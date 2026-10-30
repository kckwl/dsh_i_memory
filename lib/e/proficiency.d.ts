import { type MemoryConfig } from '../config.js';
import type { AnyRecord, MemoryState, UseEvent } from '../types.js';
export interface ProficiencyBreakdown {
    recentUses: number;
    useComponent: number;
    importanceComponent: number;
    decay: number;
    value: number;
    latestUseAt?: string;
}
export declare function recentUses(record: AnyRecord, now: string, tauMs: number): number;
/** §7.3: uses plus independently decaying importance, then overall salience-modulated decay. */
export declare function proficiencyAt(record: AnyRecord, now: string, config?: MemoryConfig): ProficiencyBreakdown;
/** Uses are counted only after the drafting orchestrator emits a unique use event. */
export declare function useEvent(recordId: string, recallId: string, sessionId: string, at: string): UseEvent;
export declare function projectedLifecycleState(record: AnyRecord, now: string, config?: MemoryConfig): MemoryState;
//# sourceMappingURL=proficiency.d.ts.map