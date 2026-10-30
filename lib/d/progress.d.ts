import { type MemoryConfig } from '../config.js';
/** The normalized shape of one read step, before any weighting. */
export interface StepShape {
    coverage: number;
    crossContextLinks: number;
}
/**
 * The itmx/itxh functional relationships, as one swappable object.
 * Numbers live in MemoryConfig; shapes live here, so a different curve is a new model
 * rather than an edit to the loop. Every method must be pure.
 */
export interface ProgressModel {
    /** Stamped into the anchor; a calibration made by another model is never mixed in. */
    readonly id: string;
    /** f_time for accumulated subjective time. */
    time(accumulatedSubjective: number, config: MemoryConfig): number;
    /** Inverse of time(), used to restart itmx from `itxh × M`. */
    timeInverse(itmx: number, config: MemoryConfig): number;
    /** First-use net progress for one read step. */
    contribution(step: StepShape, config: MemoryConfig): number;
    /** f_innovation for the draft's one-line conclusion (0–1). */
    novelty(score: number, config: MemoryConfig): number;
    /** itxh from net progress, unclamped: the runner applies the 100% hard cap. */
    itxh(progress: number, config: MemoryConfig): number;
}
/** Current formulas, kept as the default so existing behaviour is unchanged. */
export declare const DEFAULT_PROGRESS_MODEL: ProgressModel;
export declare function assertProgressModel(model: ProgressModel): void;
/** Convenience for callers that only change the numbers, not the shape. */
export declare function defaultProgress(config?: MemoryConfig): ProgressModel;
//# sourceMappingURL=progress.d.ts.map