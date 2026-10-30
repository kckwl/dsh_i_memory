import { DEFAULT_CONFIG, type MemoryConfig } from '../config.js';
import type { AnyRecord, Keyword } from '../types.js';
import { clamp, compareText, stableStringify } from '../utils.js';
import { buildKeywords, centerHead, DEFAULT_LEXICON, defaultTokenize, STOP_WORDS, type KeywordBuildOptions } from '../b/keywords.js';
import { IDFIndex } from '../e/idf.js';

export class QueryContextError extends Error {
  override readonly name = 'QueryContextError';
  constructor(message = 'query: 需要主模型先结合对话上下文消解代词/整句；recall 只接受干净名词串') { super(message); }
}
export interface QueryTerm extends Keyword { queryWhole: string }
export interface QueryPlan {
  original: string;
  terms: QueryTerm[];
  wholes: QueryTerm[];
  contextTerms: QueryTerm[];
}
export interface EmbeddingProvider { embed(text: string): Promise<readonly number[]> | readonly number[] }
export interface VectorIndex { vector(record: AnyRecord): readonly number[] | undefined }
export interface RetrievalCandidate {
  record: AnyRecord;
  lexical: number;
  vector: number;
  score: number;
  matched: Array<{ query: string; memory: string; coefficient: number; idf: number }>;
}
export interface RetrievalResult {
  found: boolean;
  query: QueryPlan;
  candidates: RetrievalCandidate[];
  starts: RetrievalCandidate[];
  threshold: number;
  alpha: number;
  beta: number;
  degraded: boolean;
  reason?: 'below_threshold' | 'no_candidates' | 'no_query_terms';
  idfComputedAt?: string;
}
export interface RetrievalOptions {
  config?: MemoryConfig;
  idf?: IDFIndex;
  embedding?: EmbeddingProvider;
  vectors?: VectorIndex;
  keywordOptions?: KeywordBuildOptions;
  topK?: number;
  now: string;
  contextTerms?: readonly string[];
  explicitTerms?: readonly Keyword[];
}
const PRONOUNS = /^(?:那个|这个|那个东西|这个东西|它|那件事|这件事|那次|那个啥|这玩意儿|那玩意儿)(?:呢|啊|？|\?|。|！|!)?$/;
const SENTENCE = /[？?。！!]|(?:怎么|如何|为什么|是不是|能不能|告诉我|帮我|我想|你知道|记得吗|怎么样了)/;
export function assertNounQuery(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) throw new QueryContextError('query: 不能为空；recall 只接受名词串');
  if (PRONOUNS.test(trimmed)) throw new QueryContextError();
  const tokens = trimmed.replace(/[\s,，、;；:：/]+/g, ' ').split(/\s+/).filter(Boolean);
  if (SENTENCE.test(trimmed) || (tokens.length > 4 && !tokens.every((token) => /^[\p{Script=Han}]{1,8}$|[A-Za-z0-9_.-]+$/u.test(token)))) {
    throw new QueryContextError('query: 收到整句或疑问句，请先由主模型消解并抽取名词串，不硬查');
  }
}
export function planQuery(query: string, options: Pick<RetrievalOptions, 'keywordOptions' | 'contextTerms' | 'explicitTerms'> = {}): QueryPlan {
  assertNounQuery(query);
  const built = options.explicitTerms ? [...options.explicitTerms] : buildKeywords(query, options.keywordOptions);
  const terms: QueryTerm[] = built.map((keyword) => ({ ...keyword, queryWhole: keyword.group ?? keyword.text }));
  if (terms.length === 0) {
    const cleaned = query.trim().replace(/[，,、;；]+/g, ' ').replace(/\s+/g, ' ');
    if (cleaned && !STOP_WORDS.has(cleaned)) terms.push({ text: cleaned, level: 'whole', queryWhole: cleaned });
  }
  const wholes = terms.filter((term) => term.level === 'whole');
  const contextTerms = (options.contextTerms ?? []).flatMap((text) => {
    const clean = text.trim();
    return clean ? [{ text: clean, level: 'part' as const, group: clean, queryWhole: clean }] : [];
  });
  return { original: query, terms: [...terms, ...contextTerms], wholes, contextTerms };
}
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (!a.length || !b.length || a.length !== b.length || a.some((n) => !Number.isFinite(n)) || b.some((n) => !Number.isFinite(n))) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!, bv = b[i]!;
    dot += av * bv; normA += av * av; normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return clamp((dot / (Math.sqrt(normA) * Math.sqrt(normB)) + 1) / 2);
}

