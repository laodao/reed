# 「领域共学空间」详细设计 v2（Domain Learning Space）

> ⚠️ **已被 design-v3.md 取代（2026-09-08）**：v3 整合本稿与 atlas-design.md 并修正"课程→知识点主序列(D8)"等演进；本稿仅作历史留档，开发请以 design-v3.md 为准。

日期：2026-09-07
分支：feat/workflow-engine
文档目录：tasks/2026-09-07-domain-learning-space/
取代：tasks/2026-09-07-domain-research-workflow/design.md（第一版"自动研究"方向，本文为演进后的完整设计；原研究链设计并入 §6 研究引擎）
子设计：**知识全景 Atlas（tasks/2026-09-07-domain-learning-space/atlas-design.md）**——领域类型学 + 知识体系化展示（独立 Tab 页、类型化节点、节点下钻、领域画像驱动视图）。
前置：工作流引擎/节点/skill 体系/知识库/采集链均已落地（细节见原 design.md §前置）；**前端 bytemd(markdown)+mermaid+公式渲染已具备**（MarkdownEditor/MarkdownEditorHeavy，package.json 含 @bytemd/plugin-mermaid / mermaid / katex / highlight.js），讲义渲染零新增依赖。

状态：**详细设计稿，待评审**（未开始编码；用户明确"先做详细设计，不着急动手"）

---

## 0. 产品定位（一句话）

**一个"领域共学空间"：系统对某个领域持续自主研究，但目标不是产出报告，而是"教到用户会"——把知识组织成用户能读懂的形式（图文/表格/思维导图/文章），用户阅读并追问，追问驱动新的研究，AI 先验知识经用户确认后沉淀，逐步长成一套有关系的、用户掌握度可追踪的知识体系。**

关键定性（区别于第一版"自动研究工作流"）：

1. **人机共学，不是无人研究**：研究是手段，教会用户是目的；用户全程在场（选方向/读讲义/追问/反馈懂没懂），不是"睡前让它跑，醒来看报告"。
2. **产出形态面向人**：讲义（图文+表格+思维导图+自测），不是给库用的原始条目。
3. **追问是研究方向的第二引擎**：学习计划驱动第一轮研究；用户追问答不上 → 自动升为新研究方向。
4. **AI 先验知识可反哺**：大模型已知且经用户确认/交叉验证的内容，平等入图（source=ai-verified）。

## 1. 需求全貌（用户原话要点归纳）

1. 学习一个领域：先综述建骨架 → 核心术语成队列 → 逐个搞懂并入库 → 关系挖掘扩边 → 理论/专著/论文收集 → 逐步形成**有关系的知识体系**；
2. 系统先循环研究（可无人值守推进），但**最终要教会用户**；
3. 内容要组织成用户能看懂的形态：图文、数据分析表格、思维导图、文章；
4. 用户阅读后追问；系统先从已有知识答，答不上就**开新学习方向**再研究；
5. AI 已具备的知识若回答正确，也**提炼回知识库/图谱**；
6. 整个过程用户参与、循环深入、状态持久（随时回来继续）。

## 2. 方法论依据（为什么这么设计学习环节）

| 方法 | 出处/证据 | 落到设计 |
|---|---|---|
| 骨架先行（先综述/分类学，再填肉） | 概念图学习法（Novak 实证研究）；auto-survey-agent research_rules.md"必选近3年综述对齐分类学" | 学习循环第 0 步 domain-map 产出领域地图，人工确认后才开始逐概念 |
| 术语是入口（核心词汇=进入领域钥匙） | 教育研究共识 | 地图产出核心术语清单 = 学习队列 |
| 理解要可验证（费曼：能否用自己的话讲清） | 费曼技巧/主动回忆（学习科学高频引用） | 每概念卡片带"费曼自检"；assessor 生成自测与复述判定 |
| 知识关系化（原子卡片+显式链接） | Zettelkasten（卢曼）；概念图 | 概念图（节点+关系边）是空间中央状态，M1 起即带 |
| 多视角提问优于关键词检索 | STORM（Stanford，评测：组织性+25%、覆盖+10%） | question-generator skill（M2 全面启用，M1 的 domain-map 已用其思路提问建骨架） |
| 资料分层（综述→专著→论文，可信度递增） | fraserlab 等入门指南 | source-collector 资料路由 skill |
| 自主闭环需可判定信号 | karpathy/autoresearch（val_bpb 启示） | 研究侧=evidence 可归因硬校验；教学侧=掌握度（用户反馈/自测）作为真信号 |

