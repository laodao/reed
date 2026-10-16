# 知识库「知识大脑」改造方案

- 日期：2026-09-16
- 状态：待评审
- 版本：v2（同日增订：知识形态学四类单元、视角化重读与观感捕捉、模式卡（情节/设定提炼）、品味侧写、裁决分域——见 §5、§6、§7 的增订标记）
- 调研存档：`docs/research/2026-09-16-kb-brain/`（84 份一手资料：高级 RAG / 知识抽取 / agent 记忆与技能 / 学习科学 / PKM 方法论与产品，五路并行调研，每份含原文摘录）
- 关联方案：`2026-09-16-longwriting-structured-design.md`（时序事实库与 JSON 设计契约——本方案与其概念对齐、域不重叠）
- 可行性核查：`2026-09-16-knowledge-brain-feasibility.md`（代码级承接力核查：架构面全绿、4 处微调已回写本版、5 项 POC 并入 M0）
- 详细设计：`2026-09-16-knowledge-brain-detailed-design.md`（实施级：DDL/接口/prompt 规格/算法/任务切分；含与 v2 的 5 处差异清单，评审现场）

---

## 0. 结论摘要

把知识库从「图书管理员」（存、切、查）升级为「大脑」（消化、联结、思想、新陈代谢）。一句话方案：

> **入库文档在任务边界与空闲期被流水线消化为带溯源的原子论断（事实/观点/方法），原子经裁决（去重/矛盾/失效）织成语义网络，再向上提炼为三类卡片——模式卡（可复用的情节/设定骨架）、思想卡（方法论/洞见）、视角卡（读什么、看什么的注意力框架），全部 AI 提议、人批准；理解通过「带图式重读」不断演化（初读与重读产出不同层次的论断）；检索面升级为"原文+论断+卡片"统一池 + 图多跳 + 按视角取面；消费面从单一 RAG 扩展为三态：检索问答、创作装配、学习巩固；全部流水线复用现有 workflow/agent 引擎，零新引擎、零新向量存储。**

三条核心判断（调研收敛，证据见 §3）：

1. **「只增不减的记忆必然退化」是多来源独立收敛的铁律**（ExpeL 投票淘汰、Mem0 四操作、Zep 边失效、Memento 效用分）。当年知识飞轮只做 ADD 最终停用，病因在结构上早有预言——本轮原子层从第一天就带生命周期裁决，裁决与写入绑在同一批次。
2. **提炼时机永远避开交互关键路径**（Generative Agents 重要性账户、Letta sleep-time、Memento 任务边界写入）。消化挂在「文档处理完成事件 + 定时（空闲近似）」双触发，本地应用的挂机时段就是免费的蒸馏窗口。
3. **消费形态决定条目 schema，而不是反过来**（Anthropic Skills 的 description 即路由接口 = Matuschak 的「标题即 API」，两个时代独立收敛）。所以本方案接口先行的第一份契约就是论断/卡片的 schema（§6），提炼质量以「被检索命中、被创作引用」验收，评估集先于批量生成。

一条 v2 增订的核心设计哲学（讨论收敛）：

4. **论断层稳定且可比，解释层廉价可重建**。知识分两种命途：视角不变的论断（谁读都一样的事实）与视角依赖的观感（读者与文本交汇处的产物）。因为论断层稳定，建立其上的图式（卡片、聚类、摘要）可以被反复推倒重写——这就是「能够重新理解」的结构前提。若理解被固化在插入时刻的结构里（固定分类树），就没有重读这回事。

---

## 1. 背景与问题

用户诉求：单纯 RAG 用处越来越小，希望知识库真的作为大脑——不仅提供给大模型检索，还能**提炼知识、思想、方法论，为创造新知识提供辅助**。典型场景：上传大量同类型小说，期望知识库协助**创新**写作思路与故事发展方向，而不是照搬别人的套路；并把书中经典的**情节、设定**提炼为可复用的资产。

现状的问题（对照代码）：

| 问题 | 表现 |
|---|---|
| 知识只有一种形态：切片 | `kb_chunks` 是唯一知识单元，检索命中即原文段落；章节摘要（`kb_chapters.summary`）是唯一的"加工品"且只有 2-4 句 |
| 入库即终点 | 文档 `completed` 后再无增量加工；没有跨文档的实体/事实/主题层 |
| 无法回答"综合型"问题 | 「这三本书对 X 的说法有什么异同」「从这批资料里提炼一套方法论」「这个类型的常用配方是什么」——混合检索只能捞回散片 |
| 知识不会生长也不会代谢 | 没有引用计数、没有失效、没有冲突发现；同源 upsert 只会全量重建 |
| 没有重读这回事 | 一次性萃取，萃取完成后理解就凝固了；同一本书不会因读者图式的成长而被重新读出新的东西 |
| 没有读者的位置 | 不同人对同一本书的观感不同（有人看想象、有人看结构、有人看人物命运），现有结构里无处安放，更无处积累 |
| 收藏家谬误 | 仪表盘只统计"存了 N 篇/M 向量"，没有"消化了多少知识、被用了多少次" |

---

## 2. 现状盘点：可复用资产清单

| 资产 | 位置 | 在本方案中的角色 |
|---|---|---|
| 文档解析→章节树→混合切片→向量+BM25→混合检索+rerank+QA 直出 | `knowledge-base.service.ts`（1886 行全链路） | **L0 原文层原样保留**；检索面叠加统一池（§8.1） |
| `qa:` 向量 chunkId 命名空间模式 | 同上（QA_VECTOR_FETCH_PADDING / 前缀过滤） | 论断/卡片向量直接复用此模式：`atom:` / `note:` 前缀，零向量存储改动 |
| 章节级 contentHash | `kb_chapters.content_hash` | 消化流水线的**增量幂等锚点**——注意幂等键是「章节 × 遍次」，不阻止带新视角的重读（§7.1） |
| `kb:document-status` → 工作流域事件 | `publishDomainEvent(WORKFLOW_EVENT_NAMES.kbDocumentCompleted)` | P1 消化流水线的触发器（事件已存在，只差消费者） |
| workflow 引擎 + agent harness（工具循环/审批/看门狗/轨迹） | platform/workflow、agent-runtime | P1-P4 全部流水线的运行时（红线：复用，不新引入引擎） |
| `generateCompletionText(purpose, req, opts)` 直调 | `simple-llm.ts` | 成本分层。注意（可行性核查）：purpose 仅是日志标签，无集中档位表——廉价模型路由走 env 覆盖先例：`KB_ATOMIZE_MODEL`/`KB_ADJUDICATE_MODEL`（照 `AGENT_MEMORY_EMBEDDING` 模式，`workflow-boot.ts:466-473`），缺省回落宿主模型；失败 fail-soft 照章节摘要 failed 标记先例 |
| 时序知识图谱先例 | `lw_graph_edges`（valid_from/until + 关旧开新 + 矛盾扫描） | KB 域实体/关系表**照此模式另建**（存储不收编，见 §9 分工） |
| structured-provider 契约 | `agent-runtime/memory/structured-provider.ts` | 知识大脑注册为新 provider，agent 装配统一检索面（§8.3） |
| 领域学习包 dl_*（概念图/讲义卡/前置依赖/掌握度/复习调度） | packs/domain-learning | **学习流程的管理层**，消费大脑的论断与思想卡作为证据（§8.4） |
| 长文设定契约（0916 方案） | docs/design/2026-09-16-longwriting-structured-design.md | 大脑向创作域**只读供给**研究资料（含设定模式卡），不自动写设定表（§8.3） |

