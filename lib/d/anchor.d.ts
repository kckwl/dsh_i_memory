import { type MemoryConfig } from '../config.js';
import type { Gap } from '../types.js';
export interface DraftFragment {
    memoryId?: string;
    text: string;
    /** Relevance is an orchestrator/model input, not a persisted derived score. */
    relevance: number;
    novelty?: number;
}
export interface Draft {
    fragments: DraftFragment[];
    conclusion: string;
    /** 0–1 self/novelty score of the conclusion, not of the fragments. */
    novelty: number;
    attemptFailures?: number;
}
export interface AnchorCalibration {
    at: string;
    itmx: number;
    itxh: number;
    round: number;
    /** Which progress model produced this calibration; defaults to the built-in one. */
    func?: string;
}
export interface AnchorSlot {
    draft?: Draft;
    calibration?: AnchorCalibration;
    writtenAt: string;
    ttlMs: number;
}
export interface Anchor {
    slots: AnchorSlot[];
    /** Index of the current draft slot, not the next write position. */
    current: number;
    position: string;
    used: string[];
    round: number;
    itmx: number;
    itxh: number;
    t: string;
    /** Which progress model produced the calibration stored in the slots. */
    func: string;
    ttlMs: number;
    gaps: Gap[];
    /** Session identity prevents one conversation's anchor leaking into another. */
    sessionId: string;
}
export interface AnchorInput {
    position: string;
    at: string;
    positionIds?: readonly string[];
    sessionId?: string;
}
export declare function emptyAnchor(input: AnchorInput, config?: MemoryConfig): Anchor;
export declare function isSlotAlive(slot: AnchorSlot, now: string): boolean;
export declare function readDraft(anchor: Anchor, now: string): {
    draft?: Draft;
    slot: number;
};
export declare function writeDraft(anchor: Anchor, draft: Draft, calibration: AnchorCalibration): Anchor;
export declare function previousCalibration(anchor: Anchor, now: string, func?: string): AnchorCalibration | undefined;
export declare function clearAnchor(): null;
export declare function serializeAnchor(anchor: Anchor): string;
//# sourceMappingURL=anchor.d.ts.map