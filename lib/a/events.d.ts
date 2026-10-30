import type { Actor, Annotation, AnyRecord, HistoryEntry, Interpretation, MemoryState, UseEvent } from '../types.js';
import type { MemoryConfig } from '../config.js';
export type StoreEvent = {
    type: 'memory';
    at: string;
    record: AnyRecord;
} | {
    type: 'state';
    at: string;
    id: string;
    from: MemoryState;
    to: MemoryState;
    who: Actor;
    why: string;
    restoreDiscount?: number;
    previousValue?: number;
} | {
    type: 'use';
    at: string;
    id: string;
    use: UseEvent;
} | {
    type: 'annotation';
    at: string;
    id: string;
    annotation: Annotation;
} | {
    type: 'interpretation';
    at: string;
    id: string;
    interpretation: Interpretation;
} | {
    type: 'keywords';
    at: string;
    id: string;
    keywords: AnyRecord['keywords'];
    why: string;
} | {
    type: 'link';
    at: string;
    id: string;
    from: string;
    to: string;
    condition?: string;
    strength?: number;
    walkedAt?: string;
} | {
    type: 'link/replace';
    at: string;
    id: string;
    from: string;
    to: string | null;
    strength?: number;
    walkedAt?: string;
} | {
    type: 'link/walk';
    at: string;
    id: string;
    from: string;
} | {
    type: 'merge';
    at: string;
    id: string;
    sources: readonly string[];
    record: AnyRecord;
};
export declare function initialHistory(at: string, who: Actor, why: string): HistoryEntry[];
/** Project the append-only event stream into a record without ever updating stored bytes. */
export declare function replayMemoryEvent(record: AnyRecord, event: StoreEvent, config?: MemoryConfig): AnyRecord;
export declare function stateEvent(record: AnyRecord, to: MemoryState, at: string, who: Actor, why: string, restoreDiscount?: number, previousValue?: number): StoreEvent;
//# sourceMappingURL=events.d.ts.map