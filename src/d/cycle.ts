import { DEFAULT_CONFIG, ITXH_CAP, type MemoryConfig } from '../config.js';
import type { AnyRecord, Gap, MemoryTrace } from '../types.js';
import { clamp, millis } from '../utils.js';
import { DEFAULT_PROGRESS_MODEL, assertProgressModel, type ProgressModel } from './progress.js';
import type { Anchor, Draft, DraftFragment } from './anchor.js';
import { clearAnchor, emptyAnchor, previousCalibration, readDraft, writeDraft } from './anchor.js';
import type { BridgeStore } from '../b/bridges.js';
import type { MemoryStore } from '../a/store.js';
import { isSettled, settleAll, type Settlement } from '../e/confidence.js';

export type StopReason = 'ceiling' | 'exhausted' | 'interrupted' | 'no_path' | 'no_candidates' | 'external';
export interface ThoughtInput {
  subjectiveTimeMs: number;
  eventDensity: number;
}
export function subjectiveDelta(input: ThoughtInput, config: MemoryConfig = DEFAULT_CONFIG): number {
  return input.subjectiveTimeMs * (1 + config.lambda * Math.max(0, input.eventDensity));
}
export function timeWeight(accumulatedSubjectiveMs: number, config: MemoryConfig = DEFAULT_CONFIG): number {
  return DEFAULT_PROGRESS_MODEL.time(accumulatedSubjectiveMs, config);
}
/** Normalized recall terms are multiplied by their own weight, then divided by M. */
export function keywordContribution(coverage: number, config: MemoryConfig = DEFAULT_CONFIG): number { return clamp(coverage) * config.wKeyword; }
export function crossContextContribution(connections: number, config: MemoryConfig = DEFAULT_CONFIG): number {
  return Math.max(0, connections) * config.wCrossLink;
}
export function itxhOf(netProgress: number, config: MemoryConfig = DEFAULT_CONFIG): number {
  return clamp(DEFAULT_PROGRESS_MODEL.itxh(netProgress, config), 0, ITXH_CAP);
}
export interface RoundStep {
  kind: 'memory' | 'trace' | 'gap';
  id: string;
  record?: AnyRecord;
  trace?: MemoryTrace;
  gap?: Gap;
  coverage: number;
  crossContextLinks: number;
  thought?: ThoughtInput;
}
export interface Interruption {
  type: 'end' | 'supplement';
  text?: string;
  query?: string;
}
export interface RecallContext {
  query: string;
  sessionId: string;
  recallId: string;
  at: string;
  position: string;
  positionIds?: readonly string[];
  steps?: readonly RoundStep[][];
  /** Optional real traversal: every round starts at the same anchor position. */
  traverse?: (position: string, round: number, used: ReadonlySet<string>, query: string) => Promise<readonly RoundStep[]> | readonly RoundStep[];
  previousDraft?: Draft;
  anchor?: Anchor;
  config?: MemoryConfig;
}
export interface RecallRound {
  round: number;
  /** One round only: discarded at the end of the round, restarted next round from itxh×M. */
  itmx: number;
  itxh: number;
  deltaItxh: number;
  netProgress: number;
  newlyUsed: string[];
  skipped: string[];
  stoppedBy?: StopReason;
  draft: Draft;
  gaps: Gap[];
  retries: number;
}
export interface RecallResult {
  rounds: RecallRound[];
  stoppedBy: StopReason;
  draft: Draft;
  anchor: Anchor | null;
  used: string[];
  gaps: Gap[];
  externalCalled: boolean;
  /** Recomputed after external retrieval; still hard-capped at 1. */
  finalItxh: number;
  /** Confidence settlements: procedural time-line dropped, refund reported per record. */
  settlements: Settlement[];
}

