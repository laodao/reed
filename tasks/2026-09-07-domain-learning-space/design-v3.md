# 「领域共学空间」总体设计定稿 v3（Domain Learning Space）

日期：2026-09-08
分支：feat/workflow-engine
文档目录：tasks/2026-09-07-domain-learning-space/
取代：`design.md`（v2）与 `atlas-design.md`（本稿整合二者并修正演进残留，两文件仅作历史留档）
子设计：**知识点内容模型（tasks/2026-09-07-domain-learning-space/content-template-design.md）**——概念讲义块化（Block）+ 知识点模板（画像×节点类型），细化本稿 §7.1 讲义呈现与 dl_card 结构。
前置：工作流引擎/节点/skill 体系/知识库/采集链均已落地；前端 bytemd(markdown)+mermaid+公式渲染已具备；
      长文写作图谱为自绘 SVG（无图库）——Atlas 复用同一技术。
原型基线：2026-09-08 已完成前端界面原型并通过真机走查（文件见 §11 清单），本稿以"参考实现"引用。

状态：**设计定稿，指导后续开发；未开始后端开发**（用户明确"先不要着手开发"）

---

## 0. 产品定位（一句话）

**「领域共学空间」：系统对某个领域持续自主研究，但目标不是产出报告，而是"教到用户会"——以知识点为最小学习单元，把知识组织成用户能读懂的形式（图文/表格/图/公式/自测），用户逐个学、随时追问，追问与反馈驱动新的研究，AI 先验经用户确认后沉淀，逐步长成一套有依赖关系、掌握度可追踪的知识体系。**

四条关键定性（区别于"自动研究工作流"）：

1. **人机共学，不是无人研究**：研究是手段，教会用户是目的；用户全程在场（确认地图/读讲义/追问/反馈懂没懂/确认先验入库）。
2. **学习单元是知识点，不是"课"**（决策 D8）：一概念一讲义；顺序由依赖拓扑 + 掌握度门控保证；"课/导读/总览"只作补充呈现，不参与排程。
3. **追问是研究方向的第二引擎**：学习计划驱动第一轮研究；追问答不上 → 登记未解问题 → 可开新研究方向。
4. **AI 先验可反哺**：大模型已知且经用户确认/交叉验证的内容平等入图（source=ai-verified）。

## 1. 需求全貌（多轮讨论收敛）

1. 学习一个领域：先综述建骨架 → 核心术语成队列 → **逐个知识点**搞懂并入库 → 关系挖掘扩边 → 理论/专著/论文收集 → 形成有关系的知识体系；
2. 系统先循环研究（可无人值守推进），最终要**教会用户**；
3. 内容组织成用户能看懂的形态：图文、表格、思维导图、文章（研究型侧重论文/公理/定义/最新成果；应用型如金融/经济侧重法规/操作规范/案例）；
4. 用户阅读后追问；先从已有知识答，答不上 → **开新学习方向**再研究；
5. AI 已有知识若回答正确，也提炼回知识库/图谱；
6. 用户全程参与、循环深入、状态持久（随时回来继续）；
7. 一个领域常有**大量知识点/子领域**（几百~上千），知识地图与全景须能承载规模；
8. 课程内容须循序渐进，否则学习困难。

## 2. 领域学习方法论依据（为什么这么设计）

