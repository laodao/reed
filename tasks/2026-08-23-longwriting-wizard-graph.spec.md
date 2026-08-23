# 长文写作「向导式 + 图谱一致性」详细设计 Spec（v2，经代码深度 review 修订）

> 状态：方案确认；**v2 依据对现有代码的深度 review 修订**（review 记录见 tasks/2026-08-23-longwriting-review-draft.md）
> 日期：2026-08-23
> 关联计划：tasks/2026-08-23-longwriting-wizard-graph.md
> 决策：YAML 仅作导出视图；预写降级可选；时间线以 chapter_number 为全局时间单位

## 0. Review 关键修正（相对 v1）

| # | v1 假设 | 现状（代码实证） | v2 修正 |
|---|---|---|---|
| 1 | ContextBuilder 已插件化，新增 Provider 自动纳入 | **编排器不存在**：context/ 下类型+10 Provider+prompt/压缩工具全实现但无 build()/loadBuildContext()，generateChapter 仍走手工拼 prompt（ai.service.ts:1203-1431） | 阶段 2 在手工 prompt 上增量加"图谱关系与事件"段；ContextBuilder 完成+接入列独立优化项 |
| 2 | 表名 lw_chapter / lw_story_factions / lw_story_maps | 实为 **lw_story_chapters / lw_project_factions / lw_project_maps** | §3.1 表名修正 |
| 3 | generatePlots 需增强注入 | **已注入完整上下文**（overview+characters+background+locations+skills+items，ai.service.ts:1722） | 删除该增强 |
| 4 | 写后提取复用现有自动机制 | 前端自动只做 extractChapterStateSummary；实体状态/新实体是手动按钮；RECOGNIZE_CHAPTER_ENTITIES 是死通道；**向量索引未接入写链路**（indexChapter/indexMemory 仅全量重建触发） | §6.3 流水线大部分是**新增编排**+向量索引自动接线 |
| 5 | 新实体"检测→确认→落库" | 现状 autoAddEntities **直落库无确认**（ChapterStage 确认对话框是死代码） | §6.3 激活"检测→确认→落库" |
| 6 | stateAt 原语需新建 | **getEntityStateAtChapter 已存在**（repository） | §6.1 stateAt=封装现有 |
| 7 | 大纲一键生成 | 实际是"结构选择(1/2/3)→多轮 AI→整体确认→串行建树" | §5.1 Step 4 保留结构选择+可编辑预览确认 |
| 8 | 进度随向导持久化 | **updateProgress 是 TODO**（lw_projects.progress 从未更新） | §5.2 补进度/阶段持久化 |
| 9 | 角色关联用 ID | 前端多处存**名称**，第三范式关联表形同虚设 | §3.2 补"名称→ID 解析"（resolveEntities） |
| 10 | 蓝图=新 API | generateStoryOverview 返回字段已覆盖（summary/coreConflict/keyCharacters/keyLocations/estimatedChapters） | 复用，仅 prompt 措辞调整 |

## 1. 目标与非目标

### 1.1 目标
1. 长文写作改向导式：创意起点 → 人物 → 世界(可选) → 故事线 → 大纲 → 逐章写作，流程驱动、上下文累积、逐步确认。
2. 图数据保存人物/物品/地点/事件及其关系与时间线，构建「写前校验 → 写中注入 → 写后提取」一致性闭环。
3. 高级模式保留并重构为「设定库 + 创作台」。

### 1.2 非目标
- 不引入图数据库；SQLite 边表 + 应用层图查询。
- 不删除既有能力（预写/记忆/向量索引等，兼容旧数据）。
- **评论类项目本轮不动**（保持 topic/outline/chapters；其短板——无模型选择、generateSection 滥用 involvedCharacters 存素材引用——记录不修）。
- **不做对话式设计助手**：lw_design_conversations/lw_design_messages 仅有数据层（repository+迁移），无 AI 服务/无 IPC/无前端，本轮不启用。
- 不做图谱多用户协作。

## 2. 术语表（沿用 v1，增补）
- 节点/边/状态切片/章节时间单位/蓝图/一致性闭环/矛盾：同 v1。
- **实体解析**：把文本中的实体名称映射为项目内实体 ID（resolveEntities）。

## 3. 领域模型

### 3.1 节点（Node）
节点不建独立表，图查询 UNION 派生。**正确表名**：