---

## 3. 调研结论（五路收敛，档案索引）

### 3.1 高级 RAG / Agentic RAG（`a-advanced-rag/`，17 篇）

- **SiReRAG**：相似树（RAPTOR 递归摘要）+ 关联树（实体分组摘要）**平铺进统一检索池**即获多跳收益——不必新建独立"图谱检索链路"，摘要向量化入池即可。
- **HippoRAG**：实体图 + Personalized PageRank 一步多跳扩散，查询侧零 LLM、本地毫秒级；但 **HippoRAG 2 证明结构化检索在简单事实型查询上反而落后普通向量 RAG**——现有混合检索必须保留为事实主路径。
- **CRAG**：检索后加质量分档（Correct/Incorrect/Ambiguous），Incorrect 走跨源兜底+改写——即插即用的纠错层。
- **GraphRAG 社区摘要成本被 LightRAG 量化证伪**（单次全局查询 61 万 token）——"预生成层级摘要"只可作离线增量层，不可全库常驻。
- **MemoRAG / Search-o1 / Deep Research 综述**：模糊任务先出草稿线索再检索、推理中自主触发检索、规划→分解→迭代探索→成报四阶段——本地深度研究的完整蓝图。

### 3.2 知识抽取与事实库（`b-knowledge-extraction/`，16 篇）

- **原子事实表示已收敛为"三要件自包含短句"**（Dense X：atomic/self-contained/concise；FActScore 反向同构）；2026 CNRS 工作证明「句子→命题→三元组」两段式抽取优于直抽，且 0.6B 蒸馏命题器可行——**本地小模型做原子化、LLM 只做合并判定**的成本架构三系统互相印证。
- **GraphRAG covariates 表是现成的事实库 schema**：claim 带 status(TRUE/FALSE/SUSPECTED) + 有效区间 + source_text + text_unit_id 溯源——直接抄。
- **Graphiti 的裁决协议可抄到 prompt 级**（源码已存档）：新事实与「现存事实+失效候选」连续编号对比，一次调用同时输出 duplicate/contradicted 两列表，矛盾即打 invalid_at 关旧开新；fact 反泛化规则（"NEVER generalize Gamecube to gaming console"）原样可用。
- **知识编辑（ROME/MEMIT）路线被证伪**，SERAC 式"知识放外部库"胜出——验证了"外置事实库+关旧开新"的架构选择。
- **生态位确认**：Khoj/QAnything 知识层仍停在解析+分块+检索；RAGFlow 2026-08 转向 Knowledge Compilation（一次编译出 Wiki/Graph/Tree/Skills 多产物）——「文档→原子事实库+溯源+矛盾发现+创作消费」尚无成熟开源实现。

### 3.3 agent 记忆与技能蒸馏（`c-agent-memory-skill/`，16 篇）

- **ADD-only 必然退化**（§0 判断 1 的证据群）；**条目生命周期裁决**（ExpeL 投票计数 + Mem0 ADD/UPDATE/DELETE/NOOP）是零基础设施成本的解。
- **提炼时机**：重要性分数累计超阈值才触发反思（Generative Agents，每天约 2-3 次）；任务完成才写入；空闲期蒸馏（Letta sleep-time，test-time 算力省 5x）。
- **两段式反思带证据指针**：先提 3 个高阶问题、再生成「because of 1,2,8,15」式带引用的方法论卡——引用指针防幻觉、可溯源。
- **CoALA 定位语言**：现状=只读 episodic+semantic（文档检索）；目标=可写 semantic（思想卡）+ 可写 procedural（技能资产，风险最高，须走审批）。
- **Zep-Mem0 论战元教训**：记忆系统必须自带硬评测（厂商自报数字不可信；全上下文基线就能打平 Mem0 最好成绩）——没有 with/without 度量就会重蹈"说不清价值"的飞轮覆辙。
- **期望管理**（Memento 消融）：记忆/经验系统的增益是个位数，工具与规划是数十分——大脑是放大器不是救命稻草，M0 评估先行因此更加必要。

### 3.4 学习科学（`d-learning-science/`，16 篇，标注证据等级）

- **检索练习是双重钉死的中等效应**（Adesope 2017 meta g≈0.51；Yang 2021 真实课堂 48,478 人 g=0.499）：吸收侧交互一律「先回忆后揭示」，答错也有独立价值（pretesting effect）。
- **合意困难警告直命中 AI 产品**（Bjork 1994）：AI 默认给顺滑答案=把用户推离长期保持；**长期吸收指标（7 天后延迟检索）必须替代会话流畅度成为北极星**。
- **FSRS**（Anki 官方，开源 rslib）：每卡独立 (D,S,R) 状态、目标保持率单参数——复习调度可直接嵌入；R(t,S) 可反向驱动"创作时优先唤醒将忘知识"。
- **遗忘有功能**（Richards & Frankland 2017）+ 睡眠巩固把细节换要义：淘汰作用于**调度与呈现层**而非存储层（可逆软衰减）；验证接受要义级匹配；掌握判定只认跨会话延迟检索证据。→ **睡眠巩固类比直接启发了代谢设计与"细节→要义"的重读深化**（§5.3）。
- **protégé effect**（Chase 2009）：「教会 AI」——AI 复述应用、用户纠错，错误归因于 AI 保护自尊，**纠错事件是比自评更强的掌握信号**。
- 专家-新手差异（Chi 1981）：按**深层结构（原理/方法论）**而非词面相似连边——AI 自动聚类出的图必须经"关系类型"二次判定，否则给用户的是新手式概念图。

### 3.5 PKM 方法论与产品（`e-pkm-products/`，19 篇）

