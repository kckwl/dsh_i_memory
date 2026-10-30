/** Immutable, append-only memory types. Derived values never live on a record. */
export const SCHEMA_VERSION = 3;
export const KINDS = ['episode', 'fact', 'pitfall', 'preference', 'open', 'daily'];
export const STATES = ['draft', 'review', 'active', 'fading', 'trashed', 'superseded'];
export const PRECISIONS = ['year', 'month', 'day', 'hour', 'minute', 'second'];
export const SOURCE_KINDS = ['witnessed', 'self_report', 'inferred'];
export const SENSITIVITIES = ['normal', 'personal', 'internal', 'sensitive'];
//# sourceMappingURL=types.js.map