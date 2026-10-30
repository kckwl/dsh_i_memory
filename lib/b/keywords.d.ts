import type { Keyword } from '../types.js';
export interface Tokenizer {
    (text: string): readonly string[];
}
export interface Lexicon {
    /** Valid head nouns, not arbitrary two-character suffixes. */
    heads: ReadonlySet<string>;
    /** Longest-match whole terms. Terms not listed can still be supplied explicitly. */
    terms: ReadonlySet<string>;
    aliases: Readonly<Record<string, readonly string[]>>;
    entities?: Readonly<Record<string, string>>;
}
export declare const STOP_WORDS: Set<string>;
export declare const DEFAULT_LEXICON: Lexicon;
export declare function splitLatinAndNumbers(text: string): string[];
export declare function chineseRuns(text: string): string[];
/** Deterministic longest-match tokenizer. Callers may inject a real segmenter later. */
export declare function defaultTokenize(text: string, lexicon?: Lexicon): string[];
export declare function centerHead(term: string, lexicon?: Lexicon): string | undefined;
export interface KeywordBuildOptions {
    lexicon?: Lexicon;
    tokenizer?: Tokenizer;
    limit?: number;
    df?: (text: string, level: 'whole' | 'part') => number | undefined;
    /** Explicit terms are the reliable way to preserve domain vocabulary without a global dictionary. */
    terms?: readonly string[];
    /** F5 placeholder: explicit aliases only; no fuzzy/global entity guessing. */
    entities?: Readonly<Record<string, string>>;
}
export declare function buildKeywords(text: string, options?: KeywordBuildOptions): Keyword[];
export declare function keywordText(keywords: readonly Keyword[], level?: 'whole' | 'part'): string[];
//# sourceMappingURL=keywords.d.ts.map