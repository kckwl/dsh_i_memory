import { compareText, unique } from '../utils.js';
export const STOP_WORDS = new Set([
    '那个', '这个', '那个东西', '这个东西', '它', '他', '她', '什么', '怎么样', '如何', '怎么', '一下', '时候',
    '一下', '一个', '一些', '我们', '你们', '他们', '自己', '还是', '已经', '就是', '然后',
    '知道', '记得', '想想', '看看', '使用', '进行', '相关', '关于', '因为', '所以', '如果', '现在', '之前', '之后',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'how', 'what',
]);
export const DEFAULT_LEXICON = {
    terms: new Set(['鲸鱼挂件', '挂件', '缓存', '登录', '认证', '鉴权', '端口', '端口号', '插件', '记忆', '检索', '渲染', '熟练度', '项目', '配置', '密钥', '令牌', '测试', '模型', '会话', '桥', '缺口', '草稿', '偏好', '经历', '文件', '目录', '工作区', '账号', '终端', '函数', '接口', '快照', '词频', '时间', '状态', '索引', '数据', '服务', '连接', '网络', '图片', '回答', '结论', '用户', '客户', '名字', '邮箱', '手机', '规则', '目标', '结果', '错误', '修改', '记录']),
    heads: new Set(['挂件', '头像', '女孩', '缓存', '登录', '认证', '鉴权', '端口', '插件', '记忆', '检索', '渲染', '项目', '配置', '密钥', '令牌', '测试', '模型', '会话', '草稿', '偏好', '经历', '文件', '目录', '账号', '终端', '函数', '接口', '快照', '词频', '时间', '状态', '索引', '数据', '服务', '连接', '网络', '图片', '回答', '结论', '规则', '目标', '结果', '错误', '修改', '记录', '组件', '工具', '协议', '地址', '事件', '记录']),
    aliases: {
        auth: ['登录', '认证', '鉴权'],
        cache: ['缓存', '快取'],
        '19387': ['端口', '端口号'],
        api: ['接口'],
        token: ['令牌', '密钥'],
        plugin: ['插件'],
        memory: ['记忆'],
        recall: ['回忆', '检索'],
        config: ['配置'],
        embedding: ['向量', '嵌入'],
    },
    entities: {
        'auth.py': 'file:auth.py',
        './auth.py': 'file:auth.py',
        'src/auth.py': 'file:auth.py',
    },
};
export function splitLatinAndNumbers(text) {
    return text.match(/[A-Za-z_][A-Za-z0-9_.-]*|\d+(?:\.\d+)*/g) ?? [];
}
export function chineseRuns(text) {
    return text.match(/[\p{Script=Han}]+/gu) ?? [];
}
/** Deterministic longest-match tokenizer. Callers may inject a real segmenter later. */
export function defaultTokenize(text, lexicon = DEFAULT_LEXICON) {
    const tokens = [];
    for (const run of chineseRuns(text)) {
        let index = 0;
        while (index < run.length) {
            let match;
            const max = Math.min(8, run.length - index);
            for (let length = max; length >= 2; length--) {
                const candidate = run.slice(index, index + length);
                if (lexicon.terms.has(candidate)) {
                    match = candidate;
                    break;
                }
            }
            if (match) {
                tokens.push(match);
                index += match.length;
            }
            else {
                // Preserve possible head nouns without manufacturing arbitrary fragments.
                let found = false;
                for (let length = Math.min(4, run.length - index); length >= 2; length--) {
                    const candidate = run.slice(index, index + length);
                    if (lexicon.heads.has(candidate)) {
                        tokens.push(candidate);
                        index += length;
                        found = true;
                        break;
                    }
                }
                if (!found)
                    index++;
            }
        }
    }
    tokens.push(...splitLatinAndNumbers(text).map((token) => token.toLowerCase()));
    return tokens.filter((token) => token.length > 0 && !STOP_WORDS.has(token.toLowerCase()));
}
export function centerHead(term, lexicon = DEFAULT_LEXICON) {
    const trimmed = term.trim();
    if (/^[A-Za-z0-9_.\s-]+$/.test(trimmed)) {
        const words = trimmed.split(/[\s_-]+/).filter(Boolean);
        return words.length > 1 ? words[words.length - 1] : undefined;
    }
    if ([...trimmed].length <= 2)
        return undefined;
    const tail = [...trimmed].slice(-2).join('');
    return lexicon.heads.has(tail) ? tail : undefined;
}
function normalize(term) {
    return /^[\p{Script=Han}]+$/u.test(term) ? term : term.toLowerCase();
}
export function buildKeywords(text, options = {}) {
    const lexicon = options.lexicon ?? DEFAULT_LEXICON;
    const tokenize = options.tokenizer ?? ((value) => defaultTokenize(value, lexicon));
    const candidates = [];
    const add = (textValue, level, group, position = candidates.length) => {
        const normalized = normalize(textValue.trim());
        if (!normalized || STOP_WORDS.has(normalized))
            return;
        const entityId = options.entities?.[textValue] ?? options.entities?.[normalized] ?? lexicon.entities?.[textValue] ?? lexicon.entities?.[normalized];
        candidates.push({ text: normalized, level, ...(group ? { group } : {}), ...(entityId ? { entityId } : {}), position });
    };
    const explicit = options.terms ?? [];
    const terms = unique([...explicit, ...tokenize(text)]);
    for (const [index, original] of terms.entries()) {
        const term = normalize(original);
        if (!term || STOP_WORDS.has(term))
            continue;
        add(term, 'whole', undefined, index * 3);
        const head = centerHead(term, lexicon);
        if (head && normalize(head) !== term)
            add(head, 'part', term, index * 3 + 1);
        const aliases = lexicon.aliases[term] ?? [];
        for (const alias of aliases)
            add(alias, 'part', term, index * 3 + 2);
    }
    // Union by text: overlapping fragments survive once, at the highest level.
    const byText = new Map();
    for (const candidate of candidates) {
        const previous = byText.get(candidate.text);
        if (!previous || (candidate.level === 'whole' && previous.level === 'part'))
            byText.set(candidate.text, candidate);
    }
    const ranked = [...byText.values()].sort((a, b) => {
        const dfA = a.df ?? options.df?.(a.text, a.level) ?? 1;
        const dfB = b.df ?? options.df?.(b.text, b.level) ?? 1;
        return dfA - dfB || (a.position ?? 0) - (b.position ?? 0) || compareText(a.text, b.text);
    });
    const limit = options.limit ?? 20;
    return ranked.slice(0, limit).map(({ df: _df, position: _position, ...keyword }) => keyword);
}
export function keywordText(keywords, level) {
    return keywords.filter((keyword) => !level || keyword.level === level).map((keyword) => keyword.text);
}
//# sourceMappingURL=keywords.js.map