| 方法 | 出处/证据 | 落到设计 |
|---|---|---|
| 骨架先行（先综述/分类学再填肉） | 概念图学习法（Novak）；auto-survey-agent"必选近3年综述对齐分类学" | 学习循环第 0 步 domain-map 产出领域地图，人工确认后才开始逐概念 |
| 术语是入口 | 教育研究共识 | 地图产出核心术语队列 |
| 理解要可验证（费曼：用自己的话讲清） | 费曼技巧/主动回忆 | 概念讲义带"费曼自检"；assessor 自测/复述判定 |
| 知识关系化（原子卡片+显式链接） | Zettelkasten；概念图 | 概念图（节点+关系边）为空间中央状态 |
| **学习单元=知识点而非课程** | 认知负荷理论（工作记忆有限）；STORM 评测揭示 LLM"过度关联"风险；Zettelkasten 原子性 | D8：一概念一讲义；关系交给结构（边），不交给课程文案；掌握度信号绑定单概念（反馈不被稀释） |
| **循序渐进 = 依赖拓扑 + 反馈闭环，不是一次排课排准** | 先决条件排序（Gagné 层级思想）；教学拆解 | D9：依赖边拓扑保证不乱序；"没懂"自动拆更小概念；"懂了"才解锁后继 |
| 多视角提问优于关键词检索 | STORM（组织性+25%、覆盖+10%） | question-generator（M2 全面启用；domain-map 已用其思路） |
| 资料分层 | fraserlab 等入门指南 | source-collector 资料路由 |
| 自主闭环需可判定信号 | karpathy/autoresearch（val_bpb 启示） | 研究侧=evidence 可归因硬校验；教学侧=掌握度（用户反馈/自测）真信号 |
| 大规模知识导航 | Obsidian/Kumu 语义缩放；focus+context | Atlas：全局图→点击聚焦一阶邻居→子图谱下钻+面包屑；文字大纲树兜底 |

## 3. 产品决策总表（已确认，最终版）

| # | 决策 | 内容 |
|---|------|------|
| D1 | 独立「领域学习空间」页面 | 领域=持久项目；三栏：左知识地图 / 中概念讲义 / 右追问；随时回来继续 |
| D2 | 概念图归学习空间自带 | 节点/边为包内领域实体（SQLite），不依赖通用图谱 |
| D3 | M1 跑"研究→讲义→教学→追问→沉淀"完整纵线 | 采集半自动（KB 检索+用户提供 URL/网页），全自动采集 M2 |
| D4 | 工作方法 = skill 家族 | 研究侧 5 + 教学侧 4 个，SKILL.md 资产化，可复制自定义换领域 |
| D5 | 结构化产出路径 | skill 由学习服务直接调用（ai-call 已具备 JSON 解析，**无需 skill-call jsonMode**）；技能提示词渲染抽公共函数（引擎面唯一小重构）；M2+ 可选把研究环节包成工作流 run |
| D6 | 先验知识入图需标记 | source=ai-verified + 用户确认/交叉验证；未验证先验只作初稿 |
| D7 | 追问答不上 → 未解问题队列 → 新研究方向 | 队列是研究方向第二驱动 |
| D8 | **学习单元 = 知识点** | 一概念一讲义（标题=概念名）；排程=依赖拓扑+掌握度门控；"课"仅保留：①每领域一篇导读 ②学完分支的总览复习讲义 |
| D9 | 顺序控制 | 依赖图自动排 + 没懂自动拆解；左栏可自由跳学/插队，系统只建议不强制 |
| D10 | 领域画像（profile）驱动展示 | 建空间选领域画像（7 类预设或自定义），决定侧重知识类型与默认/增强视图（见 §6） |
| D11 | Atlas 图谱技术 | **自绘 SVG**（与长文 GraphView 同源，不引入 G6/vis-network）；M2 抽取公共力导向组件供长文共用 |
| D12 | 知识地图支持大规模 | 左栏大纲树：任意层级折叠、父级聚合掌握度、搜索/掌握度过滤、默认展开当前学习链 |
| D13 | 全链无文字/无写死业务数据 | 讲义/画面不含水印文字等既有纪律；原型 mock 仅限界面走查，正式开发以本稿数据模型为准 |

## 4. 概念模型

### 4.1 知识体系 = 一棵大纲树（默认主线）+ 一张关系网（Atlas 副线）+ 类型化节点

