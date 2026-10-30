export interface PendingTrash {
    id: string;
    reason: string;
    at: string;
}
/** Daily rate limits and human-review queue survive process restarts. */
export declare class MaintenanceStore {
    readonly file?: string | undefined;
    private document;
    constructor(file?: string | undefined);
    private load;
    private save;
    count(day: string): number;
    increment(day: string): void;
    enqueue(item: PendingTrash): void;
    pending(): PendingTrash[];
    approve(id: string): PendingTrash | undefined;
}
//# sourceMappingURL=maintenance-store.d.ts.map