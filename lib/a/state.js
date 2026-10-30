export const LEGAL_TRANSITIONS = Object.freeze([
    { from: 'draft', to: 'active', who: ['ai', 'system'] },
    { from: 'draft', to: 'review', who: ['ai', 'human'] },
    { from: 'review', to: 'active', who: ['human', 'system'] },
    { from: 'active', to: 'fading', who: ['system'] },
    { from: 'fading', to: 'active', who: ['system', 'human'] },
    { from: 'fading', to: 'trashed', who: ['system'] },
    { from: 'active', to: 'trashed', who: ['ai', 'human'] },
    { from: 'fading', to: 'trashed', who: ['ai', 'human'] },
    { from: 'trashed', to: 'active', who: ['human'] },
    { from: 'active', to: 'superseded', who: ['ai', 'human'] },
]);
export function assertTransition(from, to, who) {
    if (to === 'draft')
        throw new Error(`state.${to}: returning to draft is forbidden (it would erase memory history)`);
    if (from === 'trashed' && to === 'superseded')
        throw new Error('state.superseded: trashed records cannot be corrected');
    if (!LEGAL_TRANSITIONS.some((rule) => rule.from === from && rule.to === to && rule.who.includes(who))) {
        throw new Error(`state: illegal transition ${from} -> ${to} by ${who}`);
    }
}
//# sourceMappingURL=state.js.map