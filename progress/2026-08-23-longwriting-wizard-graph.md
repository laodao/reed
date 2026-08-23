# 2026-08-23 长文写作「向导式 + 图谱一致性」改造完成

> 关联计划：tasks/2026-08-23-longwriting-wizard-graph.md（plan v2）
> 详细设计：tasks/2026-08-23-longwriting-wizard-graph.spec.md（spec v2）
> 深度 review 记录：tasks/2026-08-23-longwriting-review-draft.md

## 背景与目标
把长文写作从"7 阶段平铺"改造成向导式流程（创意→人物→世界→故事线→大纲→章节），
并新增图数据（SQLite 边表）保存人物/物品/地点/事件及其时间线，
构建「写前校验 → 写中注入 → 写后提取」一致性闭环，杜绝前后不一致。
开发前对现有代码做了深度 review（4 个子任务并行精读 1 万+ 行前端 + 后端服务层），
发现并修正了 3 个假设错误（ContextBuilder 半成品/表名/生成 API 注入现状），详见 review 文档。

## 交付内容（7 个 commit，按阶段）

### 阶段 0：数据层（89369b2f）
- lw_events（故事事件节点，chapter_number 时间线锚点）+ lw_graph_edges（关系边，valid_from/valid_until_chapter）
- lw_projects.wizard_state 列；character_relation 收编迁移（幂等，原表保留兼容）
- LwEventRepository / LwGraphEdgeRepository（scoped 多租户 + getActiveEdgesAtChapter 时间线查询 + endRelation + deleteByEntity 级联）
- 迁移注册 electron runMultiTenantMigrations + web initDatabase；manager 装配双端

### 阶段 1：向导（375959ed / aa9b1610）
- useAiGeneration（统一流式状态机 + cancel + parseJsonLoose 容错解析）；useWizardProgress（6 步状态机：完成判定/skipped/stage 恢复/进度/持久化）
- WizardContainer + 6 步骤组件（创意蓝图/人物/世界[复用现有]/故事线/大纲[结构选择+预览确认]/章节）
- StoryEditor 默认进向导，右上角"高级"保留完整功能（数据共享双向切换）
- prompt 串联增强：generateOutlineStory 注入故事线、generateCharacters 注入故事线+已有角色

### 阶段 2：图谱一致性闭环（cecbd3bb / 6cfccaf0）
- GraphService（getGraph 节点 union / resolveEntities 名称→ID / stateAt 时间切片 / edgesAt 生效边 / 边 CRUD / endRelation）
- ConsistencyService（写前校验[目标章节时间点状态检测] + 矛盾扫描 R1-R6：死亡后出场/关系失效同框/物品易主/技能时间线/回忆标记/状态回退）
- ChapterGraphProcessor（章节确认流水线：事件提取→落库[名称解析]→状态切片→自动建边 involves→章节摘要，分步容错）
- extractChapterEvents（四件套：AIService + handler + preload + channel-map）；generateChapter 增加"图谱关系与事件"段 + 回忆场景提示；cancelGeneration（AbortController 真中断）
- GraphView（懒加载力导向 SVG + 章节时间轴 + 节点详情）；ChapterWizardStep 写前校验冲突弹窗 + 保存后流水线接线

### 阶段 3：高级模式重构（9dd066eb / 179a5a4f）
- SettingsLibrary（设定库：概要/故事线/世界/人物/技能物品 Tab 统一管理 + 图谱入口）
- WritingWorkbench（创作台：大纲树管理 + 章节编辑 + 写前校验 + 流水线 + 上下文面板）
- 实体删除级联清理图谱边（DELETE_CHARACTER/LOCATION/ITEM）
- StoryEditor 高级模式改为工作台切换（设定库/创作台）

## 测试与验证
- **新增单测 77/77 全过**：lazy-libs 7 + useChat 4 + useAiGeneration 14 + useWizardProgress 12 + graph 8 + consistency 9 + processor 4 + lw-graph repository 11 + 迁移 4 + 阶段 0 相关 4
- **CDP 实测**（每阶段）：
  - 向导：6 步渲染、完成态判定（数据存在性）、高级模式双向切换
  - 图谱接口：graphGet/resolveEntities/validate/scan/wizard/eventByChapter 全通
  - GraphView：SVG 力导向渲染、节点详情、章节时间轴
  - 创作台：设定库 Tab、上下文面板（蓝图·4 人物）、图谱 4 节点
- 生产库迁移执行成功（create-lw-graph-tables 就绪、长文 handler 含新通道注册成功）
- 全量回归：失败数与基线一致（差异为环境性超时与本地无 PG 服务，经未改动测试交叉验证）

## 备注
- 深度 review 发现：ContextBuilder 是"半成品骨架"（类型/10 Provider/prompt 渲染已就绪，编排器缺失、generateChapter 未接入）→ 图谱段注入采用手工 prompt 增量方案；ContextBuilder 完成+接入列为独立优化项（tasks 文档）
- 设计对话（DesignConversation）仅有数据层，明确为非目标
- 评论类项目本轮不动（短板已记录）
