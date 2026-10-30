import type { Sensitivity } from '../types.js';
export interface PersonalRedactor {
    alias(value: string): string;
    reveal(alias: string): string | undefined;
}
export interface RedactionResult {
    text: string;
    sensitivity?: Sensitivity;
}
/** Human-only dereference map. It is deliberately separate from memory JSONL. */
export declare class AliasMap implements PersonalRedactor {
    private readonly file?;
    private aliases;
    private reverse;
    constructor(file?: string | undefined);
    alias(value: string): string;
    reveal(alias: string): string | undefined;
    private persist;
}
export declare const SECRET_PATTERNS: readonly RegExp[];
export interface RedactionOptions {
    redactor?: PersonalRedactor;
    /** Caller-declared person/client names; an empty list does not guess at Chinese names. */
    personalNames?: readonly string[];
    redactEmails?: boolean;
    redactPhones?: boolean;
    redactUserIds?: boolean;
}
export declare function redactText(text: string, options?: RedactionOptions): RedactionResult;
export declare function redactDeep<T>(value: T, options?: RedactionOptions, path?: string): {
    value: T;
    sensitivity?: Sensitivity;
};
//# sourceMappingURL=redaction.d.ts.map