# 长文写作模块优化调研报告

> 日期：2026-07-31
> 目的：为提升长文写作质量与功能丰富度，调研市场竞品 + 梳理现状问题 + 设计优化方案
> 分支：feat/portrait-design-redesign

---

## 一、市场竞品调研

### 1. NovelCrafter（最专业的 AI 长篇写作工具之一，信息来源：novelcrafter.com）

核心架构 = **Codex（知识库）+ Planning（规划）+ Writing（写作）+ AI Workshop（AI 工作坊）+ Collaboration（协作）**

| 功能模块 | 解决的问题 |
|---------|-----------|
| **Codex（故事圣经）** | wiki 式组织角色/地点/传说，**自动追踪并在写作时从 Codex 提取相关细节注入 AI 上下文**，无需手动复制粘贴；支持跨书共享 |
| **Planning（规划视图）** | 场景卡片 Grid 等多视图，从不同角度审视故事，**尽早发现剧情漏洞和不一致** |
| **自动追踪与演进（progressions）** | 实体状态随章节自动演进追踪 |
| **AI Workshop/Chat** | 24/7 写作伙伴，能记住故事内容并自动从 Codex 提取细节做头脑风暴 |
| **自定义 Prompt 系统** | 变量语法的灵活快捷指令，可构建自定义生成流程 |
| **多 AI 平台接入** | OpenAI/Claude/Gemini/Llama/OpenRouter/本地模型，不锁定 |
| **类型适配** | 角色化学反应追踪、多 POV 弧线、衍生创作 |

**关键启示**：NovelCrafter 的核心是 **Codex 自动注入**——写作时 AI 自动从知识库提取相关细节，作者无需手动管理上下文。这正是用户想要的方向。

### 2. Sudowrite（基于既有知识补充，官方功能页 404）

| 功能模块 | 说明 |
|---------|------|
| **Story Bible（故事圣经）** | 角色/地点/物品/传说集中管理，生成时自动引用 |
| **Story Engine** | 大纲驱动：概要 → 角色 → 大纲（Beat Sheet 节拍表）→ 章节生成，全流程串联 |
| **Beat Sheet（节拍表）** | 结构化大纲，每个 beat 对应一段情节功能（起承转合） |
| **Character Generator** | 角色生成与深度刻画 |
| **Brainstorm / Describe / Expand / Rewrite** | 头脑风暴、场景描写扩写、段落扩写、改写 |
| **Canvas** | 关系图/结构图可视化 |

### 3. NovelAI

| 功能模块 | 说明 |
|---------|------|
| **Lorebook（知识库）** | 按关键词触发注入设定条目，是上下文管理的核心 |
| **Memory** | 滑动窗口记忆最近文本 |
| **Author's Note** | 作者注，强注入引导当前段落风格/视角 |

### 4. 通用模式总结（市场共识）

成熟 AI 写小说工具的**必备能力**：
1. **Story Bible / Codex**：结构化设定集，写作时自动注入
2. **大纲驱动生成**：概要 → 大纲 → 章节的流水线
3. **自动上下文管理**：AI 自动检索相关设定/记忆注入，而非全量塞 prompt
4. **实体追踪与演进**：角色/物品/关系随章节变化追踪
5. **一致性校验**：发现剧情漏洞、时间冲突、设定矛盾
6. **可视化**：关系图、结构图、时间线

---

## 二、当前模块现状盘点（已有能力，避免重复造轮子）

### 后端数据模型（相当完整）

已实现的实体（`src/shared/types/longwriting.types.ts`）：
- 项目、故事概要（含关键角色/场景）、时代背景、地图（含 AI 生成数据）、地点、势力、角色、**角色关系（CharacterRelation）**、技能、物品、情节、大纲（卷/章/节 3 级）、章节、章节版本、预写、素材、设计对话

**已有"记忆+状态"三套机制（关键发现）：**
1. **故事记忆 StoryMemory**：事件层，从预写内容提取，写章节时注入（`longwriting-ai.service.ts` extractMemories / getMemoryContext）
2. **实体状态快照 EntityStateSnapshot**：角色/地点/物品/势力/技能在每章结束时的状态，从章节正文提取（extractEntityStates / getEntityStateContext）
3. **章节状态摘要 ChapterStateSummary**：storyTime / currentLocation / characterStates / pendingEvents / keyChanges（extractChapterStateSummary / getChapterStateSummaryContext）

### 前端现状
- 7 阶段向导：概要 → 背景 → 角色 → 技能物品 → 情节 → 大纲 → 章节
- **无 longwriting 专属 Pinia store**（状态全在组件 ref，分散）
- **无任何可视化**：无知识图谱、无时间线、无故事进展快照、无角色关系图（全靠列表弹窗）
- **写章节时上下文不可见**：用户看不到注入了哪些记忆/状态/设定，无法干预
- "设定集"按钮是空的 `el-empty`（开发中占位）

