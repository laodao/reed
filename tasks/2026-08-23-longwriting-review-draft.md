# 长文写作 spec/plan 深度 Review —— 第一手代码核验记录（草稿，待子任务报告合并）

> 目标：对照现有代码逐一核验 spec（tasks/2026-08-23-longwriting-wizard-graph.spec.md）中的假设，
> 找出"拍脑袋/与代码不符/过度设计/遗漏"，修订 spec 与 plan。

## 一、AI 服务层核验（longwriting-ai.service.ts 第一手阅读）

### 1.1 各生成方法的上下文注入现状（直接影响 spec 6.4"上下文串联增强"）
| 生成方法 | 现状注入 | spec 增强是否必要 |
|---|---|---|
| generateStoryOverview (264) | 输入是前端拼的文本（类型/构思/风格/读者/篇幅/要求），返回 JSON：title/summary/coreConflict/keyCharacters/keyLocations/estimatedChapters | 蓝图字段已覆盖（缺"一句话概念"，可用 summary 承担）；prompt 措辞调整即可 ✓ |
| generateCharacters (389) | **仅注入 overview**（标题/类型/构思/摘要/冲突/关键角色草案/主要场景） | 增强有效：注入 plot 摘要 + 已有角色列表（防重复）✓ |
| generatePlots (1722) | **已注入完整上下文**：overview + characters（含性格）+ background（时代/社会/技术）+ locations + skills + items（含持有者） | **无需增强**（spec 原话"generatePlots 注入 characters+world"是错的，已实现）⚠️ |
| generateOutlineStory (748) | 仅注入 overview（title/coreTheme/summary/targetWords=预估章节×5000）+ 前 5 个角色 + background.eraDescription | 增强有效：注入 plots（故事线未参与大纲生成）✓ |
| generateChapter (1203) | **手工拼 prompt 六段**：宏观背景/章节任务/涉及角色完整信息(含 chapterNumber-1 状态切片)/涉及场景环境(含状态)/前文衔接(上一章结尾550字+衔接建议)/关键约束(记忆+实体状态+章节状态摘要+预写) | 增量扩展点：缺 item/skill/faction 状态、关系边、事件；有进度阶段提示 ✓ |

### 1.2 ContextBuilder 现状（**spec 6.4 最大假设错误**）
- `src/core/services/longwriting/context/` 下：context.types.ts（类型完备，LwContextItemType 已预留 graphEdge/timeline/foreshadow、ContextItem.source 已支持 'graph'|'timeline'）、context-prompt.ts（SYSTEM_PROMPT_TEMPLATE + renderUserPrompt 已实现）、providers/（11 个 provider 已写，含 entity-state/memory/vector-search）、context-token/context-compressor（预算工具）。
- **但 grep 全 src：没有任何 ContextBuilder 实例化、没有 build()/loadBuildContext()/buildFromManifest() 主编排实现，generateChapter 未接入 ContextBuilder**（1203-1431 是手工拼 prompt）。
- 结论：context/ 是"步骤1"预留的半成品，**spec 6.4"ContextBuilder 已插件化，新增 Provider 自动纳入编排"前提不成立**。
- 修订选项：
  a) 完成 ContextBuilder 主编排（build/loadBuildContext）+ generateChapter 接入——改动大，但 renderUserPrompt/SYSTEM_PROMPT/providers 已就位，迁移 generateChapter 手工段是机械功；
  b) 在 generateChapter 手工 prompt 上加"七、图谱关系与事件"段落——改动小、风险低，但 GraphEdge/Timeline provider 白写。
  - 建议：**阶段 2 采用 (b) 增量 + 把 (a)（ContextBuilder 接入）列为独立优化项**，避免大重构阻塞主线。

### 1.3 写前校验现状（spec 6.2）
- **不存在数据驱动校验**。SYSTEM_PROMPT 里只有 5 条"禁止"文案（禁止已死亡角色出现/禁止技能初学/禁止物品首获/禁止忽略关系/禁止世界观冲突）——纯 prompt 约束。
- spec 的"写前校验 + 矛盾扫描"是从 0 到 1，方向正确，且 SYSTEM_PROMPT 禁忌文案正好与 R1-R4 规则对应（文案→数据驱动升级）。

