import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG, type MemoryConfig } from '../config.js';
import type { Actor, AnyRecord, MemoryState, NewRecord, UseEvent } from './store-types.js';
import type { Annotation, Interpretation, Keyword, Precision } from '../types.js';
import { clone, stableStringify } from '../utils.js';
import { normalizeRecord } from './schema.js';
import { replayMemoryEvent, stateEvent, type StoreEvent } from './events.js';
import { redactDeep, type PersonalRedactor } from './redaction.js';
import { migrateRecord } from './migration.js';

export interface AppendOptions {
  now: string;
  who?: Actor;
  why?: string;
  personalRedactor?: PersonalRedactor;
  personalNames?: readonly string[];
}
export interface ScanOptions {
  from?: string;
  to?: string;
  precision?: Precision;
  includeHidden?: boolean;
}
export interface StoredMemory {
  readonly record: AnyRecord;
  /** Exact event line used for the initial immutable body, for byte-equality checks. */
  readonly initialBytes: string;
}

/** JSONL event store: no update method exists by design. */
export class MemoryStore {
  private readonly events: StoreEvent[] = [];
  private readonly records = new Map<string, AnyRecord>();
  private readonly firstBody = new Map<string, string>();
  private readonly pending: StoreEvent[] = [];
  private readonly pendingBodies = new Map<string, string>();
  private sequence = 0;
  private cachedView: { version: number; records: readonly AnyRecord[] } | undefined;
  private writeFailure: Error | null = null;
  private readonly appendListeners = new Set<(event: StoreEvent) => void>();
  private redactor: PersonalRedactor | undefined;
  private personalNames: readonly string[] = [];