interface QueryGroup {
  whole: string;
  terms: QueryTerm[];
  wholeMatched: boolean;
  awarded: boolean;
}
/** Weighted coverage, including whole-hit fragment consumption and lower-of-two coefficients. */
export function lexicalCoverage(query: QueryPlan, record: AnyRecord, config: MemoryConfig, idf: IDFIndex): { score: number; matched: RetrievalCandidate['matched'] } {
  const groups = new Map<string, QueryGroup>();
  for (const term of query.terms) {
    // A bare query term is the whole query group. Auto-generated head terms stay
    // attached to their original whole term, so mixed coverage is well-defined.
    const key = term.level === 'whole' ? term.text : term.queryWhole;
    let group = groups.get(key);
    if (!group) { group = { whole: key, terms: [], wholeMatched: false, awarded: false }; groups.set(key, group); }
    group.terms.push(term);
  }
  const matched: RetrievalCandidate['matched'] = [];
  const denominatorParts: number[] = [];
  let numerator = 0;
  for (const group of groups.values()) {
    for (const term of group.terms) {
      if (record.keywords.some((candidate) => candidate.level === 'whole' && candidate.text === term.text)) {
        group.wholeMatched = true;
        break;
      }
    }
    let best: { memory: Keyword; coefficient: number; value: number; query: string } | undefined;
    for (const term of group.terms) {
      const exact = record.keywords.find((candidate) => candidate.level === 'whole' && candidate.text === term.text);
      const part = record.keywords.find((candidate) => candidate.level === 'part' && candidate.text === term.text);
      const memory = exact ?? (!group.wholeMatched ? part : undefined);
      if (!memory) continue;
      const queryCoefficient = term.level === 'whole' ? config.wholeCoefficient : config.partCoefficient;
      const memoryCoefficient = memory.level === 'whole' ? config.wholeCoefficient : config.partCoefficient;
      const coefficient = Math.min(queryCoefficient, memoryCoefficient);
      // Exact whole-to-whole uses the query group's IDF. A part that reached a
      // different whole keeps that candidate whole's IDF (spec B example).
      const value = memory.level === 'whole' && term.text === group.whole
        ? idf.idf(group.whole, 'whole')
        : idf.idf(memory.text, memory.level);
      if (!best || coefficient * value > best.coefficient * best.value) best = { memory, coefficient, value, query: term.text };
      if (exact) break;
    }
    let denominator: number;
    if (!best) denominator = idf.idf(group.whole, 'whole');
    else if (group.wholeMatched) denominator = idf.idf(group.whole, 'whole');
    else if (best.memory.level === 'part') denominator = best.value;
    else denominator = idf.idf(group.whole, 'whole');
    denominatorParts.push(denominator);
    if (best) {
      numerator += best.coefficient * best.value;
      matched.push({ query: best.query, memory: best.memory.text, coefficient: best.coefficient, idf: best.value });
    }
  }
  const denominator = denominatorParts.reduce((sum, value) => sum + value, 0);
  if (denominator <= 0) return { score: 0, matched: [] };
  return { score: clamp(numerator / denominator), matched };
}