### 1.4 写后提取现状（spec 6.3 流水线）
- extractMemories (2255)、extractEntityStates (2412)、recognizeChapterEntities (2607)、extractChapterStateSummary (2731) 四个 AI 方法齐全。
- **前端自动触发的只有 extractChapterStateSummary**（ChapterStage.handleChapterGenerated：saveChapter → extractChapterStateSummary → saveChapterStateSummary）；extractEntityStates/recognizeChapterEntities/记忆提取是**手动按钮**。
- recognizeChapterEntities 输出已含 **events: string[]**（事件简述）——事件提取概念已预留，spec 的 EXTRACT_EVENTS 可在其基础上结构化。
- extractEntityStates 输入 involvedEntities（{type,id,name}）+ 自动取上一章状态对比，输出 stateSummary/keyChanges——**spec 流水线第 2 步直接复用**。

### 1.5 时间切片查询（spec 6.1 stateAt 原语）
- `LwEntityStateRepository.getEntityStateAtChapter(projectId, entityType, entityId, chapterNumber)` **已存在**（≤N 最新切片）。
- generateChapter 已用它注入"上一章时间点"状态（chapterNumber-1）——**时间线注入思路与现有实现一致**，spec 的回忆注入是其扩展。

## 二、数据层核验
- LwProjectEntity 无 wizard_state 列 → 需 entity 修改 + 迁移 ensureColumn + DTO/类型更新（spec 4.2 需补 entity 修改步骤）。
- lw_character_relations 存在（无时间线字段）→ 收编设计成立。
- lw_story_plots 有 involved_characters/involved_locations（simple-json）+ lw_plot_characters/lw_plot_locations 关联表（双写）→ plot 结构化程度比 spec 假设高。
- 迁移模板 create-lw-vector-indices.ts（SQLite/PG 双 DDL、幂等、ensureIndex）→ 新表照此。

## 三、前端核验（待子任务报告补全）
- OutlineStage.generateOutline：**先选结构层级(1/2/3) → generateOutlineStory(structureLevel) → showOutlineConfirm(建议大纲弹窗) → createThreeLevelOutline 等批量建节点**——向导 Step 4 应保留此交互，spec"一键生成大纲树"表述需修正。
- ChapterStage：生成→done 后自动 save+提取章节状态摘要；自动保存 3s 防抖；一次性加载全部章节到内存。
- generatePlots 返回 {title, summary, involvedCharacters}（无三幕字段，prompt 要求起承转合）。
- DesignConversation/DesignMessage：前端零引用（预留废弃能力），spec 无需考虑。
- 预写（prewrite）：OutlineStage 与 ChapterStage 都有入口，confirmPrewriteAndExtract 确认后提取记忆——降级为可选时需收敛入口。

## 四、待子任务报告确认项
- story 四阶段组件（Plot/Background/Character/SkillItem）功能细节、生成调用、可复用点
- ChapterStage 全文状态机（生成对话框/预写/记忆/状态/新实体/版本/导出）
- 后端 repository/context providers 完整清单
- 评论类（CommentEditor/comment 三阶段）+ 大纲树交互 + 导出/设置对话框

## 五、子任务 A 报告要点（story 四阶段组件）

