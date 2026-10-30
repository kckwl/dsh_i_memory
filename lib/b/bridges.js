import { DEFAULT_CONFIG } from '../config.js';
import { clone, millis } from '../utils.js';
export function validateGap(value) {
    if (!value || typeof value !== 'object')
        throw new Error('gap: must be an object');
    const gap = value;
    for (const field of ['from', 'wanted', 'at']) {
        if (typeof gap[field] !== 'string' || !gap[field].trim())
            throw new Error(`gap.${field}: required non-empty string`);
    }
    millis(gap.at);
}
/** The only projection of link/replace: later events win, old bytes are never edited. */
export class BridgeStore {
    memories;
    config;
    links = new Map();
    /** Historical incoming registrations survive replacement for audit/dangling checks. */
    history = new Set();
    constructor(memories, config = DEFAULT_CONFIG) {
        this.memories = memories;
        this.config = config;
        for (const event of memories.snapshot())
            this.project(event);
        // Follow the live event stream: a bridge written by ingest (record.next) must be
        // visible immediately, not only after the process restarts and rebuilds from JSONL.
        memories.onAppend((event) => this.project(event));
    }
    project(event) {
        if (event.type === 'link') {
            this.history.add(`${event.from}\0${event.to}`);
            this.links.set(event.from, {
                from: event.from,
                to: event.to,
                ...(event.condition ? { condition: event.condition } : {}),
                strength: event.strength ?? this.config.alphaLink,
                walkedAt: event.walkedAt ?? event.at,
                createdAt: event.at,
            });
        }
        else if (event.type === 'link/replace') {
            if (event.to !== null)
                this.history.add(`${event.from}\0${event.to}`);
            this.links.set(event.from, {
                from: event.from,
                to: event.to,
                strength: event.strength ?? this.config.alphaLink,
                walkedAt: event.walkedAt ?? event.at,
                createdAt: event.at,
            });
        }
        else if (event.type === 'link/walk') {
            const previous = this.links.get(event.from);
            if (previous) {
                previous.strength += this.config.alphaLink;
                previous.walkedAt = event.at;
            }
        }
    }
    link(from, to, options) {
        this.require(from);
        this.require(to);
        if (from === to)
            throw new Error('link.to: self-links are not useful bridges');
        const event = {
            type: this.links.has(from) ? 'link/replace' : 'link',
            at: options.at,
            id: `${from}->${to}`,
            from,
            to,
            ...(options.condition ? { condition: options.condition } : {}),
            ...(options.strength === undefined ? {} : { strength: options.strength }),
        };
        this.memories.appendEvent(event); // projected by the onAppend subscription
        return clone(this.links.get(from));
    }
    replace(from, to, options) {
        this.require(from);
        if (to !== null)
            this.require(to);
        const event = { type: 'link/replace', at: options.at, id: `${from}->${to ?? 'null'}`, from, to, ...(options.strength === undefined ? {} : { strength: options.strength }) };
        this.memories.appendEvent(event); // projected by the onAppend subscription
        return clone(this.links.get(from));
    }
    walk(from, at) {
        if (this.status(from, at, '').status !== 'valid')
            return undefined;
        const event = { type: 'link/walk', at, id: from, from };
        this.memories.appendEvent(event); // projected by the onAppend subscription
        return clone(this.links.get(from));
    }
    get(from) { const bridge = this.links.get(from); return bridge ? clone(bridge) : undefined; }
    incoming(to) {
        const current = [...this.links.values()].filter((bridge) => bridge.to === to);
        const historical = [...this.history].filter((key) => key.endsWith(`\0${to}`)).map((key) => key.slice(0, key.indexOf('\0')));
        const ids = [...new Set([...current.map((bridge) => bridge.from), ...historical])].sort();
        return ids.map((from) => {
            const active = this.links.get(from);
            if (active?.to === to)
                return clone(active);
            return { from, to, strength: 0, walkedAt: active?.walkedAt ?? '', createdAt: active?.createdAt ?? '' };
        });
    }
    hasIncomingHistory(from, to) { return this.history.has(`${from}\0${to}`); }
    strengthAt(from, now) {
        const bridge = this.links.get(from);
        if (!bridge)
            return 0;
        const elapsed = Math.max(0, millis(now) - millis(bridge.walkedAt));
        return bridge.strength * Math.exp(-elapsed / this.config.tauLinkMs);
    }
    status(from, now, wanted) {
        const bridge = this.links.get(from);
        if (!bridge)
            return { status: 'missing' };
        const gap = () => ({ from, wanted, at: now });
        if (this.strengthAt(from, now) < this.config.thetaLink)
            return { status: 'dangling', bridge: clone(bridge), gap: gap() };
        if (!bridge.to)
            return { status: 'dangling', bridge: clone(bridge), gap: gap() };
        if (!this.memories.get(bridge.to)) {
            const trace = this.memories.trace(bridge.to);
            // The content is hidden but the entrance survives: say "details faded", not "no route".
            if (trace)
                return { status: 'trace', bridge: clone(bridge), trace };
            return { status: 'dangling', bridge: clone(bridge), gap: gap() };
        }
        // Both ends must still agree. B.in == A comes from the current incoming projection.
        if (!this.incoming(bridge.to).some((candidate) => candidate.from === from && candidate.to === bridge.to)) {
            return { status: 'dangling', bridge: clone(bridge), gap: gap() };
        }
        return { status: 'valid', bridge: clone(bridge) };
    }
    /** No silent weakening scan is needed: targets disappearing makes the bridge dangling on read. */
    validate(from, to, now, wanted = to) {
        const status = this.status(from, now, wanted);
        if (status.status === 'valid' && status.bridge.to === to)
            return status;
        // Compare the historical A.out=B / B.in=A registration, not only A's latest pointer.
        const current = this.links.get(from);
        const incoming = this.hasIncomingHistory(from, to);
        if (incoming && current && current.to !== to && this.memories.get(to)) {
            // Historical registration is visible to audit, but cannot navigate after replacement.
            return { status: 'dangling', bridge: clone({ from, to, strength: current.strength, walkedAt: current.walkedAt, createdAt: current.createdAt }), gap: { from, wanted, at: now } };
        }
        const bridge = current ?? { from, to, strength: 0, walkedAt: now, createdAt: now };
        return { status: 'dangling', bridge: clone(bridge), gap: { from, wanted, at: now } };
    }
    all() { return [...this.links.values()].sort((a, b) => a.from.localeCompare(b.from)).map(clone); }
    require(id) {
        if (!this.memories.get(id))
            throw new Error(`link: memory ${id} is absent or trashed`);
    }
}
//# sourceMappingURL=bridges.js.map