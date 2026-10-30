import { type MemoryConfig } from '../config.js';
import type { AnyRecord } from '../types.js';
import type { MemoryStore } from '../a/store.js';
import type { IDFIndex } from './idf.js';
import { MaintenanceStore } from './maintenance-store.js';
export type TrashResult = {
    status: 'trashed';
    record: AnyRecord;
} | {
    status: 'pending_human';
    id: string;
    reason: string;
    at: string;
};
export declare class MemoryMaintenance {
    readonly store: MemoryStore;
    readonly idf: IDFIndex;
    private readonly config;
    readonly persistence: MaintenanceStore;
    constructor(store: MemoryStore, idf: IDFIndex, config?: MemoryConfig, persistence?: MaintenanceStore);
    trash(id: string, reason: string, at: string, who?: 'ai' | 'human'): TrashResult;
    /** Human-only restoration: low proficiency, discounted future net value, and decay remains active. */
    restore(id: string, at: string, who?: 'human'): AnyRecord;
    tick(now: string): {
        faded: string[];
        trashed: string[];
    };
    countTrashed(day: string): number;
    pendingTrash(): import("./maintenance-store.js").PendingTrash[];
    approveTrash(id: string, at: string): TrashResult | undefined;
}
//# sourceMappingURL=maintenance.d.ts.map