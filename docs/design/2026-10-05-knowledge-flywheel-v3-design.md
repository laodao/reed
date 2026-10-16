# 知识飞轮 v3 设计方案（重做）

- 日期：2026-10-05
- 状态：**待评审**（本文只出方案，不含实现）
- 前置：旧飞轮已于 2026-09-12 停用（`36-host-kit-contract.md:139-151`）
- 关联资产：`docs/design/2026-09-16-knowledge-brain-design.md`（知识大脑，已落地）
- 调研档案：本文 §2、附录 A

---

## 0. 结论摘要

一句话方案：

> **不复用旧飞轮的代码，而是复刻 kb-brain 的整套机制（台账幂等 / 分域裁决 / 提议箱 / 冷却记账 / fail-soft / 体检建议），把知识层从"文档域"扩展到"agent 运行域"，并统一成一个知识内核 + 四类知识源 + 三层消费面 + 一组给 agent 的工具面。**

三条核心判断：

1. **旧飞轮的死因是结构性的，不是调参问题。** ADD-only、纯 2-gram 关键词召回、单一产出渠道、全人工闸门堵死闭环、没有评测——五条里任何一条单独修都没用（§1）。

2. **kb-brain 是活的、成熟的、且与旧飞轮不是同一件事。** 我逐文件读过它的实现（~13,000 行、44 文件、2,592 行 UI、26 个 IPC）：它把「**文档 → 知识**」这条路修得很好，但**对 `agent_trajectories` / `agent_tasks` 零引用**——「**agent 运行 → 经验**」这条路它是空的，而那正是旧飞轮唯一做过并做死的域（§3.1.3）。**所以新方案不是"泛化 kb-brain"，而是"用 kb-brain 的机制去补它没有的那条路，再把两条路收进同一个内核"。**

3. **行业在 2025 年集体撞墙后收敛出的答案，与 kb-brain 的实际做法高度一致**（渐进披露 / supersede 不 overwrite / 提炼避开交互路径 / 高风险降人审）。kb-brain 不是需要被推翻的旧资产，而是**已经验证过的机制范本**（§2）。

---

## 1. 旧飞轮失败诊断（代码级取证）

> 结论先行：**旧飞轮是"只写不管理、只堆不裁决、只塞不按需"的三重缺陷叠加**，与行业公认的失败形态完全一致。

### 1.1 七条病因

| # | 病因 | 代码证据 | 后果 |
|---|------|---------|------|
| 1 | **只有 ADD，无 UPDATE/DELETE/NOOP** | `memory-flywheel.ts:209-222` 仅 `repo.create()`；唯一代谢是 `archiveStale()`（30 天零命中归档，`:432-435`） | 库越滚越脏，最终只能整体停用 |
| 2 | **召回是 2-gram 关键词，非语义** | `tokenize()` `:87-97` 用相邻汉字 2-gram；`overlapRatio()` `:100-105` Jaccard；v1 的 `embedding_id` 是死字段 | 跨域假命中 |
| 3 | **跨域串扰实证** | 代码注释自认 `:46-51`：账本「审计师」的 2-gram「审计」撞上「多智能体框架调研」SOP → 框架选型建议进了故事研讨室；事后靠 `L1_MIN_KEYWORD_HITS = 2` 打补丁（`:51`） | 召回不可信，用户不敢用 |
| 4 | **产出渠道单一** | 仅"任务树 succeeded 蒸馏 + 手工录入"，`36-host-kit-contract.md:145-146` | 库长不起来 |
| 5 | **全人工闸门堵死闭环** | `CONFIDENCE_GATE=0.7` 以下直接丢；≥0.7 一律 `pending_review`，`approve()` 是唯一 active 路径（`:350-357`） | 用户不点，库永远是空的 |
| 6 | **装配是"硬塞"而非"按需"** | `assemble()` `:247-316` 把 top-K 直接拼进 system prompt 段头「相关经验」 | 要么噪音污染，要么挤占上下文 |
| 7 | **没有评测** | 停用理由原文："召回质量控制未达可用线……待深度调研业内主流 memory 方案后重做再开"（`36:145-147`） | 说不清价值 → 无法迭代 |

### 1.2 与行业失败形态的对照

行业在 2025 年提供了三条独立印证的教训，旧飞轮**三条全中**：

