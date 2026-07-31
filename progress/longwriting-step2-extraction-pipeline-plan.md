# 步骤 2 Plan - 从正文提取流水线 ExtractionPipeline

> 步骤：2 / 8
> 名称：ExtractionPipeline
> 日期：2026-07-31
> 依赖：步骤 0（LwVectorIndexService）、步骤 1（ContextBuilder 消费产物）
> 关联：[步骤2 Spec](./longwriting-step2-extraction-pipeline-spec.md)
> 预估：4-5 工作日

---

## 1. 任务拆解（TDD 顺序）

### 阶段 A：类型与接口（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| A1 | `src/core/services/longwriting/extraction/extraction.types.ts` | ExtractionInput / ExtractionResult / ExtractionStep / PipelineRunOptions / PipelineRunReport |
| A2 | `src/core/services/longwriting/extraction/extraction-step.interface.ts` | ExtractionStep 接口 + 注册器 |
| A3 | 测试 | 类型契约 |

### 阶段 B：ExtractionStep 实现与修正（1.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| B1 | `longwriting-ai.service.ts` extractMemories | 输入参数从 prewriteContent 改为 chapterContent；prompt 文案"预写"改"正文" |
| B2 | `steps/memory.step.ts` | 封装 extractMemories + batchCreateMemories；cleanup 调 deleteBySourceOutlineId |
| B3 | `steps/entity-state.step.ts` | 封装 extractEntityStates + upsert；cleanup deleteByChapter |
| B4 | `steps/chapter-state-summary.step.ts` | 封装 extractChapterStateSummary + upsert；cleanup（需新增 repo 方法 deleteByChapter） |
| B5 | `steps/vector-index.step.ts` | indexChapter + upsertEntity；cleanup deleteByChapter |
| B6 | 新增 repo 方法 | lwChapterStateSummaries.deleteByChapter（若无） |
| B7 | 各 step 单测 | mock 输入，验证 extract + cleanup |

### 阶段 C：ExtractionPipeline 编排器（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| C1 | `src/core/services/longwriting/extraction/extraction-pipeline.service.ts` | 编排主逻辑 |
| C2 | 同上 | 步骤注册 + 并行执行（Promise.allSettled） |
| C3 | 同上 | force 检测（有产物跳过）+ cleanup 前置 |
| C4 | 同上 | 单步 try-catch 隔离 + 结果收集 |
| C5 | 同上 | resetExtractionByChapter 统一清理入口 |
| C6 | 同上 | 事件流反馈进度 |
| C7 | 测试 `extraction-pipeline.service.spec.ts` | 并行/跳过/失败隔离/单步重跑/清理 |

### 阶段 D：提取日志表（0.5 天，可选）

| 任务 | 文件 | 说明 |
|------|------|------|
| D1 | `src/core/database/entities/lw-extraction-log.entity.ts` | 新建 entity |
| D2 | `src/core/database/repositories/lw-extraction-log.repository.ts` | CRUD + 查最近状态 |
| D3 | database-manager 注入 + 迁移 | |
| D4 | Pipeline 写日志 | 每步开始/结束写日志 |
| D5 | 测试 | 日志写入 + 查询 |

> 若 MVP 不做日志表，D 阶段跳过，用事件流 + console 替代。

### 阶段 E：触发机制集成（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| E1 | `longwriting.handler.ts` | 新增 outline:complete 动作（标记 completed + 触发 runForChapter） |
| E2 | 同上 | extraction:run / extraction:reset / extraction:status 通道 |
| E3 | `longwriting.service.ts` | completeChapter 方法 |
| E4 | saveChapter 集成 | 保存后若 status='completed' 触发提取（或仅 completeChapter 触发） |
| E5 | preload + Web controller | |
| E6 | 集成测试 | completeChapter -> 提取自动跑 |

### 阶段 F：端到端集成与回归（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| F1 | 集成测试 | 章节->完成->提取->各表写入->ContextBuilder 检索命中 |
| F2 | 重写测试 | force=true 重跑 -> 清理 + 新写入 |
| F3 | 回归测试 | 现有 09-longwriting.spec.ts 通过 |

---

## 2. 依赖与顺序

```
A (类型) -> B (steps) -> C (pipeline) -> E (触发集成) -> F (e2e)
A -> C
B 依赖步骤0 (LwVectorIndexService) + 现有 extract* 修正
D (日志表) 可与 C 并行，C 依赖 D 的 repo（若做日志）
```

A 先行。B 依赖步骤0就绪 + 现有 extract* 修正。C 依赖 A+B。D 可并行。E 依赖 C。F 依赖 E。

---

## 3. 测试策略

### 3.1 单元测试
- **MemoryStep**：
  - extract 输入 chapterContent（验证非 prewrite）
  - extractMemories 被调用 + batchCreateMemories
  - cleanup 调 deleteBySourceOutlineId
