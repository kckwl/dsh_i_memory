import { type MemoryConfig } from '../config.js';
import type { Actor, AnyRecord, MemoryState, NewRecord, UseEvent } from './store-types.js';
import type { Annotation, Interpretation, Keyword, Precision } from '../types.js';
import { type StoreEvent } from './events.js';
import { type PersonalRedactor } from './redaction.js';
export interface AppendOptions {
    now: string;
    who?: Actor;
    why?: string;
    personalRedactor?: PersonalRedactor;
    personalNames?: readonly string[];
}
export interface ScanOptions {
    from?: string;
    to?: string;
    precision?: Precision;
    includeHidden?: boolean;
}
export interface StoredMemory {
    readonly record: AnyRecord;
    /** Exact event line used for the initial immutable body, for byte-equality checks. */
    readonly initialBytes: string;
}
/** JSONL event store: no update method exists by design. */
export declare class MemoryStore {
    readonly file?: string | undefined;
    private readonly config;
    private readonly events;
    private readonly records;
    private readonly firstBody;
    private readonly pending;
    private readonly pendingBodies;
    private sequence;
    private cachedView;
    private writeFailure;
    private readonly appendListeners;
    private redactor;
    private personalNames;
    constructor(file?: string | undefined, config?: MemoryConfig, privacy?: {
        redactor?: PersonalRedactor;
        personalNames?: readonly string[];
    });
    private load;
    /** Append a sanitized immutable record. draft becomes active immediately unless review is explicitly requested. */
    append<K extends AnyRecord['kind']>(input: NewRecord<K>, options: AppendOptions): StoredMemory;
    /**
     * Projections that live outside the store (bridges, indexes) subscribe here instead of
     * re-scanning at construction. Without it, a `next` written by ingest stays invisible
     * to BridgeStore until the process restarts.
     */
    onAppend(listener: (event: StoreEvent) => void): () => void;
    /** Explicit high-impact/low-confidence route; unlike draft, this does wait for approval. */
    appendForReview<K extends AnyRecord['kind']>(input: NewRecord<K>, options: AppendOptions): StoredMemory;
    get(id: string): AnyRecord | undefined;
    /** Human/audit-only access; ordinary retrieval and get() both hide trashed content. */
    getForAudit(id: string): AnyRecord | undefined;
    trace(id: string): import("../types.js").MemoryTrace | undefined;
    scan(range?: ScanOptions): AnyRecord[];
    allIds(): string[];
    size(): number;
    eventCount(): number;
    /** Bumped by every applied event; the only thing a cached projection needs to check. */
    get version(): number;
    /**
     * Internal read-only view: the same ordering as scan(), but without cloning every record.
     * Callers must treat the returned records as immutable; anything that leaves the process
     * or is handed to a caller still goes through scan()/get().
     */
    view(): readonly AnyRecord[];
    bufferedCount(): number;
    rawEventLines(): string[];
    transition(id: string, to: MemoryState, options: {
        at: string;
        who: Actor;
        why: string;
        restoreDiscount?: number;
        previousValue?: number;
    }): AnyRecord;
    logUse(id: string, use: UseEvent): void;
    addAnnotation(id: string, annotation: Annotation): void;
    addInterpretation(id: string, interpretation: Interpretation): void;
    /** Used only for normalization/merges: the original body and keyword history stay append-only. */
    replaceKeywords(id: string, keywords: readonly Keyword[], at: string, why: string): void;
    appendEvent(event: StoreEvent): StoreEvent;
    private sanitizeEvent;
    private requireAny;
    private requireVisible;
    private apply;
    private commit;
    /** Failure is deliberately lazy: accepted events remain buffered until a later successful write. */
    private flush;
    /** Test/ops hook: fail the next physical append without losing accepted in-memory events. */
    failNextWrite(error?: Error): void;
    retryWrites(): void;
    /** Return the exact original immutable JSON bytes, independent of later projections. */
    originalBytes(id: string): string | undefined;
    snapshot(): StoreEvent[];
    stableDigest(): string;
}
export type { AnyRecord, MemoryState, NewRecord, UseEvent, Actor };
export type { TimeRange } from './store-types.js';
//# sourceMappingURL=store.d.ts.map