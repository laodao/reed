# 步骤 6 Plan - 前端 Pinia store + 上下文预览面板

> 步骤：6 / 8
> 名称：前端 store + 上下文预览面板
> 日期：2026-07-31
> 依赖：步骤 1（ContextBuilder manifest）、步骤 2（extraction 进度事件）
> 关联：[步骤6 Spec](./longwriting-step6-frontend-context-spec.md)
> 预估：3-4 工作日

---

## 1. 任务拆解（TDD 顺序）

### 阶段 A：Pinia store（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| A1 | `src/renderer/src/stores/longwriting.ts` | 新建 store：state（上下文/提取/预留图谱）+ actions + getters |
| A2 | 同上 | buildContextPreview / applyForcedContext / resetForcedContext |
| A3 | 同上 | runExtraction / resetExtraction / loadExtractionStatus / completeChapter |
| A4 | 同上 | setupEventListeners / cleanupEventListeners（extraction progress 事件） |
| A5 | 同上 | getters：totalTokenEstimate / includedItemsCount / overBudget / sectionsByPriority |
| A6 | 测试 `longwriting.store.spec.ts` | 各 action + getter + 事件监听 |

### 阶段 B：ContextItemRow 组件（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| B1 | `components/longwriting/story/ContextItemRow.vue` | 单行：复选框+类型图标+标题+score+token+编辑按钮 |
| B2 | 同上 | 复选框切换 emit('toggle', itemId, included) |
| B3 | 同上 | 编辑按钮 emit('edit', itemId) |
| B4 | 测试 | props 渲染 + 事件 emit |

### 阶段 C：ContextPreviewPanel 组件（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| C1 | `components/longwriting/story/ContextPreviewPanel.vue` | 面板主组件 |
| C2 | 同上 | "预览上下文"按钮 -> store.buildContextPreview |
| C3 | 同上 | 分区列表（按 priority 排序）+ ContextItemRow 渲染 |
| C4 | 同上 | token 进度条 + 超预算提示 |
| C5 | 同上 | 编辑弹窗（el-dialog + textarea） |
| C6 | 同上 | "重置选择" + "生成章节" 按钮 |
| C7 | 同上 | loading 骨架屏 + 空状态引导 |
| C8 | 测试 `context-preview-panel.spec.ts` | 渲染/勾选/编辑/超预算/loading |

### 阶段 D：ExtractionStatusBadge 组件（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| D1 | `components/longwriting/story/ExtractionStatusBadge.vue` | 各步骤状态徽章 |
| D2 | 同上 | 失败步骤"重试"按钮 -> store.runExtraction 单步 |
| D3 | 测试 | 状态渲染 + 重试 emit |

### 阶段 E：ChapterStage 集成（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| E1 | `components/longwriting/story/ChapterStage.vue` | 引入 ContextPreviewPanel 挂载右侧侧栏 |
| E2 | 同上 | 接入 store（outlineId 关联） |
| E3 | 同上 | 生成流程：预览->编辑->生成（传 manifest+forcedContext） |
| E4 | 同上 | "完成章节"按钮 -> store.completeChapter |
| E5 | 同上 | ExtractionStatusBadge 挂载 |
| E6 | 集成测试 | 全流程 |

### 阶段 F：E2E 与回归（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| F1 | E2E 测试 | 预览->编辑->生成->完成->提取 全流程 |
| F2 | 回归测试 | 现有章节生成流程不破坏（不预览直接生成仍可用） |

---

## 2. 依赖与顺序

```
A (store) -> B (item row) -> C (panel) -> E (ChapterStage 集成)
A -> D (badge) -> E
C/D 独立可并行
E 依赖 A+B+C+D
F 依赖 E
```

A 先行。B/D 可并行。C 依赖 A+B。E 依赖 C+D。F 依赖 E。

---

## 3. 测试策略

### 3.1 单元测试
- **store**（Vitest）：
  - buildContextPreview：mock IPC -> currentManifest 设置 + manifestBuildId
  - applyForcedContext('item1', 'include') -> forcedContext 含 {itemId:'item1', action:'include'}
  - applyForcedContext('item1', 'edit', 'new') -> 同 itemId 覆盖
  - resetForcedContext -> forcedContext=[]
  - getters：构造 manifest -> totalTokenEstimate/includedItemsCount/overBudget 正确
  - setupEventListeners：mock onExtractionProgress 触发 -> extractionProgress 更新
