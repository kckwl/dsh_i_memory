import { type MemoryConfig } from '../config.js';
import type { AnyRecord, Gap, MemoryTrace } from '../types.js';
import { type ProgressModel } from './progress.js';
import type { Anchor, Draft, DraftFragment } from './anchor.js';
import { readDraft } from './anchor.js';
import type { BridgeStore } from '../b/bridges.js';
import type { MemoryStore } from '../a/store.js';
import { type Settlement } from '../e/confidence.js';
export type StopReason = 'ceiling' | 'exhausted' | 'interrupted' | 'no_path' | 'no_candidates' | 'external';
export interface ThoughtInput {
    subjectiveTimeMs: number;
    eventDensity: number;
}
export declare function subjectiveDelta(input: ThoughtInput, config?: MemoryConfig): number;
export declare function timeWeight(accumulatedSubjectiveMs: number, config?: MemoryConfig): number;
/** Normalized recall terms are multiplied by their own weight, then divided by M. */
export declare function keywordContribution(coverage: number, config?: MemoryConfig): number;
export declare function crossContextContribution(connections: number, config?: MemoryConfig): number;
export declare function itxhOf(netProgress: number, config?: MemoryConfig): number;
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
    (input: {
        previous: Draft;
        fragments: DraftFragment[];
        round: number;
        query: string;
        timeout?: boolean;
        maxFragments?: number;
    }): Promise<Draft> | Draft;
}
export interface ExternalSearch {
    (gap: Gap): Promise<{
        fragments: DraftFragment[];
        conclusion: string;
        novelty: number;
    } | undefined>;
}
/** Deterministic fallback. It intentionally removes/merges fragments instead of append-only drafting. */
export declare const heuristicDraft: DraftingOrchestrator;
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
export declare function runRecall(context: RecallContext, options?: RecallRunnerOptions): Promise<RecallResult>;
export interface BridgeTraversalOptions {
    memories: MemoryStore;
    bridges: BridgeStore;
    at: string;
    perRound?: number;
    relevance?: (record: AnyRecord, query: string) => number;
    config?: MemoryConfig;
}
/** Real graph traversal: every round starts at the same anchor and walks deeper. */
export declare function createBridgeTraversal(options: BridgeTraversalOptions): (position: string, round: number, _used: ReadonlySet<string>, query: string) => Promise<RoundStep[]>;
export declare function summarizeForDraft(record: AnyRecord): string;
/** D10: a gap is retained until a later read finds a real, still-visible answer. */
export declare function reconnectGaps(gaps: readonly Gap[], findAnswer: (wanted: string) => Promise<string | undefined> | string | undefined, bridges: BridgeStore, at: string): Promise<{
    remaining: Gap[];
    connected: Array<{
        gap: Gap;
        to: string;
    }>;
}>;
export declare function clearOnSessionEnd(anchor: Anchor | null): null;
export { readDraft };
//# sourceMappingURL=cycle.d.ts.map