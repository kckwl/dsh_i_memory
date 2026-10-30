import type { Actor, AnyRecord, Annotation, Interpretation, Keyword, TimeSummary, UseEvent } from '../types.js';
import { clone, millis } from '../utils.js';
import { makeTrace, outcomeOf, validateRecord } from './schema.js';

export interface MergeOptions {
  keepId: string;
  at: string;
  who?: Actor;
  why?: string;
  /** Instance keyword cap; the merged union must be validated against it. */
  keywordLimit?: number;
}
export interface MergeResult {
  keepId: string;
  sources: string[];
  record: AnyRecord;
}
function mergedKeywords(records: readonly AnyRecord[]): Keyword[] {
  const byText = new Map<string, Keyword>();
  for (const record of records) {
    for (const keyword of record.keywords) {
      const previous = byText.get(keyword.text);
      if (!previous || (keyword.level === 'whole' && previous.level === 'part')) byText.set(keyword.text, clone(keyword));
    }
  }
  return [...byText.values()].sort((a, b) => a.level === b.level ? a.text.localeCompare(b.text, 'zh') : a.level === 'whole' ? -1 : 1);
}
function mergeTimes(records: readonly AnyRecord[]): TimeSummary {
  const times = [...new Set(records.map((record) => record.time.at))].sort();
  const count = records.length;
  if (times.length <= 1) return { shape: 'continuous', from: times[0]!, to: times[0]!, count };
  const first = millis(times[0]!), last = millis(times[times.length - 1]!);
  // Consecutive occurrences within one day keep a range; separated occurrences keep their points.
  return last - first <= 86_400_000
    ? { shape: 'continuous', from: times[0]!, to: times[times.length - 1]!, count }
    : { shape: 'sparse', times, count };
}
/** Pure, explicit merge. It never guesses duplicates and never rewrites source bridges. */
export function mergeRecords(records: readonly AnyRecord[], options: MergeOptions): MergeResult {
  if (records.length < 2) throw new Error('merge: at least two records are required');
  const keep = records.find((record) => record.id === options.keepId);
  if (!keep) throw new Error(`merge.keepId: ${options.keepId} is not among the inputs`);
  if (records.some((record) => record.kind !== keep.kind)) throw new Error('merge.kind: records must share one kind; a merge must not fabricate payloads');
  if (records.some((record) => record.state !== 'active')) throw new Error('merge.state: only active records can merge; forgetting/correction must be resolved first');
  const ids = [...new Set(records.map((record) => record.id))];
  const useLog = new Map<string, UseEvent>();
  const annotations = new Map<string, Annotation>();
  const interpretations = new Map<number, Interpretation>();
  for (const record of records) {
    for (const use of record.use_log) useLog.set(use.recallId, clone(use));
    for (const annotation of record.annotations) annotations.set(`${annotation.at}\0${annotation.text}`, clone(annotation));
    for (const interpretation of record.interpretations) interpretations.set(interpretation.version, clone(interpretation));
  }
  const record: AnyRecord = {
    ...clone(keep),
    keywords: mergedKeywords(records),
    use_log: [...useLog.values()].sort((a, b) => millis(a.at) - millis(b.at)),
    annotations: [...annotations.values()].sort((a, b) => millis(a.at) - millis(b.at)),
    interpretations: [...interpretations.values()].sort((a, b) => a.version - b.version),
    importance: Math.max(...records.map((item) => item.importance)),
    salience: Math.max(...records.map((item) => item.salience)),
    timeSummary: mergeTimes(records),
    history: [
      ...clone(keep.history),
      { at: options.at, who: options.who ?? 'ai', what: 'merged', why: options.why ?? `merged ${ids.join(', ')}` },
    ],
  };
  record.trace = makeTrace(record);
  validateRecord(record, options.keywordLimit === undefined ? {} : { keywordLimit: options.keywordLimit });
  return { keepId: options.keepId, sources: ids.filter((id) => id !== options.keepId), record };
}
export function mergeOutcome(record: AnyRecord): string { return outcomeOf(record); }
