import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnyRecord, IDFSnapshot, Keyword } from '../types.js';
import { clone } from '../utils.js';

export interface IDFOptions {
  previousSnapshot?: IDFSnapshot;
  /** A missing current and previous snapshot deliberately means all IDFs = 1. */
  fallback?: IDFSnapshot;
}
export function emptySnapshot(at = new Date(0).toISOString()): IDFSnapshot {
  return { version: 1, computedAt: at, total: 0, whole: {}, part: {} };
}
export function rebuildIDF(records: readonly AnyRecord[], at: string): IDFSnapshot {
  const whole: Record<string, number> = {};
  const part: Record<string, number> = {};
  let total = 0;
  for (const record of records) {
    if (record.state === 'trashed' || record.state === 'superseded') continue;
    total++;
    for (const level of ['whole', 'part'] as const) {
      const counts = level === 'whole' ? whole : part;
      for (const text of new Set(record.keywords.filter((keyword) => keyword.level === level).map((keyword) => keyword.text))) {
        counts[text] = (counts[text] ?? 0) + 1;
      }
    }
  }
  return { version: 1, computedAt: at, total, whole, part };
}
export class IDFIndex {
  private snapshot: IDFSnapshot | undefined;
  private previous: IDFSnapshot | undefined;
  private current: IDFSnapshot;
  constructor(records: readonly AnyRecord[] = [], at = new Date(0).toISOString(), options: IDFOptions = {}) {
    this.current = rebuildIDF(records, at);
    this.snapshot = options.previousSnapshot;
    this.previous = options.fallback;
  }
  add(record: AnyRecord): void { if (record.state === 'active' || record.state === 'fading') this.update(record, 1); }
  /** Re-align live counts with lifecycle projections; frozen snapshots are untouched. */
  reconcile(records: readonly AnyRecord[], at: string): void { this.current = rebuildIDF(records, at); }
  remove(record: AnyRecord): void { if (record.state === 'active' || record.state === 'fading') this.update(record, -1); }
  private update(record: AnyRecord, delta: number): void {
    this.current.total = Math.max(0, this.current.total + delta);
    for (const level of ['whole', 'part'] as const) {
      const target = this.current[level] as Record<string, number>;
      for (const text of new Set(record.keywords.filter((keyword) => keyword.level === level).map((keyword) => keyword.text))) {
        target[text] = Math.max(0, (target[text] ?? 0) + delta);
      }
    }
  }
  consolidate(records: readonly AnyRecord[], at: string): IDFSnapshot {
    if (this.snapshot) this.previous = clone(this.snapshot);
    this.current = rebuildIDF(records, at);
    this.snapshot = clone(this.current);
    return clone(this.snapshot);
  }
  /** Query-side live df: uses incremental counts even before the daily snapshot. */
  liveDF(text: string, level: 'whole' | 'part'): number {
    return this.current[level][text] ?? 0;
  }
  liveIDF(text: string, level: 'whole' | 'part'): number {
    const df = this.liveDF(text, level);
    return Math.log((this.current.total + 1) / (df + 1)) + 1;
  }
  /** Frozen daily score. Missing terms are new/rare: df=0 in the snapshot, never df=total. */
  idf(text: string, level: 'whole' | 'part'): number {
    const snapshot = this.snapshot ?? this.previous;
    if (!snapshot) return 1;
    const df = snapshot[level][text] ?? 0;
    return Math.log((snapshot.total + 1) / (df + 1)) + 1;
  }
  frozen(): IDFSnapshot | undefined { const value = this.snapshot ?? this.previous; return value ? clone(value) : undefined; }
  /** The snapshot retained for the "missing current, use previous" degradation path. */
  previousSnapshot(): IDFSnapshot | undefined { return this.previous ? clone(this.previous) : undefined; }
  live(): IDFSnapshot { return clone(this.current); }
  freeze(at?: string): IDFSnapshot {
    if (this.snapshot) this.previous = clone(this.snapshot);
    this.snapshot = clone(this.current);
    if (at) this.snapshot.computedAt = at;
    return clone(this.snapshot);
  }
  loseSnapshots(): void { this.snapshot = undefined; this.previous = undefined; }
  restorePrevious(snapshot: IDFSnapshot): void { this.previous = clone(snapshot); this.snapshot = undefined; }
}
export interface IDFSnapshotDocument {
  format: 'idf-snapshots/v1';
  current: IDFSnapshot;
  /** Kept on disk so "current is missing, fall back to previous" survives a restart. */
  previous?: IDFSnapshot;
}
export function saveIDFSnapshot(file: string, current: IDFSnapshot, previous?: IDFSnapshot): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  const document: IDFSnapshotDocument = { format: 'idf-snapshots/v1', current, ...(previous ? { previous } : {}) };
  writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}
export function loadIDFSnapshots(file: string): { current: IDFSnapshot | undefined; previous: IDFSnapshot | undefined } {
  if (!existsSync(file)) return { current: undefined, previous: undefined };
  const value = JSON.parse(readFileSync(file, 'utf8')) as IDFSnapshotDocument | IDFSnapshot;
  // Legacy files stored a bare snapshot; they simply have no previous to fall back to.
  if (value && typeof value === 'object' && 'current' in value) return { current: value.current, previous: value.previous };
  return { current: value, previous: undefined };
}
