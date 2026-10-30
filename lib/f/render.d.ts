import type { AnyRecord, MemoryRecord } from '../types.js';
export type RenderBudget = 'tight' | 'normal' | 'detailed';
export interface RenderOptions {
    now: string;
    budget?: RenderBudget;
    /** Model/context matching is an input, not a mutable record property. */
    matchItxh?: number;
    templateVersion?: 'v1';
    /** Optional real tokenizer for budget measurement; approximateTokens is not a substitute. */
    countTokens?: (text: string) => number;
    /** Fail closed on policy violations instead of injecting machine-tainted memory verbatim. */
    enforcePolicy?: boolean;
    /** Stable long-term blocks omit turn-relative dates rather than forging a frozen now. */
    stable?: boolean;
}
export declare const FORBIDDEN_PHRASES: string[];
declare const TOKEN_BUDGET: Record<RenderBudget, number>;
export declare function relativeTime(record: AnyRecord, now: string): string;
/** Pure renderer: no Date.now(), random ids, I/O, or mutable global state. */
export declare function renderMemory<K extends AnyRecord['kind']>(record: MemoryRecord<K>, options: RenderOptions): string;
export interface StableBlockOptions {
    now: string;
    importanceThreshold?: number;
    budget?: RenderBudget;
}
export declare function isStableRecord(record: AnyRecord, threshold?: number): boolean;
export declare function renderStableBlock(records: readonly AnyRecord[], options: StableBlockOptions): string;
export declare function renderVolatileBlock(records: readonly AnyRecord[], options: RenderOptions): string;
export declare function assertRenderPolicy(text: string): void;
export declare function approximateTokens(text: string): number;
export declare function contextTerms(record: AnyRecord, now: string): string[];
export { TOKEN_BUDGET };
//# sourceMappingURL=render.d.ts.map