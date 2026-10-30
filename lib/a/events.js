import { DEFAULT_CONFIG } from '../config.js';
import { clone, iso } from '../utils.js';
import { assertTransition } from './state.js';
import { makeTrace, validateRecord } from './schema.js';
export function initialHistory(at, who, why) {
    return [{ at, who, what: 'created', why }];
}
/** Project the append-only event stream into a record without ever updating stored bytes. */
export function replayMemoryEvent(record, event, config = DEFAULT_CONFIG) {
    const result = clone(record);
    switch (event.type) {
        case 'memory':
            if (event.record.id !== result.id)
                throw new Error(`event.id: memory conflict ${event.record.id} != ${result.id}`);
            return clone(event.record);
        case 'state': {
            if (result.id !== event.id)
                throw new Error(`event.id: ${event.id} != ${result.id}`);
            if (result.state !== event.from)
                throw new Error(`state: expected current state ${event.from}, got ${result.state}`);
            assertTransition(event.from, event.to, event.who);
            result.state = event.to;
            if (event.to === 'trashed')
                result.trashReason = event.why;
            if (event.to === 'active' && event.from === 'trashed') {
                result.forgotten = { at: event.at, valueDiscount: event.restoreDiscount ?? config.restoreDiscount, restoreTarget: config.restoreTarget, ...(event.previousValue === undefined ? {} : { previousValue: event.previousValue }) };
                delete result.trashReason;
            }
            result.history = [...result.history, { at: event.at, who: event.who, what: `${event.from}->${event.to}`, why: event.why }];
            break;
        }
        case 'use': {
            if (result.id !== event.id)
                throw new Error(`event.id: ${event.id} != ${result.id}`);
            // One use per recall is enforced here as well as in the drafting orchestrator.
            if (!result.use_log.some((entry) => entry.recallId === event.use.recallId)) {
                result.use_log = [...result.use_log, clone(event.use)];
                result.lastUsedAt = event.use.at;
                result.history = [...result.history, { at: event.at, who: 'system', what: 'drafted', why: event.use.recallId }];
            }
            break;
        }
        case 'annotation':
            result.annotations = [...result.annotations, clone(event.annotation)];
            result.history = [...result.history, { at: event.at, who: event.annotation.who, what: 'annotation', why: 'human annotation appended' }];
            break;
        case 'interpretation':
            if (result.interpretations.some((entry) => entry.version === event.interpretation.version))
                throw new Error(`interpretations.version: duplicate ${event.interpretation.version}`);
            result.interpretations = [...result.interpretations, clone(event.interpretation)];
            result.history = [...result.history, { at: event.at, who: 'ai', what: 'interpretation', why: `version ${event.interpretation.version}` }];
            break;
        case 'keywords':
            result.keywords = clone(event.keywords);
            result.trace = makeTrace(result);
            result.history = [...result.history, { at: event.at, who: 'system', what: 'keywords', why: event.why }];
            break;
        case 'link':
        case 'link/replace':
            if (result.id !== event.from)
                throw new Error(`link.from: ${event.from} != ${result.id}`);
            result.next = event.to;
            break;
        case 'link/walk':
            break;
        case 'merge': {
            if (event.id !== result.id || event.record.id !== result.id)
                throw new Error('merge.id: projection id mismatch');
            const merged = clone(event.record);
            merged.projectId = event.id;
            merged.projectedAt = event.at;
            validateRecord(merged, { keywordLimit: config.keywordLimit });
            return merged;
        }
    }
    result.projectedAt = event.at;
    result.trace = makeTrace(result);
    validateRecord(result, { keywordLimit: config.keywordLimit });
    return result;
}
export function stateEvent(record, to, at, who, why, restoreDiscount, previousValue) {
    const event = { type: 'state', at: iso(Date.parse(at)), id: record.id, from: record.state, to, who, why, ...(restoreDiscount === undefined ? {} : { restoreDiscount }), ...(previousValue === undefined ? {} : { previousValue }) };
    assertTransition(record.state, to, who);
    return event;
}
//# sourceMappingURL=events.js.map