- **树（结构主线）**：领域 → 分支 → 模块 → … → 概念/知识点。树承载：目录/大纲、导航、学习顺序的默认排列、聚合掌握度。
- **图（关系副线）**：任意节点间的显式关系边（不限于树内父子），承载 Atlas 与"前置依赖"门控。同层边才同图，边类型可开关过滤。
- 二者共享**同一节点池**：树叶子即知识节点，图引用同一批节点（正式数据模型见 §9）。

### 4.2 知识节点类型（统一枚举；画像从中挑侧重）

| 类型 | 说明 | 领域权重示例 |
|---|---|---|
| concept 概念/术语 | 基本单元（是什么） | 全部 ★ |
| fact 事实/数据/指标 | 具体实例、数据集、参数 | T2/T5/T7 ★★ |
| definition 定义/口径 | 形式化定义 | T1/T3/T5 ★★ |
| axiom 公理/定理/公式 | 可推导陈述 | T1 ★★ |
| theory 理论/模型/框架 | 解释性结构 | T2/T3/T7 ★★ |
| method 方法/算法/流程 | 怎么做 | T2/T4/T6 ★★ |
| artifact 工具/系统/实现 | 具体实现物 | T4/T6 ★ |
| paper 论文/文献/成果 | 一手知识载体 | T2/T3/T7 ★★ |
| standard 标准/协议 | 技术标准/接口规范 | T4 ★★ |
| regulation 法规/政策 | 约束性规则 | T5 ★★ |
| procedure 操作规范/作业流程 | 合规/操作要求 | T5 ★★ |
| case 案例/判例/场景 | 情境化知识 | T5 ★★ |
| person 人物/机构/学派 | 生产者与主体 | T3 ★★ |
| controversy 争议/开放问题 | 未知区与未决点 | 研究型必标 ★ |
| principle 原则/价值观 | 判断准则 | T5/T6 ★ |
| **group 分支/模块（非知识，仅目录）** | 大纲树目录节点 | 全部 |

关系（边）类型分层：概念-概念（is-a / part-of / 前置依赖 / 因果 / 对比）、概念-载体（定义出自 / 方法应用于 / 受……约束）、载体-载体（论文引用 / 标准兼容 / 规范更新）。

### 4.3 节点状态：研究态 × 掌握态（两个维度正交）

- research_state：未研究 / 研究中 / 已提炼 / 待验证 / 存疑（研究引擎维护）；
- mastery：未接触 / 学习中 / 已理解 / 需复习（**只由用户行为推进**：懂了✓、自测通过、费曼复述；AI 不自封"学会"）。

### 4.4 领域画像 profile

建空间时选择。`{ id, kindLabel, nature, emphasis:[nodeType…], defaultView, extraViews }`。预设 T1~T7（见 §6 表）；用户可自定义。画像只做"软配置"（侧重排序/默认视图），不锁死展示。

## 5. 信息架构与页面拓扑

```
列表页 /domain-learning
  └─ 主题卡（含进度）：点卡 → 空间页
空间页 /domain-learning/:id      ← "学"的主场景（三栏）
  ├─ 左：知识地图（大纲树）   ─ 点分支展开 / 点概念选课
  ├─ 中：概念讲义（知识点门控）─ 懂了✓/没懂
  ├─ 右：追问对话
  └─ [知识全景] → 新开 Tab
全景页 /domain-learning/:id/atlas ← "看体系"的副场景（四区）
  ├─ 左：结构索引（大纲树）  ├─ 中：主视图（自绘 SVG 图谱等）
  └─ 右：节点档案
互跳：空间页点概念 → 可"去 Atlas 看它在哪"；Atlas 档案"去学它" → 回空间页该概念讲义。
```

## 6. 领域画像（profile）→ 视图联动

