export const DAY_MS = 86_400_000;
export const FIXED_A = 1;
export const ANCHOR_SLOTS = 3;
export const ITXH_CAP = 1;
export const STOP_FORMULA_VERSION = 'itxh/v1';
export const DEFAULT_CONFIG = Object.freeze({
    M: 100,
    k: Math.log(101) / 10,
    lambda: 1,
    wKeyword: 100,
    wNovelty: 100,
    wCrossLink: 1,
    confStop: 0.85,
    confReadGain: 0.05,
    confReadCap: 0.35,
    confAnnotGain: 0.1,
    confCorrectPenalty: 0.15,
    confTimeGain: 0.15,
    confTauMs: 30 * DAY_MS,
    alphaProf: 0.1,
    w1: 0.04,
    w2: 0.2,
    tauImpMs: 365 * DAY_MS,
    tauBaseMs: 30 * DAY_MS,
    kappa: 2,
    thetaDel: 0.05,
    alphaLink: 0.2,
    tauLinkMs: 14 * DAY_MS,
    thetaLink: 0.1,
    alphaRet: 0.6,
    betaRet: 0.4,
    thetaEntry: 0.49178,
    wholeCoefficient: 1,
    partCoefficient: 0.6,
    keywordLimit: 20,
    idfSnapshotPeriodMs: DAY_MS,
    epsilon: 0.055,
    stableImportance: 0.7,
    trashPerDay: 10,
    restoreDiscount: 0.7,
    fadingThreshold: 0.1,
    restoreTarget: 0.055,
    anchorTtlMs: 30 * DAY_MS,
    maxDraftFragments: 6,
    defaultSensitivity: 'normal',
});
export function validateConfig(config) {
    const positive = [
        ['M', config.M], ['k', config.k], ['tauImpMs', config.tauImpMs],
        ['tauBaseMs', config.tauBaseMs], ['tauLinkMs', config.tauLinkMs],
        ['keywordLimit', config.keywordLimit], ['idfSnapshotPeriodMs', config.idfSnapshotPeriodMs],
    ];
    for (const [name, value] of positive) {
        if (!Number.isFinite(value) || value <= 0)
            throw new Error(`config.${name}: must be finite and > 0`);
    }
    if (config.lambda < 0 || config.kappa < 0)
        throw new Error('config.lambda/kappa: must be >= 0');
    for (const name of ['wKeyword', 'wNovelty', 'wCrossLink', 'confReadGain', 'confReadCap', 'confAnnotGain', 'confCorrectPenalty', 'confTimeGain']) {
        const value = config[name];
        if (!Number.isFinite(value) || value < 0)
            throw new Error(`config.${name}: must be finite and >= 0`);
    }
    if (!(config.confStop > 0 && config.confStop <= 1))
        throw new Error('config.confStop: must be within (0,1]');
    if (!(config.confTauMs > 0))
        throw new Error('config.confTauMs: must be > 0');
    for (const name of ['thetaDel', 'thetaLink', 'thetaEntry', 'epsilon', 'stableImportance', 'fadingThreshold', 'restoreTarget']) {
        const value = config[name];
        if (!(value >= 0 && value <= 1))
            throw new Error(`config.${name}: must be within [0,1]`);
    }
    if (!(config.alphaRet >= 0 && config.betaRet >= 0) || Math.abs(config.alphaRet + config.betaRet - 1) > 1e-9) {
        throw new Error('config.alphaRet/betaRet: must be non-negative and sum to 1');
    }
    if (!(config.wholeCoefficient > config.partCoefficient && config.partCoefficient >= 0)) {
        throw new Error('config.wholeCoefficient/partCoefficient: whole must be greater than part');
    }
    if (!(config.restoreTarget > config.thetaDel))
        throw new Error('config.restoreTarget: must be greater than thetaDel');
    if (!(config.restoreDiscount > 0 && config.restoreDiscount <= 1))
        throw new Error('config.restoreDiscount: must be within (0,1]');
    if (!Number.isInteger(config.trashPerDay) || config.trashPerDay < 0)
        throw new Error('config.trashPerDay: must be a non-negative integer');
    if (!Number.isInteger(config.maxDraftFragments) || config.maxDraftFragments < 1)
        throw new Error('config.maxDraftFragments: must be a positive integer');
}
export function makeConfig(patch = {}) {
    const config = { ...DEFAULT_CONFIG, ...patch };
    validateConfig(config);
    return config;
}
//# sourceMappingURL=config.js.map