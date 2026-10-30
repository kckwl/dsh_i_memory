export declare function iso(ms: number): string;
export declare function millis(value: string | number): number;
export declare function clamp(value: number, min?: number, max?: number): number;
export declare function round(value: number, digits?: number): number;
export declare function clone<T>(value: T): T;
export declare function compareText(a: string, b: string): number;
export declare function stableStringify(value: unknown): string;
export declare function unique<T>(items: Iterable<T>): T[];
export declare function assertNonEmpty(value: unknown, field: string): asserts value is string;
export declare function assertNumberRange(value: unknown, field: string, min?: number, max?: number): asserts value is number;
//# sourceMappingURL=utils.d.ts.map