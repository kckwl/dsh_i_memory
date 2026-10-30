import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Sensitivity } from '../types.js';

export interface PersonalRedactor {
  alias(value: string): string;
  reveal(alias: string): string | undefined;
}
export interface RedactionResult {
  text: string;
  sensitivity?: Sensitivity;
}

/** Human-only dereference map. It is deliberately separate from memory JSONL. */
export class AliasMap implements PersonalRedactor {
  private aliases: Record<string, string>;
  private reverse: Record<string, string>;
  constructor(private readonly file?: string) {
    this.aliases = {};
    this.reverse = {};
    if (file && existsSync(file)) {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as { version: 1; aliases: Record<string, string> };
      if (stored.version !== 1 || !stored.aliases || typeof stored.aliases !== 'object') throw new Error('alias map: unsupported schema');
      this.aliases = { ...stored.aliases };
      for (const [original, alias] of Object.entries(this.aliases)) this.reverse[alias] = original;
    }
  }
  alias(value: string): string {
    if (!value) return value;
    const known = this.aliases[value];
    if (known) return known;
    const digest = createHash('sha256').update(value).digest('hex').slice(0, 12);
    const alias = `化名_${digest}`;
    this.aliases[value] = alias;
    this.reverse[alias] = value;
    this.persist();
    return alias;
  }
  reveal(alias: string): string | undefined { return this.reverse[alias]; }
  private persist(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ version: 1, aliases: this.aliases }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, this.file);
  }
}

export const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer)[\s:=]+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
];
const INTERNAL_URL = /\b(?:https?:\/\/)?(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?(?:\/[\w./?%&=+#-]*)?\b/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g;
const USER_ID = /\b(?:user(?:_id)?|用户(?:id|ID))[\s:=#]+([A-Za-z0-9_-]{3,})\b/g;

export interface RedactionOptions {
  redactor?: PersonalRedactor;
  /** Caller-declared person/client names; an empty list does not guess at Chinese names. */
  personalNames?: readonly string[];
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactUserIds?: boolean;
}
export function redactText(text: string, options: RedactionOptions = {}): RedactionResult {
  let result = text;
  let sensitivity: Sensitivity | undefined;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      // Preserve the field prefix on key/value secrets, never their value.
      const separator = match.search(/[\s:=]/);
      return separator > 0 && !match.startsWith('sk-') ? `${match.slice(0, separator + 1)}[已脱敏密钥]` : '[已脱敏密钥]';
    });
  }
  const alias = (value: string) => options.redactor ? options.redactor.alias(value) : '[已脱敏个人信息]';
  if (options.redactEmails !== false) result = result.replace(EMAIL, (match) => alias(match));
  if (options.redactPhones !== false) result = result.replace(PHONE, (match) => alias(match));
  if (options.redactUserIds !== false) {
    result = result.replace(USER_ID, (match, id: string) => match.replace(id, alias(id)));
  }
  for (const name of [...(options.personalNames ?? [])].sort((a, b) => b.length - a.length)) {
    if (name) result = result.split(name).join(alias(name));
  }
  INTERNAL_URL.lastIndex = 0;
  if (INTERNAL_URL.test(result)) sensitivity = 'internal';
  return sensitivity ? { text: result, sensitivity } : { text: result };
}

export function redactDeep<T>(value: T, options: RedactionOptions = {}, path = ''): { value: T; sensitivity?: Sensitivity } {
  let highest: Sensitivity | undefined;
  const visit = (item: unknown, keyPath: string): unknown => {
    if (typeof item === 'string') {
      const result = redactText(item, options);
      if (result.sensitivity) highest = result.sensitivity;
      return result.text;
    }
    if (Array.isArray(item)) return item.map((entry, index) => visit(entry, `${keyPath}[${index}]`));
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(item)) {
        // Storage identifiers and timestamps are not natural-language content.
        if (['id', 'sessionId', 'schema_version', 'at', 'from', 'until'].includes(key)) result[key] = child;
        else result[key] = visit(child, `${keyPath}.${key}`);
      }
      return result;
    }
    return item;
  };
  const redacted = visit(value, path) as T;
  return highest ? { value: redacted, sensitivity: highest } : { value: redacted };
}
