# dsh_i_memory_format

DeepSeek Harness 记忆插件。**把记忆存住，并在你需要的时候，把最相关的那几条捞出来，变成一句人话。**

上下文窗口装不下所有经历。窗口可以清空，但经历不该跟着消失。所以它把「进行时」留给宿主，自己负责「记忆」和「读取」。

![node](https://img.shields.io/badge/node-%E2%89%A522-3c873a)
![version](https://img.shields.io/badge/version-0.1.0-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue)

---

## 实现方式

- **存**：经历、事实、坑、偏好、未结项、自述，六种形态，各有各的字段。
- **连**：记录之间留一条出边，像神经元那样，一个接一个走。
- **算**：这条记忆会不会被忘、这一轮想到什么时候停、这条有多确定。
- **说**：把命中的记录渲染成一句话，语气看你当时是怎么知道的。

存下来就改不了。状态变了、用过了、被人批注了、桥换了方向，都是往文件末尾追加一条新事件。整条流随时可以重放，也可以直接 `grep`。

## 安装

```bash
npm install dsh_i_memory_format
```

还没发布的话，直接把目录装上：

```bash
npm install /path/to/dsh_i_memory
```

一个 Cordis 插件

```ts
import { Context } from '@deepseek-ai/cordis';
import { apply } from 'dsh_i_memory_format';

const ctx = new Context();
ctx.plugin(apply, { file: './data/memories.jsonl' });

const memory = ctx.get('iMemory');
```

也可以把包加进 profile 的 `dsh.profile.bundles`，或者放进该 profile 的插件目录。

## 相关例子（目前不具备普遍性）

```ts
import { MemoryService } from 'dsh_i_memory_format';

const now = '2026-10-01T12:00:00.000Z';
const memory = MemoryService.open('./data'); // 落到 ./data/memories.jsonl

memory.ingest({
  now,
  record: {
    schema_version: 3,
    id: 'm_whale',
    kind: 'episode',
    source: { sessionId: 's1', seqRange: [12, 18], kind: 'witnessed', precision: 'day' },
    display: '鲸鱼挂件',
    time: { at: '2026-09-12T00:00:00.000Z', precision: 'day' },
    keywords: [
      { text: '鲸鱼挂件', level: 'whole' },
      { text: '挂件', level: 'part', group: '鲸鱼挂件' },
    ],
    next: null,
    importance: 0.6,
    salience: 0.4,
    use_log: [],
    annotations: [],
    interpretations: [],
    state: 'active',
    sensitivity: 'normal',
    history: [{ at: now, who: 'ai', what: 'created', why: 'ingest' }],
    createdAt: now,
    projectedAt: now,
    content: { intent: '调试挂件', action: '改渲染', result: '页面正常' },
  },
});

memory.consolidate(now);

// 主模型先把「那个挂件怎么样了」消解成名词，再交给 recall。
const found = await memory.recall('挂件', '2026-10-04T12:00:00.000Z');
const result = await memory.remember({
  query: '挂件',
  sessionId: 's1',
  recallId: 'r_001',
  at: '2026-10-04T12:00:00.000Z',
  position: found.starts[0].record.id,
});

console.log(memory.render(memory.store.get('m_whale')!, { now: '2026-10-04T12:00:00.000Z' }));
```

输出：

```
9月中旬，调试挂件时，改渲染，页面正常。
```

## 工具（可能用到）

**记一条**

```ts
memory.ingest({ record, now });
```

**找一条。** 只收名词串——代词和整句会被拒绝，让主模型先把它消解干净。

```ts
const found = await memory.recall('挂件', now);
found.starts;  // 最多三个起点，按相关度排
```

**想一轮。** 从锚点出发，一层层往里走，走到够了就停。

```ts
const result = await memory.remember({
  query: '挂件', sessionId: 's1', recallId: 'r_001', at: now, position: 'm_whale',
});
result.rounds;       // 每轮想到了什么
result.stoppedBy;    // 为什么停
result.settlements;  // 置信结算
```

**说一句。**

```ts
memory.render(record, { now });
memory.stable(now);              // 长期不变的那块
memory.volatile(records, { now }); // 这一轮的几条
```

**忘了，再想起来。**

```ts
memory.maintenance.trash('m_whale', '半年没再用到', now); // 写理由才能进垃圾桶
memory.store.getForAudit('m_whale');                      // 审计还看得到
memory.maintenance.restore('m_whale', now);               // 人恢复，从低处重新开始
```

**查置信、结算。**

```ts
memory.confidence('m_whale', now); // { real, procedural, value, settled }
memory.settle('m_whale', now);     // { before, after, refunded }
```

## 大致流程

```
A 记录层  →  B 连接层  →  C 检索层  →  D 循环层
                    ↘              ↘  F 出口层
                     E 演算层
```

- **A 记录**：一条记录长什么样、怎么校验、怎么写进 JSONL。
- **B 连接**：记录之间那条出边，断了会告诉你断在哪。
- **C 检索**：把名词串变成几个起点，词分不够就算没找到。
- **D 循环**：从锚点出发一轮轮走，草稿越收敛越短。
- **E 演算**：熟练度、词频、置信，全是算出来的，不落字段。
- **F 出口**：把记录说成人话，同样的输入永远同样的输出。

想知道每块要做到什么程度，看 `src/` 里的代码就行；源码和编译产物都在包里。

## 相关参数

都能在构造时改，也都能走 Cordis 配置。

| 参数 | 默认 | 管什么 |
|---|---|---|
| `M` | 100 | `itxh` 的满刻度，也是 `itmx` 的天花板 |
| `k` | ln(101)/10 | 时间项涨得多快 |
| `lambda` | 1 | 事件密度的影响；0 就是纯墙钟 |
| `wKeyword` / `wNovelty` | 100 / 100 | 关键词、创新两项各占多少 |
| `wCrossLink` | 1 | 每连上一条新线索给多少分 |
| `epsilon` | 0.055 | 涨得太少就不走了 |
| `thetaEntry` | 0.49178 | 检索入口的门槛 |
| `alphaRet` / `betaRet` | 0.6 / 0.4 | 词分和向量分的比例 |
| `confStop` | 0.85 | 置信到这儿就不再往深里读 |
| `trashPerDay` | 10 | AI 一天最多扔几条 |

默认值是为了先跑起来。真实效果取决于你需要怎么用，按自己的数据调就好，支持个性化。

如果连曲线本身都想换，`ProgressModel` 的五个函数（时间、反向换算、单步贡献、创新、百分比）也都可以替换：

```ts
new MemoryService({ progress: myModel });
```

## 它边界

格式层：不碰界面、不监听会话、不注册工具、不做多模型编排。试答、向量、外查都是所注入的端口。

存储是普通 `.jsonl`，未自定义扩展名。一般而言，密钥在写入前替换掉（如果需要外传建议自己审核一遍），化名映射表单独放，只有人能反查。

## 开发

```bash
npm run build      # src → lib
npm run typecheck  # 只检查类型
```

源码在 `src/`，编译产物在 `lib/`，两边都随包发布。

## 兼容（具体未测试）

Node ≥ 22，ESM   
Cordis 4.x   

## 注意事项

目前仅仅是一个小的部分，且未进行大量测试及实验，可能存在大量bug，不过这个主要做的是存和读取记忆的事，应该不会导致非人为的崩溃泄密等情况。目前还会持续更新，仍有部分想法未实现。

## License

[MIT](LICENSE)
