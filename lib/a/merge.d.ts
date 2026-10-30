import type { Actor, AnyRecord } from '../types.js';
export interface MergeOptions {
    keepId: string;
    at: string;
    who?: Actor;
    why?: string;
    /** Instance keyword cap; the merged union must be validated against it. */
    keywordLimit?: number;
}
export interface MergeResult {
    keepId: string;
    sources: string[];
    record: AnyRecord;
}
/** Pure, explicit merge. It never guesses duplicates and never rewrites source bridges. */
export declare function mergeRecords(records: readonly AnyRecord[], options: MergeOptions): MergeResult;
export declare function mergeOutcome(record: AnyRecord): string;
//# sourceMappingURL=merge.d.ts.map