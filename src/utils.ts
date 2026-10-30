export function iso(ms: number): string {
  if (!Number.isFinite(ms)) throw new Error(`time: invalid millisecond timestamp ${ms}`);
  return new Date(ms).toISOString();
}
export function millis(value: string | number): number {
  const result = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error(`time: invalid ISO timestamp "${value}"`);
  return result;
}
export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
export function round(value: number, digits = 12): number {
  return Number(value.toFixed(digits));
}
export function clone<T>(value: T): T {
  return structuredClone(value);
}
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function stableStringify(value: unknown): string {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(item as object).sort()) {
        const child = (item as Record<string, unknown>)[key];
        if (child !== undefined) result[key] = visit(child);
      }
      return result;
    }
    return item;
  };
  return JSON.stringify(visit(value));
}
export function unique<T>(items: Iterable<T>): T[] { return [...new Set(items)]; }
export function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field}: must be a non-empty string`);
}
export function assertNumberRange(value: unknown, field: string, min = 0, max = 1): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field}: must be a finite number within [${min},${max}]`);
  }
}