| 节点类型 | 数据源表 | 备注 |
|---|---|---|
| character | lw_story_characters | |
| location | lw_story_locations | |
| item | lw_story_items | |
| faction | lw_project_factions | |
| skill | lw_story_skills | |
| event（新增） | **lw_events** | 章节确认时创建 |

### 3.2 边（Edge）—— 新增表 lw_graph_edges
DDL 同 v1：id/user_id/project_id/source_type/source_id/target_type/target_id/relation_type/label/valid_from_chapter/valid_until_chapter/description/created_at/updated_at；索引 (project_id,source_type,source_id) / (project_id,target_type,target_id) / (project_id,relation_type)。

**关键补充：名称→ID 解析**。现有前端多处存实体**名称**（plot.involvedCharacters、AI 返回等），图谱边必须 ID。GraphService 提供 `resolveEntities(projectId, names: {type, name}[]) → {type, id, name}[]`：
- 按 projectId 内实体名精确匹配；匹配失败记录 `unresolved`（建边跳过 + 校验时提示，不静默）。
- 流水线建边前一律先解析；向导各步骤落库时**新代码统一存 ID**（不改旧数据，避免大迁移）。

### 3.3 事件节点 —— 新增表 lw_events
DDL 同 v1：id/user_id/project_id/name/description/chapter_number/story_time/involved_entities(JSON)/state_before/state_after/created_at/updated_at；索引 (project_id) / (project_id,chapter_number)。

### 3.4 relation_type 集合
同 v1：character↔character（marriage/divorced/master_apprentice/enemy/friends/lovers/rivals/family/mentor）；character→location（lives_in/stays_at/visits）；character→item（owns/uses/lost/destroyed）；character→faction（belongs_to/leads）；character→skill（masters，valid_from=学会章节）；event→实体（involves）；event→event（causes/follows）。

### 3.5 状态切片（复用 lw_entity_state_snapshots）
唯一键 (projectId, entityType, entityId, chapterNumber) 与 upsert 已存在。**现状缺口**：generateChapter 只查 character/location 状态（getEntityStateAtChapter），流水线要覆盖 item/skill/faction。

### 3.6 时间线模型
- stateAt(entityType, entityId, chapterNumber) 原语 = 封装现有 `LwEntityStateRepository.getEntityStateAtChapter`（≤N 最新切片）。
- edgesAt(entityId, chapterNumber)：valid_from<=N AND (valid_until IS NULL OR valid_until>=N)。
- **回忆注入**：generateChapter 现已在角色/地点完整信息里注入 `getEntityStateAtChapter(chapterNumber-1)` 切片——回忆注入是同一机制向"回忆时间点 R"的扩展。

## 4. 数据设计（迁移）

### 4.1 新增迁移 create-lw-graph-tables.ts（模板：create-lw-vector-indices.ts）
- lw_events + lw_graph_edges 双端 DDL（SQLite/PG 幂等）；实体类 LwEventEntity/LwGraphEdgeEntity 注册 entities/index.ts；Repository：lw-event / lw-graph-edge（BaseRepository + scoped 多租户）。
- 注册 electron runMultiTenantMigrations + web initDatabase。

### 4.2 项目表加列
- lw_projects 加 `wizard_state` TEXT（JSON `{skipped: string[]}`）——**含 LwProjectEntity 修改 + DTO/类型更新**（v1 遗漏 entity 修改步骤）。
- 旧项目无列 → 按数据存在性回推。

### 4.3 character_relation 收编
- 迁移将 lw_character_relations 行写入 lw_graph_edges（source/target_type=character、relation_type=原值、valid_from_chapter=1）。
- 原表保留（现有 CharacterStage 的 getCharacterRelations/createCharacterRelation IPC 继续可用）；新代码走边表。

## 5. 前端向导设计

### 5.1 步骤定义表（表名已修正）

