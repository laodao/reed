# 全系统知识与记忆能力盘点（只读调查，未改任何代码）

- 日期：2026-10-05
- 方法：逐文件读码（grep/glob/read），全部结论附路径+行号
- 用途：为「知识/记忆系统重建方案」提供事实基础
- 配套：`docs/design/2026-10-05-knowledge-flywheel-v3-design.md`（方案）、
  `progress/2026-10-05-knowledge-flywheel-redesign-research.md`（过程记录）

---

## 0. 三个必须先纠正的认知

| # | 常见误解 | 实情 |
|---|---------|------|
| 1 | "系统没有记忆系统" | **有五套**：kb-brain（知识库域）、长文图谱、领域学习 `dl_*`、剧集设定绑定、agent 运行域（旧飞轮，停用）。加上 L1-L4 上下文管理层，共六层机制 |
| 2 | "kb-brain 是通用记忆系统，泛化即可" | **不是**。它的提示词是深度领域专用的（见 §1.5），领域耦合在语义假设里，不在表结构里 |
| 3 | "接进 structured-provider 就是接进知识体系了" | **契约承载不了记忆**：`KnowledgeSegment` 无 id（无法回写反馈）、`kind` 硬编码单值、无时间语义（见 §3.1） |

---

## 1. kb-brain（知识库域知识引擎）

### 1.1 规模实测

| 项 | 数值 |
|----|------|
| 服务文件 | 44 个 `.ts` |
| 代码量 | **9,565 行**（不含 prompts 目录）；`prompts/index.ts` 另 654 行 |
| 最大单文件 | `digest-orchestrator.service.ts` 1,378 行 / 56KB |
| UI | `BrainPanel.vue` **2,592 行** |
| IPC 通道 | **26 个** `kb:brain:*`（`kb-brain.handler.ts:36-450`） |
| 数据表 | 6 张（另有 P4 表见 §1.4） |

### 1.2 数据模型

**`kb_atoms`（论断，L1 层）** — `kb-atom.entity.ts`

| 字段 | 语义 |
|------|------|
| `statement` | 自包含论断短句（三要件：atomic/self-contained/concise） |
| `type` | `fact`/`claim`/`concept`/`method`/`insight`/`open-question` |
| `layer` | `outline`/`setting`/`describe`/`detail`（叙事抽象层级） |
| `status` | **六态**：`supported`/`suspected`/`contradicted`/`superseded`/`stale`/`archived` |
| `certainty` | 0-1（来源权威性 × 抽取确定性；human=1.0） |
| `validFrom`/`validUntil` | 双时间线之"世界时间" |
| `sourceDocumentId`/`sourceChapterId`/`sourceChapterHash`/`sourceChunkId` | 溯源四件套 |
| `sourceQuote`/`startOffset`/`endOffset` | 原文引句 + 定位偏移 |
| `subjectEntityId`/`objectEntityId` | 实体挂点（PPR 图边来源） |
| `lensNoteId` | **视角挂点**（null=公共层） |
| `extractionPass` | 萃取溯源（`base#1`/`lens:<id>#2`/`human:ui`/`consolidate#1`） |
| `origin` | `ai`/`human`（human 原话永不改写） |
| `useCount`/`lastUsedAt` | 使用信号 |
| `supersededByAtomId` | 关旧开新血缘 |

