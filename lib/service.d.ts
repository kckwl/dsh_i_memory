import { DEFAULT_CONFIG, type MemoryConfig } from './config.js';
import type { AnyRecord, Gap, Kind, NewRecord } from './types.js';
import { MemoryStore } from './a/store.js';
import { BridgeStore } from './b/bridges.js';
import { type KeywordBuildOptions } from './b/keywords.js';
import { IDFIndex } from './e/idf.js';
import { MemoryMaintenance } from './e/maintenance.js';
import { type EmbeddingProvider, type RetrievalOptions, type RetrievalResult, type VectorIndex } from './c/retrieval.js';
import { type RecallContext, type RecallResult, type RecallRunnerOptions } from './d/cycle.js';
import type { ProgressModel } from './d/progress.js';
import { renderMemory, type RenderOptions } from './f/render.js';
import { type PersonalRedactor } from './a/redaction.js';
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
export declare class MemoryService {
    readonly config: MemoryConfig;
    readonly store: MemoryStore;
    readonly bridges: BridgeStore;
    readonly idf: IDFIndex;
    readonly maintenance: MemoryMaintenance;
    private readonly embedding;
    private readonly vectors;
    private readonly keywordOptions;
    readonly personalRedactor: PersonalRedactor;
    private readonly snapshotFile;
    private readonly anchorStore;
    private readonly progress;
    /** Store version already folded into the live IDF; avoids a full rebuild on every recall. */
    private reconciledVersion;
    constructor(options?: MemoryServiceOptions);
    ingest<K extends Kind>(input: IngestInput<K>): import("./a/store.js").StoredMemory;
    recall(query: string, now: string, extra?: Partial<RetrievalOptions>): Promise<RetrievalResult>;
    remember(context: RecallContext, options?: RecallRunnerOptions): Promise<RecallResult>;
    endSession(sessionId: string): void;
    /** Explicit merge by chosen ids; no global duplicate guessing. Old bridges are not rewritten. */
    merge(ids: readonly string[], options: {
        keepId: string;
        at: string;
        why?: string;
    }): AnyRecord;
    reconnect(gaps: readonly Gap[], at: string): Promise<{
        remaining: Gap[];
        connected: Array<{
            gap: Gap;
            to: string;
        }>;
    }>;
    render<K extends Kind>(record: Parameters<typeof renderMemory<K>>[0], options: RenderOptions): string;
    stable(now: string): string;
    volatile(records: readonly AnyRecord[], options: RenderOptions): string;
    queryContext(record: AnyRecord, now: string): string[];
    /** Derived confidence line; never stored. Settle it after a loop stops to refund the time-line part. */
    confidence(id: string, now: string): import("./e/confidence.js").ConfidenceBreakdown;
    settle(id: string, now: string): import("./e/confidence.js").Settlement;
    consolidate(now: string): import("./types.js").IDFSnapshot;
    tick(now: string): {
        faded: string[];
        trashed: string[];
    };
    static open(directory: string, options?: Omit<MemoryServiceOptions, 'file' | 'store'>): MemoryService;
}
export { DEFAULT_CONFIG };
//# sourceMappingURL=service.d.ts.map