| Step | key | 标题 | 完成判定（数据存在性 count IPC） | 生成 API（流式） | 输出写入 |
|---|---|---|---|---|---|
| 0 | idea | 创意起点 | lw_story_overviews.summary 非空 | generateStoryOverview（蓝图 prompt 措辞调整，复用现返回字段） | lw_story_overviews（isLocked=true） |
| 1 | characters | 人物设计 | lw_story_characters 有数据 | generateCharacters（requirements 透传 + 注入 plot 摘要 + 已有角色列表） | lw_story_characters（批量） |
| 2 | world | 世界设定（可选） | background/location/faction/skill 任一有数据 或 在 wizard_state.skipped | **复用 BackgroundStage / SkillItemStage 现有组件**（含 polishBackground/generateLocations/generateFactions/generateSkillsItems） | lw_story_backgrounds / lw_story_locations / lw_project_factions / lw_story_skills / lw_story_items |
| 3 | plot | 故事线 | lw_story_plots 有数据 | generatePlots（已注入完整上下文，无需增强） | lw_story_plots |
| 4 | outline | 故事大纲 | lw_story_outlines 叶子节点>0 | generateOutlineStory（**保留结构选择 1/2/3 级**；注入 plots 增强） | lw_story_outlines（串行 createOutline 或新增批量通道） |
| 5 | chapters | 逐章写作 | —（写作进度） | generateChapter + 章节确认流水线 | lw_story_chapters + 图谱更新 |

### 5.2 状态机（useWizardProgress.ts）
- 步骤顺序固定；已完成可回跳；下一步在"本步完成或已跳过"后激活。
- 完成判定：checkStep(key) 异步 count IPC（轻量，不全量拉取）。
- **进度持久化（v1 遗漏）**：每步完成时更新 lw_projects.stage + progress（现状 updateProgress 是 TODO）；wizard_state.skipped 记录跳过。
- 上下文汇总：buildContextForStep(step) 汇总已确认设定文本，供生成 prompt 与"上下文面板"展示。

### 5.3 组件清单（复用优先）
| 组件 | 职责 | 复用 |
|---|---|---|
| WizardContainer.vue | 步骤条+动态内容区+上一步/下一步+上下文面板+高级模式入口 | 新 |
| IdeaInputStep.vue | 创意大输入框（核心冲突引导）+可选参数折叠+蓝图生成/编辑/确认 | 新（生成/解析逻辑参照 OverviewStage） |
| CharacterDesignStep.vue | 蓝图草案→generateCharacters 细化→卡片编辑/确认→批量写入 | 新（确认对话框参照 CharacterStage） |
| WorldSettingStep.vue | 可选步骤容器 | **直接嵌入 BackgroundStage + SkillItemStage** |
| PlotDesignStep.vue | generatePlots→故事线卡片（排序/编辑/确认） | 新（参照 PlotStage，补"确认后入库"） |
| OutlineDesignStep.vue | 结构选择(1/2/3)→generateOutlineStory→**可编辑预览确认**（替代 ElMessageBox）→建树 | 新（参照 OutlineStage；"采纳"与"清空现有"解耦） |
| ChapterWizardStep.vue | 逐章流水线：写前校验→生成→确认→提取更新图谱（预写开关可选） | 改造 ChapterStage（复用其 80% 能力） |
| GraphView.vue | 图谱可视化（懒加载） | 新 |

### 5.4 高级模式入口
StoryEditor 保留现有 7 阶段界面为「高级」，右上角切换；向导与高级共享数据。阶段 3 重构：设定库（统一实体管理+关系入口+状态时间线+图谱入口）+ 创作台（大纲+章节流水线）+ 上下文面板（生成前展示注入设定，可勾选 include/exclude，对齐 ContextManifest 能力）。

### 5.5 统一生成基建（useAiGeneration.ts）
- 状态机 idle→generating→done/error；eventId 管理、取消、流式累积。
- parseJsonLoose：容错 JSON 解析（收敛各阶段重复实现）。
- **统一"生成→预览→确认→落库"流程**（现状 Plot 无确认/Character confirm/Background 勾选，不一致）。
- **cancel 通道**（现状前端假取消）：新增 longwriting:generate:cancel（主进程中断流式）。
- done 事件可携带服务端解析 data（可选优化，减少双端重复解析）。

### 5.6 图谱视图交互
同 v1：四类节点着色（人物蓝/地点绿/物品橙/势力紫/事件红）、力导向自绘 SVG（懒加载）、节点详情抽屉（状态时间线/关系/事件）、章节时间轴滑动、矛盾高亮。

## 6. 后端服务设计

