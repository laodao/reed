# 长文写作优化 - 实施步骤规划

> 版本：v1.0
> 日期：2026-07-31
> 关联：[总 Spec](./2026-07-31-longwriting-optimization-spec.md)、[调研报告](./2026-07-31-longwriting-quality-research.md)
> 说明：本文档包含对总 Spec 的 review 结论 + 8 步实施划分。每步配套独立 spec + plan。

---

## 一、总 Spec Review 结论

对 `2026-07-31-longwriting-optimization-spec.md` 逐条审查，发现以下需修正/补充的问题：

### 必须修正（违反铁律或有阻塞风险）

| # | 问题 | 影响 | 修正方向 |
|---|------|------|----------|
| R1 | **IVectorStore.searchSimilar 签名从位置参数改为对象参数，违反"API 只新增不破坏"铁律** | 现有 knowledge-base 所有调用方需改，Web/PC 双端 | 保留旧签名 `searchSimilar(knowledgeBaseId, queryVector, topK, opts?)`，**新增** `searchSimilarWithFilter(queryVector, opts)`；或 opts 同时容纳 knowledgeBaseId 与 filter，旧调用零改动 |
| R2 | **LanceDB schema 变更迁移方案过粗** | 旧知识库向量可能丢失 | 明确"懒迁移"策略：启动检测旧 schema → 新建 `vectors` 表（含新列）→ 旧数据按 `knowledgeBaseId` 保留，`projectId/entityType` 留空 → 长文检索用 `projectId IS NOT NULL` 天然隔离；不主动重 embedding 旧数据 |
| R3 | **ExtractionPipeline 在"章节保存后自动跑"会触发 6-8 次 AI 调用** | 自动保存防抖每次触发，成本高、打断写作 | 触发时机改为：①章节标记 completed ②手动触发 ③AI 生成完成保存后。自动保存只存正文，不触发提取 |
| R4 | **token 预算硬编码 32K 窗口** | 不同模型窗口差异大 | 从 `ProviderTemplate`/`ModelDefinition.contextWindow` 动态读取，预留生成 token 后剩余给上下文；窗口未知时保守 16K |
| R5 | **CharacterRelation 与 graph_edges 双表镜像无一致性保障** | 双写易遗漏，数据漂移 | 明确**唯一写入入口**：所有关系写入走 `StoryGraphService`，它负责 CharacterRelation↔graph_edges 双写；查询时 CharacterRelation 专表优先，graph_edges 补全跨类型关系 |
| R6 | **lw_vector_indices 与 kb_chunks/kb_documents 关系未说清** | 长文向量可能误入知识库文档表 | 明确长文向量走"轻量路径"：向量入 IVectorStore，元数据入 `lw_vector_indices`，章节原文已在 `lw_chapters`，**不入 kb_documents/kb_chunks**；切片文本由 LwVectorIndexService 内存构建后即弃 |

### 应补充（设计缺失）

| # | 问题 | 补充方向 |
|---|------|----------|
| R7 | storyTimeEpoch 对"纪元 era"和"相对时间（翌日/数日后）"处理不足 | parseStoryTime 接受 `previousEpoch` 参数做相对推算；era 参与排序前缀 |
| R8 | ContextBuilder 的 forcedContext 编辑后 generateChapter 重复检索 | buildPreview 产出 manifest，generateChapter 接收 manifest 复用，不重新检索 |
| R9 | 章节重写时跨章节提取产物清理策略缺失（如伏笔回收指向） | 重写清理：删除该章 timeline/graph_edges/snapshot + 标记该章"回收"的伏笔回滚为 open；提供 `resetExtractionByChapter` |
| R10 | 一致性校验只提了一句，无设计 | 第三步明确：死亡角色出现检测、伏笔遗忘检测（超 expectedPayoffChapter 未回收）、时间冲突检测、设定矛盾检测 |
| R11 | 测试策略只在原则里提 TDD，无具体方案 | 每步 plan 含测试计划：core 层 service/repo 单测 + 迁移测试 + 集成测试 |
| R12 | Pinia store 范围过大（迁移 7 个 Stage 组件 ref） | 第一期 store 只管"新增能力状态"（上下文清单、图谱、时间线、快照），不强行迁移现有 Stage ref，避免大爆炸 |

### 可后续（不阻塞）

| # | 问题 | 处理 |
|---|------|------|
| R13 | 图遍历 spec 说"SQLite 用应用层两步查询"不准确 | SQLite/PostgreSQL 均支持 `WITH RECURSIVE`，统一用递归 CTE |
| R14 | 跨书设定共享未设计 | 标记为未来方向，本轮不覆盖 |
| R15 | snapshot 的 character_states 等 JSON 字段冗余 | snapshot 定位为"AI 自然语言快照"为主（overallSummary/nextLeads），结构化字段存 id 引用 + 摘要，详情走关联表查 |

---

## 二、实施步骤划分（8 步）

