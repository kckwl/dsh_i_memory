import type { AnyRecord, Kind, MemoryRecord, NewRecord, Payloads } from '../types.js';
export declare function validatePayload<K extends Kind>(kind: K, payload: unknown, path?: string): void;
export interface RecordValidationOptions {
    allowRetiredFields?: boolean;
    /** Comes from the instance config; the schema must not hardcode the default. */
    keywordLimit?: number;
}
/** Runtime validator mirrors the static envelope, including all eighteen fields. */
export declare function validateRecord<K extends Kind>(record: NewRecord<K> | MemoryRecord<K>, options?: RecordValidationOptions): void;
export declare function outcomeOf<K extends Kind>(record: MemoryRecord<K>): string;
export declare function makeTrace<K extends Kind>(record: MemoryRecord<K>): {
    id: string;
    kind: "episode" | "fact" | "pitfall" | "preference" | "open" | "daily";
    display: string;
    time: import("../types.js").MemoryTime;
    keywords: readonly import("../types.js").Keyword[];
    entities: string[];
    outcome: string;
};
export declare function normalizeRecord<K extends Kind>(record: NewRecord<K>, options?: RecordValidationOptions): MemoryRecord<K>;
export declare function assertRecord(value: unknown): asserts value is AnyRecord;
export type { Payloads };
//# sourceMappingURL=schema.d.ts.map