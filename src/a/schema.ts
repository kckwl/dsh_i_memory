import { clone, assertNonEmpty, assertNumberRange, millis } from '../utils.js';
import { KINDS, PRECISIONS, SENSITIVITIES, SOURCE_KINDS, STATES, SCHEMA_VERSION } from '../types.js';
import { DEFAULT_CONFIG } from '../config.js';
import type { AnyRecord, Kind, MemoryRecord, NewRecord, Payloads, Precision } from '../types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function string(value: unknown, field: string): void { assertNonEmpty(value, field); }
function timestamp(value: unknown, field: string): void { string(value, field); millis(value as string); }
function optionalString(value: unknown, field: string): void {
  if (value !== undefined) string(value, field);
}
function array(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field}: must be an array`);
}
function checkPrecision(at: string, precision: Precision, sourcePrecision?: Precision): void {
  const supported = PRECISIONS.indexOf(sourcePrecision ?? 'day');
  const requested = PRECISIONS.indexOf(precision);
  if (requested > supported) {
    throw new Error(`time.precision: ${precision} exceeds source-supported precision ${sourcePrecision ?? 'day'}`);
  }
}
const requiredPayload: Record<Kind, readonly string[]> = {
  episode: ['intent', 'action', 'result'],
  fact: ['claim'],
  pitfall: ['trigger', 'avoid'],
  preference: ['rule', 'scope'],
  open: ['goal', 'state', 'next'],
  daily: ['text'],
};
const allowedPayload: Record<Kind, readonly string[]> = {
  episode: ['intent', 'action', 'result', 'outcome'],
  fact: ['claim', 'validity'],
  pitfall: ['trigger', 'avoid'],
  preference: ['rule', 'scope'],
  open: ['goal', 'state', 'next', 'outcome'],
  daily: ['text'],
};

export function validatePayload<K extends Kind>(kind: K, payload: unknown, path = kind === 'episode' ? 'content' : 'payload'): void {
  if (!isObject(payload)) throw new Error(`${path}: must be an object`);
  for (const field of requiredPayload[kind]) string(payload[field], `${path}.${field}`);
  for (const field of Object.keys(payload)) {
    if (!allowedPayload[kind].includes(field)) throw new Error(`${path}.${field}: field is not defined for kind ${kind}`);
  }
  if (kind === 'fact') {
    if (!isObject(payload.validity)) throw new Error('payload.validity: must be an object');
    timestamp(payload.validity.from, 'payload.validity.from');
    if (payload.validity.until !== undefined) timestamp(payload.validity.until, 'payload.validity.until');
  }
  if (kind === 'open' && payload.outcome !== 'open') throw new Error("payload.outcome: must be exactly 'open'");
  if (kind === 'episode') optionalString(payload.outcome, 'content.outcome');
}

export interface RecordValidationOptions {
  allowRetiredFields?: boolean;
  /** Comes from the instance config; the schema must not hardcode the default. */
  keywordLimit?: number;
}
/** Runtime validator mirrors the static envelope, including all eighteen fields. */
export function validateRecord<K extends Kind>(record: NewRecord<K> | MemoryRecord<K>, options: RecordValidationOptions = {}): void {
  if (!isObject(record)) throw new Error('record: must be an object');
  if (record.schema_version !== SCHEMA_VERSION) throw new Error(`schema_version: expected ${SCHEMA_VERSION}, got ${String(record.schema_version)}`);
  string(record.id, 'id');
  if (!/^[a-z][a-z0-9_-]*$/.test(record.id)) throw new Error('id: must be a lowercase identifier');
  if (!KINDS.includes(record.kind)) throw new Error(`kind: invalid value ${String(record.kind)}`);
  if (!isObject(record.source)) throw new Error('source: must be an object');
  string(record.source.sessionId, 'source.sessionId');
  if (!SOURCE_KINDS.includes(record.source.kind)) throw new Error('source.kind: must be witnessed, self_report, or inferred');
  if (record.source.precision !== undefined && !PRECISIONS.includes(record.source.precision)) throw new Error('source.precision: invalid value');
  array(record.source.seqRange, 'source.seqRange');
  if (record.source.seqRange.length !== 2 || record.source.seqRange.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error('source.seqRange: must contain two non-negative integers');
  }
  if ((record.source.seqRange[0] as number) > (record.source.seqRange[1] as number)) throw new Error('source.seqRange: start must not exceed end');
  string(record.display, 'display');
  if (!isObject(record.time)) throw new Error('time: must be an object');
  timestamp(record.time.at, 'time.at');
  if (!PRECISIONS.includes(record.time.precision)) throw new Error(`time.precision: invalid value ${String(record.time.precision)}`);
  checkPrecision(record.time.at, record.time.precision, record.source.precision);
  array(record.keywords, 'keywords');
  const keywordLimit = options.keywordLimit ?? DEFAULT_CONFIG.keywordLimit;
  if (record.keywords.length > keywordLimit) throw new Error(`keywords: at most ${keywordLimit} terms are allowed`);
  if (record.next !== null && 'next' in record && record.next) {
    // next is a projection of the link stream, not a second independent bridge registry.
    // The ingestion layer converts it to a link event and then normalizes it away.
  }
  const seen = new Set<string>();
  for (const [index, keyword] of record.keywords.entries()) {
    if (!isObject(keyword)) throw new Error(`keywords[${index}]: must be an object`);
    string(keyword.text, `keywords[${index}].text`);
    if (keyword.level !== 'whole' && keyword.level !== 'part') throw new Error(`keywords[${index}].level: must be whole or part`);
    const key = `${keyword.level}\0${keyword.text}`;
    if (seen.has(key)) throw new Error(`keywords[${index}].text: duplicate ${keyword.text} at ${keyword.level} level`);
    seen.add(key);
    optionalString(keyword.group, `keywords[${index}].group`);
    optionalString(keyword.entityId, `keywords[${index}].entityId`);
  }
  if (record.next !== null) string(record.next, 'next');
  if ('edges' in record) throw new Error('edges: disabled in v3; next is the only outgoing bridge (out-degree <= 1)');
  assertNumberRange(record.importance, 'importance');
  assertNumberRange(record.salience, 'salience');
  array(record.use_log, 'use_log');
  for (const [index, event] of record.use_log.entries()) {
    if (!isObject(event)) throw new Error(`use_log[${index}]: must be an object`);
    timestamp(event.at, `use_log[${index}].at`);
    string(event.sessionId, `use_log[${index}].sessionId`);
    string(event.recallId, `use_log[${index}].recallId`);
    if (event.drafted !== true) throw new Error(`use_log[${index}].drafted: only drafted uses may be logged`);
  }
  array(record.annotations, 'annotations');
  for (const [index, annotation] of record.annotations.entries()) {
    if (!isObject(annotation)) throw new Error(`annotations[${index}]: must be an object`);
    timestamp(annotation.at, `annotations[${index}].at`);
    if (annotation.who !== 'human') throw new Error(`annotations[${index}].who: annotations must be written by a human`);
    string(annotation.text, `annotations[${index}].text`);
  }
  array(record.interpretations, 'interpretations');
  for (const [index, interpretation] of record.interpretations.entries()) {
    if (!isObject(interpretation)) throw new Error(`interpretations[${index}]: must be an object`);
    timestamp(interpretation.at, `interpretations[${index}].at`);
    if (!Number.isInteger(interpretation.version) || (interpretation.version as number) < 1) throw new Error(`interpretations[${index}].version: must be a positive integer`);
    string(interpretation.text, `interpretations[${index}].text`);
  }
  if (!STATES.includes(record.state)) throw new Error(`state: invalid value ${String(record.state)}`);
  if (!SENSITIVITIES.includes(record.sensitivity)) throw new Error('sensitivity: invalid value');
  if (record.state === 'trashed') string(record.trashReason, 'trashReason');
  else if (record.trashReason !== undefined) string(record.trashReason, 'trashReason');
  timestamp(record.createdAt, 'createdAt');
  if (record.lastUsedAt !== undefined) timestamp(record.lastUsedAt, 'lastUsedAt');
  if (record.forgotten) {
    timestamp(record.forgotten.at, 'forgotten.at');
    assertNumberRange(record.forgotten.valueDiscount, 'forgotten.valueDiscount', 0, 1);
    assertNumberRange(record.forgotten.restoreTarget, 'forgotten.restoreTarget', 0, 1);
  }
  array(record.history, 'history');
  for (const [index, history] of record.history.entries()) {
    if (!isObject(history)) throw new Error(`history[${index}]: must be an object`);
    timestamp(history.at, `history[${index}].at`);
    if (!['ai', 'human', 'system'].includes(history.who as string)) throw new Error(`history[${index}].who: invalid actor`);
    string(history.what, `history[${index}].what`);
    string(history.why, `history[${index}].why`);
  }
  if (record.kind === 'daily' && record.source.kind !== 'self_report') {
    throw new Error('source.kind: daily only accepts self_report');
  }
  if (record.kind === 'episode') {
    if ('payload' in record && record.payload !== undefined) throw new Error('payload: episode uses content, not payload');
    validatePayload(record.kind, record.content);
  } else {
    if ('content' in record && record.content !== undefined) throw new Error('content: only episode uses content');
    validatePayload(record.kind, record.payload);
  }
  if ('trace' in record && record.trace) {
    const trace = record.trace;
    if (trace.id !== record.id) throw new Error('trace.id: must match record id');
    string(trace.display, 'trace.display');
    array(trace.keywords, 'trace.keywords');
    array(trace.entities, 'trace.entities');
    string(trace.outcome, 'trace.outcome');
  }
}

export function outcomeOf<K extends Kind>(record: MemoryRecord<K>): string {
  if (record.kind === 'episode') return record.content.outcome ?? record.content.result;
  if (record.kind === 'open') return 'open';
  if (record.kind === 'fact') return record.payload.claim;
  if (record.kind === 'pitfall') return record.payload.avoid;
  if (record.kind === 'preference') return record.payload.rule;
  return record.payload.text;
}
export function makeTrace<K extends Kind>(record: MemoryRecord<K>) {
  return {
    id: record.id,
    kind: record.kind,
    display: record.display,
    time: clone(record.time),
    keywords: clone(record.keywords),
    entities: [...new Set(record.keywords.map((keyword) => keyword.entityId).filter((value): value is string => !!value))],
    outcome: outcomeOf(record),
  };
}
export function normalizeRecord<K extends Kind>(record: NewRecord<K>, options: RecordValidationOptions = {}): MemoryRecord<K> {
  const normalized = clone(record) as MemoryRecord<K>;
  validateRecord(normalized, options);
  // A supplied trace may be stale after merging/redaction; derived projections are rebuilt.
  normalized.trace = makeTrace(normalized);
  return normalized;
}
export function assertRecord(value: unknown): asserts value is AnyRecord {
  validateRecord(value as AnyRecord);
}
export type { Payloads };