export async function retrieve(records: readonly AnyRecord[], query: string, options: RetrievalOptions): Promise<RetrievalResult> {
  const config = options.config ?? DEFAULT_CONFIG;
  const idf = options.idf ?? new IDFIndex(records, options.now);
  const plan = planQuery(query, options);
  const frozen = idf.frozen();
  const empty = (reason: RetrievalResult['reason']): RetrievalResult => ({ found: false, query: plan, candidates: [], starts: [], threshold: config.thetaEntry, alpha: 1, beta: 0, degraded: true, ...(reason ? { reason } : {}), ...(frozen ? { idfComputedAt: frozen.computedAt } : {}) });
  if (!plan.terms.length) return empty('no_query_terms');
  const usable = records.filter((record) => record.state !== 'trashed' && record.state !== 'superseded' && record.state !== 'review');
  let queryVector: readonly number[] | undefined;
  let beta = config.betaRet;
  let degraded = false;
  if (options.embedding && options.vectors) {
    try {
      const candidate = await options.embedding.embed(query);
      if (!candidate.length || candidate.some((value) => !Number.isFinite(value))) degraded = true;
      else queryVector = candidate;
    } catch { degraded = true; }
  } else if (beta > 0) degraded = true;
  const measurements: Array<{ record: AnyRecord; vector?: readonly number[] }> = [];
  for (const record of usable) {
    let vector: readonly number[] | undefined;
    if (queryVector && options.vectors) {
      try {
        const candidate = options.vectors.vector(record);
        if (candidate && candidate.length === queryVector.length && candidate.every((value) => Number.isFinite(value))) vector = candidate;
      } catch { /* this candidate is treated as missing, never as a hard service failure */ }
    }
    measurements.push(vector ? { record, vector } : { record });
  }
  // If no usable candidate vector exists, the vector channel is unavailable as a whole.
  if (queryVector && !measurements.some((measurement) => measurement.vector)) degraded = true;
  if (degraded) beta = 0;
  const alpha = degraded ? 1 : config.alphaRet;
  const candidates: RetrievalCandidate[] = [];
  for (const measurement of measurements) {
    const { record, vector: recordVector } = measurement;
    const lexicalResult = lexicalCoverage(plan, record, config, idf);
    const vector = queryVector && recordVector ? cosine(queryVector, recordVector) : 0;
    // Missing one candidate's vector contributes zero, but does not silently keep
    // its full beta in the denominator of a lexical-only answer.
    const effectiveAlpha = queryVector && !recordVector && beta > 0 ? 1 : alpha;
    const effectiveBeta = queryVector && !recordVector ? 0 : beta;
    const score = effectiveAlpha * lexicalResult.score + effectiveBeta * vector;
    if (lexicalResult.score > 0 || recordVector) candidates.push({ record: structuredClone(record), lexical: lexicalResult.score, vector, score, matched: lexicalResult.matched });
  }
  candidates.sort((a, b) => b.score - a.score || b.lexical - a.lexical || compareText(a.record.id, b.record.id));
  const starts = candidates.filter((candidate) => candidate.score >= config.thetaEntry).slice(0, options.topK ?? 3);
  return {
    found: starts.length > 0,
    query: plan,
    candidates,
    starts,
    threshold: config.thetaEntry,
    alpha,
    beta,
    degraded,
    ...(starts.length ? {} : { reason: candidates.length ? 'below_threshold' as const : 'no_candidates' as const }),
    ...(frozen ? { idfComputedAt: frozen.computedAt } : {}),
  };
}
function defaultSummary(record: AnyRecord): string {
  if (record.kind === 'episode') return `${record.display} ${record.content.intent} ${record.content.action} ${record.content.result}`;
  if (record.kind === 'fact') return `${record.display} ${record.payload.claim}`;
  if (record.kind === 'pitfall') return `${record.display} ${record.payload.trigger} ${record.payload.avoid}`;
  if (record.kind === 'preference') return `${record.display} ${record.payload.rule} ${record.payload.scope}`;
  if (record.kind === 'open') return `${record.display} ${record.payload.goal} ${record.payload.next}`;
  return `${record.display} ${record.payload.text}`;
}
export function serializeRetrieval(result: RetrievalResult): string { return stableStringify(result); }
export function summarizeRecord(record: AnyRecord): string { return defaultSummary(record); }
export { buildKeywords, centerHead, DEFAULT_LEXICON, defaultTokenize };
