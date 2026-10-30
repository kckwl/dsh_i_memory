import { type MemoryConfig } from '../config.js';
import type { AnyRecord } from '../types.js';
/**
 * Confidence is deliberately NOT a stored field (format spec §2.3: 派生不存，存输入).
 * It is computed from the event stream every time it is needed, so the formula can be
 * changed without migrating a single record.
 */
export interface ConfidenceBreakdown {
    /** Evidence part: source kind + drafted reads + human key points. Survives a settlement. */
    real: number;
    /** Time-line part. Procedural and explicitly untrusted; refunded on settlement. */
    procedural: number;
    /** real + procedural, clamped to [0,1]. This is what gates reads. */
    value: number;
    reads: number;
    keyPoints: number;
    settled: boolean;
}
export interface Settlement {
    id: string;
    before: number;
    after: number;
    refunded: number;
}
/** Base confidence by how the memory was obtained, mirroring the tone rule in F. */
export declare function confidenceBase(kind: AnyRecord['source']['kind']): number;
export declare function confidenceAt(record: AnyRecord, now: string, config?: MemoryConfig): ConfidenceBreakdown;
/** After the loop stops: drop the procedural part and report how much was refunded. */
export declare function settleConfidence(record: AnyRecord, now: string, config?: MemoryConfig): Settlement;
export declare function settleAll(records: Iterable<AnyRecord>, now: string, config?: MemoryConfig): Settlement[];
/** The stop band: at or above it the loop must stop reading deeper. */
export declare function isSettled(record: AnyRecord, now: string, config?: MemoryConfig): boolean;
//# sourceMappingURL=confidence.d.ts.map