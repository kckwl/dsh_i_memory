import { type MemoryConfig } from '../config.js';
import type { AnyRecord, Keyword } from '../types.js';
import { buildKeywords, centerHead, DEFAULT_LEXICON, defaultTokenize, type KeywordBuildOptions } from '../b/keywords.js';
import { IDFIndex } from '../e/idf.js';
export declare class QueryContextError extends Error {
    readonly name = "QueryContextError";
    constructor(message?: string);
}
export interface QueryTerm extends Keyword {
    queryWhole: string;
}
export interface QueryPlan {
    original: string;
    terms: QueryTerm[];
    wholes: QueryTerm[];
    contextTerms: QueryTerm[];
}
export interface EmbeddingProvider {
    embed(text: string): Promise<readonly number[]> | readonly number[];
}
export interface VectorIndex {
    vector(record: AnyRecord): readonly number[] | undefined;
}
export interface RetrievalCandidate {
    record: AnyRecord;
    lexical: number;
    vector: number;
    score: number;
    matched: Array<{
        query: string;
        memory: string;
        coefficient: number;
        idf: number;
    }>;
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
export declare function assertNounQuery(query: string): void;
export declare function planQuery(query: string, options?: Pick<RetrievalOptions, 'keywordOptions' | 'contextTerms' | 'explicitTerms'>): QueryPlan;
export declare function cosine(a: readonly number[], b: readonly number[]): number;
/** Weighted coverage, including whole-hit fragment consumption and lower-of-two coefficients. */
export declare function lexicalCoverage(query: QueryPlan, record: AnyRecord, config: MemoryConfig, idf: IDFIndex): {
    score: number;
    matched: RetrievalCandidate['matched'];
};
export declare function retrieve(records: readonly AnyRecord[], query: string, options: RetrievalOptions): Promise<RetrievalResult>;
export declare function serializeRetrieval(result: RetrievalResult): string;
export declare function summarizeRecord(record: AnyRecord): string;
export { buildKeywords, centerHead, DEFAULT_LEXICON, defaultTokenize };
//# sourceMappingURL=retrieval.d.ts.map