### 6.1 GraphService（新增 src/core/services/longwriting/graph/graph.service.ts）
```
getGraph(projectId): GraphData
getNode(entityType, entityId): NodeInfo
resolveEntities(projectId, names[]): ResolvedEntity[]   -- 名称→ID 解析（v2 新增）
stateAt(entityType, entityId, chapterNumber): Slice      -- 封装 getEntityStateAtChapter
getTimeline(entityType, entityId): Slice[]
edgesAt(entityId, chapterNumber): Edge[]
getRelations(entityId, chapterNumber?): Edge[]
addEdge / updateEdge / deleteEdge
endRelation(edgeId, chapterNumber)
```

### 6.2 一致性校验服务（graph/consistency.service.ts）
- 写前校验 validateBeforeGeneration(projectId, outlineId)：取本章大纲 involved 实体 → stateAt + edgesAt → 规则检测 → Conflict[] → 前端弹窗。
- 矛盾扫描 scanContradictions(projectId)：规则表同 v1（R1 死亡后出场 / R2 关系失效 / R3 物品易主 / R4 技能时间线 / R5 回忆冲突(AI辅助) / R6 状态回退(AI辅助)）。
- **现状基础**：SYSTEM_PROMPT 已有 5 条"禁止"文案（禁止死亡角色出现/禁止技能初学/禁止物品首获/禁止忽略关系/禁止世界观冲突）——本服务把"文案约束"升级为"数据驱动检测"。

### 6.3 章节确认流水线（graph/chapter-graph.processor.ts）—— v2 大幅修订
章节确认后编排（**现状只自动做状态摘要；实体状态/新实体手动；recognize 死通道；向量索引未接写链路**）：

```
1. 落库：主进程生成完成后直接 saveChapter + 记 'generated' 版本   -- 现状：渲染端补存+'manual' → 改：主进程落库+'generated'
2. recognizeChapterEntities（复活死通道）：识别本章涉及实体（库内精确匹配）→ 回写大纲 involved
3. 新实体：detectNewEntities → 确认对话框（激活现状死代码）→ autoAddEntities
4. extractEntityStates → upsert 状态切片（覆盖 character/location/item/skill/faction）
5. extractChapterEvents（新增，见 6.4）→ 写 lw_events
6. 自动建边：事件→实体 involves；人物→地点活动；人物→物品持有；关系变化（AI 提取 relationChanges → 新边/endRelation）；全部先 resolveEntities
7. extractChapterStateSummary（现状已有）→ 保存
8. 向量索引自动接线（现状缺口）：indexChapter + indexMemory + indexEntity（serializeEntity 补 'event' 分支）
分步失败可重跑（每步独立提交）
```

### 6.4 LongWritingAIService 增强（v2 修订）
- **generateStoryOverview**：prompt 措辞调整为"故事蓝图"（引导输出核心冲突/主角草案），返回字段复用现结构。
- **generateCharacters**：注入 overview + plot 摘要 + 已有角色列表（防重复）；requirements 透传已有。
- **generatePlots**：**无需增强**（已注入完整上下文）。
- **generateOutlineStory**：注入 plots（现状只注入 overview+前5角色+eraDescription）。
- **generateChapter**：
  - **在手工 prompt 上增量**（ContextBuilder 完成列独立项）：新增"七、图谱关系与事件"段（本章涉及实体的生效边 edgesAt(chapterNumber) + 最近事件时间线摘要 + 关系有效期提示）。
  - 回忆注入：大纲节点标记"回忆/闪回"（summary 语义或用户标记）→ 注入 stateAt(回忆时间点 R) 切片 + "不得与当前时间线冲突"约束（现有 chapterNumber-1 机制的扩展）。
  - 通道签名扩展：补 style/extraPrompt（现状死参数）。
- **extractChapterEvents（新增）**：照抄现有四件套（AIService 方法 → handler CHANNELS+ipcBridge.handle → preload + channel-map → 前端保存通道）。参考 extractChapterStateSummary（正文截 6000、maxTokens ~1500-2048）。返回结构化事件数组。**recognizeChapterEntities 的 events: string[] 是最接近的现有输出**，可在其上结构化。向量侧 serializeEntity 补 'event' 分支。

