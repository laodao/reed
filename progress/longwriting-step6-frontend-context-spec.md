# 步骤 6 Spec - 前端 Pinia store + 上下文预览面板

> 步骤：6 / 8
> 名称：前端 store + 上下文预览/编辑面板
> 日期：2026-07-31
> 依赖：步骤 1（ContextBuilder manifest）、步骤 2（extraction 进度事件）
> 修复 Review：R12（Pinia store 范围限定）
> 关联：[总 Spec](./2026-07-31-longwriting-optimization-spec.md) §12、[实施规划](./2026-07-31-longwriting-implementation-plan.md)

---

## 1. 目标

让长文写作的上下文**可见、可控**：
- 新建 longwriting Pinia store，集中管理"新增能力"状态（上下文清单、提取进度、后续图谱/时间线/快照）
- 上下文预览/编辑面板：生成前展示将注入的上下文分区+items，用户可勾选/排除/编辑
- forcedContext 注入生成（R8 manifest 复用）
- 提取进度反馈

**范围限定（R12）**：store 只管新增能力状态，**不强行迁移现有 7 个 Stage 组件的 ref**（避免大爆炸）。现有 Stage 组件保持现状，新面板作为独立组件挂载。

---

## 2. 现状

- 无 longwriting 专属 Pinia store（状态全在组件 ref，provide/inject 共享）
- 写章节时上下文黑盒：用户看不到注入了哪些记忆/状态/设定
- AI 生成对话框仅显示"已加载 X 条相关记忆"数字
- "设定集"按钮是空 el-empty
- 提取状态靠手动点按钮 + 弹窗

---

## 3. Pinia store 设计

文件：`src/renderer/src/stores/longwriting.ts`

### 3.1 State（仅新增能力状态）

```typescript
interface LongWritingStoreState {
  // ===== 上下文相关 =====
  currentManifest: ContextManifest | null
  manifestLoading: boolean
  manifestBuildId: string | null         // 当前 manifest 的 buildId（缓存校验）
  forcedContext: ForcedContextItem[]     // 用户的强制注入/排除/编辑
  // ===== 提取相关 =====
  extractionStatus: Record<string, ExtractionStepStatus>  // key: outlineId
  extractionRunning: boolean
  extractionProgress: ExtractionProgress | null           // 当前运行的进度
  // ===== 后续步骤扩展（步骤7用，本步预留空值）=====
  graphData: GraphData | null
  timelineEvents: LwTimelineEvent[]
  currentSnapshot: LwStorySnapshot | null
}

interface ExtractionStepStatus {
  outlineId: string
  chapterNumber: number
  steps: Array<{ key: string; name: string; status: 'pending' | 'running' | 'success' | 'failed'; error?: string }>
  lastRunAt: number
}

interface ExtractionProgress {
  eventId: string
  outlineId: string
  totalSteps: number
  completedSteps: number
  currentStep: string | null
}
```

### 3.2 Actions

```typescript
// 上下文
async buildContextPreview(input: ContextBuildInput): Promise<ContextManifest>
  // 调 IPC context:buildPreview -> 设 currentManifest + manifestBuildId
applyForcedContext(itemId: string, action: 'include' | 'exclude' | 'edit', editedContent?: string): void
  // 更新 forcedContext（同 itemId 覆盖）
resetForcedContext(): void
clearManifest(): void

// 提取
async runExtraction(projectId: string, outlineId: string, options: PipelineRunOptions): Promise<PipelineRunReport>
  // 调 IPC extraction:run，设 extractionRunning，监听进度事件
async resetExtraction(projectId: string, outlineId: string, chapterNumber: number): Promise<void>
async loadExtractionStatus(projectId: string, outlineId: string): Promise<void>
  // 调 IPC extraction:status

// 章节完成
async completeChapter(outlineId: string): Promise<void>
  // 调 IPC outline:complete（标记 completed + 触发提取）

// 事件监听（store 初始化时注册）
setupEventListeners(): void
  // onExtractionProgress -> 更新 extractionProgress + extractionStatus
  // onContextManifest -> 更新 currentManifest（生成过程中收到）
cleanupEventListeners(): void
```

