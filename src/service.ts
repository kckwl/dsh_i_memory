import { dirname, join } from 'node:path';
import { DEFAULT_CONFIG, makeConfig, type MemoryConfig } from './config.js';
import type { AnyRecord, Gap, Kind, NewRecord } from './types.js';
import { MemoryStore } from './a/store.js';
import { BridgeStore } from './b/bridges.js';
import { buildKeywords, type KeywordBuildOptions } from './b/keywords.js';
import { IDFIndex, loadIDFSnapshots, saveIDFSnapshot } from './e/idf.js';
import { MaintenanceStore } from './e/maintenance-store.js';
import { AnchorStore } from './d/anchor-store.js';
import type { Anchor } from './d/anchor.js';
import { MemoryMaintenance } from './e/maintenance.js';
import { retrieve, type EmbeddingProvider, type RetrievalOptions, type RetrievalResult, type VectorIndex } from './c/retrieval.js';
import { createBridgeTraversal, reconnectGaps, runRecall, type RecallContext, type RecallResult, type RecallRunnerOptions } from './d/cycle.js';
import type { ProgressModel } from './d/progress.js';
import { contextTerms, renderMemory, renderStableBlock, renderVolatileBlock, type RenderOptions } from './f/render.js';
import { useEvent } from './e/proficiency.js';
import { confidenceAt, settleConfidence } from './e/confidence.js';
import { mergeRecords } from './a/merge.js';
import { AliasMap, type PersonalRedactor } from './a/redaction.js';

