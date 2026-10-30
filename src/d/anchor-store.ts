import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Anchor } from './anchor.js';
import { stableStringify } from '../utils.js';

/** Session-scoped crash recovery only. No long-term anchor history is retained. */
export class AnchorStore {
  constructor(readonly file: string) {}
  save(sessionId: string, anchor: Anchor): void {
    if (anchor.sessionId !== sessionId) throw new Error('anchor.sessionId: cannot save another session\'s anchor');
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, `${stableStringify({ version: 1, sessionId, anchor })}\n`, 'utf8');
    renameSync(temp, this.file);
  }
  load(sessionId: string, now: string): Anchor | undefined {
    if (!existsSync(this.file)) return undefined;
    const stored = JSON.parse(readFileSync(this.file, 'utf8')) as { version: 1; sessionId: string; anchor: Anchor };
    if (stored.version !== 1 || stored.sessionId !== sessionId || stored.anchor.sessionId !== sessionId) return undefined;
    if (Date.parse(now) - Date.parse(stored.anchor.t) > stored.anchor.ttlMs) return undefined;
    return structuredClone(stored.anchor);
  }
  clear(sessionId?: string): void {
    if (!existsSync(this.file)) return;
    if (sessionId) {
      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as { sessionId?: string };
      if (stored.sessionId !== sessionId) return;
    }
    rmSync(this.file, { force: true });
  }
}