### 3.3 Getters

```typescript
totalTokenEstimate: number              // currentManifest.totalTokenEstimate
includedItemsCount: number              // included=true 的 item 数
overBudget: boolean                     // totalTokenEstimate > availableForContext
sectionsByPriority: ContextSection[]    // 按 priority 排序的分区
```

### 3.4 范围边界（R12）

**store 管理的**：上下文清单、forcedContext、提取状态、（预留）图谱/时间线/快照
**不迁移的**：现有 StoryEditor/各 Stage 组件的项目数据、大纲树、章节内容、角色列表等 ref（保持现状，避免大爆炸）

> 章节写作 Tab 的章节内容、大纲树等仍用组件 ref；上下文预览面板和提取状态用 store。两者通过 outlineId 关联。

---

## 4. 上下文预览/编辑面板

组件：`src/renderer/src/components/longwriting/story/ContextPreviewPanel.vue`

### 4.1 挂载位置

`ChapterStage.vue` 现有为两栏布局（`.outline-tree-panel` + `.chapters-panel`），**无右侧侧栏**，需改造为三栏（大纲树 | 编辑器 | 上下文面板）或在编辑器区内嵌可折叠侧栏。倾向三栏，ContextPreviewPanel 可折叠收起。plan 阶段 E 已含布局改造任务。

### 4.2 布局

```
┌─ 上下文预览 ────────────────────┐
│ [预览上下文] 按钮                 │
│                                  │
│ 总 token: 8420 / 16000  ▓▓▓░░    │
│ 超预算时红色提示                  │
│                                  │
│ ▼ 一、故事宏观背景 (priority 4)  │
│   ☑ [概要] 暗线追凶...  120tok  │
│   ☑ [冲突] 六年前凶案... 80tok  │
│                                  │
│ ▼ 三、涉及角色 (priority 2)      │
│   ☑ [角色] 林锋-主角...  200tok │
│     [编辑] [相关性: 0.92]        │
│   ☑ [状态] 当前: 受伤... 60tok  │
│                                  │
│ ▼ 六、关键记忆 (priority 6)      │
│   ☑ [记忆] 林锋离职...  100tok  │
│     [相关性: 0.88]               │
│   ☐ [记忆] 老局长谈话 80tok     │ <- 用户取消
│                                  │
│ ▼ 七、相关历史片段 (priority 8)  │
│   ☑ [章节] 第3章结尾... 150tok  │
│                                  │
│ [重置选择]                        │
│ [生成章节] (主按钮)               │
└──────────────────────────────────┘
```

### 4.3 交互

| 操作 | 效果 | forcedContext |
|------|------|---------------|
| 复选框勾选/取消 | 切换 included | include / exclude |
| 点"编辑" | 弹出 textarea 编辑 item.content | edit + editedContent |
| 点"预览上下文" | 调 store.buildContextPreview | - |
| 点"重置选择" | 清空 forcedContext，恢复 builder 默认 | reset |
| 点"生成章节" | 调 generateChapter(manifest, forcedContext) | 提交当前 forcedContext |

### 4.4 token 展示
- 每分区显示 tokenEstimate
- 底部进度条：totalTokenEstimate / availableForContext
- 超预算（overBudget getter）时进度条红色 + 提示"将自动压缩低优先级分区"

### 4.5 相关性展示
- vector 检索的 item 显示 score（0-1）
- 按 score 排序（同分区内）

### 4.6 状态
- manifestLoading：骨架屏
- 无 manifest 时：引导文案"点预览上下文查看将注入的信息"
- 生成中：禁用面板交互 + loading

---

## 5. 生成流程集成

### 5.1 新流程（带预览）

