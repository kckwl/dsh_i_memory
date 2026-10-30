import { type MemoryConfig } from '../config.js';
import type { Gap } from '../types.js';
import type { MemoryStore } from '../a/store.js';
export interface Bridge {
    from: string;
    to: string | null;
    condition?: string;
    strength: number;
    walkedAt: string;
    createdAt: string;
}
export type BridgeStatus = {
    status: 'valid';
    bridge: Bridge;
} | {
    status: 'trace';
    bridge: Bridge;
    trace: NonNullable<ReturnType<MemoryStore['trace']>>;
} | {
    status: 'dangling';
    bridge: Bridge;
    gap: Gap;
};
export interface LinkOptions {
    at: string;
    condition?: string;
    strength?: number;
}
export declare function validateGap(value: unknown): asserts value is Gap;
/** The only projection of link/replace: later events win, old bytes are never edited. */
export declare class BridgeStore {
    private readonly memories;
    private readonly config;
    private readonly links;
    /** Historical incoming registrations survive replacement for audit/dangling checks. */
    private readonly history;
    constructor(memories: MemoryStore, config?: MemoryConfig);
    private project;
    link(from: string, to: string, options: LinkOptions): Bridge;
    replace(from: string, to: string | null, options: LinkOptions): Bridge;
    walk(from: string, at: string): Bridge | undefined;
    get(from: string): Bridge | undefined;
    incoming(to: string): Bridge[];
    hasIncomingHistory(from: string, to: string): boolean;
    strengthAt(from: string, now: string): number;
    status(from: string, now: string, wanted: string): BridgeStatus | {
        status: 'missing';
    };
    /** No silent weakening scan is needed: targets disappearing makes the bridge dangling on read. */
    validate(from: string, to: string, now: string, wanted?: string): BridgeStatus;
    all(): Bridge[];
    private require;
}
//# sourceMappingURL=bridges.d.ts.map