| 画像 | 类型 | 侧重（高权重） | 默认视图 | 增强视图 | Atlas 额外呈现 |
|---|---|---|---|---|---|
| T1 硬理论 | 数学/理论物理/逻辑 | definition/axiom/公式/concept/controversy | 定理-依赖分层图 | — | 定理链可展开到证明 |
| T2 实证科学 | 物理/化学/生物 | concept/theory/method/paper/data/controversy | 概念网络图 | 时间线 | 论文-方法联结点、证据链 |
| T3 人文社科 | 历史/哲学/社会学 | concept/theory/person/controversy | 概念网络图 | 时间线+对比矩阵 | 学派地图、思想流变 |
| T4 工程技术 | 软件/电子/AI 系统 | concept/principle/method/artifact/standard/case | 架构分层/依赖图 | 流程状态图 | 技术栈、协议-实现对应 |
| T5 专业实务 | 金融/法律/财会/医疗 | concept/regulation/procedure/case/data | 三层结构（法规-操作-概念） | 矩阵+流程 | 合规对照、案例-条款链接 |
| T6 技艺创作 | 设计/音乐/写作/影视 | concept/principle/case(作品)/method | 作品-技法对照 | 画廊/谱系 | 作品集与风格谱系 |
| T7 前沿交叉 | 大模型/量子计算 | concept/paper/method/benchmark/controversy | 概念网络图 | 时间线+成果流 | "最新成果"高亮、开放问题置顶 |

M1 内置 5~7 个预设画像；建空间选画像或自定义。

## 7. 页面规格（对齐 D1/D12；原型已验证为参考实现）

### 7.1 空间页三栏

```
┌ 顶栏：返回 + 空间名/目标 + 掌握度进度条 + [知识全景] + [继续学习→] ──────────┐
├─ 左：知识地图（大纲树）────────────────┬─ 中：概念讲义 ──────────┬─ 右：追问 ─┤
│ 过滤条：搜索概念 + 掌握度下拉(全部/待学/   │ 头部：概念名+en+掌握度徽标 │ 消息流：    │
│   学习中/已理解)                        │ 前置依赖就绪条：            │ 有据回答    │
│ 分支行：▸ 分支名  已懂/总数(聚合,全绿=完成) │   前置概念 ✓ / 🔒         │ (带出处)   │
│   点击展开/收起；默认只展开当前学习链      │   （未就绪禁用 懂了/没懂）   │ 先验待确认  │
│ 概念行：●掌握度色点 + 概念名             │ 正文：概念讲义 markdown     │ 资料不足→   │
│ 点击→选中(高亮)+中栏切讲义               │   （图文/图/表格/自测）      │ 登记新研究  │
│ 搜索/过滤命中 → 分支强制展开             │ 底部：[懂了✓][没懂，拆细]    │            │
└────────────────────────────────────┴──────────────────────┴────────────┘
```

交互要点：
- 分支行折叠由 expanded 集控制；「继续学习」= 找第一个"前置依赖全部已理解 ∧ 未掌握"概念（依赖门控），并展开其路径；
- 中栏主标题显示**概念名**（非"第 N 课"）；无讲义时显示"本概念讲义生成中"；
- [没懂] → 计数+，超过阈值（如 2 次）提示拆成子概念入队；[懂了] → mastery=已理解，聚合/进度即时刷新；
- 右栏问答三类回答形态 + 未解问题计数。

参考实现（原型，正式开发复用形态）：`views/domain-learning/DomainLearningSpace.vue` + mock-data 树模型。

### 7.2 Atlas 全景页

```
┌ 顶栏：返回空间 + 领域名(画像标签+性质) + [全图][回到讲义空间] ──────┐
│ 侧重条：本领域侧重 [类型tags…]（随画像）                          │
├─ 左：结构索引(大纲树,类型着色,点击定位) ──┬─ 中：主视图 ───────────┬─ 右：节点档案 ─┤
│                                       │ AtlasGraph 自绘 SVG：    │ 头部:名+类型徽标│
│                                       │ - 类型着色/图例/掌握度学习圈 │ 定义/要点      │
│                                       │ - 缩放/平移/适应/拖动     │ 关键属性(类型专属│
│                                       │ - 单击→聚焦一阶邻居其余淡化│  →法规效力/论文 │
│                                       │ - 双击→子图谱下钻(面包屑回退│   年份…）      │
│                                       │ 视图(画像驱动,后续):       │ 关联内容列表   │
│                                       │  时间线/矩阵/流程/三层结构 │ 直接关系(点击跳)│
│                                       │                          │ [打开子图谱][去学]│
└───────────────────────────────────────┴──────────────────────────┴──────────────┘
```

