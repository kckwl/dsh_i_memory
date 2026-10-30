import { ANCHOR_SLOTS, DEFAULT_CONFIG, STOP_FORMULA_VERSION } from '../config.js';
import { clone, millis, stableStringify } from '../utils.js';
export function emptyAnchor(input, config = DEFAULT_CONFIG) {
    return {
        slots: Array.from({ length: ANCHOR_SLOTS }, () => ({ writtenAt: input.at, ttlMs: config.anchorTtlMs })),
        current: -1,
        position: input.position,
        used: [...(input.positionIds ?? [])],
        round: 0,
        itmx: 0,
        itxh: 0,
        t: input.at,
        func: STOP_FORMULA_VERSION,
        ttlMs: config.anchorTtlMs,
        gaps: [],
        sessionId: input.sessionId ?? 'default',
    };
}
export function isSlotAlive(slot, now) {
    return millis(now) - millis(slot.writtenAt) <= slot.ttlMs;
}
export function readDraft(anchor, now) {
    for (let offset = 0; offset < ANCHOR_SLOTS; offset++) {
        const index = (anchor.current - offset + ANCHOR_SLOTS) % ANCHOR_SLOTS;
        const slot = anchor.slots[index];
        if (slot?.draft && isSlotAlive(slot, now))
            return { draft: clone(slot.draft), slot: index };
    }
    return { slot: anchor.current };
}
export function writeDraft(anchor, draft, calibration) {
    const next = clone(anchor);
    const target = (next.current + 1) % ANCHOR_SLOTS;
    next.slots[target] = {
        draft: clone(draft),
        calibration: clone(calibration),
        writtenAt: calibration.at,
        ttlMs: next.ttlMs,
    };
    // Keep the new current slot pointing at the draft; the other slots hold calibration history.
    next.current = target;
    next.round = calibration.round;
    next.itmx = calibration.itmx;
    next.itxh = calibration.itxh;
    next.t = calibration.at;
    next.func = calibration.func ?? STOP_FORMULA_VERSION;
    return next;
}
export function previousCalibration(anchor, now, func = STOP_FORMULA_VERSION) {
    // A calibration made by another formula model must not be mixed into this one.
    if (anchor.func !== func)
        return undefined;
    for (let offset = 0; offset < ANCHOR_SLOTS; offset++) {
        const index = (anchor.current - offset + ANCHOR_SLOTS * 2) % ANCHOR_SLOTS;
        const slot = anchor.slots[index];
        if (slot?.calibration && isSlotAlive(slot, now))
            return clone(slot.calibration);
    }
    return undefined;
}
export function clearAnchor() { return null; }
export function serializeAnchor(anchor) { return stableStringify(anchor); }
//# sourceMappingURL=anchor.js.map