```
用户在 ChapterStage 选大纲节点
  -> 点"预览上下文"
  -> store.buildContextPreview({ projectId, outlineId, targetWords })
  -> IPC context:buildPreview -> ContextManifest
  -> 面板展示分区+items
  -> 用户勾选/编辑（更新 forcedContext）
  -> 点"生成章节"
  -> IPC chapter:generate(outlineId, targetWords, manifest, forcedContext)
     // R8: 后端 buildFromManifest 复用，不重复检索
  -> 流式输出到 MarkdownEditor
  -> 生成完成保存
```

### 5.2 兼容旧流程
- 不点预览直接生成：generateChapter 不传 manifest，后端自动 build（步骤1 已支持）
- 现有 AI 生成对话框保留作为简易入口

### 5.3 章节完成与提取
```
生成完成 -> 用户确认满意 -> 点"完成章节"
  -> store.completeChapter(outlineId)
  -> IPC outline:complete (标记 status='completed' + 触发 runForChapter)
  -> 监听 extraction:progress 事件
  -> 面板/通知展示提取进度
  -> 提取完成 -> 该章节向量入库 -> 后续章节预览能检索到
```

---

## 6. 提取进度消费

### 6.1 进度展示组件
`components/longwriting/story/ExtractionStatusBadge.vue`（或在 ContextPreviewPanel 底部）
- 显示各步骤状态：⏳running / ✅success / ❌failed
- 失败步骤"重试"按钮（调 runExtraction 单步）
- 提取中禁用"完成章节"重复点击

### 6.2 事件监听
store.setupEventListeners 注册：
- `longwriting:extraction:progress:<eventId>` -> 更新 extractionProgress
- `longwriting:extraction:done:<eventId>` -> 更新 extractionStatus + 清除 progress

事件通过 preload 的 `onExtractionProgress(eventId, cb)` / `offExtractionProgress(eventId, cb)` 订阅。

---

## 7. 组件结构

```
components/longwriting/story/
  ContextPreviewPanel.vue          # 上下文预览/编辑面板（本步核心）
  ContextItemRow.vue               # 单个上下文项行（复选框+编辑+score+token）
  ExtractionStatusBadge.vue        # 提取进度徽章
stores/
  longwriting.ts                   # Pinia store（本步新建）
```

现有 `ChapterStage.vue` 修改：引入 ContextPreviewPanel 挂载到右侧侧栏；接入 store。

---

## 8. IPC 调用（前端侧）

`window.electronAPI.longwriting.*` 新增/扩展：
- `context.buildPreview(input)` -> ContextManifest
- `chapter.generate({ outlineId, targetWords, manifest?, forcedContext? })` -> 流式
- `extraction.run(projectId, outlineId, options)` -> report
- `extraction.reset(projectId, outlineId, chapterNumber)` -> void
- `extraction.status(projectId, outlineId)` -> ExtractionStepStatus
- `outline.complete(outlineId)` -> void
- 事件：`onExtractionProgress(eventId, cb)` / `offExtractionProgress` / `onContextManifest`

> preload 已有 longwriting 命名空间（步骤1/2 已扩展 IPC），本步前端对接。

---

## 9. 测试计划

### 9.1 单元测试（Vitest + @vue/test-utils）
- **store**：
  - buildContextPreview：调 IPC -> 设 currentManifest
  - applyForcedContext：include/exclude/edit 更新 forcedContext（同 itemId 覆盖）
  - resetForcedContext：清空
  - getters：totalTokenEstimate、includedItemsCount、overBudget、sectionsByPriority
  - 事件监听：onExtractionProgress -> 更新 extractionProgress
- **ContextPreviewPanel**：
  - 渲染 manifest 分区 + items
  - 复选框切换 -> emit forcedContext 变更
  - 编辑按钮 -> 弹出编辑框 -> 保存
  - 超预算红色提示
  - loading 骨架屏
- **ContextItemRow**：
  - props 渲染（title/score/token）
  - 复选框/编辑事件 emit