交互：全局图 → 单击聚焦（focus+context）→ 双击/按钮下钻（面包屑 全领域>节点·子图谱 可回退）；大纲树兜底（不读图也能提纲挈领）。

参考实现：`views/domain-learning/DomainAtlas.vue`、`AtlasGraph.vue`（自绘 SVG，与长文 GraphView 同源）、`atlas-data.ts`（画像+类型元数据）。

## 8. 学习循环状态机

```
建空间(领域+目标+画像) → domain-map(综述/KB/多视角提问) → 领域地图草案 →【人审确认】
  │
  ▼
排程：依赖拓扑 + 掌握度门控 取"下一待学概念"（D9）
  │
  ▼
【研究引擎】(逐概念, 半自动 M1/全自动 M2)：
  已有讲义 → 跳过 | KB 命中 → 提炼(资料) | 用户/系统 URL → web-extract → 提炼
  | 皆无 + 先验有把握 → 初稿(待验证→ai-verified 需人确认)
  硬校验：无 evidence 来源不落库
  │
  ▼
【教学】：阅读概念讲义 → 追问(tutor) → 自测(assessor) → 反馈
  ├ [懂了✓] → mastery=已理解 → 解锁后继概念
  ├ [没懂] → 换角度重讲；N 次仍不懂 → 拆分子概念入队
  └ 追问 → 命中已有→答(带出处) | 命中先验→答+问"是否存库"(确认→ai-verified)
           | 都答不上→入未解队列→用户触发新研究
  │
  ▼
收敛/状态持久；分支学完可出总览复习讲义；导读在领域确立后生成一篇
```

人机分工：地图人审（必须）、掌握度用户驱动（系统不自封）、先验入库需确认、新研究方向用户触发；采集与研究推进可自动（M1 半自动 / M2 全自动）。

## 9. 数据模型（SQLite；正式实现以本稿为准）

表前缀 `dl_`；实体 `core/database/entities/domain-learning/`；仓储同层。个人规模（几百~几千节点）SQLite 足够，**不引图数据库**。

**dl_project**（学习空间）
`id, name, goal(入门/工作应用/前沿), profile_id(画像, 可空=自定义), profile_json(自定义画像), status(active/paused/archived), description, kb_id(可空), default_model(json), created_at, updated_at`

**dl_concept**（节点：目录 group 与知识节点同表，node_type 区分）
`id, project_id, node_type(§4.2 枚举, group=目录), name, en(可空), parent_id(树父, null=根), definition_short(可空), research_state(枚举), mastery(枚举), source(资料/ai_verified/人工), attrs(json: 类型专属字段, 如法规效力/施行、论文年份/组织), card_id(可空), note, created_at, updated_at`
索引：`(project_id, parent_id)`；唯一 `(project_id, parent_id, name)`（同级不重名）。
树=概念池的父链；图与树共享该表。

**dl_relation**（关系边；含前置依赖等全部关系类型）
`id, project_id, source_id, target_id, relation_type(§4.2 关系枚举), evidence(可空), verified(0/1), created_at`
索引：`(project_id, source_id)`, `(project_id, target_id)`；唯一 `(project_id, source_id, target_id, relation_type)`。
「前置依赖」边（source→target）驱动学习门控；其余供 Atlas 呈现。