- **ADD-only 必然退化**：Mem0 原始论文的四操作（ADD/UPDATE/DELETE/NOOP）明确包含 `"DELETE for removal of memories contradicted by new information"`（[arXiv 2504.19413](https://arxiv.org/abs/2504.19413)）。
- **自动化记忆被集体回退**：Mem0 v3 迁移说明把 `"memory mutations: ADD, UPDATE, DELETE"` 改成 `"ADD only: nothing is overwritten or deleted"`；官方承认 `"when information changes, the new fact lives alongside the old one"`（[Mem0 迁移文档](https://docs.mem0.ai/migration/platform-v2-to-v3)）。**行业头部产品主动放弃了写入期冲突消解。**
- **Cursor Memories 被静默移除**：2025-11-21 的 2.1 版本移除且**未写进 changelog**，残留记忆在 2026-01 仍泄漏进上下文，官方建议的清理办法是**降级到 2.0.77 删除后再升回来**（[Archcore 复盘](https://archcore.ai/blog/cursor-memories-removed/)）。教训：不透明层里的记忆，距离消失只差一个小版本号。

---

## 2. 行业调研结论（跨产品横向收敛）

> 调研覆盖：Anthropic（CLAUDE.md / Agent Skills / Memory Tool）、OpenAI（AGENTS.md / ChatGPT memory）、Cursor（Rules / Memories 阵亡）、Windsurf、GitHub Copilot、Letta/MemGPT、Mem0/OpenMemory、Zep/Graphiti、A-Mem、LangMem、Cognee/Supermemory、MCP memory server、Agentic RAG/GraphRAG、上下文工程。

### 2.1 六条多来源独立收敛的铁律

| # | 铁律 | 独立来源 | 对我们的直接含义 |
|---|------|---------|----------------|
| **R1** | **渐进披露（progressive disclosure）是知识挂载的标准形态**：元数据常驻 → 正文按需 → 资源再按需 | Anthropic Agent Skills 三级加载（[官方 spec](https://mintlify.wiki/anthropics/skills/spec/loading-system)）；Cursor Rules 四档触发；Windsurf 四种 activation | 知识目录常驻（可控预算），**正文与细节走工具按需取** |
| **R2** | **常驻预算必须显式设上限** | Claude Code `skillListingBudgetFraction = 0.01`、`maxSkillDescriptionChars = 1536`；Codex `project_doc_max_bytes = 32768` | 装配层要有**硬预算 + 超限告警**，不能静默膨胀 |
| **R3** | **就近/最近者胜出 + 拼接顺序即优先级** | AGENTS.md 官方 FAQ：`"The closest AGENTS.md to the edited file wins"`；Codex 根→当前目录向下遍历 | 分层知识（用户/业务/项目）按**具体度**覆盖，而非简单拼接 |
| **R4** | **冲突用 supersede（关旧开新），不用物理删除** | Graphiti/Zep 双时间线；Mem0 论文的图变体 `invalidate` 而非 delete；社区实践者一致结论 `"facts get superseded rather than overwritten"` | 生命周期裁决必须与写入同批次，且**保留历史可回滚** |
| **R5** | **提炼必须避开交互关键路径** | Letta sleep-time compute；Generative Agents 重要性阈值；MemGPT 溢出驱动 | 消化/蒸馏挂**事件 + 空闲期**，不在对话中途做重提炼 |
| **R6** | **元数据（description）就是检索接口** | Anthropic：description 是 primary triggering mechanism；Matuschak「标题即 API」 | 每条知识的 `description` 要写"做什么 + 何时用" |

### 2.2 四条反面教训（必须规避）

| # | 教训 | 证据 | 我们的对策 |
|---|------|------|-----------|
| **A1** | **写入期自动冲突消解会静默删除真事实** | 生产语料实测：Graphiti 自动失效的边中 **70% 仍是真的事实**（Wilson CI [54.6%, 81.9%]），且失败是静默的——无报错、无警告、写入报成功、事实只是不再出现在检索里（[FINDING-silent-fact-loss](https://raw.githubusercontent.com/alexsh88/synapse/refs/heads/main/docs/FINDING-silent-fact-loss.md)） | **高风险的自动失效必须降级为"标记待审"**，不做静默 supersede |
| **A2** | **厂商自报的基准数字不可信** | Zep 与 Mem0 就 LoCoMo 结果公开论战；关键事实：**全上下文基线约 73% 就能打平/超过 Mem0 最好成绩**（[Zep 复盘](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)） | **必须自建小而硬的评测集**，且用"全上下文基线"作对照 |
| **A3** | **自动化记忆的用户信任极其脆弱** | Cursor Memories 被静默移除、要求关闭 Privacy Mode、账户级而非项目级、重载即丢 | 知识必须**落用户自己的库、可 diff、可导出、可回滚**；隐私默认关 |
| **A4** | **不管理（只堆积）是普遍被跳过的一栏** | LLM Agent 记忆综述把记忆分为"写入/管理/读取"，结论是"管理"被普遍跳过 | 生命周期管理是**一等公民**，与写入同批次设计 |

### 2.3 一个必须内化的期望管理

Memento 消融实验的结论：**记忆/经验系统的增益是个位数百分点，工具与规划的增益是数十分**。知识层是**放大器**，不是救命稻草（见 `docs/research/2026-09-16-kb-brain/c-agent-memory-skill/memento-agentfly-memory-based-learning.md`）。

> 这条决定了方案的验收方式：**不许诺"变聪明"，只度量"召回准不准、被用了几次、用了之后成功率如何"。**

---

## 3. 现状盘点：系统里已有什么

### 3.1 已跑通的「知识大脑」（kb-brain）—— 本次重做的范本

**这是最重要的发现：旧飞轮停用了，但知识域的大脑活着、在自动运行，且体量远超预期。**

我逐文件读过实现（**~13,000 行**，44 个服务文件，最长单文件 1,378 行）。它不是设计稿，是**在生产运行的完整自主知识生产系统**：

| 资产 | 实测证据 |
|------|---------|
| **规模** | `src/core/platform/services/kb-brain/` 44 个 `.ts`；`digest-orchestrator.service.ts` 1,378 行 / 56KB 为最大件 |
| **6 张表** | `kb_atoms` / `kb_entities` / `kb_knowledge_edges` / `kb_notes` / `kb_digest_passes`（消化台账）/ `kb_note_reviews`（复习日志） |
| **UI 面板** | `BrainPanel.vue` **2,592 行**；IPC **26 个** `kb:brain:*` 通道（`kb-brain.handler.ts:36-450`） |
| **自启动** | `digest-orchestrator.service.ts:1295-1307`：Electron 下同时启动 `KbBrainMetabolizeService`（代谢）+ `getKbBrainAutomationService().start()`（后台自动化） |
| **已注册 agent 工具** | `kb_brain_query`，在 chat 直连白名单**第一位**（`system-agent-tools.ts:71-79`） |
| **已注册 structured-provider** | `brain-provider.ts:29-38`（`id: 'kb-brain'`，供 longwriting / domain-learning / episode-production 三宿主装配） |
| **日记已接线** | `diary-brain-sync.service.ts`（目录级 opt-in → 注册为「日记」知识库文档 → 消化 → 提议箱） |
| **卡片 → SKILL.md 桥** | `brain-panel.service.ts:220` `exportSkill()`；`kb_notes.type` 含 `skill-seed` |
| 设计文档 / 调研存档 | `docs/design/2026-09-16-knowledge-brain-design.md`（608 行）；`docs/research/2026-09-16-kb-brain/`（84 份） |

#### 3.1.1 它实际做了什么（代码级）

**A. 消化链路**（`digest-orchestrator.service.ts`）—— 逐章、台账幂等、全程 fail-soft：

```
kb:document-completed 事件 → 串行入队（并发=1，chain 队列）
 → 配置检查（brainConfig.enabled + digestion.enabled + scopeDocumentIds）
 → 内容画像检测（novel/knowledge/history/other，写回 brainConfig.profile）
 → 成本熔断（KB_BRAIN_DAILY_COST_LIMIT，按当日 calls 计数）
 → 逐章 digestChapter：
      ① atomize（低档模型，两段式：句子→命题→挂点）
      ② 实体解析（resolveEntity + 服务端负面清单 MENTION_BLOCKLIST 硬过滤代词/亲属称谓）
      ③ adjudicate（高档模型，候选上限 60）：duplicates / contradictions(update|conflict) / novel
      ④ 落库顺序刻意"先落新再关旧"——中途崩溃只可能"新已入库旧未关"，下轮按 duplicate 合并，**不会丢知识**
      ⑤ 低置信（certainty < autoApproveThreshold）额外标 suspected
      ⑥ 入池：向量 `atom:{id}` + BM25 倒排
      ⑦ leads-to 事件边（statement 对 → 落库 atom 对）
      ⑧ 场面轨（仅小说类）：scenes 落 kb_events + `event:` 向量
 → 章级台账 writes（stats_json + cost_json，MAX_ATTEMPTS 重试）
```

**B. 查询引擎**（`brain-query.service.ts`，492 行）—— 比我原以为的复杂得多：

- 向量召回 + **BM25 词法召回**（自实现 idf/长度归一化，`k1=1.2, b=0.75`）
- **跨类型 RRF 融合**（`RRF_K=60`）；`intent='synthesize'` 时 chunk 权重 ×0.5
- **同源去重**：chunk 命中某 atom 的 sourceChunkId 时不丢弃，**降级为该 atom 的 `context`**
- **M4 软衰减**（呈现层）：`boost = 1/(1+ageDays/180) × (1+ln(1+useCount))`——细节随时间衰减、常用论断增强
- **分层加权** `detectLayerBoost`（命中层 ×1.4 / 非命中层 ×0.85，乘法不硬过滤）
- **成品卡优先**：冶炼产物卡（套路/原理/案例）×1.3
- **PPR 图路补充**（仅 synthesize 且主路未满时，尾部位并入）
- **CRAG 纠错**（默认关）：判级 incorrect → 改写重试 + 图路兜底

**C. 后台自动化**（`automation.service.ts`，539 行）—— 11 个动作，各自冷却记账（`brain_state.automation`）：

`digest`（续消化）→ `sceneBackfill`（存量场面补采，6h/200章）→ `smelt`（冶炼，**事件增长门控**）→ `corpusMerge`（跨书归并，7d）→ `layerRelabel`（分层补标，增长门控）→ `bookPasses`（书级汇总）→ `goalDistill`（目标提炼，增长门控）→ `consolidate` / `cleanup` / `foreshadow`

**D. 冶炼层**（`smelt-pipeline.service.ts`）—— 顺序即依赖序，每阶段 fail-soft：
套路归纳 → 案例拆解 → 原理归纳 → 品类认知 → 跑后质量抽检

**E. 质量治理**：`consolidate`（碎片合并成综合论断，成员 superseded 归档）+
`cleanup`（LLM 分诊垃圾论断，**宁漏勿杀**只收三类硬垃圾）+
`qa-sampler`（滚动抽检均分 → 门控：低分时产物进待审而非直发）

**F. 体检服务**（`health.service.ts`）：纯 DB 只读，产出覆盖率缺口/知识构成/**可执行建议**（建议项映射到面板既有动作）

#### 3.1.2 生命周期状态机（实测六态，非我初稿说的四态）

```ts
kb_atoms.status: 'supported' | 'suspected' | 'contradicted' | 'superseded' | 'stale' | 'archived'
kb_atoms.layer:  'outline' | 'setting' | 'describe' | 'detail'
kb_atoms.type:   'fact' | 'claim' | 'concept' | 'method' | 'insight' | 'open-question'
kb_atoms.origin: 'ai' | 'human'          // human=用户划线/批注/对话捕捉，原话永不改写，certainty=1.0
```

**关键设计（直接印证 §2.2-A1 的规避）**：`severity='update'` 才 supersede（且带 `superseded_by_atom_id` 血缘）；
`severity='conflict'` **只标 suspected 走人审，绝不误毁旧论断**（`digest-orchestrator.service.ts:613-625`）。

#### 3.1.3 与旧飞轮的真实关系（重要澄清）

| 维度 | 旧飞轮 | kb-brain |
|------|--------|----------|
| **知识来源** | **agent 运行轨迹**（任务树蒸馏） | **文档/日记**（用户上传的语料） |
| 知识内容 | "做这类任务的经验教训" | "这批资料里有什么知识" |
| 状态 | 停用 | **自动运行中** |

**它们不是同一件事的新旧版本，而是两个不同的域。** kb-brain 里的"经验卡"（`goal-distill`）
指的是**从书籍里提炼的写作经验**，与 agent 自身运行得到的经验无关——
**grep 全库确认：kb-brain 对 `agent_trajectories` / `agent_tasks` / `agent_tool_calls` 零引用。**

> **这正是新方案的核心空间**：kb-brain 已经把"**文档 → 知识**"这条路修得非常好（可复用的
> 是它的**整套机制**：台账幂等、分域裁决、提议箱、冷却记账、fail-soft、体检建议），
> 但它**完全没有覆盖"agent 运行 → 经验"这条路**——而那正是旧飞轮唯一做过、且做死了的域。

### 3.2 可复用的平台设施

| 设施 | 位置 | 复用方式 |
|------|------|---------|
| **向量存储双实现** | `IVectorStore`（`vector-store.interface.ts:97-157`）：PC=LanceDB / Web=pgvector；注册 `registry.ts:26-44` | 直接用，**零新增基础设施**。**关键**：`knowledgeBaseId` 字段名为"隔离键"但**语义上是逻辑分区键**——旧飞轮正是拿它装 `mem:{userId}:biz:…:proj:…` 三层分区（`memory-flywheel.ts:259-262`），已验证可行 |
| **向量 chunkId 命名空间** | `kb-brain/vector-namespace.ts:10-19` `KB_VECTOR_NS`：`''`（原文）/ `qa:` / `atom:` / `note:` / `ent:` / `event:`；`DOC_SEARCH_EXCLUDED_NS`（`:34`） | 新增知识类型只需在此登记前缀，**同库内多命名空间已被验证** |
| **embedding 生成** | `KnowledgeBaseService.getEmbeddingVectors()`（`:932`）：provider 路由 dashscope/zhipu/openai 兼容 + SecureStorage 解密；**失败返回 null 不 throw**；21 处调用 | 直接复用 |
| **混合检索** | `KnowledgeBaseService.search()`（`:1006`）：向量 + BM25（jieba 倒排）+ RRF/加权融合 + 查询自适应路由（`:1045-1054`）；`include: ['chunk'\|'atom'\|'note']` 已支持知识层进池 | 直接复用 |
| **工具注册表** | `AgentToolRegistry`（`registry.ts`）：`register(def, {packId\|source})`、`pack:` 命名空间、危险级、审批、审计、**错误永不 throw**（`:12`） | 所有知识工具在此注册 |
| **HostKit 装配脊柱** | `host-kit.ts:246-299` `assembleMemoryLines()`：`systemLine` → 通道A（structured-provider）→ 通道B（flywheel） | **已内建双通道**；新知识层挂通道A即可，5 个宿主零改动 |
| **HostKitFlywheelPort 注入点** | `host-kit.ts:49-52`（`assemble` / `assembleUserLevel`）；注入 `deps.flywheel`（`:168`） | **5 个宿主（chat / story-room / EP / 领域学习 / agent-loop）已全部接入**——重开只需让 `flywheel` 不为 null |
| **structured-provider 契约** | `structured-provider.ts:9-34`：`StructuredKnowledgeProvider` + `KnowledgeSegment`；**已有 2 个实现**（长文图谱 `graph-knowledge-provider.ts`、kb-brain `brain-provider.ts:29-38`）、3 个宿主消费 | 新知识源按此契约注册，**抽象门槛已满足** |
| **提议-审批基建（5 条队列）** | 见 §3.4 | 治理面复用与统一 |
| **技能体系（SKILL.md）** | `SkillService`（`skill.service.ts`）：目录 bundle + frontmatter + `references/`；23 个内置技能；`skill-parser.ts` 完整解析器 | **天然符合 R1 渐进披露**，作为程序性记忆载体 |
| **事件总线 + cron 触发** | `domain-event-bus.ts:78,104`（`publishDomainEvent` / `subscribeDomainEvents`）；**双投递**：进程内同步 + 平台总线落库（at-least-once 可重放）；7 个事件名已登记 | 消化/代谢的触发宿主 |
| **Agent 观测面** | `agent_trajectories` / `agent_tool_calls` / `agent_tasks`（`qualityScore` 0-1）/ `agent_sessions` | 反馈回写与评测的数据源 |
| **任务树 + 质量门仍在运行** | `AgentTaskService` 装配于 `workflow-boot.ts:683`；`Verifier`（`verifier.ts:145`）；飞轮回写钩子**代码还在**（`task-service.ts:458-474`），仅被 null 短路 | 重开即通 |

### 3.3 从 kb-brain 实现中提炼的「可直接照抄的八个机制」

> 逐文件读完后，这八条是它工程上真正值钱的部分——**建议逐条照搬到运行域**，而不是重新发明。

| # | 机制 | kb-brain 的实现 | 照搬到运行域的价值 |
|---|------|----------------|------------------|
| 1 | **台账幂等（digest_passes）** | `kb_digest_passes` 唯一键 `(chapter_id, pass_key)` + `MAX_ATTEMPTS` 重试 + `reviveExhaustedForDocument` 人工复活 | 运行域按 `(run_id, pass_key)` 建同类台账——**幂等键是"批次×遍次"，天然支持重跑与多视角重提炼** |
| 2 | **失败方向安全的写入顺序** | 注释明文：**"先落新再关旧"**，中途崩溃只可能"新已入库旧未关"，下轮按 duplicate 合并，**不会丢知识** | 直接照抄。这是比"事务"更实用的崩溃安全策略 |
| 3 | **分域裁决** | 裁决作用域 `(lensNoteId ?? 公共层, 实体)`；**跨视角永不互裁**；consolidate/cleanup 显式排除 human 与 lens 行 | 运行域按 `(bizModule, projectId)` 分域——**根治旧飞轮跨域串扰**（不是靠调关键词阈值） |
| 4 | **冷却记账（brain_state.automation）** | 每个动作一个 ISO 时间戳 + **增长门控**（`smeltEvents` / `relabelAtoms` / `goalRuns.goalId.atoms`）——"素材没明显增长就不重跑，防近似卡反复产" | 运行域同理：**知识池没增长就不重提炼**，避免空转烧调用 |
| 5 | **成本熔断** | `KB_BRAIN_DAILY_COST_LIMIT`，按当日 `calls` 计数，超限即暂停（消化与自动化两处同口径） | 运行域是批量 LLM 调用大户，**必须有同款闸门** |
| 6 | **全程 fail-soft** | 实体摘要/场面轨/书级遍/每阶段冶炼：单点失败只记日志不阻断；文档级 `chain` 串行队列吞错继续 | 沿用 HostKit 纪律（`host-kit.ts:245`）"装配任何环节失败只降级不炸轮" |
| 7 | **体检建议（health.service）** | 纯 DB 只读，产出 `suggestions[]`，**每条建议映射到面板既有动作**（不新增写操作） | 运行域体检：覆盖率缺口 / 存疑待审 / 提议积压 / 长期零命中——**用户知道下一步该点什么** |
| 8 | **结构化输出 + 响亮失败 + 尽力而为归一** | `schemas.ts`：ajv 校验；`normalizeAtomizeRaw` 做别名映射（模型用 `claims` 代替 `atoms`）、坏条目剔除、`removeAdditional` 剥离多余字段——**"多吐字段/近义命名不致命，坏条目不毁整章"** | 运行域蒸馏同样要面对小模型字段漂移，**这套归一策略是反复真机调试的产物，直接抄** |

**另外两条纪律**：
- **注入式依赖全覆盖**：所有服务构造器都接受 `deps`（`llm` / `embed` / `repos` / `modelOverride`），测试零成本注入假实现——**这是它能被 5+ 个 spec 覆盖的原因**，运行域照做。
- **多租户按 kbId 隔离模型解析**：`createKbScopedLlm`（`llm.ts`），注释记录踩坑"单例并发跑多库不互踩"——运行域同样多租户，照做。

### 3.4 五条并存的「AI 提议、人批准」队列（本次必须统一）

盘点发现系统里有 **5 条彼此独立、形态各异的审批队列**，无统一抽象：

| # | 队列 | 存储 | 状态机 | 批准入口 |
|---|------|------|--------|---------|
| 1 | **agent 记忆待审** | 表 `agent_memory_entries` | `pending_review → active/archived` | `am:*`（**已停用，调用必抛错**） |
| 2 | **kb_notes 提议箱** | 表 `kb_notes` | `proposed → published/archived` | `kb:brain:proposal-inbox` / `decide-proposal` |
| 3 | **ApprovalCoordinator**（工具审批卡） | 内存 + 可选落库 | `pending → approve/approve_with_edit/reject`（**超时=拒绝**） | `approval:request` 事件 + `decide()` |
| 4 | **RoomApproval**（写作章法门禁） | JSON（`lw_projects.wizard_state`） | `pending → approved/rejected` | 顶栏待审批 + `[待审批:apr_xxx]` 标记 |
| 5 | **工作流人工审核节点** | 表 `workflow_node_runs` | 运行挂起 → 批准/修改后批准/驳回 | `wf:get-pending-reviews` + 待办中心 |

**已有的统一待办中心**：`/agent-todos`（`AgentTodosView.vue`）——但**当前只聚合了 #5 与任务裁决**，未聚合 #1/#2/#4。

> **设计决策**：本次不新建第 6 条队列，而是**把知识提案挂到现有统一收件箱**（§6.1 的 `knowledge_proposals` 表作为跨来源登记层，#2 的 `kb_notes.status='proposed'` 保留为卡片的具体形态）。这正是旧飞轮死因 5（闸门堵死）的结构性解法——**用户只在一个地方审批**。

### 3.5 已验证的「知识 → 可执行技能」链路（本次直接复用）

盘点发现一条**已经打通但尚未被重视**的链路，它正是"程序性记忆"的现成实现：

```
kb_notes (type='skill-seed'「技能种子」)
   → brain-panel.service.ts:220 exportSkill(noteId)   ← 导出为 SKILL.md（YAML frontmatter + markdown）
   → IPC kb:brain:export-skill (kb-brain.handler.ts:445)
   → <dataPath>/skills/<id>/SKILL.md                   ← 技能库目录格式
   → resolveSkill() → skill-call 节点 / invoke_skill 工具 → 可执行
```

- frontmatter 含 `name` / `description` / `version` / `origin: kb-brain/{type}` / `evidence-count`；正文含「## 证据锚点」段
- **这意味着 §5.2 ③ 的 `skill` 产出不需要新造格式**——产出 `skill-seed` 卡 → 人批准 → 导出 SKILL.md 即可，且天然带证据锚点与版本号

**唯一缺口**：目前导出是**单向落盘**（前端 `saveBlobAs`），没有「导出后自动写入 `<dataPath>/skills/<id>/`」的落库路径（§10 M4）。

### 3.6 遗留与待决

| 项 | 状态 |
|----|------|
| `agent_memory_entries` 表 + `MemoryFlywheelService` + `am:*` IPC + `agent:memory` 设置键 | **四件套齐全但运行时停用**——`create-agent-memory-entries.ts:24-58`；服务 `memory-flywheel.ts`（436 行）；IPC `agent-tasks.handler.ts:90-110`（7 个通道）；设置键 `settings-keys.ts:40`。**重建 ≈ 重新接线 + 扩展，不是从零写** |
| `AGENT_MEMORY_FLYWHEEL` 开关 | 缺省 off（`workflow-boot.ts:725,838,1138-1140`）；`am:*` handler 有停用守卫（`agent-tasks.handler.ts:23-27`） |
| `agent:memory` 参数组 | 仍在设置页（`agent-context.params.ts:102-143`），标签叫「记忆飞轮」——**既有配置入口，不要另造** |
| 飞轮 UI/菜单 | 已清理（`progress/2026-09-16-ai-chat-perf-and-flywheel-cleanup.md`） |
| **`agent_memories` 死表** | **仅建表、无 Entity、无仓储**；服务是抛异常的桩（`memory-service.ts:30-32` `throw new Error('M1: 待实现')`）。**但其设计更完整**：`canonical_key` 唯一约束、`superseded_by` 版本链、`idempotency_key`、`status: proposed→active→superseded/conflicted/deleted`（`create-agent-tables.ts:75-108`）→ **取其设计，并入新模型**（§11 开放问题） |
| **`portrait` 包不是用户画像** | 是 **AI 角色人像生成**（文生图工作台）：`packs/portrait/index.ts:23` `description: 'AI 角色人像设计与生成'`。**不要当作偏好知识源接入**——其产物属"资产"形态 |

---

## 4. 目标架构：一个知识内核 + 四类知识源 + 三层消费面

```
┌─────────────────────────────────────────────────────────────────────┐
│  消费面（三层，预算递减）                                             │
│  ① 装配 push：常驻目录（description 索引，硬预算）                    │
│  ② 工具 pull：agent 主动查询（丰富工具面 —— 用户核心诉求）            │
│  ③ 界面 browse：人读（治理 / 复盘 / 消化率仪表）                      │
├─────────────────────────────────────────────────────────────────────┤
│  生命周期层（写入即裁决，与写入同批次）                                │
│  写入 → 查重 / 冲突判定 / 新颖性 → 路由（自动入库 | 进提议箱 | 丢弃）  │
│  存活 → supersede 关旧开新 · 软衰减（只影响排序）· 归档（可复活）      │
├─────────────────────────────────────────────────────────────────────┤
│  知识内核 Knowledge Core（统一实体 + 统一检索 + 统一溯源）             │
│  ┌────────────┬────────────┬────────────┬────────────┐              │
│  │ 论断 atom  │ 实体 entity│  边 edge   │ 卡片 note  │              │
│  └────────────┴────────────┴────────────┴────────────┘              │
├─────────────────────────────────────────────────────────────────────┤
│  知识源接入层（四类来源，统一"提案"入口）                              │
│  ① 文档域：知识库文档 / 章节（已有 kb-brain 消化管线）                 │
│  ② 个人域：日记（已接线）/ 资产 / 画像偏好                             │
│  ③ 运行域：agent 任务轨迹 / 工具调用 / 工作流运行（**旧飞轮的地盘**）   │
│  ④ 系统域：能力目录（工具/工作流/技能/模块）快照                       │
├─────────────────────────────────────────────────────────────────────┤
│  存储层（不搬家：各域存储自持，检索面统一）                            │
│  kb_* 表 │ diary_* │ assets │ agent_trajectories │ 向量库 kb_vectors   │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 设计原则（六条硬纪律）

1. **机制复刻，代码分治。** 复用 kb-brain 已验证的**机制**（台账幂等 / 分域裁决 / 提议箱 / 冷却记账 / fail-soft / 体检建议），但**不搬它的存储、不把它改成万能件**——各域的表留在各域（沿用 `brain-provider.ts` 的"存储不收编、检索面统一"先例）。
2. **永不裸 ADD。** 任何写入必须经过裁决（查重/冲突/新颖），与写入批次同事务（Mem0 四操作 + ExpeL 投票 + Zep 边失效三来源收敛）。
3. **高风险自动裁决一律降级为人审。** 直接对应 §2.2-A1 的 70% 误杀教训；**沿用 kb-brain 已实现的 `suspected` 中间态**（`digest-orchestrator.service.ts:613-625`）。
4. **push 与 pull 分离成文。** 常驻只给**目录 + 摘要**（硬预算），细节一律走工具按需取（R1/R2）。
5. **提炼避开交互关键路径。** 挂事件（文档完成/任务终态）+ **空闲期定时巡检 + 冷却记账**（R5；kb-brain 的 `automation.service.ts` 是现成范本）。
6. **一切知识可溯源、可回滚、可导出。** 对抗 §2.2-A3 的信任崩塌。

### 4.2 两条路的现状与目标（本方案要补的正是中间这条）

```
                    kb-brain 已修好 ────────────────►  本次要修 ──────►  本次要补
   文档/日记/资产 ──► 消化管道（台账/裁决/提议箱）      │
                                                      ├──► 统一知识内核（检索/治理/工具面）
   agent 运行轨迹 ──► ✗ 空的（旧飞轮做死了这条）  ─────┘
   系统能力目录   ──► 🟡 部分已有（discover_capabilities）
```

| 路 | 状态 | 本方案动作 |
|----|------|-----------|
| 文档域 → 知识 | ✅ kb-brain 已成熟 | **不动**，只把产出登记进统一内核 |
| 个人域 → 知识 | ✅ 日记已接线；资产待接 | 补资产/偏好适配器 |
| **运行域 → 知识** | 🔴 **空的** | **本方案主战场**：用 kb-brain 的机制重建 |
| 系统域 → 能力目录 | 🟡 部分已有 | 正式登记为一等来源 |

---

## 5. 知识源接入设计（四类来源）

> 用户诉求原文："系统内的知识库、日记、资产、系统本身提供的能力等都可以作为知识的来源"。
> 本节把这句话落成四类 **Source Adapter**，全部走同一个"提案"入口。

### 5.1 统一接入契约

```ts
/** 所有知识源的统一接入契约（新增，落在知识内核） */
export interface KnowledgeSourceAdapter {
  readonly id: string                    // 'kb-document' | 'diary' | 'asset' | 'agent-run' | 'system-capability'
  readonly displayName: string
  /** 该源是否对当前 scope 生效（对应 HostKit 的 bizModule/projectId 语义） */
  supports(scope: KnowledgeScope): boolean
  /** 变更检测：返回需要（重新）消化的条目引用（增量，幂等键由适配器给出） */
  listPendingChanges(cursor: SourceCursor | null, limit: number): Promise<PendingItem[]>
  /** 拉取原文/素材（适配器负责领域读取，内核不碰领域表） */
  fetch(item: PendingItem): Promise<SourcePayload>
  /** 消化产出的提案写回（内核裁决后回调，供适配器记录同步状态） */
  onAccepted(items: ProposedKnowledge[]): Promise<void>
}
```

**为什么用适配器而不是内核直连各表**：kb-brain 已验证过一次——它通过 `resolveStructuredProvider`/`brain-provider` 与各域解耦。让内核理解 diary/assets/agent 的领域模型会让内核变成大杂烩（kb-brain §4.1 明文裁决）。

### 5.2 四类来源的具体设计

#### ① 文档域（已有，直接复用）

- **来源**：`kb_documents` / `kb_chapters` / `kb_chunks`
- **现状**：消化管线已完整（原子化 → 实体解析 → 裁决 → 入池 → 向量化）
- **本次动作**：**不改**，仅把它的产出登记为知识内核的标准 `atom` 来源
- **触发**：`kb:document-completed` 域事件（已存在）+ 空闲期定时

#### ② 个人域（日记已接线，资产/画像待接）

| 源 | 现状 | 设计 |
|----|------|------|
| **日记** | **已接线**：`diary-brain-sync.service.ts`；目录级 `brain_opt_in` 默认关；`autoApproveThreshold=1.01` 强制全部进提议箱；正文 <300 字跳过；防抖 5 分钟 | 保持既有红线（隐私 opt-in + 提议制）。**补充**：日记产出的论断应额外打 `origin='human'` 标记（用户原话优先），并计入"品味侧写" |
| **资产** | `assets` 表有 `tags` / `category` / `description` / `text_content` / `json_content` / `source_type` / `source_ref`；**与知识层无连接** | 新增轻量适配器：对 `text_content` 非空的资产（文案/报告/剧本等）做摘要级提案；对 `source_ref` 指向工作流产物的资产，**只登记"某流程产出过什么"的元知识**，不复制内容 |
| **画像/偏好** | `portrait` 包存在；全局变量 `wf_variables`（user scope）承载显式偏好 | 偏好类知识**直通**（不走 LLM 蒸馏，置信度=1）——用户显式设置的，不需要模型猜。落 `note` 类的 preference 卡 |

#### ③ 运行域（旧飞轮的地盘，**本次重点重建**）

这是旧飞轮唯一覆盖的域，也是失败最惨的域。重建要点：

- **来源**：`agent_trajectories`（轨迹全文）、`agent_tool_calls`（工具调用审计）、`agent_tasks`（任务树终态）
- **触发**：任务终态事件 + **空闲期批量**（不再逐任务即时蒸馏）
- **产出三类，而不是旧飞轮的一类**：

| 产出类型 | 内容 | 落点 | 闸门 |
|---------|------|------|------|
| **情景记录 episode** | 目标 + 结果 + 质量分 + 轨迹摘要（事实记录，不评判） | `kb_atoms`（type=`fact`，带 run 溯源）或独立 episodic 域 | **免裁决**（是事实不是观点） |
| **经验教训 lesson** | 成败对照提炼的"什么做法有效/无效" | `kb_atoms`（type=`insight`） | **进提议箱**（高风险） |
| **技能卡 skill** | 可复用的工具调用范式 / 提示词模板 / 子流程 | **导出为 SKILL.md**（复用 `SkillService`） | **一律人工**（最高风险） |

- **关键改进（直接对症旧飞轮病因 4）**：产出渠道从"仅任务成功"扩展到"任务成功 + 任务失败对照 + 用户干预事件（用户改写/驳回 AI 产出是最强信号）"。
- **失败任务的负样本**：旧飞轮对 failed 只记数不蒸馏（`:366` 注释）。新设计**必须蒸馏失败**——ExpeL 的核心发现就是"失败/成功对照对提炼"效果最好。

#### ④ 系统域（能力目录，全新）

- **来源**：统一工具注册表（`AgentToolRegistry`）+ 工作流定义 + 技能库 + 业务包/模块清单
- **产出**：L0 系统能力快照（"系统有 X 模块 / Y 工具 / Z 工作流 / W 技能"）
- **特性**：**客观事实，免审批**（不是模型观点）；带 `generatedAt` 时间戳，>24h 强制重算；变更钩子触发刷新
- **消费**：装配时只注入几百字节摘要；全量目录由 `discover_capabilities` 工具按需拉取（**这正是 R1 渐进披露的落地**，且系统里已有 `discover_capabilities` 工具与 `module-capability-catalog.ts`）

> **注意**：系统域已部分存在（`discover_capabilities` + `module-capability-catalog.ts` + `renderModuleCapabilityDigest()`）。本设计是**把它正式登记为知识内核的一等来源**，而非重建。

### 5.3 知识来源总清单（实测）

| 来源 | 数据实体 | 关键字段 | 读写入口所在包 | 知识形态 | 接入状态 |
|------|---------|---------|--------------|---------|---------|
| 知识库文档 | `kb_documents`/`kb_chapters`/`kb_chunks` | `brainStatus`/`brainProgress`（消化进度列已加） | knowledge-base 包 | 原文 + 论断 + 卡片 | ✅ 已通 |
| 日记 | `diary_entries`/`diary_folders`/`diary_links`/`diary_attachments` | `content`/`frontmatter`/`tags`/`brain_opt_in`/**双向链接 `diary_links`** | diary 包 | human 论断 | ✅ 已接线 |
| 资产 | `assets`/`asset_groups`/`asset_categories`/`asset_image` | `category`+`subCategory`（两级）/`tags`/`textContent`/`jsonContent`/`sourceType`/`sourceRef`/`metadata`；**无向量化列** | asset-center 包 | 元知识 + 摘要 | ⬜ 待接 |
| 用户偏好 | `settings`（**26 个注册键**）/ `wf_variables`(scope) / `app_user_prefs` | — | 平台壳 / workflow / app | preference 卡 | ⬜ 待接（**直通，不走 LLM**） |
| ~~画像~~ | — | — | — | — | ❌ **`portrait` 是 AI 角色人像生成，不是用户画像**（§3.3），不接入 |
| Agent 运行 | `agent_trajectories`/`agent_tool_calls`/`agent_tasks`/`agent_sessions` | `qualityScore` 0-1、`status` 9 态、`specJson`、`resultJson` | agent-runtime | episode/lesson/skill | 🔴 **本次重建** |
| 系统能力 | 工具注册表 / `workflow_definitions` / `apps` / `custom_tools` / SKILL.md | — | platform/workflow | L0 快照 | 🟡 **部分已有**（`discover_capabilities` + `module-capability-catalog.ts`） |
| 长文设定 | `lw_*`（30+ 表）+ `BibleQueryService` | `lw_bible_kinds`（**schema 注册表**）/`lw_custom_entities.fields`/`lw_foreshadows` | longwriting 包 | 结构化事实 | ✅ 走 structured-provider |
| 长文共识账本 | **`lw_projects.wizard_state` JSON**（非表） | `ConsensusEntry`/`ArtifactCard` | longwriting/story-room | 卡片 + 账本 | ✅ **已跑通的提炼+审批流水线，可作范式** |
| 领域学习 | `dl_*`（**11 张表**）：`dl_concept` 树 + `dl_relation` 边 + `dl_card` 讲义 + `dl_note` + `dl_plan` | `mastery`/`evidence`/`sections`/`version`/`status` | domain-learning 包 | **质量最高的卡片形态**（经人工确认） | ✅ 各自消费；可作知识源 |
| 剧集制作 | `character_bindings`/`location_bindings`/`item_bindings`/`user_assets` | `snapshot` JSON / 参考图集 / 风格锚点 | episode-production 包 | 结构化设定 | ✅ 走 structured-provider |
| **外部信息源** | `info_sources`/`email_accounts`/`search_engine_config_*` | **只有"去哪抓"的配置，无"抓到了什么"的内容表** | 平台壳 | — | ⚠️ **采集结果不落库**；若要纳入需新增落点（可复用 `assets` 或 kb 导入管线） |

---

## 6. 知识内核数据模型

### 6.1 复用而非新建

**kb-brain 的四张表已经是通用知识模型**，本次**不新建知识表**，只做两件事：

1. **字段增强**：让 kb-brain 的表能承载非知识库域的知识（主要是 `knowledge_base_id` 的泛化）
2. **新增两个薄表**：提案队列的统一视图 + 使用反馈日志

```sql
-- ① kb_atoms / kb_entities / kb_knowledge_edges / kb_notes 复用
--    唯一需要增强：knowledge_base_id 语义泛化为 scope_key
--    兼容策略：新增 scope_key 列，存量行由 knowledge_base_id 回填（零迁移风险）

ALTER TABLE kb_atoms  ADD COLUMN scope_key VARCHAR NULL;  -- 'kb:<id>' | 'user:<uid>' | 'biz:<module>' | 'proj:<module>:<pid>'
ALTER TABLE kb_notes  ADD COLUMN scope_key VARCHAR NULL;
-- 存量回填后建索引；查询以 scope_key 为主，knowledge_base_id 保留兼容

-- ② 统一提案队列视图（kb_notes.status='proposed' 已是提议箱；
--    新增一张跨来源的登记表，让人在一个收件箱里看到所有来源的提案）
CREATE TABLE knowledge_proposals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,
  source_id     TEXT NOT NULL,      -- 适配器 id（§5.1）
  scope_key     TEXT NOT NULL,
  kind          TEXT NOT NULL,      -- atom | note | skill
  payload_json  TEXT NOT NULL,      -- 提案内容（未落正式表前的暂存）
  evidence_json TEXT NOT NULL,      -- 溯源：sourceRef + quotes + 回链
  risk          TEXT NOT NULL,      -- 'low' | 'medium' | 'high'（决定默认处置）
  disposition   TEXT NOT NULL,      -- 'auto-accepted' | 'queued' | 'merged' | 'rejected' | 'discarded'
  reason        TEXT,               -- 裁决理由（审计与人读）
  batch_id      TEXT,               -- 同批次裁决分组（便于整批回滚）
  created_at    DATETIME NOT NULL,
  decided_at    DATETIME,
  decided_by    TEXT
);

-- ③ 使用反馈日志（旧飞轮 memory_usage_log 的思路，重做为通用形态）
CREATE TABLE knowledge_usage_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  item_kind   TEXT NOT NULL,        -- atom | note | skill
  item_id     TEXT NOT NULL,
  surface     TEXT NOT NULL,        -- 'assemble'（push）| 'tool'（pull）| 'ui'
  run_id      TEXT,                 -- 哪次运行消费的
  query       TEXT,                 -- pull 时的查询词（诊断召回质量的关键数据）
  rank_score  REAL,                 -- 排序分
  outcome     TEXT,                 -- 'succeeded' | 'failed' | 'ignored' | NULL（未观测）
  created_at  DATETIME NOT NULL
);
CREATE INDEX idx_kul_item ON knowledge_usage_log (item_kind, item_id, created_at);
CREATE INDEX idx_kul_run  ON knowledge_usage_log (run_id);
```

**关键设计说明**：

- **为什么用 `scope_key` 而不是继续用 `knowledge_base_id`**：旧飞轮用 `mem:{userId}:biz:...:proj:...` 字符串分区，思路是对的但语义混乱。统一成 `scope_key` 后，四类来源共用一套分层语义（用户级/业务级/项目级），与 R3「就近者胜出」对齐。
- **为什么提案要单独一张表**：`kb_notes.status='proposed'` 只能装卡片。运行域产出的 episode/lesson/skill 需要统一的收件箱，否则用户要去四个地方审批（这正是旧飞轮"全人工闸门堵死"的另一种死法）。
- **`batch_id` 是为了整批回滚**：一次消化批次的裁决可以被整体撤销（对抗 A1 的静默错误）。

### 6.2 生命周期状态机（统一）

```
                         ┌──────────── 高风险（skill / 实体级冲突）────────────┐
                         ▼                                                   │
源事件 ──消化──→ 候选提案 ──裁决──┬── low risk & 高置信 ──→ auto-accepted ──→ active
                                 ├── medium/high risk ───→ queued（提议箱）──→ active / rejected
                                 ├── 重复 ───────────────→ merged（旧条目 use_count+1）
                                 └── 无价值（NOOP）──────→ discarded

active ──新证据覆盖（同域）──→ superseded（关旧开新，链可回溯，可回滚）
active ──长期零命中/低成功率──→ dormant（软衰减：只降排序，不删，可复活）
dormant ──人工复活──→ active
```

**与旧飞轮状态机的关键差异**：
| 旧飞轮 | 新设计 |
|--------|--------|
| `pending_review` 是唯一入口（堵死） | 三路分流：auto / queued / merged / discarded |
| 无 `superseded` 版本链 | supersede + `superseded_by` 指针 + batch 回滚 |
| `archiveStale` 硬归档 | `dormant` 软衰减（只影响排序，可复活） |
| 无 NOOP | `discarded` 是合法且**预期中最常见**的结果（控量的关键） |

---

## 7. Agent 工具面设计（用户核心诉求）

> 用户诉求原文："提供丰富的工具给 agent 调用"。
> 设计原则：**工具是知识消费的主路径（pull），装配只给目录（push）**——对应 R1/R2。

### 7.1 工具面全景（新增 + 复用）

统一命名规范沿用现有 `TOOL_NAME_RE`（`registry.ts:57`）与 `pack:` 命名空间。

#### A. 检索类（read，免审批）

| 工具名 | 用途 | 关键参数 | 状态 |
|--------|------|---------|------|
| `kb_brain_query` | 取"知识包"（意图路由 + 类型化取材 + 预算打包） | `task`, `knowledgeBaseId?`, `topK?` | ✅ **已有** |
| `knowledge_search` | **统一知识检索**（跨来源：论断/卡片/原文/经验） | `query`, `scope?`, `kinds?`, `layers?`, `topK` | 🆕 新增 |
| `knowledge_get` | 按 id 取全文 + 溯源链（含回链原文） | `id`, `kind` | 🆕 新增 |
| `knowledge_related` | 图多跳：沿语义边扩展（supports/refutes/refines/leads-to） | `id`, `relation?`, `depth` | 🆕 新增 |
| `knowledge_timeline` | 双时间线查询："第 X 章/某时点时 Y 是什么状态" | `entity`, `at?` | 🆕 新增 |
| `knowledge_stats` | 库健康度（论断数/命中率/待审数/消化率） | `scope?` | 🆕 新增 |

#### B. 写入类（write，**默认需批准**）

| 工具名 | 用途 | 危险级 | 说明 |
|--------|------|--------|------|
| `knowledge_propose` | **agent 主动提案**一条知识（进提议箱，不直接入正式库） | `write`（可配自动批准） | 🆕 新增。对应 MemGPT 的 `core_memory_replace` / LangMem 的 `remember` |
| `knowledge_note_draft` | 写一条**模型私有草稿**（不进装配、不入库，仅本次运行有效） | `read`（本地态） | 🆕 新增。对应 codex 的 scratch 区 |
| `knowledge_feedback` | 报告"某条知识这次有用/没用" | `read` | 🆕 新增。**反馈闭环的关键**（对应 ExpeL 投票） |

#### C. 能力与技能类（复用）

| 工具名 | 用途 | 状态 |
|--------|------|------|
| `discover_capabilities` | 系统能力目录（L0 系统知识） | ✅ 已有 |
| `invoke_skill` | 执行技能（程序性记忆的执行面） | ✅ 已有 |
| `run_workflow` / `get_workflow_run` | 运行既有工作流 | ✅ 已有 |
| `skill_propose` | **agent 提议把本次做法固化为技能卡** | 🆕 新增（对应 Anthropic"任务中捕获成功做法"） |

#### D. 管理类（exec，人工批准，**主要给 UI 而非 agent 用**）

消化调度 / 代谢触发 / 批量重嵌入 / 导出——这些走 IPC 给界面，不暴露给模型（降低误操作面）。

### 7.2 工具设计纪律

1. **描述即检索接口**（R6）：每个工具的 `description` 必须写"做什么 + 何时用 + 何时不要用"（现有 `kb_brain_query` 的描述是正面范例，含"闲聊不要调用"）。
2. **参数越少越好**：`kb_brain_query` v2 的教训明文写着"参数越少调用失败率越低"——意图路由、类型选择、预算全部服务端做。
3. **写类工具返回"提案 id"而非"已入库"**：让模型知道这是提议而非既成事实，避免它在后续轮次假定知识已生效。
4. **工具结果必须带溯源**：每条返回带 `source`（回链原文/运行），让模型可引用、让人可核查。
5. **降级不报错**：检索类工具在向量不可用时降级关键词、在图不可用时降级平铺，**永不抛错阻断主链路**（沿用 HostKit 纪律 `:245`）。

### 7.3 装配面（push）设计

| 层 | 内容 | 预算 | 触发 |
|----|------|------|------|
| **L0 系统能力摘要** | "系统有 X 模块/Y 工具/Z 工作流" | ≤300 字符 | 常驻 |
| **知识目录索引** | 命中的卡片/技能 `title + description`（**不注入正文**） | 硬上限（建议 ≤800 字符，可配） | 按 query 召回 |
| **结构化事实段** | `KnowledgeSegment`（长文图谱 / kb-brain 供给） | 现有 `DEFAULT_STRUCTURED_BUDGET` | scope 匹配时 |
| **偏好与轻量事实** | 用户级 preference（体量小、普适） | ≤300 字符 | 常驻 |

**关键纪律**：正文/细节**一律不进装配**，只给目录 + 工具提示（"详情用 `knowledge_get` 查 id"）。这是与旧飞轮 `assemble()` 硬塞 top-K 全文的根本区别，也是 R1/R2 的落地。

**预算超限必须告警而非静默截断**（对抗 R2 的 Codex `project_doc_max_bytes` 静默停止追加问题）。

---

## 8. 生命周期与质量治理

### 8.1 裁决管线（写入即裁决，永不裸 ADD）

```
候选 → ①幂等（scope_key + content_hash）
     → ②查重（向量相似度，同 kind 域内比较）
           s ≥ 0.92 → merged（旧条目 use_count+1，不新增）
           0.80 ≤ s < 0.92 → 疑似重复，进提议箱并排展示
           s < 0.80 → 继续
     → ③冲突判定（同 scope + 同实体/同视角域内）
           severity='update'   → 新版旧版并存，旧版标 superseded（可回滚）
           severity='conflict' → **降级为 suspected 进人审**（A1 教训）
     → ④新颖性（LLM 判 NOOP）→ discarded 是合法且常见结果
     → ⑤风险路由（low/medium/high）→ auto-accepted | queued
```

**分域裁决**（沿用 kb-brain §6.1）：裁决作用域 = `(scope_key, 视角, 实体)`。**跨视角/跨域永不互裁**——这是旧飞轮跨域串扰的根治办法（病因 3）：不是靠调高关键词门槛打补丁，而是**从结构上让不同域的知识彼此不可见**。

### 8.2 代谢（空闲期，R5）

| 操作 | 触发 | 说明 |
|------|------|------|
| 合并近重复 | 周期 | 同域同 kind 高相似度 |
| 软衰减 → `dormant` | 周期 | 输入=`use_count`/`success_count`/`last_used_at`；**只降排序，不删** |
| 晋升 | 周期 | 高频引用/高成功率的卡片 → 推荐固化为技能（走人审） |
| 重算指标 | 周期 | 采用成功率、命中率、经典性（复用 `recomputeClassic`） |
| 清理孤儿边 | 周期 | 端点已失效的边降置信 |

**宿主**：复用现有 cron 触发机制；**Electron 挂机时段是天然的免费蒸馏窗口**（kb-brain `metabolize.service.ts:52-58` 的 interval 先例，注意 Web 端需 `web-disabled` 同款限制）。

### 8.3 反馈闭环（旧飞轮缺的最后一环）

```
知识被消费（assemble 命中 / tool 调用）
   → 写 knowledge_usage_log（surface + query + rank_score）
   → 运行终态（succeeded/failed/用户采纳）
   → 回填 outcome
   → 聚合 → 条目级 use_count / success_count
   → 驱动：软衰减 / 晋升 / 废弃 / **召回质量诊断**
```

**为什么 `query` 字段必须记录**：旧飞轮停用时最大的痛点是"说不清价值"。记录 query + 命中 + 结果，才能回答"是哪类查询召回了垃圾"。这是可诊断性的前提。

### 8.4 评测体系（**M0 硬门槛，先于一切实现**）

> 直接吸取 §2.2-A2 教训：厂商自报数字不可信，必须自建评测。kb-brain 设计文档也已把"M0 评估先行"设为硬门槛。

| 项 | 设计 |
|----|------|
| **评测集** | 2-3 个真实场景集，每集 30-50 问，含**事实型**（查得到）与**综合型**（要综合多条） |
| **基线** | ① 无知识层（现状）② 全上下文塞入（**关键对照**——行业教训是它常常就能打平专用记忆系统） |
| **指标** | recall@5、precision、**7 天后延迟检索命中率**（学习科学证据：不用会话流畅度衡量）、采用成功率 |
| **A/B** | 装配知识 vs 不装配，产出质量人工盲评 |
| **红线** | **无基线不进实现阶段**（沿用 kb-brain M0 条款） |

### 8.5 消化率仪表（对抗"收藏家谬误"）

把「存了 N 篇 / M 向量」升级为：论断数 / 被引用论断占比 / 卡片数与批准率 / 待审积压量 / 各来源贡献占比 / **各条目的采用成功率分布** / 悬而未决问题数。

**北极星指标：7 天后延迟检索命中率**。

---

## 9. 与既有模块的边界（防大杂烩）

| 模块 | 边界裁决 |
|------|---------|
| **kb-brain（知识大脑）** | **不是竞品，是机制范本。** 本次**不改它的消化/冶炼/检索实现**（那是它做对的部分），只：① 把它的产出登记进统一内核；② **照抄它的八个机制**（§3.3）去做运行域；③ 把它的提议箱接进统一收件箱。**kb-brain 的四类知识单元、状态机、面板全部保留** |
| **长文图谱 `lw_*`** | 存储互不收编；共享"时序边 + 关旧开新"模式；各自注册 structured-provider（`graph-knowledge-provider.ts` 已在） |
| **领域学习 `dl_*`** | 大脑=提炼与供给层，dl=学习项目管理层；以 atom 锚点互通，**不合并**（kb-brain §9 原裁决） |
| **技能 `SkillService`** | 作为**程序性记忆的载体**；技能卡产出直接导出为 SKILL.md 格式（天然符合 R1 渐进披露），不新造技能格式 |
| **旧飞轮 `memory-flywheel.ts`** | **不复用代码**，仅借鉴其分层与反馈计数思路；表数据保留待迁或清空（实施阶段决策） |
| **HostKit 装配** | 不改脊柱；新知识层注册为 structured-provider（通道A），旧飞轮通道B 保持 null |
| **Agent 任务树/质量门** | 作为**运行域知识源的输入**与**反馈闭环终态信号**，不反向依赖 |
| **提议-审批基建** | 复用 `ApprovalCoordinator` 与待办中心；新提案表接入同一收件箱 |

---

## 10. 分期实施计划

> 每期沿用既有作业模式：**接口先行 → 单测（TDD）→ subagent 对抗 review → 修复 → 文档登记**。

| 阶段 | 内容 | 验收标准 |
|------|------|---------|
| **M0 评估先行（硬门槛）** | 建 2-3 个评测集（每集 30-50 问）；跑 with/without + **全上下文基线**；消化率仪表最小版；**旧协议清点**（`agent_memories` 死表去留、`agent_memory_entries` 存量数据处置） | **基线报告入库；无基线不进 M1** |
| **M1 运行域台账与内核登记** | **照搬 `kb_digest_passes` 模式**建运行域台账（幂等键 `(run_id, pass_key)`，含 `MAX_ATTEMPTS` 重试与人工复活）；`scope_key` 登记层；统一提案表 + 使用日志表；`knowledge_search` / `knowledge_get` 工具 | 单测全绿；**重跑幂等**（同 run 重提炼不重复入库）；跨 scope 检索隔离强制测试（§11.5-1/8） |
| **M2 运行域消化链路** | 运行域适配器（轨迹/工具调用/任务终态）；**照搬"先落新再关旧"写入顺序 + 分域裁决 + 冷却记账 + 成本熔断 + fail-soft**；episode/lesson/skill 三类产出；**失败任务也蒸馏**；空闲期巡检（照搬 `automation.service.ts` 形态） | 一次任务运行的经验进提议箱；失败任务也产出教训；**跨域串扰回归测试**（§11.5-2，旧飞轮死因）；单点失败不阻断整批 |
| **M3 治理与消费面** | **统一收件箱**（把运行域提案接进 `/agent-todos`，与 kb-brain 提议箱并列；容错见 §11.5-10）；裁决管线补全（NOOP/merged/superseded/dormant）；装配面改造为"目录 + 工具提示"；`knowledge_feedback` / `knowledge_propose` 工具 | 提议箱可整批处理；装配预算超限告警；**召回质量可诊断（query 日志）**；某来源不可用不弹错 |
| **M4 来源扩展与体检** | 资产适配器 + 偏好直通 + 系统能力快照正式化；`knowledge_related` / `knowledge_timeline` 图工具；`skill_propose` + **`exportSkill` 自动落库到 `<dataPath>/skills/`**（补 §3.5 缺口）；**照搬 `health.service.ts` 体检建议**（运行域版） | 四类来源全部可产知识；系统能力变更后摘要自动刷新；**体检报告能给出"下一步点什么"的可执行建议** |
| **M5 代谢与闭环** | 软衰减 / 合并（照搬 `consolidate`）/ 垃圾清理（照搬 `cleanup` 宁漏勿杀）/ 晋升 / 指标重算；反馈回写闭环；消化率仪表完整版 | 衰减可逆性验证；**7 天延迟检索指标开始采集**；采用成功率驱动晋升 |
| **M6 评测与调优** | 按 M0 基线复测；A/B 盲评；按数据调阈值与预算；**照搬 `qa-sampler` 滚动抽检质量门** | 综合型 recall@5 相对基线提升 ≥5pt；**若跑不赢全上下文基线，如实登记并回归设计** |

---

## 11. 风险与开放问题

| 风险 | 缓解 |
|------|------|
| **重蹈"说不清价值"覆辙** | M0 评估先行是硬门槛；北极星指标是可采集的延迟检索命中率；query 日志保证可诊断 |
| **自动裁决误杀真事实**（A1，实测 70%） | 高风险一律降 `suspected` 人审；`batch_id` 支持整批回滚；supersede 不物理删 |
| **成本失控**（消化是批量 LLM 调用） | 分档模型（小模型原子化 + 中档裁决，kb-brain 已有 `KB_ATOMIZE_MODEL` 先例）；幂等增量；空闲期跑；brainConfig 式开关 |
| **提案箱再次堵死**（旧飞轮死因 5） | 三路分流（auto/queued/merged/discarded）；按来源与风险设不同阈值；灰度放开策略（人工批准 ≥100 条 + 污染率 <5% 才放开该类目自动） |
| **知识层变成大杂烩** | 适配器契约 + 存储不收编；内核只认四类实体，不认领域模型 |
| **多租户串扰** | `scope_key` 按构造隔离（含 userId）；强制单测（旧飞轮的 `'local'` 字面量兜底 bug 是前车之鉴——`docs/plan/2026-09-17-web-support-implementation-plan.md:343-347`） |
| **上下文预算膨胀** | 装配硬预算 + 超限告警（不静默截断）；目录与正文分离 |
| **期望管理** | 明确登记：记忆系统增益是个位数，不是救命稻草（§2.3） |
| **开放：** 旧飞轮表数据的处置 | `agent_memory_entries` 存量数据：迁移到新模型 / 保留只读 / 清空——实施前决策（**注意 `am:*` IPC、preload 通道、表与仓储全部完好且被 5 个单测覆盖，只是被开关短路**） |
| **开放：** `agent_memories` 死表的去留 | 仅建表、无 Entity/仓储、服务是抛异常的桩（`memory-service.ts:30-32`），**但其设计更完整**（`canonical_key` 唯一约束、`superseded_by` 版本链、`idempotency_key`）。建议：**取其设计并入新模型，然后删表**（第三范式：不留无消费者的表） |
| **开放：** `scope_key` 与 `knowledge_base_id` 的长期关系 | 兼容期后是否彻底移除旧列 |
| **开放：** 运行域知识的保留期 | 轨迹类知识体量大，是否需要 TTL |
| **开放：** 共享知识（跨 user） | 当前全租户隔离；组织级共享需另立可见性字段与审批链 |

---

## 11.5 已经踩过的坑（实施时必须遵守，均有代码/复盘出处）

> 这些是旧飞轮与相关模块**实际付出代价**换来的纪律，重做时逐条照做即可省下同样代价。

| # | 坑 | 出处 | 纪律 |
|---|----|------|------|
| 1 | **分区键不对称** | `memory-flywheel.ts:379-380` 注释 | `projectId` 无 `bizModule` 时归入 `default` 分区——否则**嵌入键与检索键不一致，写进去永远查不出来** |
| 2 | **L1 跨模块污染** | `memory-flywheel.ts:46-51`、`:299-300`；六扇门复盘 | 用户级知识跨所有业务共享，**必须设更高相关度门槛**（旧值 `L1_MIN_KEYWORD_HITS = 2`）。根治靠 §8.1 的分域裁决，不靠调阈值 |
| 3 | **相邻 bigram 重复计词** | `memory-flywheel.ts:113-127` | 「审计师」= 审计+计师两个相邻 bigram，**必须合并算 1 个命中词**，否则"共用一个 ≥3 字词就过门槛，门槛形同虚设" |
| 4 | **自己蒸馏自己不可靠** | `workflow-boot.ts:770-772` | 蒸馏器自产自审必须加**第二意见复核**（独立模型/独立 prompt） |
| 5 | **迁移顺序** | `electron/database/index.ts:869-871` | 依赖表必须先建——曾因顺序错误导致**全新库首次启动 boot 直接崩**（review P0-1）。新表注册须放在被依赖表之后，PC/Web 两端成对 |
| 6 | **`contentHash` + `embedModel` 双指纹** | `memory-flywheel.ts:334-337` | 内容与模型**都没变**才跳过重嵌入，缺一不可（换提供商后旧向量失配） |
| 7 | **前端别再轮询停用通道** | `progress/2026-09-16-*.md:85-86`；`agent-todos-flywheel-removed.spec.ts` | 页面加载即调 `am:list-pending` → 飞轮未装配 → **每次进页面弹一次错误**。若再引入开关，**前端必须先探测可用性再挂入口** |
| 8 | **租户兜底字面量** | `memory-flywheel.ts:259-261,326` 用 `'local'` 字面量；`docs/plan/2026-09-17-*.md:343-347` | 与 `LOCAL_DEFAULT_USER_ID` 不一致 → Web 端 ALS 缺失时记忆退化为 `mem:local:*`，**多用户互相污染**。统一走常量 |
| 9 | **迁移误放在错误段** | `electron/database/index.ts:869-871` 注释 | 曾有迁移误放在 lw 图谱段——新库首次启动时表不存在 |
| 10 | **待办中心自动轮询** | 同上 #7 | 待办聚合必须容错：某来源不可用 → 该 Tab 静默隐藏，不弹错 |

## 12. 明确不做的事

1. **不复活旧的 `memory-flywheel.ts`**——代码不复用，只借鉴思路。
2. **不引入新引擎/框架/图数据库**——复用 SQLite/PG + 现有向量存储 + 现有 workflow/agent 引擎（沿用 kb-brain §12 红线）。
3. **不做写入期静默自动失效**——高风险一律人审（A1 教训）。
4. **不做"全量正文进装配"**——只给目录 + 工具提示（R1/R2）。
5. **不做无评测的批量生成**——M0 是硬门槛。
6. **不做跨域统一裁决**——分域隔离是特性不是缺陷。
7. **不自动 published**——AI 产物一律 proposed 起步（沿用 kb-brain 治理原则）。
8. **不做物理删除**——衰减只在排序/呈现层。
9. **不追求 KG 完备性**——实体挂点服务检索，不承诺建完备知识图谱。
10. **不把技能卡自动写进技能库**——最高风险，永久人审。

---

## 附录 A：行业调研来源

| 主题 | 来源 |
|------|------|
| Anthropic Agent Skills 三级渐进披露 | [官方 spec](https://mintlify.wiki/anthropics/skills/spec/loading-system)、[Engineering blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) |
| Anthropic 上下文工程（compaction / note-taking / sub-agent） | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| AGENTS.md 开放标准（就近覆盖） | [agents.md](https://agents.md/) |
| Codex 指令链（遍历顺序 + 32KiB 上限） | [Codex AGENTS.md 文档](https://raw.githubusercontent.com/mehmetbaykar/codex-docs-skill/master/skills/codex-docs/references/agent-configuration__agents-md.md) |
| Cursor Rules（四档触发真值表） | [cursor.com/docs/rules](https://cursor.com/docs/rules.md?raw=1) |
| Cursor Memories 阵亡复盘 | [Archcore 复盘](https://archcore.ai/blog/cursor-memories-removed/) |
| Windsurf Memories/Rules/Workflows 分野 | [docs.windsurf.com](https://docs.windsurf.com/zh/windsurf/cascade/memories) |
| 项目记忆分层对照（CLAUDE.md / Copilot / Gemini） | [Project Memory & Rules](https://raw.githubusercontent.com/LucaNerlich/lucanerlich.com/refs/heads/main/docs/ai/project-memory-and-rules.md) |
| Mem0 四操作原始论文 | [arXiv 2504.19413](https://arxiv.org/abs/2504.19413) |
| Mem0 v3 放弃写入期冲突消解 | [迁移文档](https://docs.mem0.ai/migration/platform-v2-to-v3)、[工程说明](https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm) |
| Zep vs Mem0 基准论战 + 全上下文基线 | [Zep 复盘](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/) |
| Graphiti 自动失效静默误杀 70%（A1 核心证据） | [FINDING-silent-fact-loss](https://raw.githubusercontent.com/alexsh88/synapse/refs/heads/main/docs/FINDING-silent-fact-loss.md) |
| Letta/MemGPT 四层记忆 + sleep-time compute | [Letta memory](https://www.letta.com/blog/agent-memory)、[sleep-time compute](https://www.letta.com/blog/sleep-time-compute) |
| 记忆架构三系统对照 | [Agent Memory Architectures](https://raw.githubusercontent.com/MohamedAbdallah-14/prompt-to-asset/refs/heads/main/docs/research/30-agent-memory-state/30a-agent-memory-architectures.md) |

## 附录 B：站内既有调研资产（可直接引用，无需重查）

- `docs/research/2026-09-16-kb-brain/`：84 份一手资料，五路并行
  - `c-agent-memory-skill/_index.md`：15 个记忆/技能系统条目 + 横向收敛结论
  - `a-advanced-rag/`（17 篇）：SiReRAG / HippoRAG / CRAG / GraphRAG 成本证伪
  - `b-knowledge-extraction/`（16 篇）：原子事实三要件 / Graphiti 裁决协议 / ROME 路线被证伪
  - `d-learning-science/`（16 篇）：检索练习 / FSRS / 合意困难
  - `e-pkm-products/`（19 篇）：「标题即 API」/ Tana proposal 治理 / collector's fallacy
- `tasks/2026-08-28-agent-loop-harness/`：15（飞轮 v1 详设）/ 34（飞轮 v2 详设）/ 36（HostKit 契约与停用登记）
- `docs/design/2026-09-16-knowledge-brain-design.md`：知识大脑完整设计（本次基底）
- `docs/design/2026-09-16-knowledge-brain-feasibility.md`：代码级承接力核查