import type { AnyRecord, IDFSnapshot } from '../types.js';
export interface IDFOptions {
    previousSnapshot?: IDFSnapshot;
    /** A missing current and previous snapshot deliberately means all IDFs = 1. */
    fallback?: IDFSnapshot;
}
export declare function emptySnapshot(at?: string): IDFSnapshot;
export declare function rebuildIDF(records: readonly AnyRecord[], at: string): IDFSnapshot;
export declare class IDFIndex {
    private snapshot;
    private previous;
    private current;
    constructor(records?: readonly AnyRecord[], at?: string, options?: IDFOptions);
    add(record: AnyRecord): void;
    /** Re-align live counts with lifecycle projections; frozen snapshots are untouched. */
    reconcile(records: readonly AnyRecord[], at: string): void;
    remove(record: AnyRecord): void;
    private update;
    consolidate(records: readonly AnyRecord[], at: string): IDFSnapshot;
    /** Query-side live df: uses incremental counts even before the daily snapshot. */
    liveDF(text: string, level: 'whole' | 'part'): number;
    liveIDF(text: string, level: 'whole' | 'part'): number;
    /** Frozen daily score. Missing terms are new/rare: df=0 in the snapshot, never df=total. */
    idf(text: string, level: 'whole' | 'part'): number;
    frozen(): IDFSnapshot | undefined;
    /** The snapshot retained for the "missing current, use previous" degradation path. */
    previousSnapshot(): IDFSnapshot | undefined;
    live(): IDFSnapshot;
    freeze(at?: string): IDFSnapshot;
    loseSnapshots(): void;
    restorePrevious(snapshot: IDFSnapshot): void;
}
export interface IDFSnapshotDocument {
    format: 'idf-snapshots/v1';
    current: IDFSnapshot;
    /** Kept on disk so "current is missing, fall back to previous" survives a restart. */
    previous?: IDFSnapshot;
}
export declare function saveIDFSnapshot(file: string, current: IDFSnapshot, previous?: IDFSnapshot): void;
export declare function loadIDFSnapshots(file: string): {
    current: IDFSnapshot | undefined;
    previous: IDFSnapshot | undefined;
};
//# sourceMappingURL=idf.d.ts.map