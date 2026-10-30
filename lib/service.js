import { dirname, join } from 'node:path';
import { DEFAULT_CONFIG, makeConfig } from './config.js';
import { MemoryStore } from './a/store.js';
import { BridgeStore } from './b/bridges.js';
import { buildKeywords } from './b/keywords.js';
import { IDFIndex, loadIDFSnapshots, saveIDFSnapshot } from './e/idf.js';
import { MaintenanceStore } from './e/maintenance-store.js';
import { AnchorStore } from './d/anchor-store.js';
import { MemoryMaintenance } from './e/maintenance.js';
import { retrieve } from './c/retrieval.js';
import { createBridgeTraversal, reconnectGaps, runRecall } from './d/cycle.js';
import { contextTerms, renderMemory, renderStableBlock, renderVolatileBlock } from './f/render.js';
import { useEvent } from './e/proficiency.js';
import { confidenceAt, settleConfidence } from './e/confidence.js';
import { mergeRecords } from './a/merge.js';
import { AliasMap } from './a/redaction.js';
/** Small composition root. Host integration can mount this service without adopting a UI. */
export class MemoryService {
    config;
    store;
    bridges;
    idf;
    maintenance;
    embedding;
    vectors;
    keywordOptions;
    personalRedactor;
    snapshotFile;
    anchorStore;
    progress;
    /** Store version already folded into the live IDF; avoids a full rebuild on every recall. */
    reconciledVersion = -1;
    constructor(options = {}) {
        this.config = makeConfig(options.config);
        this.personalRedactor = options.personalRedactor ?? new AliasMap(options.aliasFile ?? (options.file ? join(dirname(options.file), 'aliases.json') : undefined));
        this.store = options.store ?? new MemoryStore(options.file, this.config, { redactor: this.personalRedactor });
        this.bridges = new BridgeStore(this.store, this.config);
        this.snapshotFile = options.file ? join(dirname(options.file), 'idf.json') : undefined;
        const snapshots = this.snapshotFile ? loadIDFSnapshots(this.snapshotFile) : { current: undefined, previous: undefined };
        this.idf = new IDFIndex(this.store.scan(), new Date(0).toISOString(), {
            ...(snapshots.current ? { previousSnapshot: snapshots.current } : {}),
            ...(snapshots.previous ? { fallback: snapshots.previous } : {}),
        });
        this.maintenance = new MemoryMaintenance(this.store, this.idf, this.config, new MaintenanceStore(options.file ? join(dirname(options.file), 'maintenance.json') : undefined));
        this.anchorStore = options.file ? new AnchorStore(join(dirname(options.file), 'anchor.json')) : undefined;
        this.embedding = options.embedding;
        this.vectors = options.vectors;
        this.keywordOptions = options.keywordOptions;
        this.progress = options.progress;
    }
    ingest(input) {
        const record = structuredClone(input.record);
        if (input.terms) {
            record.keywords = buildKeywords('', { ...(this.keywordOptions ?? {}), terms: input.terms, limit: this.config.keywordLimit });
        }
        const result = this.store.append(record, { now: input.now, who: input.who ?? 'ai', why: input.why ?? 'memory ingestion' });
        this.idf.add(result.record);
        this.reconciledVersion = this.store.version;
        return result;
    }
    async recall(query, now, extra = {}) {
        // Direct lifecycle edits through the append-only store cannot silently pollute live df,
        // but a rebuild is only needed when the store actually changed since the last one.
        const version = this.store.version;
        const records = this.store.view();
        if (this.reconciledVersion !== version) {
            this.idf.reconcile(records, now);
            this.reconciledVersion = version;
        }
        return retrieve(records, query, {
            config: this.config,
            idf: this.idf,
            now,
            ...(this.embedding ? { embedding: this.embedding } : {}),
            ...(this.vectors ? { vectors: this.vectors } : {}),
            ...(this.keywordOptions ? { keywordOptions: this.keywordOptions } : {}),
            ...extra,
        });
    }
    async remember(context, options = {}) {
        const anchor = context.anchor ?? this.anchorStore?.load(context.sessionId, context.at);
        let resolved = { ...context, ...(anchor ? { anchor } : {}) };
        if (!context.steps && !context.traverse) {
            const found = await this.recall(context.query, context.at);
            const start = found.starts[0]?.record.id ?? context.position;
            const relevance = new Map(found.candidates.map((candidate) => [candidate.record.id, candidate.lexical]));
            resolved = {
                ...resolved,
                position: start,
                steps: found.starts.length ? undefined : [[]],
                ...(found.starts.length ? { traverse: createBridgeTraversal({ memories: this.store, bridges: this.bridges, at: context.at, config: this.config, relevance: (record) => relevance.get(record.id) ?? 0 }) } : {}),
            };
        }
        const result = await runRecall(resolved, {
            config: this.config,
            onGap: (gap) => { /* retained in the anchor; D10 consumes it later */ void gap; },
            onDraftedUse: (id, recallId, sessionId, at) => this.store.logUse(id, useEvent(id, recallId, sessionId, at)),
            ...(this.progress ? { progress: this.progress } : {}),
            ...options,
        });
        if (result.anchor)
            this.anchorStore?.save(context.sessionId, result.anchor);
        else
            this.anchorStore?.clear(context.sessionId);
        return result;
    }
    endSession(sessionId) { this.anchorStore?.clear(sessionId); }
    /** Explicit merge by chosen ids; no global duplicate guessing. Old bridges are not rewritten. */
    merge(ids, options) {
        const records = ids.map((id) => this.store.get(id)).filter((record) => !!record);
        if (records.length !== new Set(ids).size)
            throw new Error('merge: every input id must be visible');
        const merged = mergeRecords(records, { keepId: options.keepId, at: options.at, why: options.why ?? 'explicit merge', keywordLimit: this.config.keywordLimit });
        this.store.appendEvent({ type: 'merge', at: options.at, id: merged.keepId, sources: merged.sources, record: merged.record });
        for (const source of merged.sources)
            this.store.transition(source, 'superseded', { at: options.at, who: 'ai', why: `merged into ${merged.keepId}` });
        this.idf.reconcile(this.store.view(), options.at);
        this.reconciledVersion = this.store.version;
        return this.store.get(merged.keepId);
    }
    async reconnect(gaps, at) {
        return reconnectGaps(gaps, async (wanted) => {
            const result = await this.recall(wanted, at);
            return result.starts[0]?.record.id;
        }, this.bridges, at);
    }
    render(record, options) {
        return renderMemory(record, options);
    }
    stable(now) { return renderStableBlock(this.store.view(), { now, importanceThreshold: this.config.stableImportance }); }
    volatile(records, options) { return renderVolatileBlock(records, options); }
    queryContext(record, now) { return contextTerms(record, now); }
    /** Derived confidence line; never stored. Settle it after a loop stops to refund the time-line part. */
    confidence(id, now) {
        const record = this.store.getForAudit(id);
        if (!record)
            throw new Error(`id: unknown memory ${id}`);
        return confidenceAt(record, now, this.config);
    }
    settle(id, now) {
        const record = this.store.getForAudit(id);
        if (!record)
            throw new Error(`id: unknown memory ${id}`);
        return settleConfidence(record, now, this.config);
    }
    consolidate(now) {
        const snapshot = this.idf.consolidate(this.store.view(), now);
        if (this.snapshotFile)
            saveIDFSnapshot(this.snapshotFile, snapshot, this.idf.previousSnapshot());
        this.reconciledVersion = this.store.version;
        return snapshot;
    }
    tick(now) {
        const frozen = this.idf.frozen();
        if (!frozen || Date.parse(now) - Date.parse(frozen.computedAt) >= this.config.idfSnapshotPeriodMs)
            this.consolidate(now);
        const before = new Map(this.store.scan({ includeHidden: true }).map((record) => [record.id, record.state]));
        const result = this.maintenance.tick(now);
        for (const record of this.store.scan({ includeHidden: true })) {
            const previous = before.get(record.id);
            if (previous === 'active' && record.state === 'superseded')
                this.idf.remove(record);
            if (previous === 'superseded' && record.state === 'active')
                this.idf.add(record);
        }
        this.reconciledVersion = this.store.version;
        return result;
    }
    static open(directory, options = {}) {
        return new MemoryService({ ...options, file: join(directory, 'memories.jsonl') });
    }
}
export { DEFAULT_CONFIG };
//# sourceMappingURL=service.js.map