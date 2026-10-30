import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stableStringify } from '../utils.js';
/** Session-scoped crash recovery only. No long-term anchor history is retained. */
export class AnchorStore {
    file;
    constructor(file) {
        this.file = file;
    }
    save(sessionId, anchor) {
        if (anchor.sessionId !== sessionId)
            throw new Error('anchor.sessionId: cannot save another session\'s anchor');
        mkdirSync(dirname(this.file), { recursive: true });
        const temp = `${this.file}.tmp`;
        writeFileSync(temp, `${stableStringify({ version: 1, sessionId, anchor })}\n`, 'utf8');
        renameSync(temp, this.file);
    }
    load(sessionId, now) {
        if (!existsSync(this.file))
            return undefined;
        const stored = JSON.parse(readFileSync(this.file, 'utf8'));
        if (stored.version !== 1 || stored.sessionId !== sessionId || stored.anchor.sessionId !== sessionId)
            return undefined;
        if (Date.parse(now) - Date.parse(stored.anchor.t) > stored.anchor.ttlMs)
            return undefined;
        return structuredClone(stored.anchor);
    }
    clear(sessionId) {
        if (!existsSync(this.file))
            return;
        if (sessionId) {
            const stored = JSON.parse(readFileSync(this.file, 'utf8'));
            if (stored.sessionId !== sessionId)
                return;
        }
        rmSync(this.file, { force: true });
    }
}
//# sourceMappingURL=anchor-store.js.map