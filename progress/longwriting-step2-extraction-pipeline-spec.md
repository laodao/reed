# 步骤 2 Spec - 从正文提取流水线 ExtractionPipeline

> 步骤：2 / 8
> 名称：ExtractionPipeline
> 日期：2026-07-31
> 依赖：步骤 0（LwVectorIndexService 入库）、步骤 1（ContextBuilder 消费提取产物）
> 修复 Review：R3（触发时机）、R9（章节重写清理）
> 关联：[总 Spec](./2026-07-31-longwriting-optimization-spec.md) §7、[实施规划](./2026-07-31-longwriting-implementation-plan.md)

---

## 1. 目标

将分散的提取逻辑（记忆/实体状态/章节摘要）整合为统一流水线，并新增向量入库步骤：
- **触发时机**：章节完成时（非自动保存），避免写作被打断（R3）
- **输入修正**：从章节正文提取（extractMemories 原从预写提取，修正）
- **幂等可重试**：重提先清理后写入，单步失败不阻塞其他（R9）
- **章节重写清理**：重写时清理跨章节提取产物 + 伏笔回滚（R9）
- **可扩展**：后续步骤 3/4/5 新增 TimelineStep/ForeshadowStep/GraphEdgeStep 注册进流水线

---

## 2. 现状问题

| 问题 | 位置 | 本步骤方案 |
|------|------|-----------|
| extractMemories 从预写提取，非正文 | `longwriting-ai.service.ts:2253` | 输入改为 chapterContent |
| 提取需手动点按钮，忘点则状态不更新 | 前端"提取状态"按钮 | 章节完成时自动触发 + 保留手动重提 |
| 提取步骤散落，无统一编排 | longwriting.handler.ts | ExtractionPipeline 统一编排 |
| 无向量入库 | - | VectorIndexStep 章节切片+设定 upsert |
| 章节重写时旧提取产物不清理 | - | resetExtractionByChapter 统一清理 |
| 单步失败影响其他 | - | try-catch 隔离 + 结果收集 |

---

## 3. 架构：ExtractionStep 插件式

与步骤 1 的 ContextProvider 模式一致，每个提取步骤实现统一接口，Pipeline 编排。

### 3.1 核心类型

```typescript
// src/core/services/longwriting/extraction/extraction.types.ts

export interface ExtractionInput {
  projectId: string
  outlineId: string
  chapterNumber: number
  chapterContent: string
  involvedEntities: Array<{ type: string; id: string; name: string }>
  previousChapterState?: ChapterStateSummary  // 上一章状态（时间线连续性，步骤4用）
}

export interface ExtractionResult {
  step: string
  success: boolean
  extractedCount: number
  durationMs: number
  error?: string
}

export interface ExtractionStep {
  key: string                          // 'memory' | 'entityState' | 'chapterStateSummary' | 'vectorIndex' | ...
  name: string
  parallelizable: boolean              // 是否可与其他步骤并行
  /** 清理该章节的旧提取产物（幂等前置）*/
  cleanup(projectId: string, outlineId: string, chapterNumber: number): Promise<void>
  /** 执行提取 */
  extract(input: ExtractionInput): Promise<ExtractionResult>
}

export interface PipelineRunOptions {
  /** 强制重跑（先 cleanup 再 extract）；默认 false 仅在无产物时跑 */
  force?: boolean
  /** 指定运行的步骤（空=全部）；用于手动重提单步 */
  steps?: string[]
}

export interface PipelineRunReport {
  outlineId: string
  chapterNumber: number
  results: ExtractionResult[]
  totalDurationMs: number
  success: boolean
  failedSteps: string[]
}
```

### 3.2 MVP ExtractionStep 清单（4 个）

| Step | key | parallelizable | 来源 | 说明 |
|------|-----|----------------|------|------|
| MemoryStep | memory | 是 | 修正 extractMemories | 输入改为 chapterContent；提取后 batchCreateMemories |
| EntityStateStep | entityState | 是 | extractEntityStates | 输入 chapterContent + involvedEntities；upsert EntityStateSnapshot |
| ChapterStateSummaryStep | chapterStateSummary | 是 | extractChapterStateSummary | 输入 chapterContent；upsert ChapterStateSummary |
| VectorIndexStep | vectorIndex | 是 | 新增 | indexChapter（章节切片入库）+ upsertEntity（涉及实体设定入库） |

> 4 个 step 互相独立，可并行。

### 3.3 预留 Step（后续步骤实现并注册）

