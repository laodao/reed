# 长文写作「向导式 + 图谱一致性」开发计划（v2，经深度 review 修订）

> 状态：方案与详细设计（spec v2）已定稿
> 日期：2026-08-23
> 详细设计：tasks/2026-08-23-longwriting-wizard-graph.spec.md（v2，含 §0 review 修正表）
> Review 记录：tasks/2026-08-23-longwriting-review-draft.md
> 完成后写：progress/2026-08-23-longwriting-wizard-graph.md

## 关键决策（v2 确认）
- 图谱主存储 SQLite（lw_events + lw_graph_edges + 复用实体表/状态快照）；YAML 仅作导出视图
- 时间线以 chapter_number 为全局时间单位；边带 valid_from/valid_until_chapter；状态切片=EntityStateSnapshot
- 预写默认流程去除、保留手动可选；写后识别强化为"章节确认流水线"
- 向导 6 步：创意冲突 → 人物 → 世界(可选) → 故事线 → 大纲 → 逐章
- 高级模式保留，阶段 3 重构为「设定库 + 创作台」
- **图谱边必须实体 ID → GraphService.resolveEntities 名称解析（review #9）**
- **ContextBuilder 是半成品（review #1）→ 阶段 2 在 generateChapter 手工 prompt 增量，ContextBuilder 完成列独立优化项**
- **向导进度持久化（review #8）→ 每步完成写 lw_projects.stage+progress**
- 正确表名：lw_story_chapters / lw_project_factions / lw_project_maps（review #2）

---

## 阶段 0：数据层（前置，无 UI）
- [ ] `create-lw-graph-tables.ts` 迁移：lw_events + lw_graph_edges 双端 DDL（SQLite/PG 幂等，模板 create-lw-vector-indices.ts）
- [ ] 实体类 LwEventEntity / LwGraphEdgeEntity → entities/index.ts 注册
- [ ] Repository：lw-event / lw-graph-edge（BaseRepository + scoped 多租户）
- [ ] lw_projects 加 wizard_state TEXT 列（幂等 ensureColumn + **LwProjectEntity 修改 + DTO/类型更新**）
- [ ] character_relation 收编迁移（→ lw_graph_edges valid_from=1，原表保留兼容）
- [ ] 迁移注册 electron runMultiTenantMigrations + web initDatabase
- [ ] TDD：迁移幂等/收编、repository CRUD、多租户 scoped
- 验证：新增用例绿；`tsc -p tsconfig.node.json` 绿