- **「标题即接口」**：evergreen note 的论断式标题 = SKILL.md 的 description（第三人称、写清"做什么+何时用"、常驻检索接口、渐进披露三级）——论断卡/各类卡片 schema 的直接依据。
- **结构化库的输入端必须自动化**：Tana 已把手动 supertag 产品降级转 agentic；治理原则「**AI never changes anything without approval. Every change is a proposal**」是已验证答案。
- **无语义类型的链接撑不起综合**：Scite 把每条引用分为 supporting/contrasting/mentioning（3.17 亿条工业实现）；纯向量相似（Reor/Smart Connections）全部止步联想——语义边类型集：支持/反驳/细化/示例/同指。
- **AI 产物必须落成可积累可编辑的实体**（NotebookLM 的 note、Elicit 的 report、Heptabase 的卡），不是对话流；「综合即文体模板一键切换」是标准形态。
- **创作侧先例与空档**：Sudowrite Story Bible 证明"结构化设定=作者与 AI 共同的 source of truth + 按场景级联装配"有效，但其槽位靠人工填充、**不能从外部研究资料自动长出**——正是我们「入库→消化→装配」链条的机会位。
- **collector's fallacy 解药**：把「存了 N 篇」的虚假奖励改造成「消化了 N 个原子、被引用 M 次」的消化率仪表。

---

## 4. 目标架构：五层模型 + 四条流水线

```
┌────────────────────────────────────────────────────────────────────┐
│ L4 技能层  methodology/pattern → SKILL.md/prompt 资产（M4，走审批）  │
│ L3 卡片层  kb_notes：模式卡(情节/设定骨架) + 思想卡(方法论/洞见)      │
│            + 视角卡(注意力框架)——AI提议-人批准，版本化演化           │
│ L2 网络层  kb_entities + kb_knowledge_edges（语义边+事件链+PPR图）   │
│ L1 论断层  kb_atoms（自包含论断+status+溯源+视角挂点+遍次+双时间线） │
│ L0 原文层  documents/chapters/chunks（现有，不动）                    │
├────────────────────────────────────────────────────────────────────┤
│ 流水线（全部复用 workflow 引擎 + agent harness）：                     │
│  P1 消化    doc.completed/空闲 → 基础遍原子化+事件链 → 裁决 → 入池；   │
│            视角遍（带图式重读）；观感捕捉（划线/批注/对话）           │
│  P2 提炼    重要性账户/任务边界 → 主题聚类 → 思想卡/模式卡 → 提议队列；│
│            品味侧写（主视角浮现）                                    │
│  P3 研究    深度研究流：规划→分解→多跳探索→综合报告→回写论断/卡片      │
│  P4 代谢    周期整固：合并近重复/软衰减未引用/晋升高频引用/要义强化    │
├────────────────────────────────────────────────────────────────────┤
│ 消费面（三态）：                                                     │
│  检索问答：统一池(chunk+atom+note) + PPR 多跳 + CRAG 纠错             │
│  创作装配：structured-provider + 显式点名 + 按视角取面 +              │
│            模式卡注入骨架不注入血肉                                   │
│  学习巩固：FSRS 队列 + 先回忆后揭示 + 教会AI（protégé）               │
└────────────────────────────────────────────────────────────────────┘
```

与 CoALA 的对应：L0=episodic（原文经历），L1/L2/L3=semantic（可写），L4=procedural（可写、风险最高）。与 0916 长文方案的对应：`kb_atoms` 的双时间线与 `lw_graph_edges` 的 valid_from/until 概念同构（世界时间 vs 摄入时间），但**域不重叠、互不写**。

---

## 5. 知识形态学：四类知识单元与理解演化循环（v2 增订）

本节回答"知识以什么形态存在、如何随时间深化"。这是全方案的概念核心，数据模型（§6）与流水线（§7）都是它的落地。

### 5.1 四类知识单元

| 单元 | 回答的问题 | 形态 | 例子 |
|---|---|---|---|
| **论断**（atom） | 关于文本/类型的可检验命题 | 自包含短句 + 状态 + 溯源 | 「《X》的复仇对象逐级上升：家仆→家主→朝堂」 |
| **模式卡**（pattern note） | 可复用的情节/设定骨架 | 骨架 + 参数槽 + 变体登记 + 风险注记 | 「复仇三级跳」（§5.4） |
| **思想卡**（insight note） | 方法论与跨书洞见 | 论断式标题 + 何时用我 + 证据指针 | 「复仇文的爽点有递减效应（11/12 本遵守）」 |
| **视角卡**（lens note） | 读什么、看什么、问什么 | 注意力框架（看什么+问什么） | 「人物弧光视角：看动机链的渐进性，问每步转变是否有铺垫」 |

四类单元全部挂在同一个证据锚点层（L0）与关系网络（L2）上，走同一套 proposal 治理（AI 提议、人批准、版本化演化）。设计哲学：**论断层稳定且可比 → 解释层（卡片、聚类、摘要）廉价可重建**——这是"能够重新理解"的结构前提。

### 5.2 视角与观感：读者的位置

不同人对同一本书的观感不同（有人痴迷瑰丽想象、有人看到宏大世界观、有人被人物命运打动；也可能是情感、技法、价值观等**任意维度**）。观感的本体论结构：

> **观感 = 视角（我在看什么）× 证据选择（书里哪些地方向我显现）× 评价（在我看来它意味着什么）**

它不在书里，而在书与读者的交汇处（接受美学）；**但观感虽主观，却有证据**——每种观感都能指回具体段落。因此：

- **视角卡是任意维度的注意力框架**，不限于审美：情感视角（看情感曲线的压-放节拍）、叙事技法视角（看伏笔与回收）、结构视角（看世界观草蛇灰线）……视角 = 决定"向什么显现"的提问框架，与提取什么类型的知识正交。
- **观感论断 = 带视角挂点的论断**（lensNoteId + origin 标记人/AI），仍然有回链、可积累。
- **用户第一人称观感是全库最珍贵的资产**：划线、批注、以及对话中的引导采集（"你最被打动的是哪一段？为什么？"→ 追问落地为带证据的观感论断），**原话永远保留**。AI 的多视角阅读只是脚手架，你怎么读的才是皇冠。
- **裁决分域（防平均化，最易做错处）**：跨视角的差异是丰富性，永不互裁；同视角内的分歧才是冲突。若不区分视角，"想象丰盈"（审美视角）与"设定冗余"（结构视角）会被当成矛盾，反复裁决后磨平成"这本书各方面都不错"。融合只发生在呈现层，且必须带视角溯源。
- **品味侧写**：哪张视角卡的产物被频繁批准、哪类观感论断被写作反复引用——统计意义上用户的主视角自己长出来，反哺重读优先级与创作装配加权。库里形成的不只是书的画像，**还有读者的画像**。
- **诚实边界**：AI 没有体感——它无法"感到"瑰丽，只能把"感到瑰丽的人在看什么"编码为证据选择函数（从批评与人类读后感中学出注意力模式）。机器的职责是三件事：**落地**（观感挂到证据）、**共存**（多视角不被此消彼长）、**不侵蚀**（用户原话永远保留，AI 解读永远可区分）。