| Step | 实现步骤 | 依赖 |
|------|----------|------|
| GraphEdgeStep | 步骤 3 | extractGraphEdges，写 lw_graph_edges |
| TimelineStep | 步骤 4 | extractTimelineEvents，依赖 ChapterStateSummaryStep 的 storyTime |
| ForeshadowStep | 步骤 5 | extractForeshadows，写 lw_foreshadows |

Pipeline 注册机制：`pipeline.register(step)`。后续步骤新增 Step 自动纳入编排。

---

## 4. ExtractionPipeline 编排器

`src/core/services/longwriting/extraction/extraction-pipeline.service.ts`

### 4.1 主流程

```
runForChapter(projectId, outlineId, options):
  1. 加载章节正文 + 大纲节点 + involvedEntities + chapterNumber
     - 若章节无内容 -> 跳过，返回空报告
  2. 加载 previousChapterState（上一章 ChapterStateSummary）
  3. 构造 ExtractionInput
  4. 确定运行步骤：options.steps ?? 全部注册步骤
  5. 若 options.force 或检测到无产物：
     a. 清理阶段：并行调用各 step.cleanup(projectId, outlineId, chapterNumber)
        - 包括跨章节清理（见 §6 伏笔回滚等，由对应 step.cleanup 内部处理）
     b. 提取阶段：并行调用各 step.extract(input)（parallelizable=true 的并行）
        - 每步 try-catch 隔离，失败记录到结果，不抛出
  6. 收集 ExtractionResult[]，生成 PipelineRunReport
  7. 通过事件 longwriting:extraction:<eventId> 流式反馈进度与结果
  8. 持久化报告（可选，见 §7）
```

### 4.2 触发时机（R3）

```typescript
// 三种触发入口
1. runForChapter(projectId, outlineId, { force: false })  // 章节完成时自动
2. runForChapter(projectId, outlineId, { force: true })   // 手动重提
3. runForChapter(projectId, outlineId, { steps: ['memory'] })  // 单步重提
```

**自动触发点**（在 LongWritingService.saveChapter 或 IPC 层）：
- 章节大纲节点 status === 'completed' 时，保存后触发 `runForChapter({ force: false })`
- AI 生成完成保存后触发（可配置开关，默认开）
- **自动保存（防抖）不触发**（仅调 saveChapter 存正文）

> 实现方式：在 longwriting.handler.ts 的 saveChapter 后判断 status，或新增 `completeChapter` 动作（标记 completed + 触发提取）。倾向后者，语义更清晰。

### 4.3 幂等（R9）

- 每个 step.cleanup 按 (outlineId, chapterNumber) 清理旧产物
- force=false 时：检测该章节是否已有产物（如 EntityStateSnapshot 存在），有则跳过该 step
- force=true 时：总是先 cleanup 再 extract

### 4.4 重试与隔离

- 单 step.extract 失败：catch 错误，记录到 ExtractionResult.error，继续其他 step
- 失败步骤可通过 `runForChapter({ steps: ['failedStep'], force: true })` 单独重试
- 网络/AI 调用失败重试：复用 callAIStream 的重试机制（或新增 1 次重试）

---

## 5. 修正现有 extract* 从正文

### 5.1 MemoryStep（核心修正）

`extractMemories`（`longwriting-ai.service.ts:2253`）当前输入 `prewriteContent`，改为 `chapterContent`：

```typescript
// 旧：extractMemories(eventId, projectId, outlineId, prewriteContent, chapterNumber, ...)
// 新：extractMemories(eventId, projectId, outlineId, chapterContent, chapterNumber, ...)

// MemoryStep.extract:
async extract(input: ExtractionInput): Promise<ExtractionResult> {
  const result = await longWritingAIService.extractMemories(
    eventId, input.projectId, input.outlineId, input.chapterContent, input.chapterNumber, ...
  )
  // batchCreateMemories（现有 service 已有）
  await longWritingService.batchCreateMemories(result.data)
  return { step: 'memory', success: true, extractedCount: result.data.length, ... }
}

// MemoryStep.cleanup:
async cleanup(projectId, outlineId, chapterNumber) {
  await dbManager.lwMemories.deleteBySourceOutlineId(outlineId)  // 现有方法
}
```

> prompt 优化：现有 extractMemories 的 system prompt 提"从章节预写内容中提取"改为"从章节正文中提取"。

### 5.2 EntityStateStep / ChapterStateSummaryStep