### 6.5 IPC 新增通道（v2 修订）
| 通道 | 参数 | 返回 | 说明 |
|---|---|---|---|
| longwriting:graph:getGraph | projectId | {nodes, edges} | |
| longwriting:graph:getNode | entityType, entityId | NodeInfo | |
| longwriting:graph:resolveEntities | projectId, names[] | ResolvedEntity[] | v2 新增 |
| longwriting:graph:getTimeline | entityType, entityId | Slice[] | |
| longwriting:graph:getStateAtChapter | entityType, entityId, chapterNumber | Slice\|null | |
| longwriting:graph:getEdgesAtChapter | entityId, chapterNumber | Edge[] | |
| longwriting:graph:addEdge / updateEdge / deleteEdge / endRelation | 见上 | | |
| longwriting:graph:validateBeforeGeneration | projectId, outlineId | Conflict[] | |
| longwriting:graph:scanContradictions | projectId | Conflict[] | |
| longwriting:graph:extractChapterGraph | projectId, outlineId, chapterContent, chapterNumber, providerId?, modelId? | {events, states, edges} | 流水线一键 |
| longwriting:event:getByChapter / update / delete | | | |
| longwriting:wizard:getState / setSkipped | projectId | | |
| longwriting:generate:cancel | eventId | {success} | v2 新增（真取消） |
| longwriting:outline:batchCreate（可选） | projectId, nodes[] | {success} | v2 可选（大纲批量建树） |

## 7. 时序（关键流程，沿用 v1 并更新）
- 向导主流程：进入 → useWizardProgress 恢复（stage+skipped+数据存在性）→ 渲染当前步 → 操作 → checkStep → 持久化 progress/stage → 下一步。
- 章节闭环：点"生成本章"→ validateBeforeGeneration（冲突弹窗）→ generateChapter（注入图谱关系与事件段+回忆时间点）→ 流式 → 确认 → 流水线（落库'generated'+识别+新实体确认+状态+事件+建边+摘要+向量）→ 图谱更新。
- 回忆注入：大纲标记回忆 → 解析回忆时间点 R → 注入 stateAt(R) → R5 校验。

## 8. 错误处理与边界（v2 增补）
- 生成失败/中断：useAiGeneration 统一提示 + 可重试；cancel 通道真中断。
- 流水线分步失败可重跑；不阻断已确认章节。
- 实体删除级联清理边（高级模式）。
- **名称解析失败**：unresolved 实体跳过建边 + 校验提示（不静默）。
- 旧数据兼容：无切片/无边 → 校验返回空不误报；wizard_state 缺失 → 数据存在性回推。
- 多租户：新表全走 BaseRepository scoped。

## 9. 测试策略（v2 增补）
- 迁移：幂等/双端注册/character_relation 收编/列存在。
- repository：lw-event / lw-graph-edge CRUD + scoped。
- graph.service：getGraph union / resolveEntities（名称→ID/未解析）/ stateAt（≤N 最新）/ edgesAt 有效期 / endRelation。
- consistency：R1-R4 确定性规则各场景；R5/R6 AI mock。
- chapter-graph.processor：编排顺序/分步失败重跑/建边正确性（先 resolve）/向量接线。
- useWizardProgress：步骤判定/skipped 持久化/stage+progress 更新。
- useAiGeneration：状态机/取消（cancel 通道）/parseJsonLoose。
- prompt 串联：generateCharacters（注入 plot+已有角色）/generateOutlineStory（注入 plots）/generateChapter 图谱段/回忆注入。
- extractChapterEvents：四件套注册 + JSON 结构 + serializeEntity 'event' 分支。

## 10. 分阶段实施（计划见 plan 文档，v2 修订后）
- **阶段 0**：数据层（lw_events + lw_graph_edges + wizard_state 列含 entity 修改 + character_relation 收编 + repository + 迁移注册）。
- **阶段 1**：向导框架（useAiGeneration(含 cancel) → WizardContainer + useWizardProgress(含进度持久化) → 5 步骤组件(世界步骤复用现有) + ChapterWizardStep → StoryEditor 嵌入 + 高级入口 → 上下文串联增强：generateCharacters/generateOutlineStory）。
- **阶段 2**：图谱闭环（GraphService(含 resolveEntities) → 一致性校验 → 章节确认流水线(含落库'generated'/复活 recognize/新实体确认/事件提取/向量接线) → 回忆注入 → generateChapter 图谱段 → GraphView 懒加载）。
- **阶段 3**：高级模式重构（设定库+创作台+上下文面板+实体删除级联清理边）。
- **独立优化项**（不阻塞主线）：ContextBuilder 编排器完成 + generateChapter 切换（providers/compressor/token 已就绪）；generateChapter 通道补 style/extraPrompt；大纲批量建树通道；双 calculateChapterNumber 统一；done 事件携带 data。