**dl_mastery_log**（掌握度审计）
`id, project_id, concept_id, from_mastery, to_mastery, trigger(lesson_ack/self_test/qna/expire/manual), at`

**dl_card**（概念讲义 = 学习正文；一概念至多一篇当前版）
`id, project_id, concept_id, essence_type(K-concept/K-oper/K-stmt/K-inst/K-agent/K-open), blocks(json: 有序块数组, 见 content-template-design §2), content_md(由 blocks 派生, 兼容/导出用), evidence_sources(json: [{kind,title,url|kbDocId,quote}]), version, status(draft/published), created_at, updated_at`
（结构以 content-template-design.md §5.1 为准；取代旧 dl_lesson 的"课"语义：学习单元=概念、正文=块化；导读与总览另见 dl_doc。）

**dl_doc**（文档型内容：导读/分支总览/复习讲义，非排程单元）
`id, project_id, doc_type(intro/review/manual), title, concept_ids(json 引用), content_md, created_at, published_at`

**dl_question**（追问与未解问题）
`id, project_id, concept_id(可空), question, answer_md(可空), answer_source(kb/讲义/概念图/ai_verified/新研究/未答), status(open/answered/escalated/resolved), created_at, answered_at`
索引：`(project_id, status)`；未解队列=open。

资料全文 → 项目知识库（复用 kb 包，sourceKey 幂等）；evidence_sources 只存引用摘要。

## 10. skill 家族（D4；全部 SKILL.md 资产）

研究侧：`learning-domain-map`（建骨架，输出 branches/concepts/openQuestions JSON）、`learning-concept-explainer`（输出 `{essence_type, blocks}` 块化概念卡片，含 evidence，见 content-template-design §5.2）、`learning-relation-miner`（关系+建议，M2 独立）、`learning-question-generator`（多视角问题，M2）、`learning-source-collector`（资料路由，M2）。
教学侧：`learning-lesson-planner`（**选下一概念**：依赖就绪+掌握度+目标 → conceptId，非"选课"）、`learning-lesson-writer`（把 card.blocks 打磨为可读块流，图文并用+自测）、`learning-tutor`（答疑三类路径）、`learning-assessor`（自测/复述判定，消费 selfcheck/feynman 块）。
各 skill 输入输出契约见 design.md v2 §7 基线，块化改造以 content-template-design.md §5.2 为准。

## 11. 前端实现指引（原型已完成，正式化差异）

原型文件（参考实现，P0 完成）：
`renderer/packs/domain-learning/index.ts`（路由/菜单）；`views/domain-learning/`：`DomainLearningHome.vue`（主题列表）、`DomainLearningSpace.vue`（三栏+树+门控）、`DomainAtlas.vue` + `AtlasGraph.vue`（全景）、`MarkdownViewer.vue`（bytemd 只读）、`mock-data.ts`（5 主题样例）、`atlas-data.ts`（类型/画像/图谱样例）。

正式化差异（M1 起）：
1. mock 数据 → 后端 dl_* 真实数据（IPC 前缀 `dl:`）；原型 mock 仅保留为测试夹具；
2. AtlasGraph 与长文 GraphView 的公共力导向逻辑抽取 `components/common/ForceGraph.vue`（M2 起，避免双份漂移）；
3. 图谱/树节点类型、画像元数据前移 `src/shared/types/domain-learning.types.ts`（前后端共用）。

## 12. 后端架构（包级接入，遵守平台纪律）

```
src/core/packs/domain-learning/
  manifest.ts   // ipcChannelPrefixes:['dl:']; dependencies:[workflow, knowledge-base, skills]
  index.ts      // activate: 注册 handler + 调度
  services/     // learning-project/graph/loop/tutor/research + atlas(档案聚合)
  handlers/     // dl:xxx 薄壳
实体/仓储      // entities/domain-learning + repositories（见 §9）
```
- AI 调用：服务内直调（callAI / extractJsonFromResponse）；技能渲染抽公共函数（skill.service.renderForCall）供 skill-call 节点与学习服务共用（引擎面唯一小重构，带回归单测）。
- 事件/通知：讲义就绪、研究完成 → platform_events + 通知中心；点击直达空间/讲义。
- 持久：状态落 SQLite，随应用重启恢复；研究推进由用户触发（M1）或后台任务/cron（M2）。