### 5.3 理解演化循环：初读与重读

人的理解不是一次成形的：初读记住事件，读多了长出类型观，带着新问题重读会读出全新的东西——**书没变，读者变了**。机器形态的对应循环：

```
证据（初读：局部、事实性论断）
  → 图式（读多了：思想卡/模式卡/聚类浮现）
    → 带图式重读（视角化重萃取：同一原文、新问题 → 新论断）
      → 图式被修订（新论断反哺：卡片 v2→v3，旧论断被细化/失效）
        → 更锋利的问题 → 再重读 ……（解释学循环的机器形态）
```

四个机制支撑这个循环：

1. **视角化重萃取（带图式重读）**：当新思想卡/新问题/新视角卡形成后，以它为透镜对同一批原文重新跑萃取——萃取 prompt 注入该视角的"看什么/问什么"。第一遍读出「主角在第三卷失去左臂」（事实），带着「代价机制」思想卡重读写出「每次爽点高峰后紧接身体代价，间隔逐次缩短」（第一遍不会产生——当时没有这个框架）。**幂等键是「章节 × 遍次」**：contentHash 防同遍重复，不阻止重读（重读=新遍次）。
2. **再巩固（使用即改写）**：论断每被检索命中/创作引用一次，计数与权重更新、相关边被重估；思想卡被改写而非追加（版本 +1）——evergreen 的含义：**理解是活文档，长法是演化不是堆积**。
3. **睡眠巩固类比（代谢）**：空闲期整固任务把细节换要义——细节型论断在调度层软衰减、结构型论断（方法/洞见/模式骨架）被强化、实体摘要被重写得更凝练。
4. **触发器设计（人的"自发反刍"没有直接对应物）**：合上书后的默认模式网络式联想无法复刻，只能靠机制逼近——任务边界、空闲窗口、新问题、冲突发现四类触发，把提炼的"节律"当作一等设计对象。

### 5.4 模式卡：经典情节与设定的提炼（模式 × 实例二元）

情节和设定不是"论断"（关于文本的观察），而是**模式本身的可复用形态**——用户要的不是「《X》有复仇情节」这个观察，是「复仇三级跳」这个东西：结构骨架、分几段、每段功能、可替换部件。叙事学的经典区分（普罗普的故事形态学 / TVTropes 桥段本体质同）：

**模式卡 = 抽象骨架 + 参数槽；实例 = 某本书的具体执行（参数取值 + 回链 + 变形说明）。一张模式卡，N 个实例。**

情节模式卡示例：

> **复仇三级跳**
> - 骨架：屈辱确立 → 第一次小胜（试探性）→ 代价显现 → 第二次升级 → 假性终局 → 真终局与代价清偿
> - 参数槽：复仇动机（血仇/屈辱/替代品）｜代价类型（身体/关系/道德）｜升级维度（对象层级/手段烈度/牵连面）
> - 变体登记：《A》把第二跳代价转嫁给配角（回链）；《B》假性终局让目标主动求死，反转道德重量（回链）；《C》压缩为两跳，中段乏力（反例证据）
> - 风险注记：三本踩过"第二跳无代价"的坑，与中段崩坏相关

设定模式卡示例（设定卡 = 设定实体规则集的跨书归纳）：

> **代价型金手指**
> - 规则集：能力来源（外授/意外/契约）× 代价结构（累积型/即付型/延迟型）× 限制条款 × 成长曲线
> - 已知耦合点：代价结构决定情感曲线形状（累积型→慢性压抑；即付型→节拍式痛感）
> - 崩坏点：延迟型代价在 3 本书中导致后期偿付潮、节奏崩坏（回链）

**经典的浮现式判定**：模式不需要人工钦定"经典"。网络自算：**复现实例数 × 被引用次数 × 用户收藏/标注**，三重确认浮现出"经典性"标在卡上。它会跟着库走——你的 200 本小说里真正高密度的套路可能与大众榜单不同，那才是**你的类型的真实语法**。

**反照搬的制度设计**：模式卡的抽象度刻意停在"骨架 + 参数 + 反例"层——太具体（桥段细节、台词级）就从研究资产变成抄袭素材。创作装配时注入骨架与参数空间、不注入任何原文段落：**照搬是抄血肉，创新是换骨架参数或嫁接两个骨架**。模式卡与视角是组合关系：情感视角读出的可以是情感骨架（期待-压抑-释放节拍）而非事件骨架——同一本书，情节模式卡与情感曲线模式卡并存。

---

## 6. 数据模型设计（接口先行——本节即评审现场）

新增 4 张表（SQL，随现有 kb_* 迁移体系走；多租户 `user_id` 列必带）。向量复用 `kb_vectors`，chunkId 命名空间扩展：`atom:` / `note:`（沿用 `qa:` 先例；文档检索侧的命名空间过滤从"跳过 qa:"泛化为命名空间注册表）。

### 6.1 原子论断 kb_atoms

```ts
/** 原子类型：这段话里"有什么可提炼的知识" */
export type KbAtomType = 'fact' | 'claim' | 'concept' | 'method' | 'insight' | 'open-question'

/** 命题状态（GraphRAG covariates 模型：不是布尔，是四态） */
export type KbAtomStatus = 'supported' | 'suspected' | 'contradicted' | 'superseded'

export interface KbAtom {
  id: string
  knowledgeBaseId: string
  userId: string | null
  /** 论断式自包含短句（Dense X 三要件：atomic / self-contained / concise；
   *  禁止代词悬挂、禁止"它认为"式回指——这是它能否被独立检索与引用的前提） */
  statement: string
  type: KbAtomType
  status: KbAtomStatus
  /** 0-1：来源权威性 × 抽取确定性 的合成置信度 */
  certainty: number
  /** 双时间线之"世界时间"：事实在所述世界内的有效区间（ISO 日期或小说章号等自由刻度；普通文档为空） */
  validFrom: string | null
  validUntil: string | null
  /** 溯源四件套（GraphRAG text_unit_ids 模式）：能回到原文位置是防幻觉的根 */
  sourceDocumentId: string
  sourceChunkId: string
  sourceQuote: string        // 原文引句 ≤200 字；origin='human' 时为用户原话，永不改写
  /** 实体挂点（可空；主体/客体二挂点是 PPR 图的边来源） */
  subjectEntityId: string | null
  objectEntityId: string | null
  /* ---- v2 增订：视角与遍次溯源（重读成为一等能力的前提）---- */
  /** 视角挂点：null = 视角不变论断（公共层，谁读都一样）；
   *  有值 = 该视角下的观感/观察（观感论断。裁决分域的键之一） */
  lensNoteId: string | null
  /** 萃取溯源：哪个遍次/由什么驱动读出（'base#1' | 'lens:<卡id>#2' | 'human:<渠道>'）
   *  ——区分"书说了什么"与"带着什么问题读出了什么"；幂等键 = 章节 contentHash × 遍次 */
  extractionPass: string
  /** 'ai'（流水线萃取）| 'human'（用户划线/批注/对话捕捉的观感，原话保留） */
  origin: 'ai' | 'human'
  /** 生命周期（裁决写、消费读；引用计数=使用信号，P4 代谢的输入） */
  useCount: number
  lastUsedAt: string | null
  supersededByAtomId: string | null   // superseded 时指向新原子（关旧开新，不物理删）
  createdAt: string
  updatedAt: string
}
```

