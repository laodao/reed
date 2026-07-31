# 步骤 1 Spec - 智能上下文构建器 ContextBuilder

> 步骤：1 / 8
> 名称：ContextBuilder（写作质量核心）
> 日期：2026-07-31
> 依赖：步骤 0（LwVectorIndexService 语义检索）
> 修复 Review：R4（动态 token 预算）、R8（manifest 复用避免重复检索）
> 关联：[总 Spec](./2026-07-31-longwriting-optimization-spec.md) §6、[实施规划](./2026-07-31-longwriting-implementation-plan.md)

---

## 1. 目标

替代 `LongWritingAIService.generateChapter`（`longwriting-ai.service.ts:1201-1429`）中手工拼接的 prompt，改为：
- 按**相关性**语义检索记忆/设定/历史片段（不再按章节号截断）
- 按**优先级 + token 预算**动态组装上下文（不再全量塞 prompt）
- 输出**结构化清单**供前端预览/编辑
- maxTokens 从 8192 放开（解决长章节截断）

**MVP 范围**：用步骤 0 的向量检索 + 现有记忆/实体状态/章节摘要。图谱/时间线/伏笔 provider 预留接口，由步骤 3/4/5 增量实现。

---

## 2. 现状问题（被本步骤解决）

| 问题 | 位置 | 本步骤方案 |
|------|------|-----------|
| 记忆按章节号截断（normal 前10/minor 最近5） | `getMemoryContext:2343-2387` | 向量检索按相关性 topK |
| 实体状态只注入手动标记的 involvedEntities | `getEntityStateContext` | 向量检索扩展 + 图扩展（步骤3后） |
| prompt 手工拼接无预算控制 | `generateChapter:1361-1413` | ContextBuilder 结构化组装 |
| maxTokens 上限 8192 截断长章节 | `:1420` | 动态预算，上限放开到 min(targetWords*2, 模型窗口-预留) |
| 上下文黑盒，用户不可见不可控 | - | contextManifest 清单 + forcedContext |

---

## 3. 架构：插件式 ContextProvider

每个上下文分区是一个 Provider，实现统一接口。ContextBuilder 编排所有 Provider，按优先级和预算组装。

### 3.1 核心类型

```typescript
// src/core/services/longwriting/context/context.types.ts

export interface ContextBuildInput {
  projectId: string
  outlineId: string
  targetWords?: number
  userExtraPrompt?: string
  providerConfigId?: string
  modelId?: string
}

/** 用户在预览面板的强制注入/排除 */
export interface ForcedContextItem {
  itemId: string
  action: 'include' | 'exclude' | 'edit'
  editedContent?: string  // action='edit' 时
}

export interface ContextItem {
  id: string
  type: LwContextItemType          // 'character' | 'memory' | 'chapter_fragment' | 'entity_state' | ...
  title: string
  summary: string                  // 清单展示用（一行）
  content: string                  // 完整内容（注入 prompt 用）
  source: 'vector' | 'graph' | 'timeline' | 'manual' | 'sql'
  score?: number                   // 相关性分数（vector 检索有）
  included: boolean                // 是否注入（预算/用户控制）
  editable: boolean                // 用户可否编辑
  priority: ContextPriority
}

export type LwContextItemType =
  | 'storyOverview' | 'background' | 'character' | 'location' | 'item'
  | 'memory' | 'entityState' | 'previousChapter' | 'chapterStateSummary'
  | 'prewrite' | 'timeline' | 'foreshadow' | 'plot'

export type ContextPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export interface ContextSection {
  key: string
  title: string
  items: ContextItem[]
  tokenEstimate: number
  priority: ContextPriority
}

export interface ContextManifest {
  sections: ContextSection[]
  totalTokenEstimate: number
  budgetAllocation: Record<string, number>   // 各分区 token 预算
  modelContextWindow: number
  reservedForGeneration: number
  availableForContext: number
  buildId: string                            // 用于 manifest 复用
}

export interface ContextBuildOutput {
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  manifest: ContextManifest
}
```

### 3.2 Provider 接口

```typescript
export interface ContextProvider {
  key: string
  title: string
  priority: ContextPriority
  /** 构建该分区的上下文项 */
  build(input: ContextBuildInput, ctx: BuildContext): Promise<ContextSection>
}

/** 构建过程中共享的上下文（避免重复查库） */
export interface BuildContext {
  projectId: string
  outline: StoryOutline
  overview: StoryOverview | null
  background: any | null
  characters: StoryCharacter[]
  locations: any[]
  chapterNumber: number
  totalChapters: number
  involvedCharacterIds: string[]
  involvedLocationIds: string[]
  vectorIndexService: LwVectorIndexService
  dbManager: ICoreDatabaseManager
}
```