每步自包含：entity + repository + service + test + IPC + 前端（如需）。每步有独立 spec（详细设计）和 plan（实施计划）。

### 依赖关系图

```
步骤0 向量库基础设施
  │
  ├─→ 步骤1 ContextBuilder（MVP：向量+现有记忆/状态）
  │     │
  │     └─→ 步骤6 前端 store + 上下文预览面板
  │
  ├─→ 步骤2 ExtractionPipeline（从正文提取+向量入库）
        │
        ├─→ 步骤3 故事知识图谱（graph_edges + 遍历）─→ 步骤6/7
        ├─→ 步骤4 时间线引擎 ─→ 步骤7
        └─→ 步骤5 伏笔+快照+一致性校验 ─→ 步骤7

步骤7 前端可视化（图谱/时间线/快照）依赖 3/4/5/6
```

### 步骤总览

| 步骤 | 名称 | 目标 | 关键交付 | 修复 | 预估 |
|------|------|------|----------|------|------|
| 0 | 向量库基础设施 | IVectorStore 向后兼容扩展 + LanceDB 迁移 + LwVectorIndexService | 设定/章节可入库、可按元数据检索 | R1,R2,R6 | 3-4 天 |
| 1 | 智能上下文构建器 | ContextBuilder + 动态 token 预算 + generateChapter 重构 | 上下文按相关性检索+预算分配，maxTokens 放开 | R4,R8 | 4-5 天 |
| 2 | 从正文提取流水线 | ExtractionPipeline + 修正从正文提取 + 向量入库 + 重写清理 | 章节完成后自动提取，幂等可重试 | R3,R9 | 4-5 天 |
| 3 | 故事知识图谱 | lw_graph_edges + StoryGraphService + 递归 CTE 遍历 + CharacterRelation 扩展 | 关系图 CRUD + 1-2 跳遍历 + 统一写入入口 | R5,R13 | 3-4 天 |
| 4 | 时间线引擎 | lw_timeline_events + TimelineService + 结构化时间 + 冲突检测 | 时间线 CRUD + storyTime 归一化 + 冲突检测 | R7 | 3 天 |
| 5 | 伏笔+快照+一致性校验 | lw_foreshadows + lw_story_snapshots + 一致性校验 | 伏笔追踪 + 快照生成 + 死亡/遗忘/冲突检测 | R10,R15 | 4 天 |
| 6 | 前端 store + 上下文预览面板 | longwriting Pinia store + 上下文预览/编辑面板 | 上下文可见可控，forcedContext 注入 | R12 | 3-4 天 |
| 7 | 前端可视化 | 图谱视图 + 时间线视图 + 快照面板 | "设定集"落地，图谱/时间线/快照可视化 | - | 4-5 天 |

**总预估**：约 28-35 工作日（不含集成测试与调优）。

### 推荐推进顺序

- **第一批（写作质量 MVP）**：步骤 0 → 1 → 2 → 6。完成后写作质量立竿见影（语义检索 + 智能上下文 + 从正文提取 + 可预览）。
- **第二批（图谱与时间线）**：步骤 3 → 4 → 7（图谱/时间线部分）。
- **第三批（快照与一致性）**：步骤 5 → 7（快照部分）。

---

## 三、每步 spec + plan 文档清单

每步产出两份文档，命名规则：
- spec：`progress/longwriting-step{N}-{slug}-spec.md`
- plan：`progress/longwriting-step{N}-{slug}-plan.md`

| 步骤 | spec 文档 | plan 文档 |
|------|----------|----------|
| 0 | longwriting-step0-vector-infra-spec.md | longwriting-step0-vector-infra-plan.md |
| 1 | longwriting-step1-context-builder-spec.md | longwriting-step1-context-builder-plan.md |
| 2 | longwriting-step2-extraction-pipeline-spec.md | longwriting-step2-extraction-pipeline-plan.md |
| 3 | longwriting-step3-story-graph-spec.md | longwriting-step3-story-graph-plan.md |
| 4 | longwriting-step4-timeline-spec.md | longwriting-step4-timeline-plan.md |
| 5 | longwriting-step5-foreshadow-snapshot-spec.md | longwriting-step5-foreshadow-snapshot-plan.md |
| 6 | longwriting-step6-frontend-context-spec.md | longwriting-step6-frontend-context-plan.md |
| 7 | longwriting-step7-frontend-viz-spec.md | longwriting-step7-frontend-viz-plan.md |

本文档为总规划，评审确认后按顺序逐个产出各步 spec+plan，并进入实施。

---

## 四、评审要点

请重点确认：
1. 8 步划分与依赖关系是否合理
2. 推荐推进顺序（第一批 MVP：0→1→2→6）是否符合你的优先级
3. R1-R15 的修正方向是否认可（特别是 R1 向后兼容、R3 触发时机、R5 统一写入入口）
4. 是否有遗漏的步骤或需要合并/拆分的步骤