设计取舍：

- **不存三元组只存论断短句 + 可选实体挂点**。三元组丢语气与限定（"据称/仅在 X 条件下"），论断短句保留；实体挂点只服务图检索，不承诺图谱完整性。两段式抽取（句子→命题→挂点）由 prompt 结构承担，表结构不锁死。
- **`open-question` 是一等公民**：资料中的悬而未决（"作者未说明 X 的动机"）是创作与深度研究的钩子，与 dl_concept 的"存疑"状态呼应。
- **不建 atom↔chunk 归属表**：从溯源字段派生（chunk→atoms→entities 即 PPR 所需的二部图），少一张表。
- **裁决分域（v2）**：裁决作用域 = `(lensNoteId ?? 公共层, 实体)`。**跨视角永不互裁**——不同视角对同一对象的相反评价是丰富性不是矛盾；同视角内分歧才走 contradicted/superseded。观感论断不参与公共层裁决。

### 6.2 实体 kb_entities

```ts
export interface KbEntity {
  id: string
  knowledgeBaseId: string
  userId: string | null
  name: string                  // 规范名
  aliases: string               // JSON 数组（消歧合并的产物）
  entityType: string            // 自由词表 + 独立分类步骤（含 'plot-motif' | 'setting-system' 等叙事构件类型）
  /** 演化摘要（Zep 模式：随新证据重写，非追加；P4 整固时凝练=睡眠巩固类比） */
  summary: string
  summaryStatus: 'pending' | 'done' | 'failed'   // 复用章节摘要的调度模式
  createdAt: string
  updatedAt: string
}
```

实体抽取负面清单（代词/抽象情感词/裸亲属称谓，"能否拥有自己的百科词条"判据）直接采用 Graphiti 已验证 prompt（存档 `b/zep-graphiti-temporal-kg.md`）。

### 6.3 语义边 kb_knowledge_edges

```ts
export type KbEdgeRelation =
  | 'supports' | 'refutes' | 'refines' | 'exemplifies'   // Scite + Zettelkasten 模型
  | 'same-as'                                            // 同指，消歧用
  | 'depends-on'                                         // 方法论/概念前置（对齐 dl_relation）
  | 'applies-to'                                         // 方法→场景
  | 'leads-to'          // v2：事件时序/因果边——情节链的骨架（A 导致/转折 B），模式归纳的原料
  | 'instance-of'       // v2：论断 ↔ 模式卡（该论断是某情节/设定模式的一个实例证据）

export interface KbKnowledgeEdge {
  id: string
  knowledgeBaseId: string
  userId: string | null
  sourceKind: 'atom' | 'note' | 'entity'
  sourceId: string
  targetKind: 'atom' | 'note' | 'entity'
  targetId: string
  relation: KbEdgeRelation
  /** 「为什么相关」一句话——Zettelkasten 铁律：无理由的链接不许存在 */
  evidence: string
  confidence: number
  origin: 'ai' | 'human'
  verified: number            // 0/1，人审后置 1（Tana proposal 模型）
  createdAt: string
}
```

### 6.4 卡片 kb_notes（思想卡 / 模式卡 / 视角卡统一实体）

```ts
export type KbNoteType =
  | 'methodology' | 'insight' | 'synthesis'    // 思想卡
  | 'plot-pattern' | 'setting-pattern'         // v2：模式卡（情节/设定骨架）
  | 'lens'                                     // v2：视角卡（注意力框架）
  | 'skill-seed'                               // M4：技能导出的前身

export interface KbNote {
  id: string
  knowledgeBaseId: string
  userId: string | null
  /** 论断式标题——"标题即 API"（Matuschak × SKILL.md 双重收敛）：
   *  写成可独立引用的完整论断，如「双时间线记账让时序矛盾可查」，不是「双时间线」；
   *  视角卡标题 = 视角名（如「人物弧光视角」） */
  title: string
  /** 「何时用我」——agent 路由接口（第三人称、≤200字、含触发场景与边界）；
   *  视角卡在此写"用我看书当你关心什么时" */
  description: string
  body: string                 // markdown 正文（人读层）
  type: KbNoteType
  /** proposal 治理：AI 产物一律先进 proposed，人批准才 published（Tana 模型） */
  status: 'proposed' | 'draft' | 'published' | 'archived'
  /** 证据锚点（防幻觉根）：两段式反思的 "because of 1,2,8" 指针落在这里 */
  evidence: string             // JSON: [{ atomId?, noteId?, quote?, documentId? }]
  origin: 'ai-distill' | 'human' | 'import'
  version: number              // 同题演进（evergreen：卡片被反复改写而非堆积）
  /* ---- v2：按类型的结构化载荷（JSON，仅对应类型使用）---- */
  /** 模式卡：骨架（阶段/规则序列）+ 参数槽定义 */
  patternSkeleton: string | null    // plot-pattern/setting-pattern 专用
  /** 模式卡：实例登记 [{ documentId, 参数取值, 变形说明, evidenceAtomIds[] }] */
  patternInstances: string | null
  /** 视角卡：注意力框架 { attendTo: string[], questions: string[] } */
  lensAttention: string | null      // lens 专用；重萃取与观感引导的 prompt 素材
  /* 经典性（v2：浮现式判定 = 实例数 × 被引用 × 收藏，P4 周期重算） */
  classicScore: number
  /* 学习模式（库开启 learning 才激活；FSRS 三参数） */
  fsrsStability: number | null
  fsrsDifficulty: number | null
  lastReviewAt: string | null
  reviewCount: number
  lapseCount: number
  /* 使用信号（创作引用计数——P4 晋升/衰减的输入，消化率仪表的数据源） */
  citedCount: number
  lastCitedAt: string | null
  createdAt: string
  updatedAt: string
}
```

### 6.5 知识库配置与文档状态扩展

