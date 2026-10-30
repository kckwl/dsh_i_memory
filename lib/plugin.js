import { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_CONFIG, makeConfig } from './config.js';
import { MemoryService } from './service.js';
export const name = 'dsh_i_memory_format';
export const Config = Schema.object({
    file: Schema.string().description('JSONL event log path; empty means in-memory'),
    M: Schema.number().min(1).default(DEFAULT_CONFIG.M),
    k: Schema.number().min(0).default(DEFAULT_CONFIG.k),
    lambda: Schema.number().min(0).default(DEFAULT_CONFIG.lambda),
    wKeyword: Schema.number().min(0).default(DEFAULT_CONFIG.wKeyword),
    wNovelty: Schema.number().min(0).default(DEFAULT_CONFIG.wNovelty),
    wCrossLink: Schema.number().min(0).default(DEFAULT_CONFIG.wCrossLink),
    confStop: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.confStop),
    confReadGain: Schema.number().min(0).default(DEFAULT_CONFIG.confReadGain),
    confReadCap: Schema.number().min(0).default(DEFAULT_CONFIG.confReadCap),
    confAnnotGain: Schema.number().min(0).default(DEFAULT_CONFIG.confAnnotGain),
    confCorrectPenalty: Schema.number().min(0).default(DEFAULT_CONFIG.confCorrectPenalty),
    confTimeGain: Schema.number().min(0).default(DEFAULT_CONFIG.confTimeGain),
    confTauMs: Schema.number().min(1).default(DEFAULT_CONFIG.confTauMs),
    alphaProf: Schema.number().min(0).default(DEFAULT_CONFIG.alphaProf),
    w1: Schema.number().min(0).default(DEFAULT_CONFIG.w1),
    w2: Schema.number().min(0).default(DEFAULT_CONFIG.w2),
    tauImpMs: Schema.number().min(1).default(DEFAULT_CONFIG.tauImpMs),
    tauBaseMs: Schema.number().min(1).default(DEFAULT_CONFIG.tauBaseMs),
    kappa: Schema.number().min(0).default(DEFAULT_CONFIG.kappa),
    thetaDel: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.thetaDel),
    alphaLink: Schema.number().min(0).default(DEFAULT_CONFIG.alphaLink),
    tauLinkMs: Schema.number().min(1).default(DEFAULT_CONFIG.tauLinkMs),
    thetaLink: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.thetaLink),
    alphaRet: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.alphaRet),
    betaRet: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.betaRet),
    thetaEntry: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.thetaEntry),
    wholeCoefficient: Schema.number().min(0).default(DEFAULT_CONFIG.wholeCoefficient),
    partCoefficient: Schema.number().min(0).default(DEFAULT_CONFIG.partCoefficient),
    keywordLimit: Schema.number().min(1).step(1).default(DEFAULT_CONFIG.keywordLimit),
    idfSnapshotPeriodMs: Schema.number().min(1).default(DEFAULT_CONFIG.idfSnapshotPeriodMs),
    epsilon: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.epsilon),
    stableImportance: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.stableImportance),
    trashPerDay: Schema.number().min(0).step(1).default(DEFAULT_CONFIG.trashPerDay),
    restoreDiscount: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.restoreDiscount),
    fadingThreshold: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.fadingThreshold),
    restoreTarget: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.restoreTarget),
    anchorTtlMs: Schema.number().min(1).default(DEFAULT_CONFIG.anchorTtlMs),
    maxDraftFragments: Schema.number().min(1).step(1).default(DEFAULT_CONFIG.maxDraftFragments),
}).description('dsh_i_memory_format format-only memory service; numeric values are placeholders until calibrated');
export function apply(ctx, config = {}) {
    const { file, ...numeric } = config;
    const service = new MemoryService({ config: numeric, ...(file ? { file } : {}) });
    // provide() registers ownership; set() is only for replacing an existing service.
    ctx.provide('iMemory', service);
}
export default apply;
//# sourceMappingURL=plugin.js.map