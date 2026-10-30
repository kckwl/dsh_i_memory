import { DEFAULT_CONFIG, type MemoryConfig } from '../config.js';
import type { AnyRecord, MemoryState, UseEvent } from '../types.js';
import { millis } from '../utils.js';

export interface ProficiencyBreakdown {
  recentUses: number;
  useComponent: number;
  importanceComponent: number;
  decay: number;
  value: number;
  latestUseAt?: string;
}
export function recentUses(record: AnyRecord, now: string, tauMs: number): number {
  const at = millis(now);
  return record.use_log.reduce((sum, use) => {
    const elapsed = Math.max(0, at - millis(use.at));
    return sum + Math.exp(-elapsed / tauMs);
  }, 0);
}
/** §7.3: uses plus independently decaying importance, then overall salience-modulated decay. */
export function proficiencyAt(record: AnyRecord, now: string, config: MemoryConfig = DEFAULT_CONFIG): ProficiencyBreakdown {
  const at = millis(now);
  const created = millis(record.createdAt);
  const restoredAt = record.forgotten ? millis(record.forgotten.at) : -Infinity;
  const lastUse = record.lastUsedAt ? millis(record.lastUsedAt) : -Infinity;
  // Lifecycle annotations never reset decay. Only drafting or a human restoration
  // establishes a new low-value baseline; restoration is not original-score recovery.
  const baseline = Math.max(created, restoredAt, lastUse);
  const elapsed = Math.max(0, at - baseline);
  const recent = recentUses(record, now, config.tauBaseMs);
  const importanceElapsed = Math.max(0, at - baseline);
  const useComponent = config.w1 * recent;
  const importanceComponent = config.w2 * record.importance * Math.exp(-importanceElapsed / config.tauImpMs);
  const tauEffective = config.tauBaseMs * (1 + config.kappa * record.salience);
  const decay = Math.exp(-elapsed / tauEffective);
  let value = (useComponent + importanceComponent) * decay;
  if (record.forgotten && restoredAt === baseline) {
    const restoredValue = record.forgotten.restoreTarget * decay;
    value = Math.min(value, restoredValue);
  }
  const lastUseIso = record.lastUsedAt;
  return {
    recentUses: recent,
    useComponent,
    importanceComponent,
    decay,
    value,
    ...(lastUseIso ? { latestUseAt: lastUseIso } : {}),
  };
}
/** Uses are counted only after the drafting orchestrator emits a unique use event. */
export function useEvent(recordId: string, recallId: string, sessionId: string, at: string): UseEvent {
  if (!recordId || !recallId || !sessionId) throw new Error('use: recordId, recallId and sessionId are required');
  return { at, sessionId, recallId, drafted: true };
}
export function projectedLifecycleState(record: AnyRecord, now: string, config: MemoryConfig = DEFAULT_CONFIG): MemoryState {
  const value = proficiencyAt(record, now, config).value;
  if (record.state === 'trashed' || record.state === 'superseded' || record.state === 'review' || record.state === 'draft') return record.state;
  if (value < config.thetaDel) return record.state === 'active' || record.state === 'fading' ? 'fading' : record.state;
  if (value < config.fadingThreshold) return 'fading';
  return 'active';
}
