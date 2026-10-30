import { DAY_MS } from '../config.js';
import { clamp, millis } from '../utils.js';
export const FORBIDDEN_PHRASES = ['根据记录显示', '检索到以下条目', '用户', '一定是', '肯定是', '绝对是'];
const TOKEN_BUDGET = { tight: 20, normal: 45, detailed: 80 };
function pad(value) { return String(value).padStart(2, '0'); }
export function relativeTime(record, now) {
    const event = new Date(record.time.at);
    const current = new Date(now);
    const elapsed = millis(now) - millis(record.time.at);
    const days = Math.floor(Math.abs(elapsed) / DAY_MS);
    const precision = record.time.precision;
    if (precision === 'year')
        return `${event.getUTCFullYear()}年`;
    if (precision === 'month')
        return `${event.getUTCFullYear()}年${event.getUTCMonth() + 1}月`;
    if (precision === 'day') {
        if (days === 0)
            return '今天';
        if (days === 1 && elapsed >= 0)
            return '昨天';
        if (days < 14 && elapsed >= 0)
            return `${days}天前`;
        const month = event.getUTCMonth() + 1;
        const day = event.getUTCDate();
        const segment = day <= 10 ? '上旬' : day <= 20 ? '中旬' : '下旬';
        return `${month}月${segment}`;
    }
    if (precision === 'hour') {
        if (days === 0)
            return `今天${event.getUTCHours()}点左右`;
        return `${event.getUTCMonth() + 1}月${event.getUTCDate()}日${event.getUTCHours()}点左右`;
    }
    if (precision === 'minute')
        return `${event.getUTCMonth() + 1}月${event.getUTCDate()}日${event.getUTCHours()}点${pad(event.getUTCMinutes())}分左右`;
    return `${event.getUTCMonth() + 1}月${event.getUTCDate()}日${event.getUTCHours()}点${pad(event.getUTCMinutes())}分`;
}
function tonePrefix(kind) {
    if (kind === 'self_report')
        return '你说过';
    if (kind === 'inferred')
        return '我印象里';
    return '';
}
function toneSuffix(kind, state, matchItxh) {
    const marks = [];
    if (kind === 'inferred')
        marks.push('不一定准');
    if (state === 'fading' || state === 'superseded')
        marks.push('这条我记得不算牢');
    if (state === 'superseded')
        marks.push('后来有过更正');
    if (matchItxh !== undefined && matchItxh < 0.55)
        marks.push('可能不是你要的');
    return marks.length ? `，${marks.join('，')}` : '';
}
function bodyOf(record, budget) {
    switch (record.kind) {
        case 'episode':
            if (budget === 'tight')
                return `${record.content.action}，${record.content.result}`;
            return `${record.content.intent}时，${record.content.action}，${record.content.result}`;
        case 'fact': return budget === 'detailed' && record.payload.validity.until ? `${record.payload.claim}，有效到${record.payload.validity.until.slice(0, 10)}` : record.payload.claim;
        case 'pitfall': return budget === 'tight' ? `避免${record.payload.avoid}` : `${record.payload.trigger}，要避免${record.payload.avoid}`;
        case 'preference': return budget === 'tight' ? record.payload.rule : `${record.payload.rule}（${record.payload.scope}）`;
        case 'open': return budget === 'tight' ? `${record.payload.goal}还没结` : `${record.payload.goal}还没结，下一步是${record.payload.next}`;
        case 'daily': return record.payload.text;
    }
}
function trimSentence(text, maxCharacters) {
    if (text.length <= maxCharacters)
        return text;
    return `${text.slice(0, Math.max(1, maxCharacters - 1))}…`;
}
/** Pure renderer: no Date.now(), random ids, I/O, or mutable global state. */
export function renderMemory(record, options) {
    if (record.state === 'trashed')
        throw new Error('render: trashed records are not injectable');
    // Unapproved high-impact data waits for a human; it must not reach the prompt through
    // a side door (scan -> volatile) while it is still in the review queue.
    if (record.state === 'review')
        throw new Error('render: review records are not injectable until approved');
    const budget = options.budget ?? 'normal';
    const time = options.stable ? '' : `${relativeTime(record, options.now)}，`;
    const prefix = tonePrefix(record.source.kind);
    const body = bodyOf(record, budget);
    const suffix = toneSuffix(record.source.kind, record.state, options.matchItxh);
    const latestInterpretation = record.interpretations.at(-1)?.text;
    const interpretation = budget === 'detailed' && latestInterpretation ? `，后来我理解为${latestInterpretation}` : '';
    const forgotten = record.forgotten && budget !== 'tight' ? '，这件事曾经淡忘过' : '';
    const connector = prefix && !body.startsWith('你') ? '' : '';
    const sentence = `${time}${prefix}${connector}${body}${interpretation}${forgotten}${suffix}。`;
    // Compact and normal are intentionally short, natural Chinese clauses rather than key:value output.
    const rendered = trimSentence(sentence, TOKEN_BUDGET[budget] * 2);
    if (options.enforcePolicy !== false)
        assertRenderPolicy(rendered);
    return rendered;
}
export function isStableRecord(record, threshold = 0.7) {
    return (record.kind === 'preference' || record.kind === 'daily')
        && record.importance >= threshold
        && record.state === 'active'
        && record.source.kind !== 'inferred';
}
export function renderStableBlock(records, options) {
    const threshold = options.importanceThreshold ?? 0.7;
    return records.filter((record) => isStableRecord(record, threshold))
        .sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
        .map((record) => renderMemory(record, { now: options.now, budget: options.budget ?? 'normal', stable: true }))
        .join('\n');
}
export function renderVolatileBlock(records, options) {
    return records
        .filter((record) => record.state !== 'trashed' && record.state !== 'superseded' && record.state !== 'review')
        .slice(0, 3)
        .map((record) => renderMemory(record, options)).join('\n');
}
export function assertRenderPolicy(text) {
    for (const phrase of FORBIDDEN_PHRASES) {
        if (text.includes(phrase))
            throw new Error(`render.forbidden: contains "${phrase}"`);
    }
    if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text))
        throw new Error('render.forbidden: ISO timestamp leaked into narrative');
}
export function approximateTokens(text) {
    // Deliberately exposed as an estimate only; F8 needs a real tokenizer and calibration.
    const han = (text.match(/[\p{Script=Han}]/gu) ?? []).length;
    const latin = (text.match(/[A-Za-z0-9_]+/g) ?? []).length;
    const punctuation = (text.match(/[，。；、,.!?！？：:]/g) ?? []).length;
    return Math.ceil(han / 1.5 + latin + punctuation * 0.5);
}
export function contextTerms(record, now) {
    const terms = [relativeTime(record, now)];
    if (record.salience >= 0.75)
        terms.push('搞得很烦那次');
    else if (record.salience <= 0.25)
        terms.push('挺顺利那次');
    if (record.time.precision === 'hour' && new Date(record.time.at).getUTCHours() >= 22)
        terms.push('那天弄到很晚');
    return terms;
}
export { TOKEN_BUDGET };
//# sourceMappingURL=render.js.map