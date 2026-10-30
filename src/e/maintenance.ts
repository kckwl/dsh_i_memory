import { DEFAULT_CONFIG, type MemoryConfig } from '../config.js';
import type { AnyRecord } from '../types.js';
import type { MemoryStore } from '../a/store.js';
import type { IDFIndex } from './idf.js';
import { proficiencyAt, projectedLifecycleState } from './proficiency.js';
import { MaintenanceStore } from './maintenance-store.js';

export type TrashResult =
  | { status: 'trashed'; record: AnyRecord }
  | { status: 'pending_human'; id: string; reason: string; at: string };
export class MemoryMaintenance {
  readonly persistence: MaintenanceStore;
  constructor(readonly store: MemoryStore, readonly idf: IDFIndex, private readonly config: MemoryConfig = DEFAULT_CONFIG, persistence?: MaintenanceStore) {
    this.persistence = persistence ?? new MaintenanceStore();
  }
  trash(id: string, reason: string, at: string, who: 'ai' | 'human' = 'ai'): TrashResult {
    if (!reason.trim()) throw new Error('trashReason: a non-empty human-readable reason is required');
    const record = this.store.getForAudit(id);
    if (!record) throw new Error(`id: unknown memory ${id}`);
    if (record.state === 'trashed') return { status: 'trashed', record };
    const day = at.slice(0, 10);
    const count = this.persistence.count(day);
    if (who === 'ai' && count >= this.config.trashPerDay) {
      this.persistence.enqueue({ id, reason, at });
      return { status: 'pending_human', id, reason, at };
    }
    const before = proficiencyAt(record, at, this.config).value;
    const result = this.store.transition(id, 'trashed', { at, who, why: reason });
    // The daily rate limit is an AI guard. A human emptying the trash by hand must not
    // consume the AI's quota, otherwise the AI is throttled by someone else's action.
    if (who === 'ai') this.persistence.increment(day);
    this.idf.remove(record);
    void before;
    return { status: 'trashed', record: result };
  }
  /** Human-only restoration: low proficiency, discounted future net value, and decay remains active. */
  restore(id: string, at: string, who: 'human' = 'human'): AnyRecord {
    const record = this.store.getForAudit(id);
    if (!record) throw new Error(`id: unknown memory ${id}`);
    const before = proficiencyAt(record, at, this.config).value;
    const restored = this.store.transition(id, 'active', { at, who, why: '人工审批恢复；标为曾被遗忘，净值打折', restoreDiscount: this.config.restoreDiscount, previousValue: before });
    // Re-index the surviving trace/keywords. The old record is not restored verbatim.
    this.idf.add(restored);
    // No original score is persisted; restoration metadata is the only new input.
    const after = proficiencyAt(restored, at, this.config).value;
    void before;
    void after;
    return restored;
  }
  tick(now: string): { faded: string[]; trashed: string[] } {
    const faded: string[] = [];
    const trashed: string[] = [];
    for (const record of this.store.scan()) {
      if (record.state !== 'active' && record.state !== 'fading') continue;
      const next = projectedLifecycleState(record, now, this.config);
      const value = proficiencyAt(record, now, this.config).value;
      if (value < this.config.thetaDel && record.state === 'fading') {
        this.store.transition(record.id, 'trashed', { at: now, who: 'system', why: `熟练度 ${value.toFixed(6)} 低于 θ_del=${this.config.thetaDel}` });
        this.idf.remove(record);
        trashed.push(record.id);
      } else if (next === 'fading' && record.state === 'active') {
        this.store.transition(record.id, 'fading', { at: now, who: 'system', why: '熟练度衰减，保留索引与痕迹' });
        faded.push(record.id);
      } else if (next === 'active' && record.state === 'fading') {
        this.store.transition(record.id, 'active', { at: now, who: 'system', why: '重新召回，恢复到可用状态' });
      }
    }
    return { faded, trashed };
  }
  countTrashed(day: string): number { return this.persistence.count(day); }
  pendingTrash() { return this.persistence.pending(); }
  approveTrash(id: string, at: string): TrashResult | undefined {
    const item = this.persistence.approve(id);
    return item ? this.trash(item.id, item.reason, at, 'human') : undefined;
  }
}
