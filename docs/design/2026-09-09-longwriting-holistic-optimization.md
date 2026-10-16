# 长文写作整体优化方案 —— 从「步骤流水线」到「活的故事圣经」

- 日期：2026-09-09
- 状态：提案（待评审）
- 范围：长文写作全流程（研讨 → 大纲 → 写作 → 一致性），**不限于当前数据结构与步骤**
- 背景：42 号故事研讨室已落地（`feat/story-room`），但它是加在新旧并存的体系上的——研讨室（AI 原生对话）与写作台（7 阶段表单向导）两套范式并存，概念重复、数据同源不同视角。用户指出应全局重新审视。本文给出整体优化提案。

---

## 0. 一句话主张

**一个项目 = 一个「活的故事圣经」（Story Bible）；两个工作面：研讨改变圣经、写作消费圣经；所有 AI 生成自动引用圣经，所有成果自动回流圣经并带溯源。**

行业验证：Sudowrite（Story Bible：braindump → synopsis → 人物 → 世界 → 章节，AI 生成时主动引用）、Novelcrafter（Codex：实体 wiki + progression 状态演进，官方称 "keeps your world building consistent"、"automatically keeps track of and links characters, places, lore"）、NovelAI（Lorebook 同构）。第三方 25 章对照测试（novarrium）的结论是：**能否让 AI「不索自用」地持续引用设定，是工具拉开差距的决定项**。我们的 structured knowledge provider + 记忆飞轮 + 图谱时间线在机制上已对齐，问题是没有贯穿到全流程 UI 与生成链路。

## 1. 现状诊断（三层）

### 1.1 工作流层：两套范式并存，概念重复

| 概念 | 研讨室（新） | 写作台（旧 7 阶段） |
|---|---|---|
| 概要 | 概要卡采纳 | OverviewStage 表单 + 生成按钮 |
| 设定 | 设定集 + 卡片 | Background/Character/SkillItem 三个表单阶段 |
| 故事线 | 账本 + 故事线卡 | PlotStage 列表表单 |
| 大纲 | 大纲卡（逐卷） | OutlineStage 树表单 |
| 正文 | 章节卡→交接 | ChapterStage（38 号工作台，核心资产） |

同一个事实（如人物）有两条录入路径、两个展示位；用户要在「对话范式」和「表单向导范式」之间反复切换心智。7 阶段向导本质是「前 AI 时代」的步骤流水线，与既定的 AI 原生设计原则（统一对话、无步骤表单）冲突。

### 1.2 数据层：叙事实体碎片化，溯源不是一等公民

- 事实分散在 ~10 张 `lw_*` 表（概要/人物/地点/势力/技能/物品/情节/大纲/章节/记忆）+ `wizard_state.room` + `agent_*` 表。
- **溯源断裂**：实体行不记录「它从哪来」（哪轮讨论/哪张卡/哪章提取）——用户问"这个设定怎么生成的"无法回答。42 号刚以卡片回链补了研讨室内轻量版，但章节提取（图谱流水线）产生的设定依然无源。
- **缺场（Scene）层**：行业以 scene 为写作单元（每场有目标/冲突/转折）；我们的 outline 直接 卷→章→节→正文，节的粒度没有语义（无 goal/conflict）。
- 实体演进（progression）数据已有但不可见：`lw_entity_states`、图谱时间线边（valid_from/until_chapter）在库沉睡。

### 1.3 引用层：圣经只被「半自动」引用

- 章节生成（非 agent 链路）的上下文靠**用户手动勾选**（38 号上下文面板）——圣经不会不索自用。
- AI 自动引用（结构化知识提供方 + 飞轮）只在 agent 侧生效。
- 研讨室把圣经注入主编上下文（已做），但「改了圣经 → 已写章节受影响」的回溯提示只有雏形（矛盾卡）。

## 2. 行业参照摘要

| 产品 | 核心机制 | 对我们的启示 |
|---|---|---|
| Sudowrite Story Bible | braindump 自由倾倒 → AI 长出结构；Bible 分区（synopsis/characters/worldbuilding/chapters）直接喂给生成 | 验证「对话倾倒 → 整理器结构化」路线；Bible 是生成的**默认上下文**而非可选附件 |
| Novelcrafter Codex | 实体 wiki + **progression**（状态随章节演进）+ 生成时自动检测实体提及并注入 | 溯源/演进一等公民；实体自动检测注入（我们已有 recognizeChapterEntities 的底子） |
| NovelAI Lorebook | 关键词触发式设定注入 | 触发式注入是低成本自动引用方案（可作为检索式的补充） |
| novarrium 25 章对照 | AI 自我矛盾是最大痛点；bible 合规性决定成败 | 一致性检查不能只有事后扫描，要进生成前校验（graph:validate 已有） |