### 3.3 MVP Provider 清单（8 个）

| Provider | priority | 来源 | 说明 |
|----------|----------|------|------|
| StoryOverviewProvider | 4 | sql | 核心冲突 + 概要（必留） |
| BackgroundProvider | 10 | sql | 世界观设定（超预算先压缩） |
| CharacterProvider | 2 | sql + vector | 涉及角色完整信息 + 当前状态（必留） |
| LocationProvider | 7 | sql + vector | 涉及场景环境 |
| MemoryProvider | 6 | vector | 语义检索相关记忆（替代按章节截断） |
| EntityStateProvider | 2 | sql | 涉及实体当前状态（必留） |
| PreviousChapterProvider | 3 | sql | 上一章结尾 + 章节状态摘要（必留） |
| PrewriteProvider | 5 | sql | 预写提纲 |
| VectorSearchProvider | 8 | vector | 相关历史章节片段 + 相关设定（补充） |

> 注：CharacterProvider/LocationProvider 的"涉及"来自大纲 involvedCharacters/involvedLocations；VectorSearchProvider 补充语义相关的未标记实体。

### 3.4 预留 Provider（后续步骤实现）

| Provider | 实现步骤 | 说明 |
|----------|----------|------|
| GraphProvider | 步骤 3 | 图扩展：从涉及实体 1-2 跳邻居及状态 |
| TimelineProvider | 步骤 4 | 时间线对齐：当前时间点前后事件 |
| ForeshadowProvider | 步骤 5 | 伏笔检查：待回收伏笔提示 |

ContextBuilder 启动时注册可用 Provider，后续步骤新增 Provider 自动纳入编排（无需改 ContextBuilder 主逻辑）。

---

## 4. ContextBuilder 编排流程

`src/core/services/longwriting/context/context-builder.service.ts`

```
build(input):
  1. 加载 BuildContext（大纲/概要/背景/角色/地点/章节序号）
  2. 动态计算 token 预算（见 §5）
  3. 并行调用所有注册 Provider.build(input, ctx) -> ContextSection[]
  4. 按 priority 排序 section
  5. 预算分配：
     - 必留分区（priority<=3）：全量保留
     - 高优先级（4-6）：按预算保留 topK items
     - 中低优先级（7-11）：剩余预算按 score 分配
  6. 应用 forcedContext（用户勾选/排除/编辑）：
     - action='include' -> 强制 included=true（即使超预算）
     - action='exclude' -> included=false
     - action='edit' -> 替换 content
  7. 重新核算 token，超预算时压缩低优先级分区（摘要化）
  8. 拼接 systemPrompt + userPrompt（分区结构化）
  9. 生成 manifest（含 buildId）
  10. 返回 ContextBuildOutput

buildFromManifest(manifest, forcedContext):
  // R8: generateChapter 复用，不重新检索
  1. 接收前端传回的 manifest + forcedContext
  2. 应用 forcedContext 调整 included/content
  3. 重新拼接 prompt（不调 Provider.build）
  4. 返回 ContextBuildOutput
```

### 4.1 systemPrompt（写作原则，复用现有）

保留 `generateChapter:1318-1353` 的写作核心原则（衔接技巧、人物塑造、场景描写、情节推进、写作禁忌、输出要求），提炼为模板。

### 4.2 userPrompt 结构化分区

```
# 章节写作任务

## 一、故事宏观背景
{StoryOverviewProvider + BackgroundProvider}

## 二、当前章节任务
{大纲名/概要/目标字数/进度阶段}

## 三、涉及角色完整信息
{CharacterProvider + EntityStateProvider}

## 四、涉及场景环境
{LocationProvider}

## 五、前文衔接
{PreviousChapterProvider: 上一章结尾 + 章节状态摘要}

## 六、关键记忆
{MemoryProvider}

## 七、相关历史片段
{VectorSearchProvider: 相关章节片段}

## 八、预写提纲
{PrewriteProvider}

---（以下分区由后续步骤填充）---
## 九、时间线（步骤4）
## 十、伏笔提示（步骤5）

请根据以上信息撰写章节正文。直接开始，不需要标题。
```

---

## 5. 动态 token 预算模型（R4）

### 5.1 模型窗口读取

```typescript
async function resolveModelWindow(providerConfigId?, modelId?): Promise<number> {
  // 1. 从 ProviderTemplate.models[].contextWindow 读
  // 2. 若无，从 UserProviderConfig 模型配置读
  // 3. 若仍无，保守默认 16000
  // 返回模型上下文窗口大小
}
```

