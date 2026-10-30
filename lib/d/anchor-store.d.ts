import type { Anchor } from './anchor.js';
/** Session-scoped crash recovery only. No long-term anchor history is retained. */
export declare class AnchorStore {
    readonly file: string;
    constructor(file: string);
    save(sessionId: string, anchor: Anchor): void;
    load(sessionId: string, now: string): Anchor | undefined;
    clear(sessionId?: string): void;
}
//# sourceMappingURL=anchor-store.d.ts.map