## 阶段 1：向导框架（前端重构，复用现有生成 API）
- [ ] `useAiGeneration.ts`：统一生成基建（流式/eventId/**cancel 通道**/parseJsonLoose 容错）+ 统一"生成→预览→确认→落库"流程
- [ ] `useWizardProgress.ts`：步骤定义/完成判定（数据存在性 count IPC）/skipped 持久化/stage 恢复/**progress+stage 持久化**
- [ ] `WizardContainer.vue`：步骤条 + 动态内容区 + 上一步/下一步 + 上下文面板 + 高级模式入口
- [ ] `IdeaInputStep.vue`：创意大输入框（核心冲突引导）+ 可选参数折叠 + 蓝图生成（generateStoryOverview prompt 措辞调整）→ 确认写 overview
- [ ] `CharacterDesignStep.vue`：蓝图草案 → generateCharacters 细化 → 卡片编辑/确认 → 批量写 lw_story_characters
- [ ] `WorldSettingStep.vue`（可选）：**直接嵌入 BackgroundStage + SkillItemStage**（不重复造轮子）
- [ ] `PlotDesignStep.vue`：generatePlots → 故事线卡片（排序/编辑/确认后入库）
- [ ] `OutlineDesignStep.vue`：**结构选择(1/2/3) → generateOutlineStory → 可编辑预览确认（替代 ElMessageBox）→ 建树**（"采纳"与"清空现有"解耦）
- [ ] `ChapterWizardStep.vue`：逐章流水线骨架（写前校验(桩) → 生成 → 确认 → 提取(桩)），预写开关可选
- [ ] StoryEditor.vue：嵌入向导壳 + 保留高级模式入口
- [ ] 上下文串联增强（AI 服务）：generateCharacters 注入 plot+已有角色；generateOutlineStory 注入 plots（**generatePlots 无需动**）
- [ ] TDD：useWizardProgress 判定/skipped/进度持久化、useAiGeneration 状态机/cancel、prompt 注入断言
- 验证：CDP 走通向导 6 步完整路径；单测绿；无新增 vue-tsc 错误类

## 阶段 2：图谱一致性闭环（核心）
- [ ] `graph.service.ts`：getGraph / getNode / **resolveEntities** / stateAt(封装现有 getEntityStateAtChapter) / getTimeline / edgesAt / addEdge / updateEdge / deleteEdge / endRelation
- [ ] `consistency.service.ts`：validateBeforeGeneration（写前校验）+ scanContradictions（R1-R6 规则，**SYSTEM_PROMPT 禁忌文案升级为数据驱动检测**）
- [ ] `chapter-graph.processor.ts`：章节确认流水线（**主进程落库'generated'版本 → 复活 recognize → 新实体确认对话框 → extractEntityStates(覆盖4类实体) → extractChapterEvents → 建边(先 resolve) → extractChapterStateSummary → 向量索引自动接线**），分步失败可重跑
- [ ] `extractChapterEvents` AI 提取（四件套：AIService + handler CHANNELS + preload/channel-map + 前端保存；**serializeEntity 补 'event' 分支**）
- [ ] 回忆时间点注入（stateAt(recallChapter) + R5 校验）
- [ ] generateChapter 手工 prompt 增量：新增"图谱关系与事件"段（edgesAt + 事件时间线摘要）
- [ ] IPC：graph:*/event:*/wizard:*/generate:cancel 通道注册（见 spec 6.5）
- [ ] `GraphView.vue`（懒加载）：力导向 + 节点详情抽屉（状态时间线/关系/事件）+ 章节时间轴 + 矛盾高亮
- [ ] 章节写前校验前端接入（冲突弹窗确认）
- [ ] TDD：graph.service 查询原语/名称解析、一致性规则各场景、流水线编排（含向量接线）、事件提取 mock
- 验证：CDP 端到端——写两章后查图谱节点/边/事件/切片；把已死亡角色加入后续大纲 → 校验拦截；图谱视图懒加载性能

## 阶段 3：高级模式信息架构重构
- [ ] 设定库：人物/地点/势力/技能物品/地图统一实体管理（卡片+表格+关系入口+状态时间线+图谱入口）
- [ ] 创作台：大纲+章节流水线（生成→确认→提取 单条流，提取结果内联）
- [ ] 上下文面板（生成前展示将注入设定，可勾选 include/exclude——对齐 ContextManifest 能力）
- [ ] 实体删除级联清理边（高级模式）
- [ ] 回归：导出/向量索引/@引用/预写/记忆等既有能力不破坏
- 验证：全量回归失败数不增；CDP 高级模式与向导双向切换数据一致

## 独立优化项（不阻塞主线，按需排期）
- [ ] ContextBuilder 编排器完成（build/loadBuildContext）+ generateChapter 切换（providers/compressor/token 已就绪）
- [ ] generateChapter 通道补 style/extraPrompt（现状死参数）
- [ ] 大纲批量建树通道 longwriting:outline:batchCreate（可选）
- [ ] 双 calculateChapterNumber 统一（渲染端/主进程）
- [ ] done 事件携带服务端解析 data（减少双端重复 JSON 解析）

## 验证与交付
- 每阶段：TDD 单测 + `tsc -p tsconfig.node.json` + CDP 实测
- 交付：4 个 commit（阶段 0/1/2/3 各一）+ progress 文档
- 风险：迁移兼容（character_relation 双读）、多租户 scoped、图谱视图性能（懒加载+索引）、名称→ID 解析遗漏（unresolved 提示不静默）、流水线失败重跑
