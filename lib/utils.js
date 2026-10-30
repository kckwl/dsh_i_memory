export function iso(ms) {
    if (!Number.isFinite(ms))
        throw new Error(`time: invalid millisecond timestamp ${ms}`);
    return new Date(ms).toISOString();
}
export function millis(value) {
    const result = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(result))
        throw new Error(`time: invalid ISO timestamp "${value}"`);
    return result;
}
export function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}
export function round(value, digits = 12) {
    return Number(value.toFixed(digits));
}
export function clone(value) {
    return structuredClone(value);
}
export function compareText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
export function stableStringify(value) {
    const visit = (item) => {
        if (Array.isArray(item))
            return item.map(visit);
        if (item && typeof item === 'object') {
            const result = {};
            for (const key of Object.keys(item).sort()) {
                const child = item[key];
                if (child !== undefined)
                    result[key] = visit(child);
            }
            return result;
        }
        return item;
    };
    return JSON.stringify(visit(value));
}
export function unique(items) { return [...new Set(items)]; }
export function assertNonEmpty(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`${field}: must be a non-empty string`);
}
export function assertNumberRange(value, field, min = 0, max = 1) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${field}: must be a finite number within [${min},${max}]`);
    }
}
//# sourceMappingURL=utils.js.map