```ts
/** knowledge_bases.brain_config JSON（缺省 null = 大脑关闭——成本闸门 + 评估先行） */
export interface KbBrainConfig {
  enabled: boolean
  /** 原子化：粒度与范围（如只处理某目录/某类文档） */
  digestion: { enabled: boolean; scopeDocumentIds?: string[] }
  /** v2：视角遍——启用哪些视角卡做重萃取；缺省空=只跑基础遍。
   *  多视角是乘法级成本，按库/按书启用；品味侧写会建议主视角 */
  lenses: { enabledLensNoteIds: string[]; readingCapture: boolean }
  /** v2：模式提炼——设定卡（低风险，规则归纳）与情节卡（高风险，事件链对齐）分开关 */
  patterns: { settingEnabled: boolean; plotEnabled: boolean }
  /** 自动裁决阈值：置信度高于阈值自动入库，低于则进提议队列 */
  autoApproveThreshold: number   // 缺省 0.8
  /** 跨文档提炼思想卡 */
  distillation: { enabled: boolean; importanceThreshold: number }
  /** 学习模式（FSRS 队列） */
  learning: { enabled: boolean; desiredRetention: number }  // 缺省 0.9
}

/** kb_documents 增列：消化进度（与现有 status/progress 并列，不混用） */
brainStatus: 'pending' | 'digesting' | 'digested' | 'failed' | 'skipped'
brainProgress: number
brainError: string | null
```

---

## 7. 流水线设计（P1-P4，全部复用现有引擎）

红线：不新引入工作流引擎/agent 框架。P1/P2/P4 = workflow 定义（域事件/定时触发），P3 = agent harness 会话（工具循环）。

### 7.1 P1 消化流水线（核心，M1）

```
触发：kb.document.completed 域事件（已存在）→ 检查 kb.brainConfig.digestion
  └ 未开启 → brainStatus=skipped；开启 → 入队（限流：并发≤2，尊重 provider 频控）

基础遍（视角不变，每章一个工作单元，幂等键=章节 contentHash × 遍次）：
  1. 原子化（低档模型，两段式）：
     句子 → 候选命题（atomic/self-contained/concise 三要件 + 反泛化规则）
          → 命题 + 挂点（subject/object 实体提及 + type + certainty + 世界时间）
     批量：按章分批；本地小模型可用则路由到本地（成本分层）
  2. 实体解析：提及 → kb_entities（规范名/别名/合并；"百科词条"判据 + 负面清单）
  3. 事件链（v2）：情节类论断（谁对谁做了什么、因果/转折）之间补 leads-to 边，
     把一本书的事件串成链——模式归纳（P2）的原料；错排率靠回链人工可核
  4. 裁决（高档模型，Graphiti dedupe 协议，分域=(视角,实体)）：
     新论断 ×（同域现存论断 + 已 superseded 候选）连续编号对比
     → duplicate（丢弃，旧论断 useCount+1）/ contradicted（旧论断 status=superseded
        + supersededBy 指新；或标记 suspected 待人审）/ 无关（新增）
     裁决与写入同一批次（飞轮教训：永不裸 ADD）
  5. 入池：statement 向量化 → kb_vectors(chunkId=`atom:<id>`)；
     实体 summary 生成（演化重写）→ `ent:<id>`
  6. fail-soft：单章失败标记可重试；论断层任何故障不影响现有检索主链路

视角遍（v2，可选：按 brainConfig.lenses 启用的视角卡）：
  同一批原文、以视角卡的 attendTo/questions 为透镜重萃取 → 观感论断
  （带 lensNoteId + extractionPass='lens:<卡id>#N'）
  触发：新视角卡启用 / 思想卡演进后定向重读 / 用户显式要求"从X视角重读"

观感捕捉通道（v2，human origin）：
  - 对话引导：与库对话中的采集动作（"最打动你的是哪段？为什么？"→ 追问落地
    为带证据的观感论断，原话保留在 sourceQuote）
  - 划线/批注：阅读器侧输入面（M3 起步先做对话捕捉，划线面后置）
  - human 论断不参与自动裁决，直接进库并计入品味侧写
```

成本预算：以 30 万字书为参考，基础遍 ≈ 每章 1-3 次低档调用 + 裁决每批 1 次高档调用；视角遍按启用视角数线性增加（乘法级，故按需启用）。档位实现见 §2 表注（env 覆盖，缺省回落宿主模型）。进度沿 `brainProgress` 上报，事件复用 `kb:document-progress` 通道（加 phase 字段）。

### 7.2 P2 提炼流水线（M2 起）

```
触发（双闸门，Generative Agents 模式）：
  a) 重要性账户：新论断的 type=method/insight/open-question 计分，累计超阈值
  b) 任务边界：用户主动"提炼这个库/这批文档"（对话指令或工作台按钮）
步骤：
  1. 主题聚类：论断按深层结构聚类（嵌入 + 关系类型二次判定——Chi 1981：
     按原理聚类而非词面，防新手式概念图）
  2. 两段式反思：先对每簇提 3 个高阶问题 → 生成卡片草稿
     （论断式标题 + 何时用我 + 正文 + because-of 证据指针）
  3. 模式归纳（v2，brainConfig.patterns）：
     - 设定卡（低风险）：设定实体的规则类论断 → 跨书参数空间归纳
       （能力来源×代价结构×限制条款×成长曲线；哪些取值组合被验证/崩过）
     - 情节卡（高风险）：事件链跨书结构对齐（同功能序列=同一模式变体）
       → 骨架抽象 + 参数槽 + 变体登记；实例经 instance-of 边挂到论断
     - 经典性计算：classicScore = 实例数 × 被引用 × 收藏（P4 周期重算）
  4. 入提议队列：status=proposed（不直接 published——Tana 治理原则）
  5. 人审：对话内审批卡（复用 harness 审批）或知识库工作台收件箱；
     批准=published；改写=新 version（evergreen 演进）；拒绝=archived 留档
  6. 品味侧写（v2）：视角卡产物的批准/引用统计 → 主视角浮现，
     反哺重读优先级与装配加权（用户的读者画像）
```

### 7.3 P3 深度研究流（M4，capstone）

```
输入：一个研究问题（"这三份资料对 X 的分歧在哪""给我一套 Y 的方法论"
      "给我一个没被写烂的方向"）
四阶段（Deep Research 综述 + Search-o1 循环体 + MemoRAG 入口）：
  规划 → 子问题分解（模糊问题先出草稿线索，MemoRAG 式）
  → 迭代探索（brain query 工具：统一池 + PPR 多跳 + 沿 refutes/supports
     深挖分歧点 + 按视角取面；可选外网扩展）→ 每步独立消化成笔记
  → 综合成报：extraction-table 视图（论断×文档对照，格内句级回链）
     + 类型配方统计（高频共现=惯例；低频组合=荒地；refutes 边=分歧）
     + 叙述报告；创新方向卡写明"与惯例的差异/风险/依据书目"
  → 产物回写：新论断 + 新卡片（proposed）+ 可能提议新视角卡
     ——大脑的增量学习闭环
运行时：agent harness 会话（长任务、看门狗、过程在工作台可见）
```

