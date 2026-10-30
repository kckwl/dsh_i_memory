import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { clone } from '../utils.js';
export function emptySnapshot(at = new Date(0).toISOString()) {
    return { version: 1, computedAt: at, total: 0, whole: {}, part: {} };
}
export function rebuildIDF(records, at) {
    const whole = {};
    const part = {};
    let total = 0;
    for (const record of records) {
        if (record.state === 'trashed' || record.state === 'superseded')
            continue;
        total++;
        for (const level of ['whole', 'part']) {
            const counts = level === 'whole' ? whole : part;
            for (const text of new Set(record.keywords.filter((keyword) => keyword.level === level).map((keyword) => keyword.text))) {
                counts[text] = (counts[text] ?? 0) + 1;
            }
        }
    }
    return { version: 1, computedAt: at, total, whole, part };
}
export class IDFIndex {
    snapshot;
    previous;
    current;
    constructor(records = [], at = new Date(0).toISOString(), options = {}) {
        this.current = rebuildIDF(records, at);
        this.snapshot = options.previousSnapshot;
        this.previous = options.fallback;
    }
    add(record) { if (record.state === 'active' || record.state === 'fading')
        this.update(record, 1); }
    /** Re-align live counts with lifecycle projections; frozen snapshots are untouched. */
    reconcile(records, at) { this.current = rebuildIDF(records, at); }
    remove(record) { if (record.state === 'active' || record.state === 'fading')
        this.update(record, -1); }
    update(record, delta) {
        this.current.total = Math.max(0, this.current.total + delta);
        for (const level of ['whole', 'part']) {
            const target = this.current[level];
            for (const text of new Set(record.keywords.filter((keyword) => keyword.level === level).map((keyword) => keyword.text))) {
                target[text] = Math.max(0, (target[text] ?? 0) + delta);
            }
        }
    }
    consolidate(records, at) {
        if (this.snapshot)
            this.previous = clone(this.snapshot);
        this.current = rebuildIDF(records, at);
        this.snapshot = clone(this.current);
        return clone(this.snapshot);
    }
    /** Query-side live df: uses incremental counts even before the daily snapshot. */
    liveDF(text, level) {
        return this.current[level][text] ?? 0;
    }
    liveIDF(text, level) {
        const df = this.liveDF(text, level);
        return Math.log((this.current.total + 1) / (df + 1)) + 1;
    }
    /** Frozen daily score. Missing terms are new/rare: df=0 in the snapshot, never df=total. */
    idf(text, level) {
        const snapshot = this.snapshot ?? this.previous;
        if (!snapshot)
            return 1;
        const df = snapshot[level][text] ?? 0;
        return Math.log((snapshot.total + 1) / (df + 1)) + 1;
    }
    frozen() { const value = this.snapshot ?? this.previous; return value ? clone(value) : undefined; }
    /** The snapshot retained for the "missing current, use previous" degradation path. */
    previousSnapshot() { return this.previous ? clone(this.previous) : undefined; }
    live() { return clone(this.current); }
    freeze(at) {
        if (this.snapshot)
            this.previous = clone(this.snapshot);
        this.snapshot = clone(this.current);
        if (at)
            this.snapshot.computedAt = at;
        return clone(this.snapshot);
    }
    loseSnapshots() { this.snapshot = undefined; this.previous = undefined; }
    restorePrevious(snapshot) { this.previous = clone(snapshot); this.snapshot = undefined; }
}
export function saveIDFSnapshot(file, current, previous) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    const document = { format: 'idf-snapshots/v1', current, ...(previous ? { previous } : {}) };
    writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    renameSync(temp, file);
}
export function loadIDFSnapshots(file) {
    if (!existsSync(file))
        return { current: undefined, previous: undefined };
    const value = JSON.parse(readFileSync(file, 'utf8'));
    // Legacy files stored a bare snapshot; they simply have no previous to fall back to.
    if (value && typeof value === 'object' && 'current' in value)
        return { current: value.current, previous: value.previous };
    return { current: value, previous: undefined };
}
//# sourceMappingURL=idf.js.map