### 5.2 预算分配

```
modelWindow = resolveModelWindow(...)           // 如 32000
reservedForGeneration = min(targetWords * 2, modelWindow * 0.5)  // 生成预留，上限一半
availableForContext = modelWindow - reservedForGeneration - 1000  // -1000 安全边际
```

### 5.3 maxTokens

```typescript
maxTokens = Math.min((targetWords || outline.estimatedWords || 3000) * 2, reservedForGeneration)
// 例：targetWords=5000 -> maxTokens=10000（旧 8192 上限解除）
```

### 5.4 11 级优先级（超预算时低优先级先压缩/丢弃）

| 级别 | 分区 | 策略 |
|------|------|------|
| 1 | 当前章节任务（大纲名/概要/字数） | 必留 |
| 2 | 涉及角色信息 + 实体状态 | 必留 |
| 3 | 上一章结尾 + 章节状态摘要 | 必留 |
| 4 | 核心冲突 + 故事概要 | 必留 |
| 5 | 待回收伏笔提示（步骤5） | 高 |
| 6 | 关键记忆（critical + vector 检索 normal） | 高 |
| 7 | 涉及场景环境 | 中 |
| 8 | 相关历史章节片段（vector） | 中 |
| 9 | 时间线事件（步骤4） | 中 |
| 10 | 背景设定 | 低（超预算摘要化） |
| 11 | 次要记忆（minor） | 低（超预算先丢） |

### 5.5 token 估算

中文按 `字符数 * 1.5` 估算（粗略，避免引入 tiktoken 依赖）。估算误差由安全边际 1000 + 压缩策略兜底。

### 5.6 压缩策略

超预算时按优先级从低到高：
1. minor 记忆：丢弃
2. 背景设定：摘要化（取前 200 字）
3. 历史片段：减少 topK
4. normal 记忆：按 score 截断

---

## 6. 集成到 generateChapter（重构）

`src/core/services/longwriting-ai.service.ts` 的 `generateChapter`（1201-1429）重构：

### 6.1 删除
- 手工拼接的 systemPrompt（1318-1353）+ prompt（1361-1413）
- getMemoryContext / getEntityStateContext / getChapterStateSummaryContext 调用（移入 Provider）
- buildCharacterFullInfo / buildLocationFullInfo / buildBackgroundContext（移入 Provider 复用）
- maxTokens 计算（:1420）

### 6.2 新流程

```typescript
async generateChapter(eventId, projectId, outlineId, targetWords?, providerConfigId?, modelId?, manifest?: ContextManifest, forcedContext?: ForcedContextItem[]) {
  const contextBuilder = getContextBuilderService()

  let output: ContextBuildOutput
  if (manifest) {
    // R8: 前端已预览，复用 manifest
    output = await contextBuilder.buildFromManifest(manifest, forcedContext)
  } else {
    // 未预览，直接构建（兼容旧流程）
    output = await contextBuilder.build({ projectId, outlineId, targetWords, providerConfigId, modelId })
  }

  // 生成前发送 manifest 供前端展示（可选）
  getEventEmitter().emit(`longwriting:context-manifest:${eventId}`, output.manifest)

  const result = await this.callAIStream(
    eventId, output.userPrompt, output.systemPrompt, output.maxTokens, providerConfigId, modelId
  )
  return { success: true, data: { content: result, manifest: output.manifest } }
}
```

### 6.3 buildPreview（独立入口，不调 AI）

```typescript
async buildPreview(input: ContextBuildInput): Promise<ContextManifest> {
  const output = await this.build(input)
  return output.manifest
}
```

---

## 7. IPC 通道

`src/electron/ipc/handlers/longwriting.handler.ts`：
- `longwriting:context:buildPreview` (input) -> ContextManifest（不调 AI，快速返回供前端预览）
- `longwriting:chapter:generate` 扩展参数：接收 `manifest` + `forcedContext`（R8 复用）

preload 注册。Web 端 controller 同步。

---

## 8. 测试计划（TDD）

### 8.1 单元测试
- 各 Provider：
  - StoryOverviewProvider：正确输出概要 + 核心冲突
  - CharacterProvider：涉及角色完整信息 + 实体状态
  - MemoryProvider：调用 vectorIndexService.search，按 score 排序，topK 生效
  - PreviousChapterProvider：上一章结尾按段落截取（动态字数）
  - VectorSearchProvider：chapterNumberLte 过滤，不检索未写章节
