/** Immutable, append-only memory types. Derived values never live on a record. */
export const SCHEMA_VERSION = 3 as const;
export const KINDS = ['episode', 'fact', 'pitfall', 'preference', 'open', 'daily'] as const;
export const STATES = ['draft', 'review', 'active', 'fading', 'trashed', 'superseded'] as const;
export const PRECISIONS = ['year', 'month', 'day', 'hour', 'minute', 'second'] as const;
export const SOURCE_KINDS = ['witnessed', 'self_report', 'inferred'] as const;
export const SENSITIVITIES = ['normal', 'personal', 'internal', 'sensitive'] as const;
export type Kind = typeof KINDS[number];
export type MemoryState = typeof STATES[number];
export type Precision = typeof PRECISIONS[number];
export type SourceKind = typeof SOURCE_KINDS[number];
export type Sensitivity = typeof SENSITIVITIES[number];
export type Actor = 'ai' | 'human' | 'system';

export interface MemorySource {
  sessionId: string;
  seqRange: readonly [number, number];
  /** Tone is about how we know something, never about whether it is true. */
  kind: SourceKind;
  /** Exact precision supported by the original event; omit means day-level evidence only. */
  precision?: Precision;
}
export interface MemoryTime {
  /** ISO instant; precision controls how much of it may be spoken. */
  at: string;
  precision: Precision;
}
export type TimeSummary =
  | { shape: 'continuous'; from: string; to: string; count: number }
  | { shape: 'sparse'; times: readonly string[]; count: number };
export interface CreatedMetadata {
  /** Immutable ingestion time, separate from projectedAt which tracks lifecycle events. */
  at: string;
}
export interface HistoryEntry {
  at: string;
  who: Actor;
  what: string;
  why: string;
}
export interface Annotation {
  at: string;
  who: Actor;
  text: string;
}
export interface Interpretation {
  at: string;
  version: number;
  text: string;
  supersedes?: number;
}
export interface UseEvent {
  at: string;
  sessionId: string;
  recallId: string;
  /** Only fragments actually drafted count as a use. */
  drafted: true;
}
export interface Validity { from: string; until?: string }
export interface EpisodePayload { intent: string; action: string; result: string; outcome?: string }
export interface FactPayload { claim: string; validity: Validity }
export interface PitfallPayload { trigger: string; avoid: string }
export interface PreferencePayload { rule: string; scope: string }
export interface OpenPayload { goal: string; state: string; next: string; outcome: 'open' }
export interface DailyPayload { text: string }
export interface Payloads {
  episode: EpisodePayload;
  fact: FactPayload;
  pitfall: PitfallPayload;
  preference: PreferencePayload;
  open: OpenPayload;
  daily: DailyPayload;
}
export type Payload<K extends Kind = Kind> = Payloads[K];

export interface Keyword {
  text: string;
  /** whole = exact term; part = head noun or an explicitly declared English alias. */
  level: 'whole' | 'part';
  /** part terms may point to their whole-term group; aliases point to the identifier. */
  group?: string;
  entityId?: string;
}
export interface KeywordCandidate extends Keyword {
  /** Pre-ingestion document frequency. Unknown/new terms count as df=1. */
  df?: number;
  /** Last lexical position, used only as a stable tiebreaker after df sorting. */
  position?: number;
}
export interface MemoryTrace {
  id: string;
  kind: Kind;
  display: string;
  time: MemoryTime;
  keywords: readonly Keyword[];
  entities: readonly string[];
  outcome: string;
}
export interface BaseRecord {
  schema_version: typeof SCHEMA_VERSION;
  id: string;
  kind: Kind;
  source: MemorySource;
  display: string;
  time: MemoryTime;
  keywords: readonly Keyword[];
  /** Single outgoing bridge. edges is intentionally absent/disabled in v3. */
  next: string | null;
  importance: number;
  salience: number;
  use_log: readonly UseEvent[];
  annotations: readonly Annotation[];
  interpretations: readonly Interpretation[];
  state: MemoryState;
  sensitivity: Sensitivity;
  trashReason?: string;
  history: readonly HistoryEntry[];
  /** Original wall-clock write time; never changed by subsequent events. */
  createdAt: string;
  /** Retired/unknown fields kept verbatim for auditable schema migration. */
  retired?: Readonly<Record<string, unknown>>;
  /** Coarse occurrence summary after merging; individual source events remain in source. */
  timeSummary?: TimeSummary;
  /** Explicit projection marker for a merged memory; it is not a second stored body. */
  projectId?: string;
  /** Exact last drafting event; importance decay uses this instead of arbitrary lifecycle events. */
  lastUsedAt?: string;
  /** Survives forgetting; the content payload may be hidden. */
  trace: MemoryTrace;
  /** Exact timestamp of the last lifecycle projection, never a derived score. */
  projectedAt: string;
  /** Human-approved restoration metadata: restoredAt is an input to low-value recovery. */
  forgotten?: { at: string; valueDiscount: number; restoreTarget: number; previousValue?: number };
}
export type MemoryRecord<K extends Kind = Kind> = BaseRecord & (
  K extends 'episode' ? { kind: K; content: EpisodePayload; payload?: never } :
  { kind: K; payload: Payloads[K]; content?: never }
);
export type AnyRecord = { [K in Kind]: MemoryRecord<K> }[Kind];
export type RecordOf<K extends Kind> = MemoryRecord<K>;
export type NewRecord<K extends Kind = Kind> = Omit<MemoryRecord<K>, 'trace' | 'projectedAt'> & {
  trace?: MemoryTrace;
  projectedAt?: string;
};

export interface StateChange {
  from: MemoryState;
  to: MemoryState;
  who: Actor;
  why: string;
}
export interface StateRule extends StateChange { automatic?: boolean }

export interface Gap {
  from: string;
  wanted: string;
  at: string;
}
export type TraceResult =
  | { type: 'trace'; trace: MemoryTrace }
  | { type: 'gap'; gap: Gap };

export interface IDFSnapshot {
  version: 1;
  computedAt: string;
  total: number;
  whole: Readonly<Record<string, number>>;
  part: Readonly<Record<string, number>>;
}
export interface DailyLimit {
  day: string;
  count: number;
}