- **ExtractionStatusBadge**：
  - 各状态渲染
  - 失败重试按钮 emit

### 9.2 集成测试
- `context-panel.integration.spec.ts`：
  - mock IPC buildPreview 返回 manifest -> 面板渲染
  - 勾选/编辑 -> forcedContext 更新
  - 点生成 -> 调 chapter.generate 传 manifest + forcedContext
  - 完成章节 -> completeChapter -> 进度事件 -> 状态更新

### 9.3 E2E 测试
- `tests/e2e/` 长文写作章节生成：预览->编辑->生成->完成->提取 全流程

---

## 10. 验收标准（可量化）

| # | 验收点 | 可量化指标 / 断言 |
|---|--------|------------------|
| 6.1 | store 建立 | store 含 state/actions/getters；git diff 显示 7 个 Stage 组件仅新增 import + 挂载，无 ref 删除（R12 范围限定） |
| 6.2 | 面板渲染 | buildPreview 返回 8 分区 -> 面板渲染 8 个 section，每 section items 数 = `manifest.sections[i].items.length` |
| 6.3 | forcedContext 交互 | toggle -> forcedContext 含 {itemId, action}；编辑 -> content 替换；重置 -> forcedContext=[] |
| 6.4 | 生成传参 | chapter.generate 参数 `manifest.buildId === buildPreview` 返回的 buildId；forcedContext.length = 用户操作数 |
| 6.5 | 完成章节 | completeChapter 后 `extractionProgress.totalSteps=4`；4 步状态在 badge 可见 |
| 6.6 | 失败重试 | step failed -> badge 显示❌ + 重试按钮；点击 -> `runExtraction({steps:[failedStep],force:true})` |
| 6.7 | 超预算提示 | overBudget 场景进度条红色 + 提示文案显示 |
| 6.8 | 测试覆盖 | store ≥6 单测；3 组件各 ≥3 单测；集成 ≥1；E2E ≥1（预览-编辑-生成-完成-提取）；回归通过 |

---

## 10.5 接口细节补充（review 补充）

### P6-1 store 占位类型
本步 store 的 graphData/timelineEvents/currentSnapshot 引用步骤3/4/5 的 entity 类型（未建）。本步用占位：
- `graphData: unknown`（步骤7 替换为 GraphData）
- `timelineEvents: unknown[]`（步骤7 替换为 LwTimelineEvent[]）
- `currentSnapshot: unknown`（步骤7 替换为 LwStorySnapshot）
步骤3/4/5 实现时将 unknown 替换为实际类型。

### P6-2 ContextPreviewPanel props/emit 契约
```typescript
interface ContextPreviewPanelProps {
  outlineId: string
  projectId: string
}
interface ContextPreviewPanelEmits {
  (e: 'generate', payload: {
    outlineId: string
    targetWords: number
    manifest: ContextManifest
    forcedContext: ForcedContextItem[]
  }): void
  (e: 'retryStep', stepKey: string): void
}
```

### P6-3 generate payload 结构
点"生成章节"按钮 `emit('generate', { outlineId, targetWords, manifest, forcedContext })`：
- outlineId：当前大纲节点
- targetWords：用户输入或大纲默认
- manifest：store.currentManifest（buildPreview 返回，含 buildId）
- forcedContext：store.forcedContext（用户勾选/编辑累积）
父组件 ChapterStage 接收 -> 调 IPC chapter.generate(payload)

---

## 11. 开放问题

1. ContextPreviewPanel 默认展开还是折叠？- 倾向首次预览后自动展开，用户可折叠。
2. 编辑 item.content 用弹窗还是内联？- 倾向弹窗（内容可能较长）。
3. 是否支持"保存为预设"（用户固定的 forcedContext 偏好）？- 标记未来增强，本步不做。
4. 提取进度用面板内徽章还是全局通知？- 倾向面板内徽章 + 完成时 toast。