### 知识库基础设施（可复用约 60%）
- 已有 `IVectorStore` 抽象 + LanceDB（PC）/ pgvector（Web）双端实现
- 已有 embedding 调用链（dashscope/bailian/zhipu/openai，默认 1024 维）
- 已有 HybridSplitter 切片、kb_chunks/kb_documents 的 metadata 字段
- **缺陷**：
  - `searchSimilar` 仅支持按 knowledgeBaseId 过滤，**无元数据过滤**
  - LanceDB schema **无 entityType/projectId 列**
  - **无图数据/图遍历能力**（纯向量+倒排）
  - **longwriting 与 knowledge-base 完全零耦合**

---

## 三、当前写作效果存在的系统性问题

### 维度 1：上下文构建（写作质量根因）

**问题 1.1 记忆注入靠截断，丢失相关信息**（`longwriting-ai.service.ts:2343-2387` getMemoryContext）
- normal 记忆只取前 10 条、minor 只取最近 5 条
- 第 50 章时可能有几百条记忆，**按章节号+重要度截断，而非按与当前章节的相关性检索**
- 结果：相关记忆被丢、无关记忆占 token

**问题 1.2 实体状态只注入手动标记的涉及实体**（`getEntityStateContext`）
- 只取大纲 `involvedCharacters`/`involvedLocations` 标记的实体
- 大纲若未标涉及实体（极常见），**完全不注入状态**
- 只取 `chapterNumber-1` 单点快照，非演变轨迹

**问题 1.3 设定全量塞 prompt 或按 ID 取，无语义检索**
- 角色/地点/物品是 SQL 表，写作时按 ID 全量取或按 involvedEntities 取
- 无法"语义检索与本章相关的设定"

**问题 1.4 prompt 是手工拼接大段文本**（`generateChapter:1361-1413`）
- 无 token 预算控制、无优先级排序、无结构化分区
- 章节越长越容易超出模型窗口或被 maxTokens 截断

**问题 1.5 maxTokens 上限 8192**（`:1420`）
- `Math.min((targetWords || 3000) * 2, 8192)` —— 5000+ 字章节会被截断

### 维度 2：记忆/状态层

**问题 2.1 记忆从"预写"提取，不从"正文"提取**
- extractMemories 的输入是 `prewriteContent`（预写提纲），而非章节正文
- 预写与正文可能有偏差，提取的记忆不一定反映最终写成的内容

**问题 2.2 实体状态/章节摘要提取需手动点按钮触发**
- 前端"提取状态"是手动按钮，用户忘点则状态不更新，后续章节写作上下文缺失

**问题 2.3 无向量检索，全 SQL 查询**
- 记忆/状态/设定都没入向量库，无法做语义相关性检索

### 维度 3：设定组织层

**问题 3.1 设定是扁平表，无图关系**
- 角色关系 CharacterRelation 只有 type/description，**无关系强度、无关系演变时间线**
- 无法查"第 20 章时 A 和 B 的关系状态"
- 实体间关联靠 involvedEntities 数组，无统一图模型

**问题 3.2 设定未入向量库**
- 无法按语义检索"与本章情节相关的角色/地点"

### 维度 4：时间线/连续性层

**问题 4.1 storyTime 是纯文本**（`ChapterStateSummary.storyTime`）
- "第一年春三月十五日傍晚" 无法排序、无法做时间冲突检测

**问题 4.2 无结构化时间线**
- 没有"事件-时间"的统一串联视图

**问题 4.3 伏笔无结构化追踪**
- `pendingEvents` 是文本字段，**无"埋下章节/是否回收/回收章节"结构化追踪**
- 伏笔容易遗忘或矛盾

### 维度 5：大纲/情节层

**问题 5.1 情节与大纲关联脆弱**（`generateChapterPrewrite:1148-1151`）
- `relevantPlots` 查找逻辑是 `p.title?.includes(outline.name) || outline.summary?.includes(p.title)` —— 字符串包含匹配，极易失效

**问题 5.2 大纲生成是分步 JSON，情节间关联弱**
- 卷→章→节分步生成，但情节线（plot）与大纲节点的对应关系不紧密

### 维度 6：前端体验层

**问题 6.1 写章节时上下文黑盒**
- 用户看不到注入了哪些记忆/状态/设定，无法编辑、无法强制注入某条信息

**问题 6.2 无可视化**
- 无角色关系图、无时间线、无故事进展总览
- "设定集"按钮是空的

**问题 6.3 无 Pinia store**
- 状态分散在组件，跨阶段共享困难

### 维度 7：基础设施层

**问题 7.1 longwriting 与 knowledge-base 零耦合**
- 现有向量库/知识库能力完全没用在长文写作上

**问题 7.2 向量检索无元数据过滤**
- 即使入库也无法按 projectId/entityType 过滤检索

---

## 四、优化方案设计（对应你的诉求）

### 核心理念：把"扁平表 + 截断注入"升级为"故事知识图谱 + 向量检索 + 智能上下文构建"