## 3. 已确认的产品决策（与前面对齐）

| # | 决策 | 内容 |
|---|------|------|
| D1 | 独立「领域学习空间」页面 | 领域=持久项目；三栏：左概念图 / 中讲义 / 右追问对话；随时回来继续 |
| D2 | 概念图归学习空间自带 | 节点/边/掌握度为该包领域实体（SQLite 表），不依赖通用图谱（系统无通用图谱） |
| D3 | M1 跑"研究→讲义→教学→追问→沉淀"完整纵线 | 采集半自动（KB 检索 + 用户提供少量 URL/网页），全自动采集 M2 |
| D4 | 工作方法 = skill 家族 | 研究侧 5 个 + 教学侧 4 个，SKILL.md 资产化，可复制自定义换领域 |
| D5 | 结构化产出路径 | 教学/研究侧 skill 均由学习服务直接调用（低延迟、可编排，平台 ai-call 已具备 JSON 解析，无需 skill-call jsonMode）；技能提示词渲染抽公共函数供节点与服务共用（小重构）；M2+ 可选把研究环节包成工作流 run |
| D6 | 先验知识入图需标记 | source=ai-verified + 用户确认或交叉验证；未验证先验只作初稿，不直接当真理 |
| D7 | 追问答不上 → 未解问题队列 → 新研究方向 | 队列是研究方向的第二驱动 |
| D8 | 学习单元=**知识点（概念）**，非"课" | 一概念一讲义（标题=概念名）；排程=依赖拓扑序+掌握度门控（前置未懂不放行后继）；"课"仅保留两种补充形态：①每领域一篇**导读**（地图总览伴读）②学完分支后的**总览复习讲义**（间隔复习用） |
| D9 | 顺序控制 | 依赖图自动排 + 没懂自动拆解（难概念拆成子概念入队重学）；左栏可手动点任意概念跳学/插队，系统只建议不强制 |

## 4. 交互形态与页面（D1 细化）