- **EntityStateStep / ChapterStateSummaryStep**：
  - extract 调对应 extract* + upsert
  - cleanup 调 deleteByChapter
- **VectorIndexStep**：
  - extract 调 indexChapter + upsertEntity（涉及实体数）
  - cleanup 调 deleteByChapter（不删实体设定）
- **Pipeline**：
  - 注册 4 step -> runForChapter -> Promise.allSettled 并行
  - force=false + 已有 EntityStateSnapshot -> EntityStateStep 跳过
  - force=true -> 全部 cleanup 后 extract
  - MemoryStep 抛错 -> 其他 3 步仍 success，failedSteps=['memory']
  - steps=['memory'] -> 仅 memory 执行
  - resetExtractionByChapter -> 4 个 cleanup 均调用

### 3.2 集成测试
- `extraction-pipeline.integration.spec.ts`：
  - 建项目+大纲+章节正文（3000 字）-> completeChapter -> 验证：
    - lw_memories 有记录（sourceOutlineId = outlineId）
    - lw_entity_states 有记录（chapterNumber）
    - lw_chapter_state_summaries 有记录
    - lw_vector_indices 有章节切片 + 涉及实体设定
  - ContextBuilder.search 命中该章内容（与步骤1联动验证）
  - 重写章节（改内容）-> force=true runForChapter -> 旧 memories 删除、新写入
  - 单步失败：mock extractMemories reject -> 其他步骤成功，日志记录 failed

### 3.3 回归测试
- `tests/e2e/web/09-longwriting.spec.ts`：现有"提取状态"按钮 -> 封装为 extraction:run 单步，功能等价
- extractMemories 从正文提取的记忆质量抽检（不低于预写）

---

## 4. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| 章节完成触发提取时用户还在编辑 | 中 | 中 | completeChapter 是显式动作；自动保存不触发；提取异步不阻塞 UI |
| 4 步并行 AI 调用成本高 | 中 | 中 | 提取可用独立 cheaper 模型（开放问题3）；并行但总量可控 |
| extractMemories 输入改正文后 prompt 不适配 | 中 | 中 | prompt 文案"预写"改"正文"；单测验证输入；人工抽检质量 |
| 章节重写清理误删跨章节数据 | 中 | 高 | cleanup 严格按 (outlineId, chapterNumber)；跨章节回滚仅伏笔/图边（后续步骤实现时谨慎）；集成测试覆盖 |
| Promise.allSettled 并行向量检索冲突 | 低 | 低 | LanceDB 支持并发读；upsertEntity 涉及同一实体可能竞争，串行化 upsertEntity |
| 提取耗时长用户无感知 | 中 | 中 | 事件流反馈进度 + lw_extraction_logs 状态 |

---

## 5. 交付物清单

- [ ] `extraction.types.ts` + `extraction-step.interface.ts`
- [ ] 4 个 ExtractionStep 实现 + 单测
- [ ] extractMemories 输入修正（prewriteContent -> chapterContent）
- [ ] `extraction-pipeline.service.ts`（编排+并行+幂等+隔离+清理+事件）
- [ ] lwChapterStateSummaries.deleteByChapter（新增 repo 方法）
- [ ] （可选）lw_extraction_logs entity + repo + 迁移
- [ ] completeChapter 动作 + extraction:run/reset/status IPC
- [ ] preload + Web controller
- [ ] 集成测试（完成->提取->写入->ContextBuilder 检索命中）
- [ ] 重写清理测试
- [ ] 回归测试通过

---

## 6. 验收检查表

- [ ] completeChapter 触发自动提取，自动保存不触发
- [ ] extractMemories 从正文提取
- [ ] 4 步并行，单步失败不阻塞
- [ ] force=true 清理旧产物 + 跨章节回滚入口就绪
- [ ] VectorIndexStep 入库后 ContextBuilder 可检索
- [ ] 手动单步/全部重提可用
- [ ] 进度事件反馈前端
- [ ] 现有提取功能回归通过

---

## 7. 后续衔接

本步骤完成后（第一批 MVP：0->1->2 完成）：
- **步骤 6 前端**：消费 extraction 进度事件 + ContextBuilder manifest，实现上下文预览面板
- **步骤 3 故事知识图谱**：新增 GraphEdgeStep 注册到 Pipeline，extractGraphEdges 写 lw_graph_edges；其 cleanup 处理 endedChapter 回滚
- **步骤 4 时间线**：新增 TimelineStep，依赖 ChapterStateSummaryStep 的 storyTime
- **步骤 5 伏笔+快照**：新增 ForeshadowStep + SnapshotStep；ForeshadowStep.cleanup 处理伏笔回滚

**接口冻结**：ExtractionStep 接口、ExtractionInput、runForChapter 签名、resetExtractionByChapter 在本步骤冻结。后续步骤仅新增 Step 注册，不改 Pipeline 主逻辑。
