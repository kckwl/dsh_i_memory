import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
/** Daily rate limits and human-review queue survive process restarts. */
export class MaintenanceStore {
    file;
    document = { version: 1, counts: {}, pending: [] };
    constructor(file) {
        this.file = file;
        this.load();
    }
    load() {
        if (!this.file || !existsSync(this.file))
            return;
        const stored = JSON.parse(readFileSync(this.file, 'utf8'));
        if (stored.version !== 1 || !stored.counts || !Array.isArray(stored.pending))
            throw new Error('maintenance: unsupported document');
        this.document = { version: 1, counts: { ...stored.counts }, pending: stored.pending.map((item) => ({ ...item })) };
    }
    save() {
        if (!this.file)
            return;
        mkdirSync(dirname(this.file), { recursive: true });
        const temp = `${this.file}.tmp`;
        writeFileSync(temp, `${JSON.stringify(this.document, null, 2)}\n`, 'utf8');
        renameSync(temp, this.file);
    }
    count(day) { return this.document.counts[day] ?? 0; }
    increment(day) { this.document.counts[day] = this.count(day) + 1; this.save(); }
    enqueue(item) {
        if (!this.document.pending.some((entry) => entry.id === item.id))
            this.document.pending.push({ ...item });
        this.save();
    }
    pending() { return this.document.pending.map((item) => ({ ...item })); }
    approve(id) {
        const index = this.document.pending.findIndex((item) => item.id === id);
        if (index < 0)
            return undefined;
        const [item] = this.document.pending.splice(index, 1);
        this.save();
        return item;
    }
}
//# sourceMappingURL=maintenance-store.js.map