### 7.4 P4 代谢整固（M2 起步、M4 完整）

- 周期任务（定时触发；「空闲」用引擎 cron 近似，可行性核查：dl-pace 的进程级 setInterval 在 Web 端 web-disabled 是警示，代谢走引擎 cron 触发器如每日凌晨；应用层空闲检测后置为增强项）：合并近重复论断（嵌入+实体同挂点+同视角）、重算实体摘要（凝练=要义强化）、收敛孤儿边、重算 classicScore。
- 软衰减：**只作用于调度与呈现层**（检索 boost、复习队列、推荐位），不物理删（遗忘有功能，但存储可逆）。衰减因子以 useCount/citedCount/lastUsedAt 为输入；**细节型论断衰减快于结构型论断**（睡眠巩固类比：细节换要义）。
- 晋升：高频引用的思想卡/模式卡 → 推荐"固化为技能资产"（skill-seed → 导出 SKILL.md/prompt 模板，走审批，M4）。
- 触发器即"自发反刍"的逼近（§5.3 机制 4）：任务边界/定时窗口（cron 近似）/新问题/冲突发现。

---

## 8. 检索与消费面改造

### 8.1 统一检索池（M1）

`search()` 的向后兼容扩展：

```ts
interface SearchRequest {
  ...
  /** 大脑扩展：要哪些知识层进池（缺省 ['chunk'] = 现行为不动） */
  include?: Array<'chunk' | 'atom' | 'note'>
  /** 检索模式 hint：事实型（缺省，chunk 主导）| 综合型（atom/note 主导） */
  intent?: 'lookup' | 'synthesize'
  /** v2：视角过滤——"取面不取书"（学 A 的想象不学 A 的节奏） */
  lensNoteId?: string
}
```

- 论断/卡片的 statement/title+description 向量化进同一 `kb_vectors` 池（`atom:`/`note:` 前缀），BM25 倒排同步建（论断短句天然利于词法命中）。
- 命中论断在结果里携带 `sourceQuote` 与回链（点击跳原文位置）——检索结果从"段落"升级为"论断+出处"。
- 现有查询路由（`detectKeywordIntent`）自然延伸：综合型问题（"比较/方法论/异同"）自动加 `atom`/`note` 层。
- **CRAG 纠错层（M3）**：rerank 后对 top 结果做质量分档（一次低档调用），Incorrect → 降级 PPR 图路径 + query 改写重试一次；Ambiguous → 混合呈现。失败降级原序，永不阻断。

### 8.2 图多跳查询（M2）

- 图构成：kb_entities 节点 + 论断挂点边（subject/object）+ leads-to 事件链 + 实体↔chunk 溯源边（派生）。
- Personalized PageRank：查询实体提及为种子，一步扩散拿多跳邻域（纯图算法、零 LLM、本地毫秒级）。实现放平台层通用算法（真实消费者：KB 大脑 + 长文图谱 = 2 个，够抽象门槛）。
- 双时间线过滤：带 validFrom/until 的论断按"查询时点"过滤——长文/历史资料库可问"第 X 章时 Y 是什么状态"，与 `lw_graph_edges` 语义对齐。
- **事实型查询保持向量+BM25 主路径**（HippoRAG 2 警训），PPR 只作综合型与纠错兜底。

### 8.3 创作装配（M3）

- 注册 structured-provider（`id: 'kb-brain'`，scope 带 knowledgeBaseIds）：把命中论断/卡片序列化为 KnowledgeSegment 供给 agent 装配层——检索面统一、存储不收编，完全对齐长文图谱先例。
- 写作场景「显式点名装配」（Sudowrite 级联思想 + 可控性）：作者/agent 点名设定元素才注入，agent 可提议点名（联想）；**按视角取面**（lensNoteId 过滤）；**模式卡注入骨架+参数+反例，不注入原文段落**——"惯例是三跳、代价通常转嫁给配角、两跳会中段乏力；你想反着来？先例和成败原因在这"。同一知识子图一键输出多文体（设定文档/人物小传/主题论纲/讲义卡）。
- 红线：大脑对长文域**只读供给**，不自动写 lw_* 表（设定录入走 0916 方案的设计确认流）。看中一张设定模式卡想用进自己的书，走确认流转成项目内设定。
- **chat 链路的消费边界（可行性核查决策）**：system-agent 传 `scope: null` 进不了 HostKit 通道A——不为 chat 特设 scope 语义；chat 场景靠 `kb_brain_query` 工具（agent 主动调用，照 room-agent-tools 注册先例）+ 现有旧版 RAG 预检路径兜底；装配通道先行覆盖三大宿主（长文研讨室/领域学习/剧集制作）。

### 8.4 学习巩固（M3）

- 复习队列：FSRS 三参数已内嵌 kb_notes；首次复习不早于次日（睡眠巩固），间隔≈保持期 10-20%，跨主题交错出题。
- 交互铁律（检索练习证据群）：**先回忆后揭示**——AI 先问（自由回忆/自我解释），用户作答后才展示卡片原文与证据；答错也有价值，不作惩罚。
- 「教会 AI」模式（protégé effect）：AI 复述知识并尝试应用 → 用户纠错；纠错事件写掌握日志，作为比自评更强的信号。
- 掌握刻度对齐 SOLO/Bloom（能否建立关联/能否迁移），阈值 90%（Bloom 参数），未达标给替代呈现（换角度再讲）而非卡死。
- 分工：**轻量复习内嵌知识库（对话+工作台）；重学习流程走 dl 包**（概念图/讲义/前置门控是其主场），dl 的 evidenceSources 从 kbDocId 升级为 atom 锚点。

### 8.5 消化率仪表（M1 起最小版）

把「存了 N 篇/M 向量」升级为：论断数/文档、被引用论断占比、卡片数与批准率、**模式卡数与经典性分布**、悬而未决问题数、（学习库）复习队列健康度。北极星指标：**7 天后延迟检索命中率**（合意困难警告：不用会话流畅度衡量吸收）。

---

## 9. 与现有模块的边界（架构统一原则落点）

| 模块 | 关系 |
|---|---|
| 长文图谱（lw_graph_edges） | 存储互不收编；共享的只有「时序边 + 关旧开新」模式与平台层 PPR 算法；检索各自注册 structured-provider |
| 领域学习包（dl_*） | 大脑=提炼与供给层，dl=学习项目管理层；dl_card 与 kb_note 是不同生命周期的两种实体（讲义 vs evergreen 卡），不合并；以 atom 锚点互通 |
| skills 包（workflow skills） | M4 的技能导出对接其 manifest 体系；SKILL.md 格式作为导出格式之一（生态互通），不引入运行时依赖 |
| agent 记忆（agent_memory_entry） | 记忆域（episodic/经验）与知识域（semantic）分治；飞轮重启是独立议题，但**生命周期裁决模式两边共用**（同一教训） |
| QA 对（kb_qa_pairs） | 保持现状；QA=人工权威直出，论断=自动提炼，检索层各自命名空间 |
| 阅读器/对话（观感捕捉输入面） | v2 新增输入通道：对话引导先行（M2），划线/批注面后置（M3+）；只增不改现有消息/附件链路 |