### 模块 A：故事知识图谱（Story Knowledge Graph）—— 对应"图数据知识库"

**目标**：统一实体-关系图模型，把静态设定 + 动态已写内容都建模为图。

**数据模型**（新增 core entity）：
- 复用已有：lw_character / lw_location / lw_item / lw_faction / lw_skill / lw_plot 作为**节点**
- 扩展 **CharacterRelation**：增加 `strength`（关系强度）、`chapterNumber`（建立章节）、`status`（active/broken）、`evolution`（演变历史 JSON）—— 支持关系随章节演变
- 新增 **图边通用表 lw_graph_edge**：srcType/srcId → dstType/dstId + edgeType（owns/knows/located_at/participates/foreshadows/resolves/conflicts）+ metadata
- 新增 **lw_plot_graph**：情节→大纲节点→章节 的对应关系（替代脆弱的字符串匹配）

### 模块 B：向量索引层 —— 对应"知识库"

**目标**：复用 IVectorStore，把设定 + 章节切片入库，支持语义检索。

- 扩展 VectorRecord / LanceDB schema：增加 `projectId`、`entityType`、`entityId`、`chapterNumber` 列
- 扩展 `searchSimilar` 接口：增加 metadata filter 参数（破坏性变更，双端同步）
- 新增 `LwVectorIndexService`：
  - 设定入库：角色/地点/物品/情节/大纲节点序列化为文本 → embedding → 入库（带 entityType 元数据）
  - 章节入库：章节正文切片 → embedding → 入库（带 chapterNumber）
  - 增量更新：章节保存/设定修改时自动 upsert

### 模块 C：智能上下文构建器（Context Builder）—— 写作质量核心

**目标**：替代当前手工拼接 prompt，按相关性+重要度+token 预算自动构建。

- 输入：当前大纲节点 + 涉及实体 + 章节序号
- 流程：
  1. **语义检索**：用大纲 summary 向量检索相关设定/记忆/历史章节片段（topK）
  2. **图扩展**：从涉及实体出发，1-2 跳扩展关联实体及其当前状态
  3. **时间线对齐**：取当前章节时间点的前后事件
  4. **伏笔检查**：检索未回收伏笔，提示本章可回收
  5. **token 预算分配**：按优先级（核心冲突 > 涉及实体状态 > 相关记忆 > 背景设定）分配 token，避免截断
  6. **结构化输出**：分区 prompt + 上下文清单（供前端展示）

### 模块 D：时间线引擎 —— 对应"时间线串联事件"

**目标**：结构化事件时间线，支持排序与冲突检测。

- 新增 **lw_timeline_event**：projectId、chapterNumber、storyTime（结构化：era/year/month/day/period）、eventTitle、eventSummary、involvedEntities、orderIndex
- 从章节正文提取时结构化 storyTime（替换纯文本）
- 前端时间线视图：事件按故事内时间排列，可标注伏笔回收

### 模块 E：故事进展快照（Story Progress Snapshot）—— 对应"故事进展快照"

**目标**：综合"截至第 N 章"的全局状态视图。

- 复用 ChapterStateSummary + EntityStateSnapshot 聚合
- 新增 **lw_story_snapshot**：projectId、chapterNumber、全局摘要（角色现状集合、未解决伏笔集合、世界状态、关系网现状）
- 写章节前生成快照供注入，写完后更新

### 模块 F：前端可视化与可控上下文

- **故事图谱视图**：节点-关系可视化（可用 ECharts/D3/Cytoscape）
- **时间线视图**：事件时间轴
- **进展快照面板**：当前故事状态总览
- **上下文预览/编辑面板**：写章节前展示将注入的上下文清单，用户可勾选/编辑/强制注入
- **补建 longwriting Pinia store**：集中状态管理

### 模块 G：从正文提取（而非预写）

- 把 extractMemories / extractEntityStates / extractChapterStateSummary 的触发时机改为"章节正文保存后自动提取"，输入改为正文
- 提取后自动更新图谱节点状态、时间线、向量索引

---

## 五、推荐实施分期

### 第一期（MVP，写作质量立竿见影）
- 模块 C 智能上下文构建器（核心，直接提升写作质量）
- 模块 B 向量索引层（设定 + 章节入库，语义检索）
- 模块 G 从正文自动提取（修正提取时机）
- 模块 F 的上下文预览面板

### 第二期（图谱与时间线）
- 模块 A 故事知识图谱（关系演变、通用图边）
- 模块 D 时间线引擎（结构化时间）
- 模块 F 的图谱可视化、时间线视图

### 第三期（快照与一致性）
- 模块 E 故事进展快照
- 一致性校验（剧情漏洞、时间冲突、伏笔追踪）
- 跨书设定共享

---

## 六、待用户确认

1. 实施范围：先做 MVP（第一期）还是全量？
2. 向量库 schema 扩展是破坏性变更（需双端同步 + LanceDB 重建表），是否接受？
3. 是否同意"从正文提取"替代"从预写提取"？