/** Injectable boundary for the main model: deduplicate, select, converge, then score the one-line conclusion. */
export interface DraftingOrchestrator {
  (input: { previous: Draft; fragments: DraftFragment[]; round: number; query: string; timeout?: boolean; maxFragments?: number }): Promise<Draft> | Draft;
}
export interface ExternalSearch {
  (gap: Gap): Promise<{ fragments: DraftFragment[]; conclusion: string; novelty: number } | undefined>;
}
function textKey(text: string): string { return text.replace(/[\s，。；、,.!?！？]/g, '').toLowerCase(); }
/** Deterministic fallback. It intentionally removes/merges fragments instead of append-only drafting. */
export const heuristicDraft: DraftingOrchestrator = ({ previous, fragments, maxFragments }) => {
  const merged = new Map<string, DraftFragment>();
  for (const fragment of [...previous.fragments, ...fragments]) {
    const key = fragment.memoryId ? `id:${fragment.memoryId}` : `text:${textKey(fragment.text)}`;
    const old = merged.get(key);
    if (!old || fragment.relevance > old.relevance) merged.set(key, { ...fragment });
  }
  const kept = [...merged.values()].filter((fragment) => fragment.relevance >= 0.25).sort((a, b) => b.relevance - a.relevance || a.text.localeCompare(b.text));
  const newConclusion = fragments.length ? fragments.map((fragment) => fragment.text).join('；') : previous.conclusion;
  return {
    fragments: kept.slice(0, Math.max(1, maxFragments ?? 6)),
    conclusion: newConclusion || previous.conclusion,
    novelty: fragments.length ? Math.max(0.1, ...fragments.map((fragment) => fragment.novelty ?? 0.5)) : previous.novelty,
  };
};