### 5.1 共性（spec 阶段 1 直接受益）
1. 流式生成监听/累积/卸载逻辑 4 组件各写一份 → useAiGeneration 复用价值确认。
2. JSON 解析（``` 剥离+正则抓取+控制字符清理）各写一份；**主进程已解析但 done 事件不带 data，前端重复解析** → 可让 done 携带 data 或抽共用工具。
3. 确认流程不一致：Plot 直接入库 / Character、SkillItem confirm 后全添加 / Background 勾选采纳 → 向导步骤应统一"生成→预览→确认→落库"。
4. **进度值全部写死且父组件 updateProgress 只 console.log（未写 lw_projects.progress）** → 向导进度持久化是新增工作（spec 未提，需补：向导步骤完成时更新 lw_projects.progress/stage）。
5. cancelGeneration 均只清前端状态，无真正中断通道。
6. 组件体积巨大（641-1936 行），单文件多职责 → 阶段 3 高级模式重构方向正确。

### 5.2 对图谱设计的直接影响（重要）
- **角色关联存"名称"而非 ID**：PlotStage 的 involvedCharacters 存角色名称字符串，lw_plot_characters/lw_plot_locations/lw_skill_characters 关联表只在传 ID 时写入（前端多传名称 → 关联表形同虚设）。
- **图谱边必须基于实体 ID**（source_id/target_id），spec 需明确：图谱建边前做"名称→ID 解析"（按 projectId 内实体名称匹配），或在向导/高级模式落库时统一改存 ID。
- BackgroundStage 势力关联已用"名称匹配 locationId"模式（adoptSelectedFactions 按 suggestedLocationName 匹配）——可复用此模式。

### 5.3 各组件可复用点
- BackgroundStage：AI 生成结果"勾选采纳"对话框模式（地点/势力）值得作为向导世界设定步骤的交互模板。
- CharacterStage：AI 生成 confirm 后逐条 createCharacter（含成功/失败统计）；重新生成模式（第一条覆盖）；人像关联流程（CreateCharacterDialog 复用）。
- SkillItemStage：类型/等级配置 CRUD 完整（lw_project_skill_types/levels 等 4 表）。
- PlotStage：vuedraggable 拖拽排序 + reorderPlots（失败回滚）。

### 5.4 DesignConversation 专项结论
- **前端/IPC 完全未接线**：无 IPC 通道、无渲染层引用；仅后端表/仓库/旧数据迁移存在（LwDesignMessageRepository：getByConversationId/add/batchAdd/replaceAll/delete/migrateFromJson）。
- 结论：spec 无需考虑；如未来做"对话式设计助手"可启用（向导步骤确认面板是天然入口），本轮不做。

## 六、子任务 B 报告要点（ChapterStage 全文）

### 6.1 表名修正（spec 错误）
- 章节表是 **`lw_story_chapters`**（不是 lw_chapter）；版本表 `lw_chapter_versions`（保留 20 未锁定版本）；预写表 `lw_chapter_prewrites`；记忆 `lw_story_memories` + `lw_memory_entities`；状态快照 `lw_entity_state_snapshots`；章节状态摘要 `lw_chapter_state_summaries`；大纲 `lw_story_outlines`（按 order_index 排序）。
- spec §5.1 步骤表"输出写入 lw_chapter"需修正为 lw_story_chapters。

### 6.2 落库与版本（spec 6.3 流水线改造点）
- **AI 生成不落库**：主进程只流式返回，渲染端 done 后 saveChapter；**所有版本一律 'manual'，'generated' 类型从未写入**。
- 流水线改造：主进程生成完成后直接落库 + 记 'generated' 版本（而非渲染端补存 + 'manual'）。

### 6.3 预写位置（spec 修正）
- **预写在 OutlineStage（第六步），不在 ChapterStage**；只在 `nodeType==='section'` 节点上做。
- `confirmPrewriteAndExtract`：先 savePrewrite → extractMemories（AI 返回不落库）→ 确认对话框（可编辑每条记忆）→ batchCreateMemories → confirmPrewrite(isConfirmed=1)。
- ChapterStage 生成对话框只读展示预写；generateChapter prompt 自动注入预写。
- 降级为可选时：入口收敛到章节流水线，复用现有 extractMemories+确认对话框模式。

### 6.4 写前一致性现状（spec 6.2 确认）
- **无任何生成前校验/警告/阻断**：startGenerate 只检查模型；一致性全是提示词软约束（记忆/实体状态/上一章摘要注入 + systemPrompt 5 条禁忌）。
- 写前校验引擎（新服务）是**从 0 到 1**，spec 6.2 方向正确且确属缺失。

### 6.5 新实体检测现状（spec 6.3 流水线重要修正）
- **RECOGNIZE_CHAPTER_ENTITIES 是死通道**（无渲染端调用）；ChapterStage"检测到新实体"对话框是死代码（showNewEntitiesDialog 从未置 true）。
- 实际路径：extractEntityStatesFromChapter 第 1 段 detectNewEntities → **autoAddEntities 直落库**（无确认对话框，只弹 ElMessage）。
- 流水线改造：激活"检测→确认→落库"（复用 OutlineStage 记忆确认模式），而非现在直接落库。

### 6.6 其它改造点
- `generateForm.style` 与 `extraPrompt` 是**死参数**（executeGeneration 与 IPC 签名都没带）→ 扩展 generateChapter 通道签名 + AI service 注入。
- `cancelGenerate` 假取消（无 IPC、不退订、主进程继续流式）→ 补 cancel 通道。
- `calculateChapterNumber` 渲染端/主进程**双实现** → 统一。
- 章节状态摘要（自动）与实体状态快照（手动）**两套并存机制** → 流水线应统一编排。
- `LOCK_CHAPTER_VERSION` 通道存在但无 UI。
- 版本/导出/自动保存（3s 防抖）可直接复用。

## 七、子任务 C 报告要点（后端服务层）

### 7.1 ContextBuilder 半成品最终确认（三份报告一致）
- 类型层完备（ContextProvider 接口/BuildContext/priority/source 含 graph|timeline/LwContextItemType 预留 graphEdge|timeline|foreshadow），10 个 Provider + context-prompt + context-compressor + context-token 全实现，但 **build()/loadBuildContext() 编排器不存在，全部死代码（无 import）**，generateChapter 走旧手工路径。
- **spec 6.4 假设修正**：GraphEdgeProvider/TimelineProvider 需要挂载点——要么先实现 ContextBuilder 编排层（含 loadBuildContext 一次性加载 BuildContext 全部字段）并把 generateChapter 切到 ContextBuildOutput，要么在手工 prompt 上增量。**推荐后者（低风险）**，ContextBuilder 完成列独立优化项。

### 7.2 新增 extractChapterEvents 四件套（spec 6.3 落地指引）
- 照抄模式：LongWritingAIService 方法（eventId/查参考数据/callAIStream/JSON 容错）→ handler CHANNELS + ipcBridge.handle → preload/index.ts + web/client/channel-map.ts → 前端保存通道。
- 向量侧：`LwVectorEntityType` 已有 'event'；`lw-vector-serializer.ts` 的 serializeEntity 需补 'event' 分支（当前会抛"不支持的 entityType"），或先复用 'memory' 通道。

### 7.3 遗漏的既有能力（spec 需补充）
- **向量索引未接入写链路**：indexEntity/indexChapter/indexMemory 只在全量重建 + 3 个 IPC（rebuildProject/search/stats）触发；章节保存/记忆创建不自动索引。→ spec 6.3 流水线第 6 步应明确"自动索引"是**新增接线**（不是复用现有自动行为）。
- recognizeChapterEntities 的 events: string[] 是最接近事件提取的现有输出（未结构化、未落库）。
- LwEntityDetectionService.detectNewEntities 可作新实体检测补充（已被 recognize 内部调用）。
- generateChapter 现有覆盖缺口：involvedItems/plots/factions/skills/materials/characterRelations 未注入。

### 7.4 generateChapter 手工路径全貌（第一手+子任务确认）
读 lwOutlines/lwStoryOverviews/lwCharacters/lwLocations/lwBackgrounds + getTreeByProjectId 前 3 sibling + 上一章正文 550 字 + getMemoriesBeforeChapter（importance 分组：critical 全/normal 前10/minor 后5）+ getLatestBeforeChapter + getEntityStateAtChapter(chapterNumber-1)（角色/地点）+ buildCharacterFullInfo/buildLocationFullInfo + getByOutlineId(prewrite) + calculateStoryProgressStage。6+1 段 prompt，systemPrompt 与 context-prompt SYSTEM_PROMPT_TEMPLATE 逐字节一致。

## 八、子任务 D 报告要点（评论类/大纲/通用组件）

### 8.1 评论类现状（本轮不动，确认）
- 3 阶段 topic/outline/chapters；topic 复用 lw_story_overviews（title/coreTheme←coreArgument/estimatedWords）+ lw_story_materials（file/url/manual 素材，异步处理）。
- **无顶部模型选择、AI 调用不传模型**（后端兜底默认提供商第一模型）→ 评论类明显短板，本轮不动。
- comment ChapterStage 用 generateSection（素材驱动，`relevantMaterials = outline.involvedCharacters?.includes(m.id) || indexOf<3` 取前 3 条各 500 字，**滥用了 involvedCharacters 存素材引用**）。
- 导出 ExportDialog：**仅 markdown/word 两种**；txt/pdf/image/scope/selectedItems 是类型残留未实现。

### 8.2 大纲生成交互（spec Step 4 修正）
- 故事类：结构选择弹窗(1/2/3 级) → generateOutlineStory（level 3 时两轮 AI：卷→逐卷章/节，emit progress）→ ElMessageBox 整体确认 → 串行 createOutline（level 1/2/3 分派，全部 status pending、无事务）。
- 向导 Step 4 建议：复用结构选择（默认 3 级）+ 向导内置**可编辑大纲预览确认**（替代 ElMessageBox）；**"采纳建议"与"清空现有大纲"解耦**（评论类 OutlineStage 采纳时会先清空再重建，破坏性，向导不做）；可选新增 batchCreateOutlines（现无批量创建通道，保持串行 createOutline 但注意无事务）。

### 8.3 表名修正（spec 3.1/5.1 数据源表名）
- 正确表名：lw_projects、lw_project_model_configs、lw_story_overviews、lw_story_backgrounds、lw_story_locations、**lw_project_factions**、**lw_project_maps**、lw_story_plots、lw_story_characters、lw_character_relations、lw_story_skills、lw_story_items、lw_story_outlines、**lw_story_chapters**、lw_chapter_versions、lw_story_materials、lw_chapter_prewrites、lw_story_memories、lw_memory_entities、lw_entity_state_snapshots、lw_chapter_state_summaries、lw_outline_characters/locations/items、lw_project_skill_types/item_types/skill_levels/item_levels。
- spec 中"lw_chapter""lw_story_factions""lw_story_maps"需修正。

### 8.4 模型配置（spec 阶段 3 上下文面板基础）
- ProjectSettingsDialog：步骤模型配置存 lw_project_model_configs（UNIQUE(project_id,stage)，upsert id=`modelconfig_${projectId}_${stage}`）；storyStages 硬编码 7 项；评论类无此入口。

## 九、Review 总结论（spec 需修订项汇总）

### 9.1 假设错误（必须改）
1. **ContextBuilder 已插件化** → 实际无编排器、generateChapter 未接入；改为手工 prompt 增量 + ContextBuilder 列独立项。
2. **表名**：lw_chapter→lw_story_chapters、lw_story_factions→lw_project_factions、lw_story_maps→lw_project_maps。
3. **generatePlots 需增强** → 已注入完整上下文，删除该项。
4. **"写后提取流水线复用现有自动机制"** → 现状前端只自动做章节状态摘要；实体状态/新实体是手动；recognize 是死通道；向量索引未接写链路。流水线大部分是**新增编排**。
5. **新实体"检测→确认→落库"** → 现状是 autoAddEntities 直落库（无确认）；需激活确认对话框。

### 9.2 假设成立（确认）
6. stateAt 原语 = 封装现有 getEntityStateAtChapter。
7. 提取 API 模式可复制（四件套）→ extractChapterEvents 照抄。
8. 时间线切片注入思路与现有 generateChapter（chapterNumber-1）一致，回忆注入是其扩展。
9. lw_entity_state_snapshots 唯一键 (projectId, entityType, entityId, chapterNumber) + upsert 已有 → 状态切片写入直接复用。
10. character_relation 收编成立（现表无时间线字段）。

### 9.3 遗漏（spec 需补充）
11. 向导进度持久化（现状 updateProgress 是 TODO，lw_projects.progress 从未更新）→ 每步完成持久化 progress+stage。
12. 名称→ID 实体解析（前端多处存名称，关联表形同虚设；图谱边必须 ID）→ graph service 提供 resolveEntities(projectId, names)。
13. 向量索引自动接线（章节保存/记忆创建/事件提取后触发 indexChapter/indexMemory/indexEntity）。
14. 大纲批量建树通道（可选）+"采纳与清空解耦"。
15. generateChapter 通道扩展（style/extraPrompt 死参数修复，可选）。
16. cancel 通道（生成中断）。
17. DesignConversation 明确非目标（仅数据层，无 AI 服务/无 IPC）。
18. 评论类非目标确认 + 记录其短板（无模型选择/滥用 involvedCharacters）。
19. recognizeChapterEntities.events 结构化复用 → extractChapterEvents 设计参考。
20. serializeEntity 需补 'event' 分支（或先复用 'memory' 通道）。