**`kb_notes`（卡片，L3 层）** — `kb-note.entity.ts`
- `type`：`methodology`/`insight`/`synthesis`/`plot-pattern`/`setting-pattern`/`lens`/**`skill-seed`**
- `status`：`proposed`（默认）/`draft`/`published`/`archived`
- `origin`：`ai-distill`/`human`/`import`
- 专用载荷：`patternSkeleton`/`patternInstances`（模式卡）、`lensAttention`（视角卡）
- 质量信号：`classicScore`、`citedCount`/`lastCitedAt`
- 学习态：`fsrsStability`/`fsrsDifficulty`/`dueAt`/`fsrsState`/`reviewCount`/`lapseCount`
- 演化：`version`/`supersededNoteId`
- 证据：`evidence`（JSON `[{atomId, statement}]`）

**其余四表**：`kb_entities`（实体+演化摘要+aliases）、`kb_knowledge_edges`（语义边：`supports`/`refutes`/`refines`/`exemplifies`/`same-as`/`depends-on`/`applies-to`/`leads-to`/`instance-of`/`sets-up`）、`kb_digest_passes`（消化台账）、`kb_note_reviews`（复习日志，只追加）
**P4 表**：`kb_qa_log`、`kb_automation_log`（自动化动作日志 + 撤销依据）
**另有**：`kb_events`（场面事件原料，仅聚类不进检索主池）

### 1.3 向量命名空间

`vector-namespace.ts:10-19` `KB_VECTOR_NS`：

| 前缀 | 内容 | 是否进检索主池 |
|------|------|--------------|
| `''` | 原文切片 | ✅ |
| `qa:` | QA 对 | ❌（存量语义） |
| `atom:` | 论断 | ✅ |
| `note:` | 卡片 | ✅ |
| `ent:` | 实体摘要 | ❌（仅供图路邻域） |
| `event:` | 场面事件 | ❌（仅聚类） |

### 1.4 六条流水线

| 流水线 | 服务 | 触发 | 产出 |
|--------|------|------|------|
| **P1 消化** | `digest-orchestrator` | `kb:document-completed` 事件 + 台账恢复 | 论断/实体/边/场面 |
| **P2 提炼** | `distill` / `pattern-induct` / `case-study` / `principle-distill` / `corpus-passes` / `goal-distill` | 重要性账户 + 任务边界 | 思想卡/套路卡/案例卡/原理卡/品类认知/目标卡 |
| **P3 研究** | `research.service` | 面板手动 | 综合报告卡 + open-question 论断 |
| **P4 代谢** | `metabolize` / `consolidate` / `cleanup` / `fsrs` | 挂机 interval + cron | 合并/垃圾清理/经典性重算/复习排期 |
| **书级汇总** | `book-passes` | 文档消化收尾 | 全书概要/设定索引/人物册/伏笔台账/知识体系图 |
| **体检** | `health.service` | 面板手动 | 覆盖率报告 + 可执行建议 |

**后台自动化 11 个动作**（`automation.service.ts`）：`digest`/`sceneBackfill`/`smelt`/`corpusMerge`/`layerRelabel`/`bookPasses`/`goalDistill`/`consolidate`/`cleanup`/`foreshadow` + 成本熔断。各有冷却记账 + **增长门控**。

### 1.5 领域耦合的具体位置（决定性证据：它不能泛化）

`prompts/index.ts` 的提示词是**文学研究专用**的：

- `ATOMIZE_SYSTEM`（:49）："你是**文学资料研究员**"；提取世界观设定/人物长效事实/伏笔/写作手法
- **有"最高禁令"**（:59-62）：禁止剧情梗概复述——"剧情是章节摘要的职责，不是知识"
- **有创作物判例**（:72-77）：诗词歌赋"转述无价值，评价才有价值"
- **有自检问句**（:68-70）："剥离本书情节后，一个想学这本书设定与体系的写作者还需要这条吗？"
- **场面类型枚举**（:96-97）：`conflict`/`battle`/`breakthrough`/`deal`/`probe`/`emotion`/`chase`/`scheme`/`reveal`/`daily`
- 三个变体（`novel`/`knowledge`/`history`）都是**文档阅读场景**，没有"agent 运行经验"这个场景

**结论**：领域知识在这里是**资产而非负担**——正是这些约束让它提炼质量高。但也正因如此，把它"泛化"到 agent 运行域等于让文学研究员去总结代码调试经验。

---

## 2. 长文写作域

> 本节结论已由我**独立复核**（非仅采信子代理报告）。

### 2.1 对外知识出口（极小，且硬编码单域）

`longwriting/graph/graph-knowledge-provider.ts`（96 行）：

```ts
installGraphKnowledgeProvider(d) → registerStructuredProvider({
  id: 'longwriting-graph',
  supports: (scope) => scope.bizModule === 'longwriting' && !!scope.projectId,   // ← 硬编码
  query: queryGraph,
})
```

- **唯一安装点**：`packs/longwriting/story-room/room-session.ts:310`（每轮调用）
- **查询逻辑**（`:41-64`）：对每个 topic × 6 类实体（`character`/`location`/`item`/`faction`/`skill`/`event`）尝试 `resolveEntities` → `getRelations` → 拼「X 当前关系：…」段
- **复核确认**：`supports` 硬编码 `bizModule === 'longwriting'`，**其他域/宿主拿不到长文知识**

### 2.2 死代码（已独立复核）

| 项 | 复核结果 |
|----|---------|
| **整个 `longwriting/context/` 包**（context-compressor / context-prompt / context-token / entity-formatters / 11 个 providers，含 `vector-search.provider.ts`、`memory.provider.ts`） | ✅ **确认死代码**。`Select-String "longwriting/context"` 在 `src/` 全量扫描（排除 context 目录自身）**零命中**——仅测试文件引用 |
| `LwPredicateRegistryRepository.normalizeOrRegister()` | 全仓零调用（谓词归一仅发生在迁移期一次性 SQL） |
| **`LwVectorIndexService.indexEntity/indexChapter/indexMemory`** | 除 `rebuildProjectIndex` 内部外**零生产调用**；`indexMemory` 全仓零调用 |
| **`lw_story_memories`（长文域自己的"记忆"表）** | **实质死表**：CRUD 挂在 IPC 上但渲染层无调用；`indexMemory` 零调用 → 表基本为空 |
| `ChapterGraphProcessor.buildEdges()` | ✅ **确认恒返回 `[]`**（`:660-667`），但**是刻意为之**（注释：52 号统一存储，事件→实体关联改由 `lw_events.involved_entities` JSON 推导，"保留方法签名避免破坏调用方"）。**不是 bug** |

### 2.2.1 弃用原因（**已查到根因，对重建决策至关重要**）

`tasks/2026-08-23-longwriting-review-draft.md:17-24` 记录得很清楚：

> **"没有 ContextBuilder 实例化、没有 `build()`/`loadBuildContext()` 主编排实现，`generateChapter` 未接入 ContextBuilder"**
> —— `context/` 是**"步骤 1"预留的半成品**

**它不是被否定的设计，而是从未完成**：

| 已完成 | 缺失 |
|--------|------|
| `context.types.ts` 类型完备（`LwContextItemType` 已预留 `graphEdge`/`timeline`/`foreshadow`；`ContextItem.source` 已支持 `'graph'`\|`'timeline'`） | **主编排器 `ContextBuilder`**（`build()` / `loadBuildContext()`） |
| `context-prompt.ts`（`SYSTEM_PROMPT_TEMPLATE` + `renderUserPrompt`） | `generateChapter` 的接入 |
| 11 个 provider（含 entity-state / **memory** / **vector-search**） | —— |
| `context-token` / `context-compressor`（预算工具） | —— |

**当时的决策**（`:22-24`）：给了两个选项——(a) 补完 ContextBuilder 并接入（改动大）；(b) 在手工 prompt 上增量加图谱段（改动小、风险低，但"GraphEdge/Timeline provider 白写"）。**建议采用 (b) 并"把 ContextBuilder 接入列为独立优化项"——即挂起了**。

**另有一处荒诞细节**（`docs/review/2026-08-27-commit-review-0817-0827.md:1800-1807`）：`context-compressor.spec.ts:73` 有语法错误（多一个右括号），**整个 spec 从未运行过**，提交信息却宣称"配套单测"——"这正是'假测试'形态"。

> **对重建的含义（重要）**：
> 1. 本项目**已经有过一次"通用知识装配层"的设计并写了大半**，卡在**主编排器**这一步——不是想法错了，是没做完
> 2. 我们这次要建的"总线"，与它当年的目标**高度重叠**。**必须先读这套代码再设计**，否则是第二次重造
> 3. 它的类型层设计（`LwContextItemType` 预留 `graphEdge`/`timeline`/`foreshadow`、`source` 支持 `graph`/`timeline`）**可以作为总线契约的参考或起点**
> 4. 教训：这次建总线，**编排器（谁调用、何时调用、预算怎么分）必须与 provider 一起交付**，不能只写 provider 不写编排

### 2.2.2 这套死代码的设计对总线契约的参考价值（已读源码）

`longwriting/context/context.types.ts`（174 行）的设计**比现有 `KnowledgeSegment` 契约成熟得多**：

| 设计点 | 它怎么做 | 对总线的启示 |
|--------|---------|-------------|
| **稳定 id** | `makeItemId(type, entityId, idx)` → `${type}:${entityId}`（`:42-44`） | **正是当前 `KnowledgeSegment` 缺的**——有 id 才能回写反馈 |
| **优先级预算** | `ContextPriority` 1-11，超预算时**低优先级先压缩**（`:34-35`） | 比现在"先到先得填满 maxChars"更合理 |
| **来源标注** | `source: 'vector'\|'graph'\|'timeline'\|'manual'\|'sql'`（`:59`） | 让消费方能区分知识来源与可信度 |
| **相关性分** | `score?: number` 0-1（`:61`） | 排序与阈值过滤的基础 |
| **可包含/排除/编辑** | `included` + `editable` + `ForcedContextItem`（`:63-65`, `:92-97`） | **用户可强制注入/排除/改写**——人机协同的关键，当前契约完全没有 |
| **分区聚合** | `ContextSection`（同类 item 聚合 + 分区 token 估算，`:70-77`） | 为"按 kind 分流注入"提供现成结构 |
| **清单可复用** | `ContextManifest.buildId = ${outlineId}:${sha256(...)}`（`:109-110`） | 幂等复用，避免重复装配 |
| **共享加载上下文** | `BuildContext` 一次性加载，Provider 只读不重复查库（`:142-171`） | 解决 N 个 provider 各自查库的性能问题 |

> **建议**：总线契约设计时**直接复用这套类型的思想**（稳定 id / 优先级预算 / 来源标注 / 强制注入），而不是在 `KnowledgeSegment` 上打补丁。这套代码虽然死，但**类型设计是对的**——它死在编排器缺失，不死在设计。

### 2.3 与 kb-brain 的关系

- 长文域**不读** kb-brain（源码零 import）；方向是**反向**的——kb-brain 的 provider 声明 `supports` 含 `'longwriting'`
- 研讨室内可用 `kb_brain_query` 工具（`room-session.ts:317`）

### 2.4 长文域的对外出口实测（**只有一条，且被锁死**）

| 出口 | 提供什么 | 谁能拿到 |
|------|---------|---------|
| **唯一正式出口**：`longwriting-graph` provider | ① 关系事实（每 topic 前 3 条边）② 待处理矛盾（前 3 条，已排除作者已登记项） | **仅 `bizModule==='longwriting' && projectId`**（硬编码拒绝其他域） |

**它拿不出来的（当前）**：bible 设定集全字段 / 状态切片与时间线 / 章节摘要与跨章事实表 / 共识账本 / 向量检索——**全部只在域内被 R 规则和 prompt 注入消费，无 provider 通道**。

**两个实测缺陷**（重建时要修）：

1. **章节时间过滤从未生效**——`installGraphKnowledgeProvider({})` 唯一调用点传空 deps（`room-session.ts:310`，我已复核），而 deps 是模块级变量，`resolveCurrentChapter` 恒为 `null`，`chapter` 恒为 `undefined` → 关系段实际给的是"**全时段有效关系**"，不是"当前章时点"。
2. **预算截断是先 push 后累加**（`:63-64`），单段无长度上限 → **可能超预算一段**。对比 kb-brain 的实现更严谨（显式截断到剩余预算）。

### 2.5 长文域的知识"厚"但出口"薄"

实测这里有四样东西加起来就是一个现成的"**实体时间线知识 API**"：

| 资产 | 内容 |
|------|------|
| `lw_entity_state_snapshots` | 按章的状态切片（`UNIQUE(project, entity_type, entity_id, chapter_number)`） |
| `lw_events` | 事件 + `involved_entities` JSON |
| `lw_graph_edges` | 关系边 + `valid_from_chapter`/`valid_until_chapter` |
| `cross-chapter-facts.ts` | **已实现的"事实表"格式化器**（人物优先排序、≤140 字截断、严格取本章之前） |
| `BibleQueryService.progression` | 已是"状态/事件/关系"三合一时间线 |

**目前只在域内被 R 规则与写作 prompt 消费，没有 provider 化**——这是接入总线的现成高价值素材。

### 2.6 设定集 schema 注册表（`lw_bible_kinds`）

`create-bible-tables.ts:99-115`，10 个内置种子（`:30-89`）：

| 字段 | 语义 |
|------|------|
| `storage` | `'entity'` \| `'custom'`——路由到不同存储 |
| `entity_repo` | db manager 上的键名（如 `lwCharacters`） |
| `fields_schema` | JSON 表单/详情渲染字段模板 |
| `prompt_hint` | 整理器 JSON 输出模板 |

**注意**：内置 entity 类 7 个种子的 `fields_schema` 为空，靠 `bible.service.ts:54-89` 的 `DEFAULT_ENTITY_SCHEMAS` 兜底。

> 详见子代理完整报告（`lw_*` 全表、story-room 账本/提炼器/审批、R1-R11 规则、向量索引）。

---

## 3. 平台级知识/记忆基础设施

### 3.1 结构化知识提供方契约（装配总线）

`agent-runtime/memory/structured-provider.ts`（47 行，全文）

```ts
interface KnowledgeSegment {
  layer: 'L3'                    // 硬编码单层
  kind: 'structured-fact'        // 硬编码单值
  text: string                   // 无 id
  source: { provider: string; ref: string }
}
interface StructuredKnowledgeProvider {
  readonly id: string
  supports(scope: { bizModule?, projectId? }): boolean
  query(req: { scope, topics: string[], budget: {maxSegments, maxChars}, signal? }): Promise<KnowledgeSegment[]>
}
```

**三个能力缺口**（决定了"支撑不了记忆"）：
1. **无 `id`** → 消费方无法回写"这条被用了/没用"→ **反馈闭环做不了**（旧飞轮死因之一）
2. **`kind` 只有 `structured-fact`** → 无法区分事实/经验/偏好/技能，而它们的注入策略完全不同
3. **无时间语义** → 无法表达"这条经验是三个月前的，可能过时"→ **衰减做不了**

**现有实现 2 个**：
- `longwriting/graph/graph-knowledge-provider.ts`（id `longwriting-graph`，`supports: bizModule==='longwriting' && !!projectId`）
- `kb-brain/brain-provider.ts`（id `kb-brain`，`supports: ['longwriting','domain-learning','episode-production']`）

### 3.2 HostKit 装配脊柱（消费端）

`agent-runtime/host/host-kit.ts:246-299` `assembleMemoryLines()`，三段式：

```
① mem.systemLine                          → L0 系统能力摘要（常驻）
② 通道A：listStructuredProviders() 扇出      → 结构化事实段（scope 匹配时）
③ 通道B：flywheel.assemble()                → 旧飞轮召回（当前 null）
```

- 预算：`DEFAULT_STRUCTURED_BUDGET = { maxSegments: 2, maxChars: 600 }`（`:76-77`）
- 主题词提取：`extractRecallTopics(text, max=5)`（`:200`，取前 60 字符按非中英数切分）
- **纪律**：任何环节失败只降级不炸轮（`:245`）

**5 个宿主的实际声明（实测）**：

| 宿主 | memory.scope | recallText / topicsText | 备注 |
|------|-------------|------------------------|------|
| chat | `null` | — | **进不了通道A**（`system-agent.service.ts:222`），靠 `kb_brain_query` 工具 |
| story-room | `{bizModule:'longwriting', projectId}` | **两者都有**（`room-session.ts:359-363`） | 唯一同时声明 topicsText 的宿主 |
| 领域学习 | `{bizModule:'domain-learning', projectId: spaceId}` | 仅 recallText（`dl-agent-harness.service.ts:448-451`） | 未声明 topics/structured |
| 剧集制作 | `{bizModule:'episode-production', projectId}` | 仅 recallText（`ep-agent-harness.service.ts:431-435`） | 另**显式绑定 `kb_brain_query` 工具**（`:361`） |
| 任务树 | 由 `runtimeContext.memoryScope` 声明 | — | 漏声明会退化 L1 并跨模块互串（§5.5） |

**`recallText` 只用用户消息的纪律**（EP 注释 `:433-434` 明文）：
> "召回语料只用用户消息（story-room 复盘结论：整段快照作语料会让 2-gram 撞上无关全局记忆，构成污染源）"

——这是旧飞轮跨域串扰的**第三个成因**（除 2-gram 分词、漏声明 scope 之外）。

### 3.3 上下文管理层（L1-L4，**已完整实现**）

`agent-runtime/context/context-manager.ts`（555 行）

**消息分类**（`:66-81`）`MessageKind`：`user`/`assistant`/`tool`/`system`/`compaction.summary`/`turn.context`
- 稳定标记识别（双端同检防伪造，`:69-77`）

**压缩管线**（`:316-378`）两阶段：
- Phase 1 **剪枝**：近端保护（`protectedTail` 缺省 8K）+ 最小节省门槛（`minPruneSavings` 缺省 4K）
- Phase 2 **守恒摘要**：用户消息预算（20K）+ 当轮最后一条用户消息无条件保留 + 最新轮次上下文块保底 + **摘要置尾**（`summaryMessage`）
- 水位：软限 0.9 / 硬顶 0.95（夹取上限 0.99）
- **滚动携带**（`:332`）：前次摘要一并进入摘要输入——防"前次折叠内容在二次压缩时永久蒸发"
- `forceCompact`（`:280-309`）：provider 超窗后的强制降载重试

**同签名大结果折叠**（`:413+` `collapseSupersededToolResults`）：同工具同入参重复执行时只保留最新全文，旧的大结果占位化（可 `get_tool_result` 回查）

**悬空工具调用修复**（`:187-198`）：崩溃恢复补哨兵，幂等

### 3.4 会话与流水存储（**无损历史**）

| 表/模块 | 语义 | 关键点 |
|---------|------|--------|
| `agent_sessions` | **当前工作集**（全量替换） | `session-store.ts`；压缩/剪枝会改写 |
| `agent_session_events` | **append-only 原始流水** | `transcript-store.ts`；"每条消息首次进入历史时落一行，之后工作集怎么改写都不影响流水" |
| `agent_trajectories` | 轨迹（决策/工具/记忆装配留痕） | 幂等键 `(scope_key, seq)`；`kind` 含 **`memory_assembly`** |
| `agent_tool_artifacts` | 工具产物归档 | 按 `toolCallId` 回查全文（`get_tool_result`） |

**这是"可回放审计"的基础设施**——旧飞轮当年没有利用它。

### 3.5 工具注册表与能力目录

`agent-runtime/tools/registry.ts`（875 行）：
- 命名 `TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,48}$/`；`pack:` 命名空间；`source` 枚举 `builtin|pack|node|tool`
- 执行管线六步：审批短路 → zod 校验 → 静态合并 → 执行 → 产物归档 → 截断序列化
- **错误永不 throw 出 registry**（`:12`）

**L0 能力目录（`discover_capabilities` 的数据源）**：
`workflow/tools/module-capability-catalog.ts` — **13 张能力卡**：`workflow`/`data`/`skills`/`longwriting`/`episode-production`/`voice`/`image`/`translate`/`knowledge-base`/`asset-center`/`diary`/`portrait`/`domain-learning`
- 消费面①：`renderModuleCapabilityDigest()` 注入系统提示（有界摘要）
- 消费面②：`filterModuleCapabilityCards()` 全量详情（`discover_capabilities` 按 keyword 收窄）
- 登记处纪律："能力写多了=诱导必败调用，写少了=agent 不知道能用"

### 3.6 技能体系（程序性记忆载体）

`workflow/skills/skill.service.ts` + `skill-parser.ts`
- 存储：**文件系统** `<dataPath>/skills/<id>/SKILL.md` + `references/`
- frontmatter：`name`/`description`/`title`/`when_to_use`/`category`/`inputs`/`system_prompt`/`output_desc`/`disable_model_invocation`
- 23 个内置技能（`builtin-skills.ts`）
- 渐进披露天然支持：`references/*.md|txt` 执行时才拼入

### 3.7 事件与调度

- `domain-event-bus.ts:78` `publishDomainEvent` **双投递**：进程内同步 + 平台总线落库（at-least-once 可重放）
- 已登记事件 7 个（`workflow.types.ts:1236-1244`）：`kb:document-completed`/`kb:document-failed`/`image:generation-completed`/`translation:completed`/`translation:failed`/`voice:tts-completed`/`voice:stt-completed`
- `workflow-trigger-scheduler.service.ts`：cron + 事件触发（**V1 限制：仅首个 cron 触发器生效**，`:154-156`）
- 事件触发限流（防自触发风暴，`:41-47`）

### 3.8 提议-审批队列（**5 条并存，无统一抽象**）

| # | 队列 | 存储 | 状态机 | 批准入口 |
|---|------|------|--------|---------|
| 1 | agent 记忆待审 | 表 `agent_memory_entries` | `pending_review → active/archived` | `am:*`（**已停用，必抛错**） |
| 2 | kb 提议箱 | 表 `kb_notes` | `proposed → published/archived` | `kb:brain:proposal-inbox`/`decide-proposal` |
| 3 | 工具审批卡 | 内存+可选落库 | `pending → approve/approve_with_edit/reject`（**超时=拒绝**） | `approval:request` 事件 |
| 4 | 写作章法门禁 | JSON `wizard_state` | `pending → approved/rejected` | 顶栏 + `[待审批:apr_x]` |
| 5 | 工作流人工审核 | 表 `workflow_node_runs` | 挂起 → 批准/修改后批准/驳回 | `wf:get-pending-reviews` |

**已有统一待办中心** `/agent-todos`——但**只聚合了 #5 与任务裁决**。

### 3.9 运行域观测面（反馈闭环的信号源）

| 表 | 关键字段 | 用途 |
|----|---------|------|
| `agent_tasks` | `status` 9 态、`qualityScore` 0-1、`specJson`、`resultJson`、`retryCount` | **成败信号**（旧飞轮唯一用过的） |
| `agent_trajectories` | `kind`/`name`/`payload_json`/token 计数 | 轨迹全文 |
| `agent_tool_calls` | 工具调用审计（含被拦截/被拒） | 行为序列 |
| `agent_tool_artifacts` | 完整工具产物 | 可回查 |

**质量门仍在运行**：`Verifier`（`verify/verifier.ts:145`），`DEFAULT_GRAY_LOW=0.6`/`DEFAULT_GRAY_HIGH=0.8`

---

## 4. 旧飞轮（agent 运行域，停用）

### 4.1 资产完整度（**代码/表/IPC/配置全在，只是被开关短路**）

| 资产 | 位置 |
|------|------|
| 服务 | `agent-runtime/memory/memory-flywheel.ts`（436 行） |
| 表 | `agent_memory_entries`（含 KE-1 分层列 `biz_module`/`project_id`/`content_hash`/`embed_model`） |
| IPC | `am:*` **7 个通道**（`agent-tasks.handler.ts:90-110`） |
| 设置键 | `agent:memory`（**6 个参数全部保留**，`agent-context.params.ts:102-163`） |
| 开关 | `AGENT_MEMORY_FLYWHEEL`（`workflow-boot.ts:1139-1141`） |
| 单测 | **5 个 spec 仍可运行** |

### 4.2 七条失败病因（代码级）

| # | 病因 | 证据 |
|---|------|------|
| 1 | 只有 ADD，无 UPDATE/DELETE/NOOP | `:209-222` 仅 `repo.create()`；唯一代谢 `archiveStale()`（30 天零命中） |
| 2 | 召回是 2-gram 关键词 | `tokenize()` `:87-97`；v1 `embedding_id` 是死字段 |
| 3 | **跨域串扰实证** | 注释自认 `:46-51`：账本「审计师」的 2-gram「审计」撞上 SOP → 框架选型建议进了故事研讨室 |
| 4 | 产出渠道单一 | 仅任务成功蒸馏 + 手工录入 |
| 5 | **全人工闸门堵死** | `approve()` 是唯一 active 路径（`:350-357`） |
| 6 | 装配硬塞 top-K 全文 | `assemble()` `:247-316` |
| 7 | 无评测 | 停用理由原文"说不清价值" |

### 4.3 死表 `agent_memories`

仅建表（`create-agent-tables.ts:75-108`），**无 Entity、无仓储**，服务是抛异常的桩（`memory-service.ts:30-32`）。但设计更完整：`canonical_key` 唯一约束、`superseded_by` 版本链、`idempotency_key`、`status: proposed→active→superseded/conflicted/deleted`。

### 4.4 设计思想资产

`agent_memory_entries.kind` 枚举 `fact`/`sop`/`preference`/`skill`/`episode-ref` 与 `L1_MIN_KEYWORD_HITS` 门槛思路可借鉴；`memory_usage_log`（v1 设计，未实现）的使用留痕思路正确。

---

## 5. 领域学习域（已复核）

### 5.1 数据资产：`dl_*` 共 11 张表

| 表 | 用途 | 关键字段 |
|----|------|---------|
| `dl_project` | 学习空间 | `goal`/`kb_id`（绑知识库）/`pace_settings`/`review_settings`/`prerequisites`/`book_suggestions` |
| **`dl_concept`** | **概念节点（树+图）** | `parent_id`/`node_type`(**16 值**)/`definition_short`/`research_state`(5 值)/`mastery`(4 值)/`source`/`attrs`/`card_id` |
| **`dl_relation`** | **关系边（10 值，三层）** | 前置层 `prerequisite`；结构层 `is_a`/`part_of`/`compare`/`cause`/`supports`/`cites`/`constrains`/`updates`；兜底 `related`。含 `evidence`/`verified` |
| `dl_mastery_log` | 掌握度审计 | `from_mastery`/`to_mastery`/`trigger` |
| **`dl_card`** | **讲义（多版本）** | `essence_type`(6 值)/`sections`(JSON)/`works`/`content_md`/**`evidence_sources`**/`spec`/`version`/`status`/**`verification`** |
| `dl_doc` | 文档型内容 | 🔴 **死表**（详见 §5.3） |
| `dl_question` | 追问/未解队列 | `question`/`answer_md`/`status` |
| `dl_note` | 笔记（选区/qna） | `anchor_text`/`anchor_start`/`anchor_end`/`content_md` |
| `dl_plan` | 方案确认流程 | `step`/`status`/`revision`/`payload`/`feedback` |
| `dl_concept_log` | 节点字段审计 | `field`/`from_value`/`to_value`/`trigger` |

### 5.2 知识质量最高，且有独特治理机制

| 机制 | 说明 |
|------|------|
| **掌握度只由用户推进** | `ackMastered`/`ackConfused`/`markReview`/`reviewDone`；**"AI 不自封"**（`learning-graph.service.ts:5-7` 头注释）。前置未全掌握会抛错 |
| **关系需人审** | `verified` 0=agent 建议 / 1=人审确认；`confirmRelation()` 写前**做环检测** |
| **讲义三层门禁** | G1 结构（首区必须 `meta`）/ G2 前置声明（meta 必须命中 6 个标记词）/ G3 前置能力（8 条技能 + 三条豁免路径） |
| **讲义证据强制** | `dl_save_card` 的 `evidenceSources` **`.min(1)` 硬校验**——无证据不落库 |
| **讲义版本化** | `version` + `uniq_dl_card_concept_version` 唯一约束 + 版本恢复（生成新版本） |
| **讲义核验** | `verification.status`：`unverified`/`verifying`/`verified`/`needs_review`；**任一 `unsupported` → `needs_review`**；解析失败保持 `unverified`（**不误标 verified**） |
| **地图完整度诊断** | `assessMapCoverage()` 满分 100，**10 类缺口扣分**（无入口 −25 / 成环 −25 / 不可达 / 平干 −15 / 漏斗 / 仅声明无边 / 无讲义 / 过粗 / 扁平分支 / 无主题前置） |
| **间隔复习** | `pickReviewCandidates()`：逾期降序；**注意：固定间隔（缺省 1440 分钟），无 SM-2/FSRS 递增** |

### 5.3 死表 `dl_doc`（已独立复核）

DDL（`:404-438`）、Entity（`dl-doc.entity.ts`）、Repository（`dl-doc.repository.ts:35`）齐全，但**全仓无任何服务读写**——grep 仅命中 database-manager 装配（`electron/database/index.ts:4707`、`web-database-manager.ts:411`）与单测。**无 `dl:*` IPC 暴露**。**有表无消费者。**

另：`dl_mastery_log.trigger` 注释声明 6 个值，**实际只有 4 个写入点**（`expire`/`self_test`/`qna`/`split` 无写入）。

### 5.4 「已接通但未被认知」（**本项目总线已在工作的最直接证据**）

```
DL 宿主 memory.scope = { bizModule: 'domain-learning', projectId: spaceId }
                                  ↓（dl-agent-harness.service.ts:448-451）
kb-brain provider 的 supports 含 'domain-learning'（brain-provider.ts:35）
                                  ↓
DL 每轮自动获得 kb-brain 的「通道A 设定事实」注入（论断 + 思想卡）
预算：maxSegments: 2 / maxChars: 600（host-kit.ts:77）
```

**DL 从未声明 `topK`/`structured` 参数，用的是默认值**——它是 kb-brain 的无意识消费者。

### 5.5 工具面

- **10 个 `dl_*` 动作 + `dl_task_progress`**（`dl-agent-tools.ts:356-424`）
- `DL_AGENT_PACK_ID = 'dl-agent'`（`dl-agent.types.ts:18`），命名空间 `pack:dl-agent:*`
- **DL 没有 `ep_confirm_choice` 式审批工具**——用 `dl_plan` 弹窗确认替代
- 读工具白名单：`DL_READ_TOOL_NAMES = ['wf_kb_retrieve','wf_web_extract','http_get']`（`dl-agent-bindings.ts:28`）
- **确认：DL 没有 `kb_brain_query`**（grep 验证）——它只能检索原文，不能查论断/思想卡。**EP 有，DL 没有**

### 5.6 运行域打标（**旧飞轮跨域串扰的第二成因**）

`dl-agent-harness.service.ts:465-467` 注释：

> "KE 分层打标（37 号）：`create_task_plan` 据此盖 `scopeTag`——**缺此声明蒸馏全部退化 L1 用户级，跨模块记忆互串（六扇门复盘实证）**"

即：旧飞轮的分层依赖宿主**主动声明** `runtimeContext.memoryScope`，是易漏的隐式契约。

---

## 6. 剧集制作域（已复核）

### 6.1 设定绑定的"双源投影"

`source_type ∈ { linked_lw, standalone }`，核心是 `getEffectiveData()`：

```
linked_lw : override_* → lw 投影 → 兜底
standalone: 直读 standalone_*
```

**实测的投影优先级**（`character-asset.service.ts:162-174`）：
```
name        = overrideName ?? lw.name ?? '(未命名)'
description = overrideDescription ?? ''        ← 仅 override！lw 表无此列
appearance  = overrideAppearance ?? lw.appearance
outfit      = overrideOutfit ?? undefined      ← 仅 override！lw 表无此列
```

> **含义**：EP 对长文设定是**部分覆盖+部分继承**。`description`/`outfit` 完全不继承——这是容易踩的坑。

**`buildAssetRosterForProject()`**（`:35`）对全部 binding 调 `getEffectiveData()`，保证 `linked_lw` 与 `standalone` 对 AI 呈现一致。

### 6.2 剧本/分镜的存储形态（**生产态 ≠ 知识**）

`episode_scripts`/`scene_scripts`/`storyboards` 是**混合存储**：权威列 + **JSON 副本列**（`scenes`/`characters`/`dialogues`/`actions` simple-json）**双写**。

**规范化子表**（真正符合 3NF，可作知识图谱节点）：
- `scene_characters`（`character_id`/`expression`/`outfit`/`position`）
- `scene_dialogues`（`character_id`/`text`/`emotion`/`voice_id`）
- `scene_actions`（`character_id`/`description`/`timing`）
- `scene_props`（挂 `scene_character` 下）
- `storyboard_characters` / `storyboard_dialogue_links` / `storyboard_action_links`

**判定：算「生产态数据」，不算「可复用的知识资产」**——依据：① JSON 列是冗余投影；② 强绑定生产上下文（`location_binding_id`/`video_path`/`segment_id` 换集即失效）；③ 当前无任何服务把它们当知识消费。

**唯一有明确知识属性的是 `asset_image.prompt`/`negative_prompt`/`metadata`**——"什么提示词生成了什么角色"，是可跨项目复用的**生图知识**（有 `derived_from_image_id` 生成谱系）。

### 6.3 工具面

- **13 个生产动作 + `ep_confirm_choice`**（`ep-agent-tools.ts:26,35-50`）
- `EP_AGENT_PACK_ID = 'ep-agent'`；全部带 `dedupArgs: true`
- **EP 显式绑定 `kb_brain_query`**（`ep-agent-harness.service.ts:361`，注释"分镜/编剧会话主动查知识大脑，read，无频控上限"）
- **EP 有审批管线**（`ApprovalCoordinator`，超时 30min）；DL 没有

### 6.4 跨域耦合

- 复用**长文的表** `lw_design_messages` 存 EP 会话历史（`ep-agent-harness.service.ts:328`，已知耦合见 `packs/episode-production/index.ts:20-22`）
- `ep:is-binding-from-longwriting` 判据不是"有没有 lw id"，而是"**指向的 lw 实体 `sourceType === 'longwriting'`**"（排除上传伪实体）

---

## 7. 其他域

- **资产中心**：`assets`/`asset_groups`/`asset_categories`/`asset_image`；两级分类 + `tags` + `textContent`/`jsonContent` + `sourceType`/`sourceRef`。**无向量化列**，与知识库零外键
- **日记**：`diary_entries`（`content`/`frontmatter`/`tags`）、`diary_links`（双向链接）、`diary_attachments`、`diary_folders`（`brain_opt_in`）。**已接线 kb-brain**
- **`portrait` 包** = AI 角色人像生成，**与知识无关**（`packs/portrait/index.ts:23`），不接入

---

## 8. 综合判断

### 8.1 现有能力矩阵（实测）

| 域 | 存储 | 提炼引擎 | 检索能力 | 装配接入 | 反馈闭环 | 状态 |
|----|------|---------|---------|---------|---------|------|
| **知识库** | `kb_*` 6+P4 表 | kb-brain（成熟，9565 行） | 向量+BM25+RRF+图路+CRAG+软衰减 | ✅ provider（3 宿主） | ❌ **无回写** | 运行中/**未验证** |
| **长文写作** | `lw_*` 30+ 表 | 图谱+章节流水线 | 图谱查询 | ✅ provider（**仅 longwriting**） | ❌ | 运行中 |
| **领域学习** | `dl_*` 11 表 | 讲义/方案门 | ❌ 无 | 🟡 **被动被 kb-brain 注入** | ❌ | 运行中 |
| **剧集制作** | binding 表 | 设定富化 | ❌ 无 | 🟡 被动注入 + **主动调 `kb_brain_query`** | ❌ | 运行中 |
| **agent 运行** | `agent_memory_entries` | 旧飞轮（失败） | 2-gram | ⚠️ 通道B = null | ❌ | **停用** |
| **系统能力** | 代码注册表（13 卡） | 无需 | keyword | ✅ systemLine | — | 运行中 |
| **上下文 L1-L4** | 内存 + 3 表 | ContextManager（555 行） | 水位触发 | ✅ 内置 | — | 运行中 |
| **日记** | `diary_*` 4 表 | 复用 kb-brain | 复用 | ✅ 已接线 | ❌ | 运行中 |
| **资产** | `assets` 4 表 | ❌ 无 | ❌ 无向量 | ❌ | ❌ | 运行中（孤立） |

### 8.2 数据流向实测（**单向放射，无回环**）

grep 确认：**kb-brain 对任何业务包零 import**（仅 `brain-provider.ts` 里一个 `bizModule` 字符串数组）。数据流是**纯单向**的：

```
      ┌──────────────┐
      │   kb-brain   │  （知识库域引擎）
      └──────┬───────┘
             │ 只出不进（provider / 工具 / 日记写入）
   ┌─────────┼─────────┬──────────────┐
   ▼         ▼         ▼              ▼
长文写作  领域学习   剧集制作      chat（工具）
（被动注入）（被动注入）（被动注入+主动工具）
```

**没有任何一条回路**：
- 长文写作的图谱/共识账本 **不会**回流到 kb-brain
- 领域学习的讲义/掌握度 **不会**回流
- 剧集制作的设定富化 **不会**回流
- **agent 运行经验完全没有来源**

> 这是"缺总线"的最直观证据：**放射状的单向供给，而不是网状的双向知识流动**。各域产出的高价值知识（长文的图谱事实、DL 的人审讲义）都困在各自域内，无法被其他域或 agent 复用。

### 8.3 六个核心结论

1. **不缺引擎，缺总线与闭环。** 六个域各有存储与部分能力，但 `structured-provider` 契约**承载不了记忆**（无 id → 无法回写；`kind` 单值 → 无法分流注入；无时间语义 → 无法衰减）。**反馈闭环全线缺失**——八个域没有一个能把"这条知识被用了、用完成没成"写回去。

2. **kb-brain 不可泛化。** 领域耦合在**提示词**里（`prompts/index.ts:49` 起：文学资料研究员、剧情复述最高禁令、创作物判例、场面类型枚举），不在表结构里。泛化等于让文学研究员总结代码调试经验。**它是资产，不是基座。**

3. **运行域是唯一真空，且它的病因恰好是 kb-brain 已解决的。** 旧飞轮七条病因中，"ADD-only"对应 kb-brain 的裁决管线、"全人工闸门堵死"对应它的三路分流、"无评测"对应它的 health 体检——**范本现成**。

4. **基建远超预期，几乎不需要新造底层。** 无损流水（`agent_session_events` append-only）、L1-L4 上下文管理（剪枝+守恒摘要+同签名折叠）、能力目录（13 卡）、工具注册表（pack 命名空间+审批+审计）、事件双投递（落库可重放）、文件式技能体系（SKILL.md）、5 条提议队列 + 统一待办中心。

5. **存在"接通了但没人知道"的能力，也有"设计了但从未接线"的死代码。** DL 正被 kb-brain 注入而自己没声明（§5.3）；长文 `context/` 整套 provider 体系零生产引用（§2.2）。**重建前必须查清后者为何被弃用**——本项目历史上已尝试过一次通用知识装配并搁置。

6. **旧飞轮跨域串扰有三个成因，不止一个。** ① 2-gram 分词假命中；② 宿主漏声明 `runtimeContext.memoryScope` 导致蒸馏退化 L1（§5.5 注释实证）；③ `recallText` 用整段快照而非用户消息（§3.2 EP 注释实证）。**修一个没用**——这解释了为什么当年只加 `L1_MIN_KEYWORD_HITS` 补丁无效。

### 8.5 遗留清理清单

| 项 | 判定 | 建议 |
|----|------|------|
| `longwriting/context/` 整套包 | 死代码（零生产引用） | 查清弃用原因后删除或重启用 |
| `dl_doc` 表 | 死表（有表无消费者） | 删表 |
| `agent_memories` 表 | 死表（无 Entity/仓储，服务抛异常） | 取其设计（`canonical_key`/`superseded_by`/`idempotency_key`）后删表 |
| `agent_memory_entries` + 旧飞轮 | **非死代码**（代码/表/IPC/配置/单测全在，仅被开关短路） | 数据处置需决策 |
| `LwPredicateRegistryRepository.normalizeOrRegister()` | 零调用 | 删或接线 |
| `ChapterGraphProcessor.buildEdges()` | 恒返回 `[]`，**刻意为之**（52 号统一存储） | **保留**（注释已说明） |
| `dl_doc` 表 | 死表（有表无消费者） | 删表 |
| `dl_mastery_log` 的 4 个未用 trigger | 注释声明无写入点 | 清理注释或补实现 |
| `ep-agent-context.ts` | 疑似死代码（头注释自认"内容已分叉"） | 查证后删除 |
| `lw_story_memories` + `LwVectorIndexService.index*` | 实质死链（表空、无调用） | 决策：清掉或接通 |
| `LwPredicateRegistryRepository.normalizeOrRegister()` | 注释宣称"M1 起 GraphService 写边前统一过这里"，**接线从未落地** | 删或接线 |
| 三张 binding 的 `image_paths`、`storyboards.frame_image*` | 已 `@deprecated` | 迁移完成后删列 |

---

## 9. 对重建方案的直接含义（本盘点的结论）

### 9.1 总线的确切定义（基于实测）

> **总线 = 一个把「各域知识」标准化后供给「各宿主」的编排层。**
> 它必须包含四件，缺一不可：**① 统一检索扇出 ② 统一装配契约（带 id/kind/优先级）③ 反馈回写 ④ 统一提案收件箱。**

**当前状态：②有雏形但能力不足，①③④全缺。**

| 件 | 现状 | 差距 |
|----|------|------|
| ① 统一检索扇出 | `assembleMemoryLines()` 有扇出循环（`host-kit.ts:268`） | 无跨域统一查询工具；chat 进不了通道A |
| ② 装配契约 | `KnowledgeSegment`（47 行） | **无 id / kind 单值 / 无时间语义 / 无优先级 / 无强制注入** |
| ③ 反馈回写 | **完全没有** | 契约无 id，无从回写；八域无一处记录"被用/成败" |
| ④ 统一收件箱 | 5 条独立队列 + `/agent-todos`（只聚合 2 条） | 需接入知识提案 |

### 9.2 契约设计的现成参考（**重要发现**）

死代码 `longwriting/context/context.types.ts` 的设计**比现有契约成熟**，建议直接复用其思想（§2.2.2）：

```
稳定 id（makeItemId）        ← 补 KnowledgeSegment 最大的缺口
优先级预算（ContextPriority 1-11，超预算低优先级先压缩）
来源标注（vector|graph|timeline|manual|sql）
相关性分（score 0-1）
强制注入/排除/编辑（ForcedContextItem）
分区聚合（ContextSection + 分区 token 估算）
清单复用（ContextManifest.buildId = sha256）
共享加载上下文（BuildContext，防 N 个 provider 重复查库）
```

### 9.3 各域接入总线的优先级（按"能否立刻产生价值"）

| 优先级 | 域 | 动作 | 理由 |
|--------|----|------|------|
| **P0** | **运行域** | 新建引擎 + 注册 provider | 唯一真空；旧飞轮病因恰是 kb-brain 已解决的 |
| **P1** | **领域学习** | **注册 `StructuredKnowledgeProvider`** | 它的**知识质量最高**（人审 + 证据强制 + 版本化 + 掌握度），却**只进不出**——全项目最可惜的一处浪费 |
| **P1** | 领域学习 | **补 `kb_brain_query` 式主动查询** | EP 已有先例（`ep-agent-harness.service.ts:361`），DL 白名单加一项即可 |
| **P2** | 知识库 | 修 `supports` 白名单 | 现在只服务 3 个 bizModule；chat 进不来 |
| **P2** | 剧集制作 | 剧本规范化子表知识化 | `scene_dialogues`/`scene_actions`/`scene_characters` 是现成的带外键结构化事实 |
| **P3** | 资产中心 | 建适配器 | 无向量化、无提炼，价值待验证 |

### 9.4 三个必须先决策的问题

1. **kb-brain 质量验证**（前置条件）——设计文档自己把"M0 评估先行"列为硬门槛（`knowledge-brain-design.md:567` "无基线不进 M1"），**这个门槛被跳过了**。不验证就照抄它的机制，等于拿未验证的东西当基准。
2. **总线与引擎的先后**——建议**引擎优先**（抽象滞后于验证）。代价：短期内两套并行（`kb_*` 表 + 运行域新表）。
3. **跨域召回默认开还是关**——建议**默认隔离、显式声明才跨域**（沿用 manifest `dependencies` 的思路）。理由：旧飞轮跨域串扰有**三个成因**（§8.3-6），任何一个都是真实教训。

### 9.5 一个必须写进方案的教训

`longwriting/context/` 那套代码死得很有教育意义：**类型层、11 个 provider、prompt 渲染、压缩工具全写完了，唯独没写主编排器**，于是没有任何一行生产代码调用它。提交记录里还有"配套单测"的宣称，而那个 spec 因语法错误**从未运行过**。

**结论：这次建总线，编排器（谁调用、何时调用、预算怎么分、失败怎么办）必须与 provider 同期交付。只交付 provider = 交付死代码。**