### 4.1 领域学习空间页（renderer 新增，包级路由）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 领域学习空间 · 量子计算入门（目标：看懂量子霸权论文）      [继续学习→]│
├──────────────┬───────────────────────────────────────┬──────────────┤
│ 知识地图      │ 当前讲义：第 3 课 · 量子比特           │ 追问 · 答疑   │
│ (概念图)      │                                       │              │
│              │ # 量子比特（qubit）                    │ 我：什么是叠  │
│  量子比特 ●已懂 │ 定义：…与经典比特的差别表格            │    加？        │
│  叠加   ◐学习中│ ```mermaid graph … 叠加/测量关系图```  │ 系统：叠加=…  │
│  纠缠   ○待学  │ 直观类比：旋转硬币                    │   （出处：讲义│
│  测量公设 ○    │ 为什么重要：…                         │    第3课 + KB  │
│  退相干 ○      │ ---                                   │    文档x）    │
│              │ **自测** 1. … 2. …  [提交]             │ 我：那测量坍缩 │
│ (掌握度着色)   │ [懂了✓] [没懂，再讲一遍]              │    必然吗？    │
│              │                                       │ 系统：现有资料 │
│ 研究进度       │ （讲义全文 markdown 渲染，bytemd 能力）│    不足，已登记 │
│ ▓▓▓▓░░ 后台在  │                                       │    →开新研究： │
│   研究退相干    │                                       │   "测量问题"  │
└──────────────┴───────────────────────────────────────┴──────────────┘
```

### 4.2 交互时序（用户视角）

1. 新建领域空间：填 领域名 + 学习目标（入门/工作应用/前沿）→ 系统跑 domain-map 出骨架 → **用户确认领域地图**（术语清单/分支可增删）；
2. 系统按计划生成第 1 课讲义 → 通知（复用通知中心）→ 用户阅读；
3. 用户点 [懂了✓] → 概念掌握度=已理解 → 系统规划第 2 课；点 [没懂] → 换角度重讲（可拆更小概念入队）；
4. 用户在右栏随时追问 → tutor 检索知识库/概念图/讲义回答（带出处）；检索不到但有把握的先验 → 给出并问"是否存入知识库"；
5. 检索和先验都答不上 → 登记未解问题 → 用户可选"开启研究"→ 进研究队列（后台/手动触发）；
6. 离开/回来：空间状态持久，通知"第 N 课已备好"或"新研究完成"。

## 5. 数据模型（SQLite；学习空间自带，D2）

表前缀 `dl_`（domain-learning），实体放 `core/database/entities/domain-learning/`，仓储对应。

### 5.1 项目

**dl_project**：学习空间本体
`id, name(领域名), goal(枚举: 入门/工作应用/前沿), status(active/paused/archived),
 description, kb_id(可选，绑定项目知识库), default_model(json: providerConfigId/modelId), created_at, updated_at`

### 5.2 概念图（D2 核心）

**dl_concept**：概念节点
`id, project_id, name(术语), kind(概念/理论/方法/人物/组织/事件/数据源),
 definition_short(一句话定义, 地图悬停用),
 research_state(枚举: 未研究/研究中/已提炼/待验证/存疑),
 mastery(枚举: 未接触/学习中/已理解/需复习),
 source(资料/ai_verified/人工), card_id(概念卡片外键, 可空),
 note, created_at, updated_at`
索引：`(project_id)`，唯一 `(project_id, name)`。

**dl_relation**：关系边（带类型+证据+验证态）
`id, project_id, source_id, target_id,
 relation_type(枚举: 前置依赖/特例/包含/对比/因果/支撑/引用/相关),
 evidence(text, 可空=来源说明), verified(int 0/1), created_at`
索引：`(project_id, source_id)`, `(project_id, target_id)`, 唯一 `(project_id, source_id, target_id, relation_type)`。
图遍历/下一课排序用 `(project_id)` 全量小表内存即可（个人规模几百~几千节点，SQLite 无压力）。

**dl_mastery_log**：掌握度变更审计（教学信号溯源）
`id, project_id, concept_id, from_mastery, to_mastery, trigger(lesson_ack/self_test/qna/expire/manual), at`

### 5.3 教学内容

**dl_card**：概念卡片（教学原子；与 concept 1:1，独立表便于长文与版本）
`id, project_id, concept_id, content_md(定义/原理/类比/为什么重要/反例/费曼自检), evidence_sources(json: [{kind, title, url|kbDocId, quote}]), version, created_at, updated_at`

**dl_lesson**：讲义（面向用户的组织单元）
`id, project_id, seq, title, concept_ids(json), content_md(图文全文, 含 mermaid/表格), status(draft/published/archived), feedback(懂了/没懂计数), created_at, published_at`

**dl_question**：追问与未解问题（研究方向第二引擎）
`id, project_id, lesson_id(可空), concept_id(可空), question, answer_md(可空),
 answer_source(枚举: kb/讲义/概念图/ai_verified/新研究/未答),
 status(枚举: open/answered/escalated→研究中/resolved), created_at, answered_at`
索引：`(project_id, status)` —— 未解问题队列即 `status=open`。

### 5.4 资料
原文/网页/论文全文 → 项目知识库（复用 kb 包，kb-ingest sourceKey 幂等）；dl_card.evidence_sources 只存"引用摘要"，不重复存全文。

## 6. 学习循环状态机（系统行为设计）

### 6.1 驱动与主循环

状态：概念图（每节点 research_state × mastery）+ 队列（学习队列=按计划待学概念；未解问题队列）。

```
用户：建空间(领域+目标) → domain-map(研究引擎跑, 综述/知识库/多视角提问)
  → 领域地图草案(概念+分支+术语队列) →【人审】确认/增删 → 落 dl_concept(未研究/未接触)
  │
  ▼
lesson-planner：取"下一课概念集"(规则：前置依赖已理解 ∧ mastery∈{未接触,需复习} ∧ 按地图顺序, 一课≤3个)
  │
  ▼
【研究引擎】(对每个概念, 半自动 M1 / 全自动 M2)：
  已有 dl_card → 跳过
  知识库检索命中 → 提炼为卡片(source=资料)
  未命中 + 用户/系统提供 URL/网页(M1) → web-extract → 提炼(source=资料)
  以上皆无 + 模型先验有把握 → 生成初稿卡片(source=待验证→ai-verified 需人确认)
  硬校验: 卡片必含 evidence 来源, 否则不落库(记日志)
  │
  ▼
lesson-writer：把概念集+卡片+已有讲义 → 讲义全文(图文/mermaid/表格/类比/自测2~3题)
  → dl_lesson(published) → 通知用户
  │
  ▼
