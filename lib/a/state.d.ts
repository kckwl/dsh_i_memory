import type { Actor, MemoryState } from '../types.js';
export interface Transition {
    from: MemoryState;
    to: MemoryState;
    who: readonly Actor[];
}
export declare const LEGAL_TRANSITIONS: readonly Transition[];
export declare function assertTransition(from: MemoryState, to: MemoryState, who: Actor): void;
//# sourceMappingURL=state.d.ts.map