- ContextBuilder：
  - 并行调用 Provider
  - 优先级排序
  - 预算分配：必留分区全保留、低优先级超预算压缩
  - forcedContext：include/exclude/edit 生效
  - buildFromManifest：不调 Provider.build，复用 manifest
- resolveModelWindow：有 contextWindow/无 contextWindow/默认
- token 估算：中文计数正确

### 8.2 集成测试
- 端到端构建：创建项目+大纲+角色+记忆 -> buildPreview -> manifest 含各分区
- 预算超限：构造大量记忆 -> 验证低优先级被压缩
- manifest 复用：buildPreview -> 编辑 forcedContext -> generateChapter 用 manifest -> 上下文一致
- 与旧流程兼容：不传 manifest 时 generateChapter 正常工作

### 8.3 回归测试
- 现有章节生成 e2e 用例通过（语义一致，质量不降）

---

## 9. 验收标准（可量化）

| # | 验收点 | 可量化指标 / 断言 |
|---|--------|------------------|
| 1.1 | 替代手工拼接 | `longwriting-ai.service.ts:1361-1413` 手工 prompt 删除；systemPrompt/userPrompt 来自 `ContextBuilder.build()` |
| 1.2 | 向量检索记忆 | 第30章 buildPreview，MemoryProvider items 中 source='vector' 占比 ≥80%；`getMemoriesBeforeChapter` 调用次数 = 0 |
| 1.3 | maxTokens 动态 | targetWords=5000 -> maxTokens ≥10000；contextWindow=32000 -> reservedForGeneration=10000、availableForContext=21000 |
| 1.4 | 预算压缩 | 100 normal + 50 minor 超预算场景：priority 1-4 items 100% included=true；priority 11（minor）included=false；priority 10（背景）content ≤200 字 |
| 1.5 | manifest 复用 | 传 manifest 时 `LwVectorIndexService.search` 调用 = 0；`buildFromManifest` 耗时 < `build` 的 20% |
| 1.6 | forcedContext | exclude -> included=false；include -> included=true（低优先级亦然）；edit -> content=editedContent |
| 1.7 | 窗口未知 | ProviderTemplate 无 contextWindow -> `resolveModelWindow` 返回 16000 |
| 1.8 | 测试覆盖 | 8 Provider 各 ≥3 单测；ContextBuilder ≥6 单测；集成 ≥3；回归 09-longwriting.spec.ts 通过 |

---

## 9.5 接口细节补充（review 补充）

### P1-1 BuildContext 加载责任
`ContextBuilder.build()` 第1步统一加载 BuildContext 所有字段（outline/overview/background/characters/locations/chapterNumber/involvedEntityIds），传入各 Provider 共享。Provider 不自行查库加载共享数据，只读 BuildContext + 调 vectorIndexService/dbManager 做检索。

### P1-2 ContextItem.id 生成规则
格式：`${itemType}:${entityId}`（如 `character:char_xxx`、`memory:mem_xxx`）。同 entityType 多 chunk 时加序号（`chapter:chunk_yyy:0`）。保证 forcedContext 的 itemId 可稳定映射回 item。

### P1-3 forcedContext 优先级
`buildFromManifest` 处理 forcedContext 与 manifest.included 冲突：
- `exclude` -> 强制 included=false（即使 priority 高）
- `include` -> 强制 included=true（即使被预算压缩）
- `edit` -> 替换 content，included 保持 true
- 优先级：forcedContext > builder 默认 > 预算压缩
- 应用后重新核算 token；include 导致超预算则压缩其他低优先级分区（forced include 项不压缩）

### P1-4 token 估算（混合文本）
统一公式：`tokenEstimate = ceil(字符数 × 1.5)`（含中英文，保守估算）。不区分语种，安全边际 1000 + 压缩策略兜底。不引入 tiktoken 依赖。

### P1-5 buildPreview 缓存
- `manifest.buildId = ${outlineId}:${sha256(outline.summary + involvedEntityIds + targetWords)}`
- 同 buildId 且大纲未改 -> 直接返回缓存 manifest（不重新检索）
- 大纲改动或 forcedContext 变化 -> 重新构建
- 缓存放内存（store），不持久化

---

## 10. 开放问题

1. token 估算用粗略字符数还是引入 tiktoken？- 倾向粗略（避免依赖 + 中文模型 token 与字符比不稳定）。
2. Provider 并行构建是否需限流（同时多个向量检索）？- MVP 并行即可，量不大。
3. systemPrompt 是否允许用户自定义（写作风格偏好）？- 标记为未来增强，本步用固定模板。
4. buildPreview 是否缓存（同大纲未改动时复用）？- 倾向加 buildId + 大纲 hash 缓存，减少重复构建。
