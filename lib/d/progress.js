import { DEFAULT_CONFIG, FIXED_A, STOP_FORMULA_VERSION } from '../config.js';
import { clamp } from '../utils.js';
/** Current formulas, kept as the default so existing behaviour is unchanged. */
export const DEFAULT_PROGRESS_MODEL = {
    id: STOP_FORMULA_VERSION,
    time: (accumulated, config) => FIXED_A * Math.expm1(config.k * accumulated),
    timeInverse: (itmx, config) => config.k > 0 ? Math.log1p(Math.max(0, itmx) / FIXED_A) / config.k : 0,
    contribution: (step, config) => clamp(step.coverage) * config.wKeyword + Math.max(0, step.crossContextLinks) * config.wCrossLink,
    novelty: (score, config) => clamp(score) * config.wNovelty,
    itxh: (progress, config) => progress / config.M,
};
export function assertProgressModel(model) {
    if (!model || typeof model.id !== 'string' || !model.id.trim())
        throw new Error('progress.id: required non-empty string');
    for (const method of ['time', 'timeInverse', 'contribution', 'novelty', 'itxh']) {
        if (typeof model[method] !== 'function')
            throw new Error(`progress.${method}: must be a function`);
    }
}
/** Convenience for callers that only change the numbers, not the shape. */
export function defaultProgress(config = DEFAULT_CONFIG) { return DEFAULT_PROGRESS_MODEL; }
//# sourceMappingURL=progress.js.map