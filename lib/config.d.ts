import type { Sensitivity } from './types.js';
/** All numeric knobs live here. Units are milliseconds unless explicitly named. */
export interface MemoryConfig {
    /** 100% denominator for itxh, and the itmx ceiling. Pure scale unless weights change. */
    M: number;
    /** ln(M+1)/T撞顶, where T is the intended accumulated subjective time. */
    k: number;
    lambda: number;
    /**
     * Net-progress weights, in the same unit as M. They are NOT derived from M, so a
     * weight set of M/3 per term means "three saturated terms reach 100%".
     * Defaults equal M, which preserves the historical one-saturated-term-equals-100% behaviour.
     */
    wKeyword: number;
    wNovelty: number;
    /** Progress awarded for one cross-context connection. */
    wCrossLink: number;
    /**
     * Confidence line (派生值，不落字段). Stop band, per-read gain and cap, human key points,
     * and the untrusted time-line part that is refunded after the loop stops.
     * All placeholders until calibrated against real recall traces.
     */
    confStop: number;
    confReadGain: number;
    confReadCap: number;
    confAnnotGain: number;
    confCorrectPenalty: number;
    confTimeGain: number;
    confTauMs: number;
    /** Simple §7.2 increment. Weighted §7.3 uses w1/w2 instead. */
    alphaProf: number;
    /** w1/w2/tauImp are explicitly marked as uncalibrated source-spec gaps. */
    w1: number;
    w2: number;
    tauImpMs: number;
    tauBaseMs: number;
    kappa: number;
    thetaDel: number;
    alphaLink: number;
    tauLinkMs: number;
    thetaLink: number;
    alphaRet: number;
    betaRet: number;
    thetaEntry: number;
    wholeCoefficient: number;
    partCoefficient: number;
    keywordLimit: number;
    idfSnapshotPeriodMs: number;
    epsilon: number;
    stableImportance: number;
    trashPerDay: number;
    restoreDiscount: number;
    fadingThreshold: number;
    restoreTarget: number;
    anchorTtlMs: number;
    maxDraftFragments: number;
    defaultSensitivity: Sensitivity;
}
export declare const DAY_MS = 86400000;
export declare const FIXED_A = 1;
export declare const ANCHOR_SLOTS = 3;
export declare const ITXH_CAP = 1;
export declare const STOP_FORMULA_VERSION = "itxh/v1";
export declare const DEFAULT_CONFIG: Readonly<MemoryConfig>;
export declare function validateConfig(config: MemoryConfig): void;
export declare function makeConfig(patch?: Partial<MemoryConfig>): MemoryConfig;
//# sourceMappingURL=config.d.ts.map