现有 `extractEntityStates` / `extractChapterStateSummary` 已从 chapterContent 输入，无需改输入。封装为 Step：
- EntityStateStep.extract：调 extractEntityStates + batchCreateEntityStateSnapshots（upsert）
- ChapterStateSummaryStep.extract：调 extractChapterStateSummary + upsert ChapterStateSummary
- cleanup：EntityStateStep 用 `deleteByChapterNumber`（现有）；ChapterStateSummaryStep 按 outlineId 清理，复用现有 `deleteByOutlineId`（一章一 outline 等价，无需新增 deleteByChapter）

### 5.3 VectorIndexStep（新增）

```typescript
async extract(input: ExtractionInput): Promise<ExtractionResult> {
  let count = 0
  // 1. 章节切片入库
  await lwVectorIndexService.indexChapter(input.projectId, input.outlineId, input.chapterNumber, input.chapterContent)
  count++
  // 2. 涉及实体设定 upsert（状态可能变化）
  for (const entity of input.involvedEntities) {
    await lwVectorIndexService.upsertEntity(input.projectId, entity.type, entity.id)
    count++
  }
  return { step: 'vectorIndex', success: true, extractedCount: count, ... }
}

async cleanup(projectId, outlineId, chapterNumber) {
  await lwVectorIndexService.deleteByChapter(projectId, chapterNumber)  // 步骤0已有
  // 涉及实体设定不删（其他章节可能引用），由 upsert 增量更新
}
```

---

## 6. 章节重写清理策略（R9）

当章节内容被大幅修改并重新提取时（force=true），需清理跨章节影响：

### 6.1 resetExtractionByChapter

```typescript
async resetExtractionByChapter(projectId: string, outlineId: string, chapterNumber: number): Promise<void> {
  // 调用所有注册 step 的 cleanup（统一入口）
  for (const step of this.steps) {
    await step.cleanup(projectId, outlineId, chapterNumber)
  }
}
```

### 6.2 各 step.cleanup 的清理范围

| Step | cleanup 清理 | 跨章节影响处理 |
|------|-------------|---------------|
| MemoryStep | lwMemories.deleteBySourceOutlineId | - |
| EntityStateStep | lwEntityStates.deleteByChapterNumber | - |
| ChapterStateSummaryStep | deleteByChapter（新增） | 后续章节的 EntityState getEntityStateAtChapter 会自动 fallback 到更早章节 |
| VectorIndexStep | deleteByChapter（步骤0） | 涉及实体设定保留，upsert 增量 |
| GraphEdgeStep（步骤3） | deleteByChapter | endedChapter=该章 的边回滚 status='active' |
| TimelineStep（步骤4） | deleteByChapter | - |
| ForeshadowStep（步骤5） | deleteByChapter | 该章 resolved 的伏笔 status 回滚为 'open'（resolvedChapter 置 null） |

> 跨章节回滚（伏笔/图边）由对应 step.cleanup 内部处理，步骤 2 只提供统一调用入口。步骤 3/4/5 实现时填充其 cleanup 逻辑。

---

## 7. 提取报告持久化（可选）

新增轻量表 `lw_extraction_logs` 记录每次提取运行（便于前端展示进度与重试）：

```typescript
@Entity({ name: 'lw_extraction_logs' })
export class LwExtractionLogEntity {
  id: string
  userId: string | null
  projectId: string
  outlineId: string
  chapterNumber: number
  step: string                    // 步骤 key
  status: 'running' | 'success' | 'failed'
  extractedCount: number
  errorMessage: string | null
  durationMs: number
  createdAt: Date
}
```

> MVP 可选：若不想加表，用事件流反馈进度 + console 日志即可。倾向加表，便于前端展示"提取状态"和故障排查。

---

## 8. IPC + 事件

`src/electron/ipc/handlers/longwriting.handler.ts`：
- `longwriting:extraction:run` (projectId, outlineId, options) -> PipelineRunReport
  - 进度事件 `longwriting:extraction:progress:<eventId>`：{ step, status, progress }
- `longwriting:extraction:reset` (projectId, outlineId, chapterNumber) -> void
- `longwriting:extraction:status` (projectId, outlineId) -> 各步骤最近状态（查 lw_extraction_logs）

`completeChapter` 动作（标记 completed + 触发提取）：
- `longwriting:outline:complete` (outlineId) -> 更新 status='completed' + 触发 runForChapter

preload 注册。Web 端同步。

---

## 9. 测试计划（TDD）

### 9.1 单元测试
- **各 ExtractionStep**：
  - MemoryStep：输入 chapterContent（非 prewrite），调 extractMemories + batchCreate；cleanup 删旧
  - EntityStateStep：extract + upsert；cleanup deleteByChapter
  - ChapterStateSummaryStep：extract + upsert；cleanup
  - VectorIndexStep：indexChapter + upsertEntity；cleanup deleteByChapter
