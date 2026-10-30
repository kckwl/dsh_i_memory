import { SCHEMA_VERSION } from '../types.js';
import { validateRecord } from './schema.js';
/** One migration strategy only: upgrade-on-read, while retaining retired field values. */
export function migrateRecord(input, fallbackAt, keywordLimit) {
    if (!input || typeof input !== 'object')
        throw new Error('migration.record: must be an object');
    const record = structuredClone(input);
    const version = record.schema_version ?? 1;
    if (typeof version !== 'number' || version > SCHEMA_VERSION || version < 1)
        throw new Error(`migration.schema_version: unsupported ${String(version)}`);
    record.createdAt ??= fallbackAt;
    record.projectedAt ??= fallbackAt;
    record.next ??= null;
    record.use_log ??= [];
    record.annotations ??= [];
    record.interpretations ??= [];
    record.history ??= [{ at: fallbackAt, who: 'system', what: 'migrated', why: `schema v${version} upgraded on read` }];
    if (record.state === undefined)
        record.state = 'draft';
    record.sensitivity ??= 'normal';
    if (record.source && typeof record.source === 'object') {
        const source = record.source;
        source.kind ??= 'witnessed';
        source.precision ??= 'day';
    }
    // Retired fields remain as inert historical evidence; no data is silently dropped.
    if ('edges' in record) {
        record.retired = { ...record.retired, edges: record.edges };
        delete record.edges;
    }
    record.schema_version = SCHEMA_VERSION;
    validateRecord(record, keywordLimit === undefined ? {} : { keywordLimit });
    return record;
}
//# sourceMappingURL=migration.js.map