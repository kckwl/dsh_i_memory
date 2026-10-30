import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG } from '../config.js';
import { clone, stableStringify } from '../utils.js';
import { normalizeRecord } from './schema.js';
import { replayMemoryEvent, stateEvent } from './events.js';
import { redactDeep } from './redaction.js';
import { migrateRecord } from './migration.js';
/** JSONL event store: no update method exists by design. */
export class MemoryStore {
    file;
    config;
    events = [];
    records = new Map();
    firstBody = new Map();
    pending = [];
    pendingBodies = new Map();
    sequence = 0;
    cachedView;
    writeFailure = null;
    appendListeners = new Set();
    redactor;
    personalNames = [];
    constructor(file, config = DEFAULT_CONFIG, privacy = {}) {
        this.file = file;
        this.config = config;
        this.redactor = privacy.redactor;
        this.personalNames = privacy.personalNames ?? [];
        if (file)
            this.load();
    }
    load() {
        if (!this.file || !existsSync(this.file))
            return;
        const text = readFileSync(this.file, 'utf8');
        for (const [index, line] of text.split(/\r?\n/).entries()) {
            if (!line.trim())
                continue;
            let event;
            try {
                event = JSON.parse(line);
            }
            catch (error) {
                throw new Error(`store:${index + 1}: malformed JSONL (${error.message})`);
            }
            this.apply(event, false, line);
        }
    }
    /** Append a sanitized immutable record. draft becomes active immediately unless review is explicitly requested. */
    append(input, options) {
        if (!options?.now)
            throw new Error('append.now: required (the store never reads the wall clock implicitly)');
        if (this.records.has(input.id) || this.pendingBodies.has(input.id))
            throw new Error(`id: conflict; immutable record ${input.id} already exists`);
        const copy = clone(input);
        const redacted = redactDeep(copy, {
            ...((options.personalRedactor ?? this.redactor) ? { redactor: (options.personalRedactor ?? this.redactor) } : {}),
            personalNames: options.personalNames ?? this.personalNames,
        });
        const record = redacted.value;
        const initialNext = record.next;
        record.next = null; // bridge topology comes only from link events
        if (record.state === 'trashed' || record.state === 'superseded' || record.state === 'fading') {
            throw new Error(`state: new records must start as draft/review/active, not ${record.state}; append a lifecycle event instead`);
        }
        record.createdAt = record.createdAt ?? options.now;
        if (redacted.sensitivity === 'internal' && record.sensitivity === 'normal')
            record.sensitivity = 'internal';
        if (record.state === 'draft') {
            record.state = 'active';
            record.history = [...record.history, { at: options.now, who: options.who ?? 'ai', what: 'draft->active', why: '落库即生效，不等待人工审批' }];
        }
        record.projectedAt = options.now;
        const normalized = normalizeRecord(record, { keywordLimit: this.config.keywordLimit });
        const event = { type: 'memory', at: options.now, record: normalized };
        const body = JSON.stringify(normalized);
        this.commit(event, body);
        if (initialNext) {
            this.commit({ type: 'link', at: options.now, id: `${record.id}->${initialNext}`, from: record.id, to: initialNext });
        }
        // Return the projection, not the pre-link body: callers must see the bridge they just created.
        return { record: this.requireAny(record.id), initialBytes: body };
    }
    /**
     * Projections that live outside the store (bridges, indexes) subscribe here instead of
     * re-scanning at construction. Without it, a `next` written by ingest stays invisible
     * to BridgeStore until the process restarts.
     */
    onAppend(listener) {
        this.appendListeners.add(listener);
        return () => { this.appendListeners.delete(listener); };
    }
    /** Explicit high-impact/low-confidence route; unlike draft, this does wait for approval. */
    appendForReview(input, options) {
        const copy = clone(input);
        if (copy.state !== 'draft' && copy.state !== 'review')
            throw new Error('state: review ingestion must begin at draft or review');
        copy.state = 'review';
        // Review is a lifecycle change like any other; the audit trail must say who queued it.
        copy.history = [...copy.history, { at: options.now, who: options.who ?? 'ai', what: 'draft->review', why: '高影响／低置信，进入人工待审队列' }];
        return this.append(copy, options);
    }
    get(id) {
        const record = this.records.get(id);
        if (!record || record.state === 'trashed' || record.state === 'superseded')
            return undefined;
        return clone(record);
    }
    /** Human/audit-only access; ordinary retrieval and get() both hide trashed content. */
    getForAudit(id) {
        const record = this.records.get(id);
        return record ? clone(record) : undefined;
    }
    trace(id) {
        const record = this.records.get(id);
        return record ? clone(record.trace) : undefined;
    }
    scan(range = {}) {
        const from = range.from ? Date.parse(range.from) : -Infinity;
        const to = range.to ? Date.parse(range.to) : Infinity;
        return [...this.records.values()]
            .filter((record) => {
            const at = Date.parse(record.time.at);
            return at >= from && at <= to && (range.includeHidden || (record.state !== 'trashed' && record.state !== 'superseded'));
        })
            .sort((a, b) => Date.parse(a.time.at) - Date.parse(b.time.at) || a.id.localeCompare(b.id))
            .map(clone);
    }
    allIds() { return [...this.records.keys()].sort(); }
    size() { return this.records.size; }
    eventCount() { return this.events.length; }
    /** Bumped by every applied event; the only thing a cached projection needs to check. */
    get version() { return this.sequence; }
    /**
     * Internal read-only view: the same ordering as scan(), but without cloning every record.
     * Callers must treat the returned records as immutable; anything that leaves the process
     * or is handed to a caller still goes through scan()/get().
     */
    view() {
        if (!this.cachedView || this.cachedView.version !== this.sequence) {
            this.cachedView = {
                version: this.sequence,
                records: [...this.records.values()].sort((a, b) => Date.parse(a.time.at) - Date.parse(b.time.at) || a.id.localeCompare(b.id)),
            };
        }
        return this.cachedView.records;
    }
    bufferedCount() { return this.pending.length; }
    rawEventLines() { return this.events.map((event) => JSON.stringify(event)); }
    transition(id, to, options) {
        const record = this.requireAny(id);
        const event = stateEvent(record, to, options.at, options.who, options.why, options.restoreDiscount, options.previousValue);
        this.commit(this.sanitizeEvent(event));
        return this.requireAny(id);
    }
    logUse(id, use) {
        this.requireVisible(id);
        this.commit({ type: 'use', at: use.at, id, use: clone(use) });
    }
    addAnnotation(id, annotation) {
        this.requireAny(id);
        this.appendEvent({ type: 'annotation', at: annotation.at, id, annotation: clone(annotation) });
    }
    addInterpretation(id, interpretation) {
        // Superseded evidence remains correctable/auditable even though ordinary reads hide it.
        this.requireAny(id);
        this.appendEvent({ type: 'interpretation', at: interpretation.at, id, interpretation: clone(interpretation) });
    }
    /** Used only for normalization/merges: the original body and keyword history stay append-only. */
    replaceKeywords(id, keywords, at, why) {
        this.requireVisible(id);
        this.appendEvent({ type: 'keywords', at, id, keywords: clone(keywords), why });
    }
    appendEvent(event) {
        if (event.type === 'memory')
            throw new Error('event.type: use append(record), never appendEvent(memory)');
        const sanitized = this.sanitizeEvent(event);
        this.commit(sanitized);
        return sanitized;
    }
    sanitizeEvent(event) {
        const result = redactDeep(event, { ...(this.redactor ? { redactor: this.redactor } : {}), personalNames: this.personalNames });
        return result.value;
    }
    requireAny(id) {
        const record = this.records.get(id);
        if (!record)
            throw new Error(`id: unknown memory ${id}`);
        return clone(record);
    }
    requireVisible(id) {
        const record = this.records.get(id);
        if (!record || record.state === 'trashed' || record.state === 'superseded')
            throw new Error(`id: memory ${id} is absent, trashed, or superseded`);
        return clone(record);
    }
    apply(event, countPending, initialLine) {
        if (event.type === 'memory') {
            if (this.records.has(event.record.id))
                throw new Error(`id: conflict while loading ${event.record.id}`);
            this.records.set(event.record.id, migrateRecord(event.record, event.at, this.config.keywordLimit));
            if (initialLine) {
                const parsed = JSON.parse(initialLine);
                this.firstBody.set(event.record.id, JSON.stringify(parsed.record));
            }
            else {
                this.firstBody.set(event.record.id, JSON.stringify(event.record));
            }
        }
        else if ('from' in event && (event.type === 'link' || event.type === 'link/replace' || event.type === 'link/walk')) {
            // Link events are projected by BridgeStore. A missing body is a legal dangling bridge.
            const record = this.records.get(event.from);
            if (record && event.type !== 'link/walk') {
                const projected = replayMemoryEvent(record, event, this.config);
                this.records.set(event.from, projected);
            }
        }
        else {
            const record = this.records.get(event.id);
            if (!record)
                throw new Error(`event.id: ${event.id} has no memory body`);
            const projected = replayMemoryEvent(record, event, this.config);
            if (event.type === 'merge') {
                for (const source of event.sources) {
                    if (source === event.id)
                        throw new Error('merge.sources: keeper cannot be its own source');
                    const sourceRecord = this.records.get(source);
                    if (!sourceRecord)
                        throw new Error(`merge.sources: unknown ${source}`);
                }
            }
            this.records.set(event.id, projected);
        }
        this.events.push(clone(event));
        this.sequence++;
        if (countPending) {
            this.pending.push(clone(event));
            for (const listener of this.appendListeners)
                listener(clone(event));
        }
    }
    commit(event, body) {
        this.apply(event, true);
        if (event.type === 'memory' && body)
            this.pendingBodies.set(event.record.id, body);
        this.flush();
    }
    /** Failure is deliberately lazy: accepted events remain buffered until a later successful write. */
    flush() {
        if (!this.file || this.pending.length === 0 || this.writeFailure)
            return;
        try {
            mkdirSync(dirname(this.file), { recursive: true });
            const lines = this.pending.map((event) => JSON.stringify(event)).join('\n') + '\n';
            appendFileSync(this.file, lines, 'utf8');
            this.pending.splice(0);
            this.pendingBodies.clear();
        }
        catch (error) {
            this.writeFailure = error;
        }
        // A failed first append may leave no file; an empty log is still a valid empty store.
        if (this.writeFailure && this.file && !existsSync(this.file)) {
            try {
                writeFileSync(this.file, '', { encoding: 'utf8', flag: 'a' });
            }
            catch { /* the buffered event remains authoritative */ }
        }
    }
    /** Test/ops hook: fail the next physical append without losing accepted in-memory events. */
    failNextWrite(error = new Error('simulated disk failure')) { this.writeFailure = error; }
    retryWrites() {
        if (!this.file) {
            this.pending.splice(0);
            this.pendingBodies.clear();
            return;
        }
        const error = this.writeFailure;
        this.writeFailure = null;
        this.flush();
        if (this.writeFailure)
            throw this.writeFailure;
        if (error && this.pending.length === 0)
            return;
    }
    /** Return the exact original immutable JSON bytes, independent of later projections. */
    originalBytes(id) {
        return this.firstBody.get(id) ?? this.pendingBodies.get(id);
    }
    snapshot() { return clone(this.events); }
    stableDigest() { return stableStringify(this.events); }
}
//# sourceMappingURL=store.js.map