export interface RecallRunnerOptions {
  config?: MemoryConfig;
  orchestrator?: DraftingOrchestrator;
  external?: ExternalSearch;
  onGap?: (gap: Gap) => void;
  onDraftedUse?: (id: string, recallId: string, sessionId: string, at: string) => void;
  interruption?: (round: number) => Interruption | undefined;
  /** Simulates one failed trial response; the runner retries at most once. */
  failNextDraft?: boolean;
  /** Swap the itmx/itxh functional relationships. Numbers still come from config. */
  progress?: ProgressModel;
}
export async function runRecall(context: RecallContext, options: RecallRunnerOptions = {}): Promise<RecallResult> {
  const config = options.config ?? DEFAULT_CONFIG;
  const orchestrator = options.orchestrator ?? heuristicDraft;
  const model = options.progress ?? DEFAULT_PROGRESS_MODEL;
  if (options.progress) assertProgressModel(model);
  let anchor = context.anchor
    ? structuredClone(context.anchor)
    : emptyAnchor({ position: context.position, at: context.at, sessionId: context.sessionId, ...(context.positionIds ? { positionIds: context.positionIds } : {}) }, config);
  const used = new Set(anchor.used);
  const gaps: Gap[] = [...anchor.gaps];
  const rounds: RecallRound[] = [];
  const seenRecords = new Map<string, AnyRecord>();
  const settlements = (): Settlement[] => settleAll(seenRecords.values(), context.at, config);
  const restored = readDraft(anchor, context.at);
  let draft: Draft = restored.draft ? structuredClone(restored.draft) : { fragments: [], conclusion: '', novelty: 0 };
  let previousItxh = previousCalibration(anchor, context.at, model.id)?.itxh ?? 0;
  let accumulatedProgress = previousItxh * config.M;
  let retries = 0;
  let externalCalled = false;
  const stepLimit = 64;
  const totalRounds = context.traverse ? stepLimit : (context.steps?.length ?? 0);
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
    const interruption = options.interruption?.(roundIndex + 1);
    if (interruption?.type === 'end') {
      anchor.gaps = gaps;
      return { rounds, stoppedBy: 'interrupted', draft, anchor: clearAnchor(), used: [...used], gaps, externalCalled, finalItxh: previousItxh, settlements: settlements() };
    }
    const roundSteps = context.traverse
      ? await context.traverse(context.position, roundIndex + 1, used, context.query)
      : context.steps?.[roundIndex] ?? [];
    const usedBeforeRound = new Set(used);
    // itmx lives for exactly one read round. The next round does not resume the raw
    // counter; it restarts from itxh×M, the reverse conversion of the percentage.
    let itmx = Math.min(config.M, previousItxh * config.M);
    let subjective = itmx > 0 ? Math.max(0, model.timeInverse(itmx, config)) : 0;
    const newlyUsed: string[] = [];
    const skipped: string[] = [];
    const roundGaps: Gap[] = [];
    const fragments: DraftFragment[] = [];
    let netProgress = 0;
    for (const step of roundSteps) {
      if (step.kind === 'gap') {
        const gap = step.gap ?? { from: step.id, wanted: context.query, at: context.at };
        gaps.push(gap);
        roundGaps.push(gap);
        options.onGap?.(gap);
        continue;
      }
      if (step.kind === 'trace') continue;
      const thought = step.thought ?? { subjectiveTimeMs: 1, eventDensity: 0 };
      subjective += subjectiveDelta(thought, config);
      // f_time is a function of accumulated subjective time, not a running sum of increments.
      itmx = Math.min(config.M, model.time(subjective, config));
      if (used.has(step.id)) {
        skipped.push(step.id);
        // Re-reading still adds fake time weight, never first-use net progress or proficiency.
        continue;
      }
      used.add(step.id);
      newlyUsed.push(step.id);
      const restoredDiscount = step.record?.forgotten?.valueDiscount ?? 1;
      netProgress += model.contribution({ coverage: step.coverage, crossContextLinks: step.crossContextLinks }, config) * restoredDiscount;
      if (step.record) {
        seenRecords.set(step.id, step.record);
        fragments.push({ memoryId: step.id, text: summarizeForDraft(step.record), relevance: step.coverage, novelty: 0.5 });
      }
      if (itmx >= config.M) break; // 撞 M 即停：M 就是刹车点，没有中间的 theta_m
    }
    let failed = false;
    retries = 0;
    const previousDraft = structuredClone(draft);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (options.failNextDraft && attempt === 0) { retries++; continue; }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const candidate = await Promise.race([
          Promise.resolve(orchestrator({ previous: previousDraft, fragments, round: roundIndex + 1, query: context.query, maxFragments: config.maxDraftFragments })),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('draft timeout')), 30_000);
            // Never keep the host process alive just to observe a timeout nobody awaits.
            timer.unref?.();
          }),
        ]);
        draft = candidate;
        failed = false;
        break;
      } catch {
        if (attempt === 1) retries++;
        failed = true;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    if (!failed) {
      const draftedIds = new Set(draft.fragments.map((fragment) => fragment.memoryId).filter((id): id is string => !!id));
      for (const id of newlyUsed) if (draftedIds.has(id)) options.onDraftedUse?.(id, context.recallId, context.sessionId, context.at);
    }
    // A failed trial response reuses the previous draft and does not consume first-use ids.
    if (failed) {
      used.clear();
      for (const id of usedBeforeRound) used.add(id);
      newlyUsed.splice(0);
      netProgress = 0;
    }
    const novelty = failed ? 0 : model.novelty(draft.novelty, config);
    accumulatedProgress += netProgress;
    const rawItxh = failed ? previousItxh : model.itxh(accumulatedProgress + novelty, config);
    const itxh = failed ? previousItxh : clamp(rawItxh, 0, ITXH_CAP);
    const delta = failed ? 0 : itxh - previousItxh;
    let stoppedBy: StopReason | undefined;
    // itxh is capped at 100%; reaching that cap is already the ceiling stop.
    // Waiting for raw progress > M would waste one extra round after itxh=1.
    if (!failed && rawItxh >= 1) stoppedBy = 'ceiling';
    else if (roundIndex > 0 && delta < config.epsilon && !options.external) stoppedBy = 'exhausted';
    else if (roundIndex === 0 && netProgress === 0 && novelty === 0 && !options.external) stoppedBy = 'exhausted';
    const round: RecallRound = { round: roundIndex + 1, itmx, itxh, deltaItxh: delta, netProgress: accumulatedProgress + novelty, newlyUsed, skipped, ...(stoppedBy ? { stoppedBy } : {}), draft: structuredClone(draft), gaps: roundGaps, retries };
    rounds.push(round);
    anchor = writeDraft(anchor, draft, { at: context.at, itmx, itxh, round: roundIndex + 1, func: model.id });
    anchor.used = [...used];
    anchor.gaps = gaps;
    if (stoppedBy) return { rounds, stoppedBy, draft, anchor, used: [...used], gaps, externalCalled, finalItxh: itxh, settlements: settlements() };
    if (context.traverse && newlyUsed.length === 0 && !roundSteps.some((step) => step.kind === 'memory' && !usedBeforeRound.has(step.id))) break;
    previousItxh = itxh;
  }
  if (options.external && (gaps.length || rounds.every((round) => round.newlyUsed.length === 0))) {
    const gap = gaps[0] ?? { from: context.position, wanted: context.query, at: context.at };
    if (!gaps.length) gaps.push(gap);
    externalCalled = true;
    const answer = await options.external(gap);
    let finalItxh = rounds.at(-1)?.itxh ?? previousItxh;
    if (answer) {
      const fragments = answer.fragments;
      draft = await orchestrator({ previous: draft, fragments, round: rounds.length + 1, query: context.query, maxFragments: config.maxDraftFragments });
      draft.conclusion = answer.conclusion;
      draft.novelty = clamp(answer.novelty);
      finalItxh = clamp(model.itxh(accumulatedProgress + model.novelty(draft.novelty, config), config), 0, ITXH_CAP);
      anchor = writeDraft(anchor, draft, { at: context.at, itmx: Math.min(config.M, previousItxh * config.M), itxh: finalItxh, round: rounds.length + 1, func: model.id });
      anchor.gaps = gaps;
    }
    return { rounds, stoppedBy: 'external', draft, anchor, used: [...used], gaps, externalCalled, finalItxh, settlements: settlements() };
  }
  const finalItxh = rounds.at(-1)?.itxh ?? previousItxh;
  return { rounds, stoppedBy: rounds.length ? 'exhausted' : 'no_path', draft, anchor, used: [...used], gaps, externalCalled, finalItxh, settlements: settlements() };
}
export interface BridgeTraversalOptions {
  memories: MemoryStore;
  bridges: BridgeStore;
  at: string;
  perRound?: number;
  relevance?: (record: AnyRecord, query: string) => number;
  config?: MemoryConfig;
}
/** Real graph traversal: every round starts at the same anchor and walks deeper. */
export function createBridgeTraversal(options: BridgeTraversalOptions) {
  return async (position: string, round: number, _used: ReadonlySet<string>, query: string): Promise<RoundStep[]> => {
    const steps: RoundStep[] = [];
    const seen = new Set<string>();
    let current: string | null = position;
    const limit = Math.max(1, round * (options.perRound ?? 2));
    while (current && seen.size < limit) {
      if (seen.has(current)) break;
      seen.add(current);
      const record = options.memories.get(current);
      if (!record) {
        const trace = options.memories.trace(current);
        if (trace) steps.push({ kind: 'trace', id: current, trace, coverage: 0, crossContextLinks: 0 });
        else steps.push({ kind: 'gap', id: current, gap: { from: position, wanted: query, at: options.at }, coverage: 0, crossContextLinks: 0 });
        break;
      }
      steps.push({
        kind: 'memory', id: current, record,
        coverage: options.relevance?.(record, query) ?? 0.5,
        crossContextLinks: steps.some((step) => step.kind === 'memory') ? 1 : 0,
      });
      // Stop band: this memory is confident enough. Read it once, then stop going deeper
      // from it instead of re-walking the same chain every recall.
      if (isSettled(record, options.at, options.config ?? DEFAULT_CONFIG)) break;
      const bridge = options.bridges.get(current);
      if (!bridge?.to) break;
      const status = options.bridges.status(current, options.at, query);
      if (status.status !== 'valid') {
        if (status.status === 'trace') steps.push({ kind: 'trace', id: bridge.to, trace: status.trace, coverage: 0, crossContextLinks: 0 });
        else if (status.status === 'dangling') steps.push({ kind: 'gap', id: bridge.to, gap: status.gap, coverage: 0, crossContextLinks: 0 });
        break;
      }
      options.bridges.walk(current, options.at);
      current = bridge.to;
    }
    return steps;
  };
}
export function summarizeForDraft(record: AnyRecord): string {
  if (record.kind === 'episode') return `${record.content.intent}：${record.content.action}，${record.content.result}`;
  if (record.kind === 'fact') return record.payload.claim;
  if (record.kind === 'pitfall') return `${record.payload.trigger}，避免${record.payload.avoid}`;
  if (record.kind === 'preference') return record.payload.rule;
  if (record.kind === 'open') return `${record.payload.goal}，下一步${record.payload.next}`;
  return record.payload.text;
}

/** D10: a gap is retained until a later read finds a real, still-visible answer. */
export async function reconnectGaps(
  gaps: readonly Gap[],
  findAnswer: (wanted: string) => Promise<string | undefined> | string | undefined,
  bridges: BridgeStore,
  at: string,
): Promise<{ remaining: Gap[]; connected: Array<{ gap: Gap; to: string }> }> {
  const remaining: Gap[] = [];
  const connected: Array<{ gap: Gap; to: string }> = [];
  for (const gap of gaps) {
    const answer = await findAnswer(gap.wanted);
    if (answer) {
      bridges.replace(gap.from, answer, { at });
      const status = bridges.status(gap.from, at, gap.wanted);
      if (status.status === 'valid') connected.push({ gap: structuredClone(gap), to: answer });
      else remaining.push(structuredClone(gap));
    } else remaining.push(structuredClone(gap));
  }
  return { remaining, connected };
}
export function clearOnSessionEnd(anchor: Anchor | null): null { return clearAnchor(); }
export { readDraft };