- **ContextItemRow**：
  - props（item with score/token）渲染
  - 复选框 click -> emit('toggle', itemId, !included)
  - 编辑 click -> emit('edit', itemId)
- **ContextPreviewPanel**：
  - 无 manifest -> 空状态引导
  - manifestLoading -> 骨架屏
  - 有 manifest -> 分区 + items 渲染（按 priority 排序）
  - 复选框 toggle -> store.applyForcedContext
  - 编辑 -> 弹窗 -> 保存 -> store.applyForcedContext('edit', content)
  - overBudget -> 进度条红色
  - 生成按钮 -> emit('generate', { manifest, forcedContext })
- **ExtractionStatusBadge**：
  - steps 各状态渲染
  - failed 重试按钮 -> emit('retry', stepKey)

### 3.2 集成测试
- `context-panel.integration.spec.ts`：
  - mount ChapterStage + store -> mock IPC
  - 点预览 -> buildPreview 返回 manifest -> 面板渲染
  - 勾选/编辑 -> forcedContext 更新
  - 点生成 -> 验证 chapter.generate 调用参数含 manifest + forcedContext
  - 点完成 -> completeChapter -> mock extraction:progress 事件 -> badge 更新

### 3.3 E2E 测试
- `tests/e2e/longwriting-chapter-context.spec.ts`（新增）：
  - 创建项目 -> 大纲 -> 角色设定 -> 章节写作
  - 预览上下文 -> 编辑（取消某记忆）-> 生成 -> 验证生成内容
  - 完成章节 -> 提取进度显示 -> 完成
- 回归：现有 `09-longwriting.spec.ts` 通过

---

## 4. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| 现有 ChapterStage 改动破坏章节写作 | 中 | 高 | 最小改动：仅加侧栏挂载 + store 接入；不重构现有逻辑；回归测试 |
| store 与现有组件 ref 状态冲突 | 中 | 中 | R12 严格限定 store 范围；不迁移现有 ref；通过 outlineId 解耦 |
| manifest 结构复杂导致面板渲染性能差 | 低 | 低 | 分区懒展开；item 虚拟滚动（若 >100 项） |
| 事件监听未清理导致内存泄漏 | 中 | 中 | setupEventListeners/cleanupEventListeners 配对；组件 unmount 时 cleanup |
| 编辑 content 后 token 超预算未提示 | 低 | 中 | 编辑后重新核算 token（getter），超预算提示 |
| E2E 测试依赖 AI 生成不稳定 | 中 | 中 | E2E mock AI 响应；或仅测预览/编辑流程不测生成内容 |

---

## 5. 交付物清单

- [ ] `stores/longwriting.ts` Pinia store + 单测
- [ ] `ContextItemRow.vue` + 单测
- [ ] `ContextPreviewPanel.vue` + 单测
- [ ] `ExtractionStatusBadge.vue` + 单测
- [ ] `ChapterStage.vue` 集成（侧栏挂载 + 生成流程 + 完成章节）
- [ ] 集成测试（预览->编辑->生成->完成->提取）
- [ ] E2E 测试
- [ ] 回归测试通过

---

## 6. 验收检查表

- [ ] longwriting Pinia store 建立，范围限定（R12）
- [ ] 上下文预览面板展示 manifest（分区+items+token+score）
- [ ] 勾选/排除/编辑生效，forcedContext 正确
- [ ] 生成传 manifest + forcedContext，后端复用（R8）
- [ ] 完成章节触发提取，进度反馈
- [ ] 失败步骤可重试
- [ ] 现有 Stage 组件未破坏
- [ ] 超预算提示
- [ ] 回归测试通过

---

## 7. 后续衔接

本步骤完成后，**第一批 MVP（0->1->2->6）完整**：写作质量提升闭环可用。

- **步骤 3 故事知识图谱**：store.graphData 填充 + GraphProvider 注册到 ContextBuilder + GraphEdgeStep 注册到 Pipeline
- **步骤 4 时间线**：store.timelineEvents 填充 + TimelineProvider + TimelineStep
- **步骤 5 伏笔+快照**：store.currentSnapshot 填充 + ForeshadowProvider + ForeshadowStep + SnapshotStep
- **步骤 7 前端可视化**：图谱/时间线/快照视图组件，消费 store 中预留的状态字段

**接口冻结**：store state 结构（含预留 graphData/timelineEvents/currentSnapshot）、ContextPreviewPanel 的 props/emit 契约、forcedContext 格式在本步骤冻结。后续步骤 7 按此填充预留字段。