Sources: [Sudowrite 官网](https://sudowrite.com/)、[Sudowrite 工作流博客](https://sudowrite.com/blog/best-ai-for-first-time-novelists-the-no-bs-guide/)、[Kindlepreneur 评测](https://kindlepreneur.com/sudowrite-review/)、[Novelcrafter Codex](https://www.novelcrafter.com/features/codex)、[Novelcrafter 帮助文档](https://www.novelcrafter.com/help/docs/codex/the-codex)、[novarrium 25 章对照测试](https://novarrium.com/blog/ai-writing-tools-keep-contradicting-themselves)、[LaterPress 2026 工具综述](https://www.laterpress.com/craft-of-writing/best-ai-writing-tools-for-fiction)。

## 3. 目标工作流（重构后）

```
研讨室（前期唯一入口）                       写作台（生产工作台）
┌──────────────────────────┐              ┌──────────────────────────┐
│ 对话研讨（主编）            │   采纳/入库   │ ① 章节流（默认页）          │
│  ├→ 共识账本（结论）        │ ──────────→  │    大纲树 = 章节队列        │
│  ├→ 卡片提炼（整理器）      │              │    点章即写（38号工作台）    │
│  └→ 世界设定集（实时投影）   │              │    上下文自动引用圣经        │
└──────────────────────────┘              │ ② 设定资产（抽屉编辑）       │
        ↑ 矛盾卡回流（改设定）               │ ③ 洞察（图谱/时间线/导出）   │
        └──────────────────────────────────└──────────────────────────┘
                    一致性飞轮：写一章 → 提取 → 校验 → 矛盾卡 → 回圣经
```

1. **研讨室是前期唯一入口**（已落地）：概要/人物/故事线/世界观/大纲全部在对话中生长；设定集是圣经的实时投影（详情+溯源已补）。
2. **写作台从 7 阶段向导瘦身为「章节流」工作台**：默认页 = 大纲树当章节队列（树即队列），点章即写；概要/人物等不再是「阶段」，而是可呼出的引用侧栏。
3. **上下文自动引用**：章节生成默认「圣经自动引用」（结构化提供方按章节大纲检索相关实体 + 状态 + 时间线），手动勾选降级为高级模式。
4. **一致性飞轮**：每章完成 → 图谱提取 → 生成前校验（validate）+ 事后扫描（scan）→ 矛盾卡 → 卡上一键「改设定/改本章」回流。
5. **溯源三跳**：任何实体 → 来源（讨论轮次/卡片/章节）→ 原始消息，界面三跳内可达。

## 4. 数据结构演进（允许破格，但分两步走）

**第一步（视图/DAO 级抽象，零物理迁移）**：
- `StoryBible` 统一读模型：一个聚合查询把 ~10 张表投影为统一实体列表 `{kind, id, name, fields, origin, progression}`——研讨室设定集与写作台引用侧栏共用（架构统一原则：一处抽象，两处消费）。
- 溯源补全：`lw_*` 各表加 `origin` JSON 列（迁移，可空）：`{type:'discussion'|'extract'|'manual', cardId?, turns?, chapter?}`；研讨室采纳时写，图谱流水线提取时写。

**第二步（新增能力，新增表）**：
- `lw_scenes`：outline_id / order_index / goal / conflict / turn / summary——场层语义；38 号上下文面板按场出上下文，正文按场续写。
- progression UI 化不新增表：`lw_entity_states` + `lw_graph_edges`（valid_from/until）已够，缺的只是「实体详情 → 状态时间线」视图。

## 5. 界面重构

### 5.1 研讨室（本轮已基本到位，小迭代）
- 世界设定集：单一面板 + 待讨论提示 + 来源徽标（已按原型还原）；条目详情抽屉 + 溯源回看（本轮补齐）。
- 待加：实体详情抽屉里的「状态时间线」tab（progression，P3）。

### 5.2 写作台（重构主体，建议独立一轮）
- **P1 导航重构（纯重组，不动逻辑）**：`/story-editor/:id` 三 tab 化——写作（默认，ChapterStage 原样搬入）/ 设定（资产列表+编辑抽屉，合并 5 个 stage 组件）/ 洞察（GraphView+导出）。7 阶段导航与 wizard_state.skipped 语义退役（wizard/* 清理顺路完成）。
- **P2 资产面板统一**：设定 tab = 圣经读模型（同一组件复用研讨室设定集）+ 行内编辑抽屉（抄 EP 域 AssetEditDrawer 范式）；AI 生成按钮收敛到「研讨室去做」跳转（生成不重复建设——架构统一原则）。
- **P3 章节流打磨**：大纲树即队列（写完打勾）；每章卡片带状态/字数/矛盾徽标。

### 5.3 生成链路
- 章节生成上下文：自动引用（圣经检索段）为默认，勾选面板为高级；预览=实际原则不变（38 号骨架保留）。

## 6. 分期路线

| 期 | 内容 | 量级 |
|---|---|---|
| P0 | 研讨室 + 设定集 + 溯源轻量版（**本轮已交付**） | 完成 |
| P1 | 写作台三 tab 导航重构 + 资产面板统一（复用圣经读模型） | ~3-4 人日 |
| P2 | origin 列迁移 + 溯源三跳贯通 + 章节生成自动引用圣经 | ~3 人日 |
| P3 | scene 层（lw_scenes + 按场上下文/续写）+ progression 时间线视图 + 一致性回流闭环（矛盾卡一键改） | ~4-5 人日 |

## 7. 风险与权衡

- **ChapterStage 是核心资产（2383 行 + 真机验收链）**：P1 只做外壳重组不动其内部，风险可控。
- **自动引用的幻觉风险**：检索段注入可能带入弱相关设定——保留 token 预算 + 相关度阈值 + 手动模式兜底。
- **origin 迁移**：可空 JSON 列，旧数据 origin=null 显示「手动/未知」，无破坏性。
- **两套范式过渡期**：研讨室与旧 stage 并存期间数据同源（同一批表），无双写风险；P1 完成后旧 stage 退役。