【教学】(用户同步): 阅读 → 追问(tutor) → 自测(assessor) → 反馈
  ├ [懂了✓] → mastery=已理解(mastery_log) → 回 lesson-planner 下一课
  ├ [没懂] → 换角度重讲(tutor/lesson-writer 变体)；2次仍不懂 → 拆分子概念入队
  └ 追问 → tutor:
       ├ 命中 KB/概念图/讲义 → 答(带出处)
       ├ 命中先验且较可靠 → 答 + 询问"存入知识库?" → 用户确认 → explainer 提炼入图(ai-verified)
       └ 都答不上 → 问题入未解队列 → 用户触发 → 新研究(子领域/新概念) → 回 domain-map/研究引擎
  │
  ▼
收敛：队列空 or 用户暂停 → 阶段总结(mastery 统计 + 地图快照 + 薄弱区清单) → 空间保存, 随时继续
```

### 6.2 人机分工（哪些自动、哪些人在环）

| 环节 | 自动程度 | 人在环点 |
|---|---|---|
| domain-map 建骨架 | 自动跑 | **必须审**：地图是方向，错则全错 |
| 逐概念研究 | M1 半自动（KB+手动 URL）；M2 全自动 | 采集来源与结果可抽查（研究详情可看） |
| 卡片落库硬校验 | 自动 | 无 |
| 讲义生成 | 自动 | 阅读时反馈懂没懂 |
| 掌握度推进 | 用户驱动 | 懂了/自测通过才算数（系统不自封） |
| 答疑 | 自动 | 先验入库需用户确认 |
| 新研究方向 | 自动建议，用户触发 | 是否开新研究由用户决定 |

## 7. skill 家族设计（D4：工作方法层）

全部为 SKILL.md 资产（内置只读，复制为自定义换领域）。研究侧可被 skill-call（工作流/服务）调用；教学侧低延迟由学习服务直调（同一渲染逻辑）。

### 研究侧

**1. learning-domain-map**（建骨架）
- 输入：`topic, goal, kbHits(可空: 知识库/已有资料摘要), model`
- M1 综述来源（半自动）：优先用户提供 1~2 个综述性 URL（或 KB 内已有综述文档）→ web-extract 取全文；两者皆无 → 退化为"模型先验生成草稿地图"，但每条分支/概念标 confidence，草稿地图标注"待验证"，随后续学习逐步校正（人审环节用户可删改）。
- 正文：角色=领域图谱师；方法=先定位 1~2 篇综述式资料（KB/网页）→ 提取分类树 → **多视角提问**（STORM：该领域的子方向各问什么）补全边界 → 产出核心术语清单（区分 必学/可选/前沿）；
- 输出契约：JSON——`{ branches:[{name,desc}], concepts:[{name,kind,why_important}], openQuestions:[…] }`。

**2. learning-concept-explainer**（概念卡片，含费曼）
- 输入：`concept, material(资料全文/摘录, 可空), kbHits(可空), priorAllowed(yes/no)`
- 正文：角色=会教人的领域专家；六段卡片（定义→直觉类比→为什么重要→原理/机制→反例或边界→费曼自检"给新手讲清"）；
- 纪律：**每条论断标注来源**（材料原文摘录 / 模型先验）；先验部分自评 confidence 并建议是否需外部验证；不编造引用；
- 输出契约：JSON——`{ card:{definition,analogy,importance,mechanism,counterexample,feynman_explain}, evidence_sources:[{kind,title,url|kbDocId,quote}], priors_used:[…], needs_verification:[…] }`。

**3. learning-relation-miner**（关系挖掘）
- 输入：`conceptCards(本课卡片json), graphContext(已有图节点/边摘要)`
- 输出契约：JSON——`{ relations:[{source,target,type,evidence}], suggestions:[“A 可能是 B 的特例，待查证”] }`（M1 由 explainer 轻量附带，独立 skill M2 启用）。

**4. learning-question-generator**（多视角提问，STORM 式）
- 输入：`topic, currentGraph`
- 输出：`{ questions:[{perspective,question,why}] }` → 驱动下一轮检索。M2 全面接入。

**5. learning-source-collector**（资料路由）
- 输入：`need(概念/问题), kbResults, allowedSources(用户偏好)`
- 输出：`{ plan:[{action: 检索KB|抓网页|搜arxiv|读论文, target, reason}], risk }`。M2 接入自动执行。

### 教学侧（M1 必须）

**6. learning-lesson-planner**（选下一课）
- 输入：`graphSummary(全部概念 mastery/research_state + 依赖边)`
- 规则正文：依赖优先（前置未懂不教后继）、复习穿插、每课 ≤3 概念、目标驱动（入门先主干后分支）；
- 输出：`{ lessonConcepts:[conceptId...], rationale, nextOpenQuestions 引用 }`。

**7. learning-lesson-writer**（讲义生成——面向用户的核心产出）
- 输入：`concepts(卡片们), lessonMeta, 已有讲义大纲(衔接), model`
- 正文：角色=教材作者；要求：**图文并用**（关系画 mermaid 图：flowchart/思维导图；对比用表格；公式用 katex）、类比先行、每节结尾 2~3 道自测（含答案与讲解）、长度匹配目标（入门浅、前沿可深）、语言平实；
- 输出契约：markdown 讲义全文（约定头部 frontmatter：标题/涉及概念/自测清单，供页面解析）。

**8. learning-tutor**（答疑）
- 输入：`question, context(当前讲义/概念), kbHits(实时检索), graphFacts(相关节点/边)`
- 正文：角色=耐心的私教；回答纪律：**先给直接答案再给理由**；引用来源（讲义节/KB 文档/图内事实）；分不清时说"这个我不确定，建议开新研究"；不编造；
- 输出：markdown 答案 + `{ answer_source, needs_research(bool), suggested_research(可空) }`（结构化字段由服务解析，答案文本直接进对话）。

**9. learning-assessor**（自测判定 + 费曼复述）
- 输入：`lessonContent, userAnswer(自由文本 或 选择题答案)`
- 输出：`{ correct(bool), score, feedback, still_confused(可空: 建议拆解的概念) }`。

## 8. 后端架构（包级接入，遵守平台纪律）

### 8.1 包结构

```
src/core/packs/domain-learning/
  manifest.ts            // 声明 ipcChannelPrefixes: dl:; dependencies: [workflow, knowledge-base, skills]
  index.ts               // activate(): 注册 handler + 启动调度(研究推进) 
  services/
    learning-project.service.ts   // 项目 CRUD + 空间状态
    learning-graph.service.ts     // 概念/边 CRUD + mastery 推进 + 拓扑/下一课数据
    learning-loop.service.ts      // 学习循环编排(计划→研究→写讲义→通知)
    learning-tutor.service.ts     // 答疑(检索→先验→未解登记)
    learning-research.service.ts  // 研究引擎(半自动 M1): KB 检索/网页抓取/提炼/硬校验 → 卡片
  handlers/…             // dl:xxx IPC（薄壳）
  repositories/ 或复用 core/database/repositories/domain-learning/
