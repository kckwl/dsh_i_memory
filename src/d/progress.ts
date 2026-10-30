import { DEFAULT_CONFIG, FIXED_A, STOP_FORMULA_VERSION, type MemoryConfig } from '../config.js';
import { clamp } from '../utils.js';

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
export const DEFAULT_PROGRESS_MODEL: ProgressModel = {
  id: STOP_FORMULA_VERSION,
  time: (accumulated, config) => FIXED_A * Math.expm1(config.k * accumulated),
  timeInverse: (itmx, config) => config.k > 0 ? Math.log1p(Math.max(0, itmx) / FIXED_A) / config.k : 0,
  contribution: (step, config) => clamp(step.coverage) * config.wKeyword + Math.max(0, step.crossContextLinks) * config.wCrossLink,
  novelty: (score, config) => clamp(score) * config.wNovelty,
  itxh: (progress, config) => progress / config.M,
};

export function assertProgressModel(model: ProgressModel): void {
  if (!model || typeof model.id !== 'string' || !model.id.trim()) throw new Error('progress.id: required non-empty string');
  for (const method of ['time', 'timeInverse', 'contribution', 'novelty', 'itxh'] as const) {
    if (typeof model[method] !== 'function') throw new Error(`progress.${method}: must be a function`);
  }
}
/** Convenience for callers that only change the numbers, not the shape. */
export function defaultProgress(config: MemoryConfig = DEFAULT_CONFIG): ProgressModel { return DEFAULT_PROGRESS_MODEL; }
