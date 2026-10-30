import { ANCHOR_SLOTS, DEFAULT_CONFIG, STOP_FORMULA_VERSION, type MemoryConfig } from '../config.js';
import type { Gap } from '../types.js';
import { clone, millis, stableStringify } from '../utils.js';

export interface DraftFragment {
  memoryId?: string;
  text: string;
  /** Relevance is an orchestrator/model input, not a persisted derived score. */
  relevance: number;
  novelty?: number;
}
export interface Draft {
  fragments: DraftFragment[];
  conclusion: string;
  /** 0–1 self/novelty score of the conclusion, not of the fragments. */
  novelty: number;
  attemptFailures?: number;
}
export interface AnchorCalibration {
  at: string;
  itmx: number;
  itxh: number;
  round: number;
  /** Which progress model produced this calibration; defaults to the built-in one. */
  func?: string;
}
export interface AnchorSlot {
  draft?: Draft;
  calibration?: AnchorCalibration;
  writtenAt: string;
  ttlMs: number;
}
export interface Anchor {
  slots: AnchorSlot[];
  /** Index of the current draft slot, not the next write position. */
  current: number;
  position: string;
  used: string[];
  round: number;
  itmx: number;
  itxh: number;
  t: string;
  /** Which progress model produced the calibration stored in the slots. */
  func: string;
  ttlMs: number;
  gaps: Gap[];
  /** Session identity prevents one conversation's anchor leaking into another. */
  sessionId: string;
}
export interface AnchorInput {
  position: string;
  at: string;
  positionIds?: readonly string[];
  sessionId?: string;
}
export function emptyAnchor(input: AnchorInput, config: MemoryConfig = DEFAULT_CONFIG): Anchor {
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
export function isSlotAlive(slot: AnchorSlot, now: string): boolean {
  return millis(now) - millis(slot.writtenAt) <= slot.ttlMs;
}
export function readDraft(anchor: Anchor, now: string): { draft?: Draft; slot: number } {
  for (let offset = 0; offset < ANCHOR_SLOTS; offset++) {
    const index = (anchor.current - offset + ANCHOR_SLOTS) % ANCHOR_SLOTS;
    const slot = anchor.slots[index];
    if (slot?.draft && isSlotAlive(slot, now)) return { draft: clone(slot.draft), slot: index };
  }
  return { slot: anchor.current };
}
export function writeDraft(anchor: Anchor, draft: Draft, calibration: AnchorCalibration): Anchor {
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
export function previousCalibration(anchor: Anchor, now: string, func: string = STOP_FORMULA_VERSION): AnchorCalibration | undefined {
  // A calibration made by another formula model must not be mixed into this one.
  if (anchor.func !== func) return undefined;
  for (let offset = 0; offset < ANCHOR_SLOTS; offset++) {
    const index = (anchor.current - offset + ANCHOR_SLOTS * 2) % ANCHOR_SLOTS;
    const slot = anchor.slots[index];
    if (slot?.calibration && isSlotAlive(slot, now)) return clone(slot.calibration);
  }
  return undefined;
}
export function clearAnchor(): null { return null; }
export function serializeAnchor(anchor: Anchor): string { return stableStringify(anchor); }