  constructor(readonly file?: string, private readonly config: MemoryConfig = DEFAULT_CONFIG, privacy: { redactor?: PersonalRedactor; personalNames?: readonly string[] } = {}) {
    this.redactor = privacy.redactor;
    this.personalNames = privacy.personalNames ?? [];
    if (file) this.load();
  }
  private load(): void {
    if (!this.file || !existsSync(this.file)) return;
    const text = readFileSync(this.file, 'utf8');
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let event: StoreEvent;
      try { event = JSON.parse(line) as StoreEvent; }
      catch (error) { throw new Error(`store:${index + 1}: malformed JSONL (${(error as Error).message})`); }
      this.apply(event, false, line);
    }
  }
  /** Append a sanitized immutable record. draft becomes active immediately unless review is explicitly requested. */
  append<K extends AnyRecord['kind']>(input: NewRecord<K>, options: AppendOptions): StoredMemory {
    if (!options?.now) throw new Error('append.now: required (the store never reads the wall clock implicitly)');
    if (this.records.has(input.id) || this.pendingBodies.has(input.id)) throw new Error(`id: conflict; immutable record ${input.id} already exists`);
    const copy = clone(input);
    const redacted = redactDeep(copy, {
      ...((options.personalRedactor ?? this.redactor) ? { redactor: (options.personalRedactor ?? this.redactor)! } : {}),
      personalNames: options.personalNames ?? this.personalNames,
    });
    const record: AnyRecord = redacted.value as unknown as AnyRecord;
    const initialNext = record.next;
    record.next = null; // bridge topology comes only from link events
    if (record.state === 'trashed' || record.state === 'superseded' || record.state === 'fading') {
      throw new Error(`state: new records must start as draft/review/active, not ${record.state}; append a lifecycle event instead`);
    }
    record.createdAt = record.createdAt ?? options.now;
    if (redacted.sensitivity === 'internal' && record.sensitivity === 'normal') record.sensitivity = 'internal';
    if (record.state === 'draft') {
      record.state = 'active';
      record.history = [...record.history, { at: options.now, who: options.who ?? 'ai', what: 'draft->active', why: '落库即生效，不等待人工审批' }];
    }
    record.projectedAt = options.now;
    const normalized = normalizeRecord(record, { keywordLimit: this.config.keywordLimit }) as unknown as AnyRecord;
    const event: StoreEvent = { type: 'memory', at: options.now, record: normalized };
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
  onAppend(listener: (event: StoreEvent) => void): () => void {
    this.appendListeners.add(listener);
    return () => { this.appendListeners.delete(listener); };
  }
  /** Explicit high-impact/low-confidence route; unlike draft, this does wait for approval. */
  appendForReview<K extends AnyRecord['kind']>(input: NewRecord<K>, options: AppendOptions): StoredMemory {
    const copy: AnyRecord = clone(input) as unknown as AnyRecord;
    if (copy.state !== 'draft' && copy.state !== 'review') throw new Error('state: review ingestion must begin at draft or review');
    copy.state = 'review';
    // Review is a lifecycle change like any other; the audit trail must say who queued it.
    copy.history = [...copy.history, { at: options.now, who: options.who ?? 'ai', what: 'draft->review', why: '高影响／低置信，进入人工待审队列' }];
    return this.append(copy, options);
  }
  get(id: string): AnyRecord | undefined {
    const record = this.records.get(id);
    if (!record || record.state === 'trashed' || record.state === 'superseded') return undefined;
    return clone(record);
  }
  /** Human/audit-only access; ordinary retrieval and get() both hide trashed content. */
  getForAudit(id: string): AnyRecord | undefined {
    const record = this.records.get(id);
    return record ? clone(record) : undefined;
  }
  trace(id: string) {
    const record = this.records.get(id);
    return record ? clone(record.trace) : undefined;
  }
  scan(range: ScanOptions = {}): AnyRecord[] {
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
  allIds(): string[] { return [...this.records.keys()].sort(); }
  size(): number { return this.records.size; }
  eventCount(): number { return this.events.length; }
  /** Bumped by every applied event; the only thing a cached projection needs to check. */
  get version(): number { return this.sequence; }
  /**
   * Internal read-only view: the same ordering as scan(), but without cloning every record.
   * Callers must treat the returned records as immutable; anything that leaves the process
   * or is handed to a caller still goes through scan()/get().
   */
  view(): readonly AnyRecord[] {
    if (!this.cachedView || this.cachedView.version !== this.sequence) {
      this.cachedView = {
        version: this.sequence,
        records: [...this.records.values()].sort((a, b) => Date.parse(a.time.at) - Date.parse(b.time.at) || a.id.localeCompare(b.id)),
      };
    }
    return this.cachedView.records;
  }
  bufferedCount(): number { return this.pending.length; }
  rawEventLines(): string[] { return this.events.map((event) => JSON.stringify(event)); }

  transition(id: string, to: MemoryState, options: { at: string; who: Actor; why: string; restoreDiscount?: number; previousValue?: number }): AnyRecord {
    const record = this.requireAny(id);
    const event = stateEvent(record, to, options.at, options.who, options.why, options.restoreDiscount, options.previousValue);
    this.commit(this.sanitizeEvent(event));
    return this.requireAny(id);
  }
  logUse(id: string, use: UseEvent): void {
    this.requireVisible(id);
    this.commit({ type: 'use', at: use.at, id, use: clone(use) });
  }
  addAnnotation(id: string, annotation: Annotation): void {
    this.requireAny(id);
    this.appendEvent({ type: 'annotation', at: annotation.at, id, annotation: clone(annotation) });
  }
  addInterpretation(id: string, interpretation: Interpretation): void {
    // Superseded evidence remains correctable/auditable even though ordinary reads hide it.
    this.requireAny(id);
    this.appendEvent({ type: 'interpretation', at: interpretation.at, id, interpretation: clone(interpretation) });
  }
  /** Used only for normalization/merges: the original body and keyword history stay append-only. */
  replaceKeywords(id: string, keywords: readonly Keyword[], at: string, why: string): void {
    this.requireVisible(id);
    this.appendEvent({ type: 'keywords', at, id, keywords: clone(keywords), why });
  }
  appendEvent(event: StoreEvent): StoreEvent {
    if (event.type === 'memory') throw new Error('event.type: use append(record), never appendEvent(memory)');
    const sanitized = this.sanitizeEvent(event);
    this.commit(sanitized);
    return sanitized;
  }
  private sanitizeEvent(event: StoreEvent): StoreEvent {
    const result = redactDeep(event, { ...(this.redactor ? { redactor: this.redactor } : {}), personalNames: this.personalNames });
    return result.value;
  }
  private requireAny(id: string): AnyRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`id: unknown memory ${id}`);
    return clone(record);
  }
  private requireVisible(id: string): AnyRecord {
    const record = this.records.get(id);
    if (!record || record.state === 'trashed' || record.state === 'superseded') throw new Error(`id: memory ${id} is absent, trashed, or superseded`);
    return clone(record);
  }
  private apply(event: StoreEvent, countPending: boolean, initialLine?: string): void {
    if (event.type === 'memory') {
      if (this.records.has(event.record.id)) throw new Error(`id: conflict while loading ${event.record.id}`);
      this.records.set(event.record.id, migrateRecord(event.record, event.at, this.config.keywordLimit));
      if (initialLine) {
        const parsed = JSON.parse(initialLine) as { record: AnyRecord };
        this.firstBody.set(event.record.id, JSON.stringify(parsed.record));
      } else {
        this.firstBody.set(event.record.id, JSON.stringify(event.record));
      }
    } else if ('from' in event && (event.type === 'link' || event.type === 'link/replace' || event.type === 'link/walk')) {
      // Link events are projected by BridgeStore. A missing body is a legal dangling bridge.
      const record = this.records.get(event.from);
      if (record && event.type !== 'link/walk') {
        const projected = replayMemoryEvent(record, event, this.config);
        this.records.set(event.from, projected);
      }
    } else {
      const record = this.records.get(event.id);
      if (!record) throw new Error(`event.id: ${event.id} has no memory body`);
      const projected = replayMemoryEvent(record, event, this.config);
      if (event.type === 'merge') {
        for (const source of event.sources) {
          if (source === event.id) throw new Error('merge.sources: keeper cannot be its own source');
          const sourceRecord = this.records.get(source);
          if (!sourceRecord) throw new Error(`merge.sources: unknown ${source}`);
        }
      }
      this.records.set(event.id, projected);
    }
    this.events.push(clone(event));
    this.sequence++;
    if (countPending) {
      this.pending.push(clone(event));
      for (const listener of this.appendListeners) listener(clone(event));
    }
  }
  private commit(event: StoreEvent, body?: string): void {
    this.apply(event, true);
    if (event.type === 'memory' && body) this.pendingBodies.set(event.record.id, body);
    this.flush();
  }
  /** Failure is deliberately lazy: accepted events remain buffered until a later successful write. */
  private flush(): void {
    if (!this.file || this.pending.length === 0 || this.writeFailure) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const lines = this.pending.map((event) => JSON.stringify(event)).join('\n') + '\n';
      appendFileSync(this.file, lines, 'utf8');
      this.pending.splice(0);
      this.pendingBodies.clear();
    } catch (error) {
      this.writeFailure = error as Error;
    }
    // A failed first append may leave no file; an empty log is still a valid empty store.
    if (this.writeFailure && this.file && !existsSync(this.file)) {
      try { writeFileSync(this.file, '', { encoding: 'utf8', flag: 'a' }); } catch { /* the buffered event remains authoritative */ }
    }
  }
  /** Test/ops hook: fail the next physical append without losing accepted in-memory events. */
  failNextWrite(error = new Error('simulated disk failure')): void { this.writeFailure = error; }
  retryWrites(): void {
    if (!this.file) { this.pending.splice(0); this.pendingBodies.clear(); return; }
    const error = this.writeFailure;
    this.writeFailure = null;
    this.flush();
    if (this.writeFailure) throw this.writeFailure;
    if (error && this.pending.length === 0) return;
  }
  /** Return the exact original immutable JSON bytes, independent of later projections. */
  originalBytes(id: string): string | undefined {
    return this.firstBody.get(id) ?? this.pendingBodies.get(id);
  }
  snapshot(): StoreEvent[] { return clone(this.events); }
  stableDigest(): string { return stableStringify(this.events); }
}

export type { AnyRecord, MemoryState, NewRecord, UseEvent, Actor };
export type { TimeRange } from './store-types.js';