---

## 10. 实施里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M0 评估先行** | 契约冻结（§6 interfaces + ajv schema，对齐 0916 方案的响亮失败路线）；建 2 个评测库（每库 30-50 问，含事实型/综合型），跑出 with-atoms/without 基线；消化率仪表最小版 | 基线报告入库 docs/progress；无基线不进 M1 批量 |
| **M1 论断层** | kb_atoms/kb_entities 两表 + P1 基础遍（含裁决）+ leads-to 事件链 + 统一检索池（include 扩展）+ brainConfig 开关 | 新评测集 recall@5 提升≥5pt（综合型）；单档模型下 30 万字书消化成本有账可查；fail-soft 验证（关大脑=完全回退现状） |
| **M2 网络与提炼** | 语义边 + 实体摘要演化 + PPR 查询路径 + 冲突面（superseded/suspected 列表）+ P2 思想卡提议/审批 + **裁决分域上线（lens 字段先行）+ 视角卡与视角遍基础版 + 对话式观感捕捉** | 矛盾注入测试：改写一段资料后重消化，旧论断正确 superseded 不复活；**跨视角相反评价不触发裁决（防平均化回归测试）**；审批队列 UX 走通 |
| **M3 消费面** | structured-provider 注册 + 创作装配（长文/剧集场景试点，含按视角取面）+ **模式卡：设定卡（规则归纳）先行，情节卡（事件链对齐）小范围试点** + CRAG 纠错 + 学习模式（FSRS 队列 + 先回忆后揭示 + 教会 AI） | 创作链路 A/B：装配大脑卡 vs 纯检索，产出一致性人工盲评；**模式卡变体登记抽查：实例回链准确率、骨架抽象人工可用率**；学习库 7 天延迟检索指标开始采集 |
| **M4 代谢与研究** | P4 整固/软衰减/晋升/经典性重算 + **品味侧写完整版 + 划线批注输入面** + P3 深度研究流 + 情节卡全量 + 技能导出（skill-seed → SKILL.md，走审批） | 深度研究产物回写闭环演示；衰减可逆性验证（恢复 boost 即恢复呈现）；创新方向卡人工评审"差异化+依据充分"双达标 |

每期节奏沿用既有作业模式：实现 → 单测 → subagent 对抗 review → 修复 → 文档登记。

---

## 11. 风险与开放问题

| 风险 | 缓解 |
|---|---|
| **LLM 成本失控**（消化是批量调用；多视角/多遍次是乘法级） | brainConfig 缺省关 + 分目录 scope + 视角按需启用（缺省只跑基础遍+主视角）；contentHash×遍次 幂等增量；模型分档；本地模型路由；成本台账进消化率仪表 |
| **抽取质量差→污染检索** | M0 评估集先行；autoApproveThreshold 高置信才自动入池，低置信进提议；fail-soft：论断层可整体禁用回退纯 RAG |
| **多租户契约失守**（历史教训：batchCreatePlots 租户 NULL） | 新表全带 user_id；流水线异步回调遵循 ALS 教训——同步捕获 userId 再 runWithUser 包裹 |
| **裁决误判**（把互补当矛盾） | suspected 而非直接 superseded 的中间态；人审队列；Graphiti 式"同关系不同细节=更新而非矛盾"判例进 prompt |
| **多视角平均化**（把多样性磨平成不咸不淡的综合意见） | 裁决分域（跨视角永不互裁）；融合只在呈现层且带视角溯源；回归测试进 M2 验收 |
| **模式卡过具体=抄袭素材** | 抽象度刻意停在骨架+参数+反例；装配只注入骨架不注入原文段落（§8.3） |
| **跨书事件链对齐**（全方案最高技术风险，比事实萃取难一个量级） | 分开关（settingEnabled 先行，plotEnabled 试点后全量）；粗粒度模式可用、细粒度会错的预期管理；实例带人工可核回链，错一位看得见 |
| **论断粒度漂移**（太碎=噪音，太粗=退化为切片） | 三要件 prompt 硬约束 + 评测集调优；类型分层（fact 细/method 粗） |
| **观感捕捉的引导性偏差**（追问诱导用户表达非本心观点） | 原话保留不可改写；AI 复述与用户原话严格区分；用户可作废自己的观感论断 |
| **与 dl 包功能感重叠引发用户困惑** | §9 分工写死：知识库内是"复习/消化"，进 dl 才是"学习项目"；UI 文案区分 |
| 开放：中文论断短句的 embedding 命中率（现有 embedding 对短句弱） | M0 评测集覆盖；必要时 statement 拼接实体上下文再嵌入 |
| 开放：空闲期检测（挂机蒸馏窗口的触发信号） | 先用工作流定时器 + 文档事件双触发；应用空闲检测（输入静默）后续迭代 |
| 开放：重读遍次的成本回收（视角遍何时值得跑） | 品味侧写给出主视角加权；重要性账户驱动定向重读而非全书重跑 |

---

## 12. 明确不做的事

1. **不新引入引擎/框架**：无新 workflow 引擎、无新 agent 框架、无图数据库——4 张 SQL 表 + 现有向量存储 + 现有引擎。
2. **不做全库社区摘要**（GraphRAG global 模式）：61 万 token/查询的成本结构不适合本地产品；层级摘要只做"实体/主题粒度 + 增量"。
3. **不动长文域与设定录入**：大脑对 lw_*/bible 只读供给；设定落库走既有设计确认流。
4. **不合并 dl_card 与 kb_note**：生命周期与消费场景不同（讲义/门控 vs evergreen/装配），强行统一会把两边都做浅。
5. **不做自动 published**：AI 提炼产物一律 proposed 起步；学习模式外不做自动复习打扰。
6. **不做物理删除代谢**：衰减只在调度/呈现层，superseded 留档可追溯。
7. **不追"知识图谱完备性"**：实体挂点服务检索，不承诺构建完备 KG（AutoSchemaKG 的 schema-free 路线本来就是反完备性的）。
8. **不做 TVTropes 式通用桥段百科穷举**（v2）：模式的数量由你的库自然长出，目标是你的类型的实用语法，不是通用桥段百科。
9. **不做跨视角裁决与观感合成**（v2）：观感永不合成"平均意见"；AI 观感与用户原话必须可区分，AI 不冒充用户观点。
10. **不把模式卡提炼到桥段细节/台词级**（v2）：停在骨架+参数+反例的抽象度——那是研究资产与抄袭素材的分界线。