实体: core/database/entities/domain-learning/{dl-project,dl-concept,dl-relation,dl-mastery-log,dl-card,dl-lesson,dl-question}.entity.ts

src/renderer/src/packs/domain-learning/
  index.ts               // 路由贡献(菜单"学习空间")
  views/DomainLearningSpace.vue   // 三栏主页面(左图/中讲义/右对话)
  components/…           // ConceptGraph.vue(掌握度着色), LessonViewer.vue(bytemd), QnAPane.vue
```

### 8.2 skill 调用两条路径（D5）

- **教学/研究侧均走服务内直接调用**（tutor/lesson-writer/assessor/planner/explainer/domain-map，低延迟、能进学习循环编排）：
  - 平台层 `ai-call.ts` 已提供 `callAI`（非流式）+ `extractJsonFromResponse` 等解析工具，episode-production 的 script-generator/story-text-generator 等即服务层调 AI 解析 JSON 的现成先例——服务侧结构化能力已具备，**无需给 skill-call 加 jsonMode**（原 design.md §4.3 方案 A 不再需要，从 M1/M2 均移除）。
  - 为保持"方法=SKILL.md 资产"（用户可复制为自定义、可编辑）而非把提示词硬编码进服务：把"渲染技能提示词"逻辑从 skill-call 节点抽为**公共函数**（如 skill.service.renderForCall(skill, params)，含 references 拼装），节点与学习服务共用同一实现——这是**引擎/节点面唯一小重构**，有单测，skill-call 节点行为不变。
- **可选工作流化**（M2+）：如某研究环节需要人工介入/重试/可视化编排，可包成工作流 run（skill-call 节点已支持 {{变量}} 动态选技能），与学习服务共用同一技能资产与输出契约。

### 8.3 通知与持久
- 讲义就绪/研究完成 → 复用 platform_events + 通知中心（参考审批通知链路），点击直达该空间/讲义。
- 全部状态落 SQLite（项目随应用重启恢复），无常驻进程负担：研究推进由用户触发或后台低优先任务（M2 起可 cron）。

## 9. 改动面清单（评审用，M1 范围）

### 代码（新增为主）
1. **实体/迁移**：7 张 dl_* 表 + migration（参照既有 create-*.ts 幂等风格）。
2. **领域学习包（后端）**：manifest + project/graph/loop/tutor/research 五服务 + IPC handlers（前缀 `dl:`，注册走包 activate，遵守 CLAUDE.md 包接入纪律）。
3. **渲染公共化小重构**：skill 提示词渲染抽公共函数，skill-call 节点改调之（行为不变，补单测）。
4. **前端包**：路由/菜单贡献 + DomainLearningSpace.vue（三栏）+ ConceptGraph（掌握度着色，mermaid/自绘均可）+ LessonViewer（bytemd）+ QnAPane。
5. **内置 skill 资产（builtin-skills.ts 增量）**：M1 六个（domain-map / concept-explainer / lesson-planner / lesson-writer / tutor / assessor）；relation-miner / question-generator / source-collector 留 M2。
6. ~~**skill-call jsonMode**~~：不再需要（服务侧直接调 AI + extractJsonFromResponse，见 §8.2），M1/M2 均不涉及此项。

### 测试（TDD，先写红）
- 实体/仓储：dl_* CRUD + 唯一约束（concept 同名、relation 三方唯一）。
- graph 服务：mastery 推进规则、依赖未满足不入队、拓扑排序（下一课选择）。
- tutor 服务：命中 kb / 命中先验 / 都答不上三路分支（先验路断言"询问确认"，未答路断言入未解队列）。
- research 服务：卡片硬校验（无 evidence 不落库）、先验初稿标记待验证。
- 渲染公共化：skill-call 节点输出与重构前一致（回归）。
- 内置技能计数相关 spec 同步。

### 真机验收（M1 纵线，D3）
选一个真实小领域：建空间 → domain-map 出地图（人审）→ 跑通 ≥3 个概念"研究→讲义→教学→追问→沉淀"：
- 用户在右栏追问 ≥1 次且有据回答；制造一次"答不上"→ 入未解队列；
- 一次先验回答经确认后入图（source=ai-verified）；
- dl_lesson 讲义在页面正确渲染（含 mermaid/表格）；
- 掌握度推进：懂了/自测通过后 mastery=已理解，lesson-planner 给出下一课；
- 重启应用空间状态完好，可继续。

## 10. 阶段拆分

- **M1（本轮目标）**：包骨架 + dl_* 表 + 六 skill + 三栏页面 + 完整纵线半自动（KB+手动 URL 采集）→ 真机验收如上。
- **M2**：研究引擎全自动化（source-collector/question-generator/relation-miner 三 skill + 自动采集 web-search/crawl/web-extract + 论文源）+ 可选研究环节工作流化 + cron 周期推进 + 未解问题自动开子研究。
- **M3**：与既有知识库/资产深度互通、间隔复习（需复习节点按遗忘曲线回访）、学习统计/导出（讲义合集/知识地图 PNG/PDF）、多空间管理。
- 图谱 DB / 记忆服务：按原结论不引入（个人规模 SQLite 足够）；若未来"跨领域知识复用/全局图谱"成为需求再评估通用图谱层。

## 11. 风险与边界（诚实标注）

1. **"教到会"难自动验证**：掌握度由用户反馈/自测驱动，存在"用户以为自己懂了"的偏差 → 费曼复述题 + assessor 判分 + 隔日复习题兜底；AI 不替用户宣称"学会了"。
2. **先验幻觉风险**：ai-verified 必须有用户确认或交叉验证；needs_verification 字段强制让模型自报存疑点，讲义上对"待验证"内容加视觉标记。
3. **讲义质量即产品**：lesson-writer 是核心 skill，一次写不好 → 需 few-shot 与用户反馈闭环（反馈进 skill 迭代）；M1 人工抽查。
4. **范围控制**：M1 刻意不含全自动采集/论文源/工作流化，避免研究基建拖住"教学"主价值的验证。
5. **长文/多概念上下文**：单概念卡片 + 单课讲义 ≤3 概念，控制 token；关系挖掘按课增量做，不全图重算。
6. **数据体积**：个人规模（几百~几千节点）SQLite 全内存遍历足够；不做图数据库。
7. 内置定义/skill boot 覆盖语义沿用既有；技能内容资产不入单测，靠真机验收。