## 13. 质量与判定

- 研究侧硬校验：卡片必含 evidence 来源；jsonMode 结构化解析；结构不符自动重试/丢弃（宁可漏一条不落无证据）。
- 教学侧真信号：mastery 只由用户反馈/自测推进；assessor 出题+复述判定；「需复习」隔日回访（M3）。
- 先验防幻觉：needs_verification 自报存疑点 + ai-verified 需确认 + 讲义待验证内容视觉标记。

## 14. 测试策略（TDD，后端开发起用）

- 实体/仓储：dl_* CRUD + 唯一约束。
- graph 服务：mastery 推进规则、依赖门控（未满足不选后继）、拓扑排序取下一概念。
- 排程/循环：D9 拆解触发、分支总览生成时机、导读生成。
- tutor：命中 kb/命中先验/答不上三路（先验断言询问确认、未答断言入队列）。
- research：evidence 硬校验、先验初稿待验证标记。
- atlas 档案：按 node_type 聚合关联内容。
- 渲染公共化：skill-call 输出与重构前一致（回归）。
- 前端：复用原型交互（真机/CDP 走查回归），组件级单测覆盖树行计算/门控派生（若抽纯函数）。

## 15. 阶段拆分与验收

- **P0（已完成）**：前端形态原型（列表/空间三栏/大纲树/门控/Atlas）+ 交互真机走查；验收=用户走查通过（已通过）。
- **M1（下一开发目标）**：后端化——7 张 dl_* 表 + 领域学习包五服务 + IPC（`dl:`）+ 渲染公共化小重构 + 六个内置 skill（map/explainer/planner/writer/tutor/assessor）+ 前端 mock 替换为真实数据（三栏/树/门控/Atlas 档案接入）+ 完整纵线半自动采集。验收：真实小领域建空间→地图人审→跑通 ≥3 概念"研究→讲义→教学→追问→沉淀"；追问有据回答一次、答不上入队列一次、先验确认入图一次；重启状态完好；skill-call 回归全绿。
- **M2**：研究引擎全自动（source-collector/question-generator/relation-miner + web-search/crawl/web-extract + 论文源）+ 研究环节工作流化（可选）+ 公共 ForceGraph 抽取 + Atlas 增强视图按画像启用（时间线/矩阵/流程/三层结构）+ cron 周期推进 + 未解问题自动开子研究 + profile 可视化配置。
- **M3**：与既有知识库/资产深度互通、间隔复习、学习统计/导出（讲义合集/地图 PNG/PDF）、多空间管理；跨领域节点复用评估（届时再评估是否需要通用图谱层/记忆服务）。

## 16. 风险与边界

1. "教到会"难自动验证 → 掌握度用户驱动 + 费曼/自测/隔日复习兜底；AI 不宣称"学会了"。
2. 先验幻觉 → ai-verified 确认制 + needs_verification + 视觉标记。
3. 讲义质量即产品 → lesson-writer 是核心 skill；few-shot + 用户反馈进 skill 迭代；M1 人工抽查。
4. 图谱规模（>500 节点）→ 画像分组分区 + 大纲树兜底 + 懒展开。
5. 领域画像"侧重"是软配置，避免硬规则锁死。
6. 法规/规范时效内容 → 标注生效/版本/时间，与研究更新流（M3）联动。
7. 顺序依赖来自 AI 提取，可能出错 → 地图人审 + 没懂拆解双保险（一次排课不追求终身正确）。
8. 内置定义/skill boot 覆盖语义沿用既有；技能内容资产不入单测，靠真机验收。
