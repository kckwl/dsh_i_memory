import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PendingTrash { id: string; reason: string; at: string }
interface MaintenanceDocument {
  version: 1;
  counts: Record<string, number>;
  pending: PendingTrash[];
}
/** Daily rate limits and human-review queue survive process restarts. */
export class MaintenanceStore {
  private document: MaintenanceDocument = { version: 1, counts: {}, pending: [] };
  constructor(readonly file?: string) { this.load(); }
  private load(): void {
    if (!this.file || !existsSync(this.file)) return;
    const stored = JSON.parse(readFileSync(this.file, 'utf8')) as MaintenanceDocument;
    if (stored.version !== 1 || !stored.counts || !Array.isArray(stored.pending)) throw new Error('maintenance: unsupported document');
    this.document = { version: 1, counts: { ...stored.counts }, pending: stored.pending.map((item) => ({ ...item })) };
  }
  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.document, null, 2)}\n`, 'utf8');
    renameSync(temp, this.file);
  }
  count(day: string): number { return this.document.counts[day] ?? 0; }
  increment(day: string): void { this.document.counts[day] = this.count(day) + 1; this.save(); }
  enqueue(item: PendingTrash): void {
    if (!this.document.pending.some((entry) => entry.id === item.id)) this.document.pending.push({ ...item });
    this.save();
  }
  pending(): PendingTrash[] { return this.document.pending.map((item) => ({ ...item })); }
  approve(id: string): PendingTrash | undefined {
    const index = this.document.pending.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    const [item] = this.document.pending.splice(index, 1);
    this.save();
    return item;
  }
}