export interface MemoryServiceOptions {
  config?: Partial<MemoryConfig>;
  store?: MemoryStore;
  file?: string;
  embedding?: EmbeddingProvider;
  vectors?: VectorIndex;
  keywordOptions?: KeywordBuildOptions;
  personalRedactor?: PersonalRedactor;
  aliasFile?: string;
  /** Swappable itmx/itxh functional relationships; defaults to the built-in model. */
  progress?: ProgressModel;
}
export interface IngestInput<K extends Kind> {
  record: NewRecord<K>;
  now: string;
  who?: 'ai' | 'human' | 'system';
  why?: string;
  terms?: readonly string[];
}
/** Small composition root. Host integration can mount this service without adopting a UI. */
export class MemoryService {
  readonly config: MemoryConfig;
  readonly store: MemoryStore;
  readonly bridges: BridgeStore;
  readonly idf: IDFIndex;
  readonly maintenance: MemoryMaintenance;
  private readonly embedding: EmbeddingProvider | undefined;
  private readonly vectors: VectorIndex | undefined;
  private readonly keywordOptions: KeywordBuildOptions | undefined;
  readonly personalRedactor: PersonalRedactor;
  private readonly snapshotFile: string | undefined;
  private readonly anchorStore: AnchorStore | undefined;
  private readonly progress: ProgressModel | undefined;
  /** Store version already folded into the live IDF; avoids a full rebuild on every recall. */
  private reconciledVersion = -1;
  constructor(options: MemoryServiceOptions = {}) {
    this.config = makeConfig(options.config);
    this.personalRedactor = options.personalRedactor ?? new AliasMap(options.aliasFile ?? (options.file ? join(dirname(options.file), 'aliases.json') : undefined));
    this.store = options.store ?? new MemoryStore(options.file, this.config, { redactor: this.personalRedactor });
    this.bridges = new BridgeStore(this.store, this.config);
    this.snapshotFile = options.file ? join(dirname(options.file), 'idf.json') : undefined;
    const snapshots = this.snapshotFile ? loadIDFSnapshots(this.snapshotFile) : { current: undefined, previous: undefined };
    this.idf = new IDFIndex(this.store.scan(), new Date(0).toISOString(), {
      ...(snapshots.current ? { previousSnapshot: snapshots.current } : {}),
      ...(snapshots.previous ? { fallback: snapshots.previous } : {}),
    });
    this.maintenance = new MemoryMaintenance(this.store, this.idf, this.config, new MaintenanceStore(options.file ? join(dirname(options.file), 'maintenance.json') : undefined));
    this.anchorStore = options.file ? new AnchorStore(join(dirname(options.file), 'anchor.json')) : undefined;
    this.embedding = options.embedding;
    this.vectors = options.vectors;
    this.keywordOptions = options.keywordOptions;
    this.progress = options.progress;
  }
  ingest<K extends Kind>(input: IngestInput<K>) {
    const record = structuredClone(input.record);
    if (input.terms) {
      (record as unknown as AnyRecord).keywords = buildKeywords('', { ...(this.keywordOptions ?? {}), terms: input.terms, limit: this.config.keywordLimit });
    }
    const result = this.store.append(record, { now: input.now, who: input.who ?? 'ai', why: input.why ?? 'memory ingestion' });
    this.idf.add(result.record);
    this.reconciledVersion = this.store.version;
    return result;
  }
  async recall(query: string, now: string, extra: Partial<RetrievalOptions> = {}): Promise<RetrievalResult> {
    // Direct lifecycle edits through the append-only store cannot silently pollute live df,
    // but a rebuild is only needed when the store actually changed since the last one.
    const version = this.store.version;
    const records = this.store.view();
    if (this.reconciledVersion !== version) {
      this.idf.reconcile(records, now);
      this.reconciledVersion = version;
    }
    return retrieve(records, query, {
      config: this.config,
      idf: this.idf,
      now,
      ...(this.embedding ? { embedding: this.embedding } : {}),
      ...(this.vectors ? { vectors: this.vectors } : {}),
      ...(this.keywordOptions ? { keywordOptions: this.keywordOptions } : {}),
      ...extra,
    });
  }
  async remember(context: RecallContext, options: RecallRunnerOptions = {}): Promise<RecallResult> {
    const anchor = context.anchor ?? this.anchorStore?.load(context.sessionId, context.at);
    let resolved = { ...context, ...(anchor ? { anchor } : {}) };
    if (!context.steps && !context.traverse) {
      const found = await this.recall(context.query, context.at);
      const start = found.starts[0]?.record.id ?? context.position;
      const relevance = new Map(found.candidates.map((candidate) => [candidate.record.id, candidate.lexical]));
      resolved = {
        ...resolved,
        position: start,
        steps: found.starts.length ? undefined : [[]],
        ...(found.starts.length ? { traverse: createBridgeTraversal({ memories: this.store, bridges: this.bridges, at: context.at, config: this.config, relevance: (record) => relevance.get(record.id) ?? 0 }) } : {}),
      } as RecallContext;
    }
    const result = await runRecall(resolved, {
      config: this.config,
      onGap: (gap) => { /* retained in the anchor; D10 consumes it later */ void gap; },
      onDraftedUse: (id, recallId, sessionId, at) => this.store.logUse(id, useEvent(id, recallId, sessionId, at)),
      ...(this.progress ? { progress: this.progress } : {}),
      ...options,
    });
    if (result.anchor) this.anchorStore?.save(context.sessionId, result.anchor);
    else this.anchorStore?.clear(context.sessionId);
    return result;
  }
  endSession(sessionId: string): void { this.anchorStore?.clear(sessionId); }
  /** Explicit merge by chosen ids; no global duplicate guessing. Old bridges are not rewritten. */
  merge(ids: readonly string[], options: { keepId: string; at: string; why?: string }): AnyRecord {
    const records = ids.map((id) => this.store.get(id)).filter((record): record is AnyRecord => !!record);
    if (records.length !== new Set(ids).size) throw new Error('merge: every input id must be visible');
    const merged = mergeRecords(records, { keepId: options.keepId, at: options.at, why: options.why ?? 'explicit merge', keywordLimit: this.config.keywordLimit });
    this.store.appendEvent({ type: 'merge', at: options.at, id: merged.keepId, sources: merged.sources, record: merged.record });
    for (const source of merged.sources) this.store.transition(source, 'superseded', { at: options.at, who: 'ai', why: `merged into ${merged.keepId}` });
    this.idf.reconcile(this.store.view(), options.at);
    this.reconciledVersion = this.store.version;
    return this.store.get(merged.keepId)!;
  }
  async reconnect(gaps: readonly Gap[], at: string) {
    return reconnectGaps(gaps, async (wanted) => {
      const result = await this.recall(wanted, at);
      return result.starts[0]?.record.id;
    }, this.bridges, at);
  }
  render<K extends Kind>(record: Parameters<typeof renderMemory<K>>[0], options: RenderOptions): string {
    return renderMemory(record, options);
  }
  stable(now: string): string { return renderStableBlock(this.store.view(), { now, importanceThreshold: this.config.stableImportance }); }
  volatile(records: readonly AnyRecord[], options: RenderOptions): string { return renderVolatileBlock(records, options); }
  queryContext(record: AnyRecord, now: string): string[] { return contextTerms(record, now); }
  /** Derived confidence line; never stored. Settle it after a loop stops to refund the time-line part. */
  confidence(id: string, now: string) {
    const record = this.store.getForAudit(id);
    if (!record) throw new Error(`id: unknown memory ${id}`);
    return confidenceAt(record, now, this.config);
  }
  settle(id: string, now: string) {
    const record = this.store.getForAudit(id);
    if (!record) throw new Error(`id: unknown memory ${id}`);
    return settleConfidence(record, now, this.config);
  }
  consolidate(now: string) {
    const snapshot = this.idf.consolidate(this.store.view(), now);
    if (this.snapshotFile) saveIDFSnapshot(this.snapshotFile, snapshot, this.idf.previousSnapshot());
    this.reconciledVersion = this.store.version;
    return snapshot;
  }
  tick(now: string) {
    const frozen = this.idf.frozen();
    if (!frozen || Date.parse(now) - Date.parse(frozen.computedAt) >= this.config.idfSnapshotPeriodMs) this.consolidate(now);
    const before = new Map(this.store.scan({ includeHidden: true }).map((record) => [record.id, record.state]));
    const result = this.maintenance.tick(now);
    for (const record of this.store.scan({ includeHidden: true })) {
      const previous = before.get(record.id);
      if (previous === 'active' && record.state === 'superseded') this.idf.remove(record);
      if (previous === 'superseded' && record.state === 'active') this.idf.add(record);
    }
    this.reconciledVersion = this.store.version;
    return result;
  }
  static open(directory: string, options: Omit<MemoryServiceOptions, 'file' | 'store'> = {}): MemoryService {
    return new MemoryService({ ...options, file: join(directory, 'memories.jsonl') });
  }
}
export { DEFAULT_CONFIG };
