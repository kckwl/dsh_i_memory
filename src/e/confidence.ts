import { DEFAULT_CONFIG, type MemoryConfig } from '../config.js';
import type { AnyRecord } from '../types.js';
import { clamp, millis } from '../utils.js';

/**
 * Confidence is deliberately NOT a stored field (format spec §2.3: 派生不存，存输入).
 * It is computed from the event stream every time it is needed, so the formula can be
 * changed without migrating a single record.
 */
export interface ConfidenceBreakdown {
  /** Evidence part: source kind + drafted reads + human key points. Survives a settlement. */
  real: number;
  /** Time-line part. Procedural and explicitly untrusted; refunded on settlement. */
  procedural: number;
  /** real + procedural, clamped to [0,1]. This is what gates reads. */
  value: number;
  reads: number;
  keyPoints: number;
  settled: boolean;
}
export interface Settlement { id: string; before: number; after: number; refunded: number }

/** Base confidence by how the memory was obtained, mirroring the tone rule in F. */
export function confidenceBase(kind: AnyRecord['source']['kind']): number {
  if (kind === 'witnessed') return 0.5;
  if (kind === 'self_report') return 0.45;
  return 0.25;
}
export function confidenceAt(record: AnyRecord, now: string, config: MemoryConfig = DEFAULT_CONFIG): ConfidenceBreakdown {
  const base = confidenceBase(record.source.kind);
  // Reads only ever add. "最低加幅为零" means a re-read can never lower confidence.
  const reads = Math.min(config.confReadCap, record.use_log.length * config.confReadGain);
  // Key points: a human annotation confirms; a reinterpretation that supersedes an earlier
  // one is a correction and cuts. Both come from existing fields, never new storage.
  const annotated = record.annotations.length > 0 ? config.confAnnotGain : 0;
  const corrected = record.interpretations.some((entry) => entry.supersedes !== undefined) ? config.confCorrectPenalty : 0;
  const keyPoints = annotated - corrected;
  const real = clamp(base + reads + keyPoints);
  // Time-line: grows with time since the last real read. Procedural, hence untrusted.
  const last = record.lastUsedAt ?? record.createdAt;
  const elapsed = Math.max(0, millis(now) - millis(last));
  const procedural = config.confTimeGain * (1 - Math.exp(-elapsed / config.confTauMs));
  const value = clamp(real + procedural);
  return { real, procedural, value, reads, keyPoints, settled: value >= config.confStop };
}
/** After the loop stops: drop the procedural part and report how much was refunded. */
export function settleConfidence(record: AnyRecord, now: string, config: MemoryConfig = DEFAULT_CONFIG): Settlement {
  const { real, value } = confidenceAt(record, now, config);
  return { id: record.id, before: value, after: real, refunded: Math.max(0, value - real) };
}
export function settleAll(records: Iterable<AnyRecord>, now: string, config: MemoryConfig = DEFAULT_CONFIG): Settlement[] {
  return [...records].map((record) => settleConfidence(record, now, config));
}
/** The stop band: at or above it the loop must stop reading deeper. */
export function isSettled(record: AnyRecord, now: string, config: MemoryConfig = DEFAULT_CONFIG): boolean {
  return confidenceAt(record, now, config).settled;
}