- **ExtractionPipeline**：
  - 注册 4 step -> runForChapter -> 4 step 并行执行
  - force=false 且有产物 -> 跳过
  - force=true -> cleanup 后 extract
  - 单步失败 -> 其他步继续，failedSteps 记录
  - steps=['memory'] -> 只跑 memory
  - resetExtractionByChapter -> 调用所有 cleanup

### 9.2 集成测试
- `extraction-pipeline.integration.spec.ts`：
  - 建项目+大纲+章节正文 -> runForChapter -> 验证 memories/entityStates/chapterStateSummary/vectorIndices 都写入
  - 重写章节内容 -> force=true 重跑 -> 旧产物清理 + 新产物写入
  - 单步失败场景（mock extractMemories 抛错）-> 其他步骤仍成功
  - VectorIndexStep 后 ContextBuilder 检索能命中该章内容（与步骤1联动）

### 9.3 回归测试
- 现有手动"提取状态"按钮功能仍可用（封装为 runForChapter 单步）
- extractMemories 从正文提取后，记忆质量不低于从预写提取（人工抽检）

---

## 10. 验收标准（可量化）

| # | 验收点 | 可量化指标 / 断言 |
|---|--------|------------------|
| 2.1 | 触发时机 | completeChapter 后 4 step 全 status='success'；自动保存（防抖）`pipeline.runForChapter` 调用次数 = 0 |
| 2.2 | 从正文提取 | MemoryStep 调 extractMemories 第4参数 = chapterContent（非 prewriteContent）；提取的记忆 title/description 在正文中可溯（抽检 ≥80% 相关） |
| 2.3 | 并行隔离 | 4 step 总耗时 ≤ max(单步耗时) × 1.5（非串行相加）；MemoryStep reject 时其他 3 step success，failedSteps=['memory'] |
| 2.4 | 重写清理 | force=true 重跑：lw_memories（sourceOutlineId=该章）记录数 = 新提取数（无重复残留）；lw_vector_indices 该章 chunk 全为新 chunkId |
| 2.5 | 向量联动 | VectorIndexStep 执行后 ContextBuilder.search 该章内容命中（entityType='chapter'） |
| 2.6 | 单步重跑 | `runForChapter({steps:['memory'],force:true})` 仅 memory 执行，其他 step 调用次数 = 0 |
| 2.7 | 进度事件 | extraction:progress 事件 ≥4 次（每 step 一次）；extraction:done 事件 = 1 次 |
| 2.8 | 测试覆盖 | 4 step 各 ≥2 单测；pipeline ≥6 单测；集成 ≥4；手动按钮等价可用 |

---

## 10.5 接口细节补充（review 补充）

### P2-1 completeChapter vs saveChapter
- `saveChapter(outlineId, content)`：仅保存正文 + 创建版本，**不触发提取**（自动保存防抖走此）
- `completeChapter(outlineId)`：显式动作 = 更新大纲 status='completed' + 触发 `runForChapter({force:false})`
- 关系：用户可多次 saveChapter 编辑；满意后点 completeChapter 一次性触发提取
- AI 生成完成保存后是否自动 completeChapter：默认否（用户可能还要编辑），可配 per-project 开关

### P2-2 eventId 生成与传递
- pipeline.runForChapter 内部生成 `eventId = ext_${uuid}`，或接收前端传入
- 前端调 `extraction:run` 时传 eventId，订阅 `longwriting:extraction:progress:${eventId}` / `done:${eventId}`
- IPC `extraction:run(projectId, outlineId, options, eventId?)` 返回 `{ eventId, report }`

### P2-3 failedSteps 前端用途
`PipelineRunReport.failedSteps` 供前端 ExtractionStatusBadge 显示失败步骤的重试按钮。前端调 `runForChapter({steps: failedSteps, force:true})` 单步重试。

---

## 11. 开放问题

1. lw_extraction_logs 表是否 MVP 必需？- 倾向加，便于故障排查与前端状态展示。
2. AI 生成完成保存后是否自动触发提取？- 倾向默认开 + per-project 配置开关（生成后可能用户还要编辑，提取可能浪费）。
3. 提取的 AI 调用是否复用章节生成的 provider/model？- 倾向独立配置（提取可用更便宜模型）。
4. 章节正文很长（>6000 字）提取截断策略？- 现有 extractEntityStates 等截断 6000 字，需评估是否分段提取。倾向 MVP 保持截断，后续优化。
