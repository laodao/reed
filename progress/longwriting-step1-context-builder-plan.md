# 步骤 1 Plan - 智能上下文构建器 ContextBuilder

> 步骤：1 / 8
> 名称：ContextBuilder
> 日期：2026-07-31
> 依赖：步骤 0（LwVectorIndexService）
> 关联：[步骤1 Spec](./longwriting-step1-context-builder-spec.md)
> 预估：4-5 工作日

---

## 1. 任务拆解（TDD 顺序）

### 阶段 A：类型与接口定义（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| A1 | `src/core/services/longwriting/context/context.types.ts` | ContextBuildInput / ForcedContextItem / ContextItem / ContextSection / ContextManifest / ContextBuildOutput / ContextProvider / BuildContext 类型 |
| A2 | `src/core/services/longwriting/context/context-provider.interface.ts` | ContextProvider 接口 + 注册器 |
| A3 | 测试 `context.types.spec.ts` | 类型契约（编译期） |

### 阶段 B：MVP Provider 实现（1.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| B1 | `providers/story-overview.provider.ts` | 概要+核心冲突（复用现有数据） |
| B2 | `providers/background.provider.ts` | 世界观设定（复用 buildBackgroundContext 逻辑） |
| B3 | `providers/character.provider.ts` | 涉及角色完整信息+实体状态（复用 buildCharacterFullInfo + EntityStateSnapshot） |
| B4 | `providers/location.provider.ts` | 涉及场景（复用 buildLocationFullInfo） |
| B5 | `providers/memory.provider.ts` | 向量检索记忆（调 LwVectorIndexService.search）+ critical 记忆 |
| B6 | `providers/entity-state.provider.ts` | 涉及实体当前状态（getEntityStateAtChapter） |
| B7 | `providers/previous-chapter.provider.ts` | 上一章结尾（按段落截取，动态字数）+ 章节状态摘要 |
| B8 | `providers/prewrite.provider.ts` | 预写提纲 |
| B9 | `providers/vector-search.provider.ts` | 相关历史章节片段+相关设定（vector 检索，chapterNumberLte） |
| B10 | 各 provider 单测 | mock BuildContext，验证输出 ContextSection 正确 |

> 复用原则：从 `longwriting-ai.service.ts` 提取 buildCharacterFullInfo/buildLocationFullInfo/buildBackgroundContext/extractEndingContentByParagraph 为独立工具函数，Provider 调用。

### 阶段 C：ContextBuilder 编排器（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| C1 | `src/core/services/longwriting/context/context-builder.service.ts` | 编排主逻辑 |
| C2 | 同上 | Provider 注册 + 并行 build |
| C3 | 同上 | 优先级排序 + 预算分配 + 压缩策略 |
| C4 | 同上 | forcedContext 应用 |
| C5 | 同上 | buildFromManifest（R8 复用） |
| C6 | 同上 | systemPrompt/userPrompt 拼接 |
| C7 | 测试 `context-builder.service.spec.ts` | 并行编排、优先级、预算压缩、forcedContext、manifest 复用 |

### 阶段 D：动态 token 预算（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| D1 | `src/core/services/longwriting/context/token-budget.util.ts` | resolveModelWindow / 预算分配 / token 估算（中文*1.5） |
| D2 | 确认 ProviderTemplate/ModelDefinition 字段 | 查 `src/shared/types/provider-template.types.ts` 是否有 contextWindow，无则扩展类型+默认值 |
| D3 | 测试 `token-budget.util.spec.ts` | 有窗口/无窗口/默认/超预算压缩 |

### 阶段 E：集成 generateChapter 重构（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| E1 | `src/core/services/longwriting-ai.service.ts` | 重构 generateChapter：删除手工拼接，调用 ContextBuilder |
| E2 | 同上 | 提取 buildCharacterFullInfo 等为工具函数供 Provider 复用 |
| E3 | 同上 | 支持 manifest + forcedContext 参数（R8） |
| E4 | 同上 | buildPreview 独立方法 |
| E5 | 同上 | 删除 getMemoryContext/getEntityStateContext/getChapterStateSummaryContext 的直接调用（逻辑移入 Provider） |
| E6 | 集成测试 | 端到端构建+生成 |

### 阶段 F：IPC + 前端契约（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| F1 | `src/electron/ipc/handlers/longwriting.handler.ts` | context:buildPreview 通道 |
| F2 | `src/preload/index.ts` | 注册 API |
| F3 | `src/shared/types/longwriting.types.ts` | ContextManifest 等类型导出（供前端用） |
| F4 | Web 端 controller 同步 | |
| F5 | 集成测试 | buildPreview -> manifest -> 前端可消费 |

> 注：前端预览面板 UI 在步骤 6 实现，本步只保证 IPC 契约就绪。

---

## 2. 依赖与顺序

```
A (类型) -> B (providers) -> C (builder) -> E (集成 generateChapter)
A -> D (token 预算) -> C
C -> F (IPC)
```

A 先行。B/D 可并行。C 依赖 A+B+D。E 依赖 C。F 依赖 E。

---

## 3. 测试策略

### 3.1 单元测试
- **各 Provider**：mock BuildContext（含 vectorIndexService mock），验证：
  - 输出 ContextSection 结构正确
  - 涉及实体来自大纲 involvedEntities
  - MemoryProvider/VectorSearchProvider 调用 search 且 chapterNumberLte 生效
  - PreviousChapterProvider 截取字数动态（min(targetWords*0.15, 800)）
- **ContextBuilder**：
  - 注册多个 Provider -> 并行 build -> 收集 sections
  - 优先级排序正确
  - 预算充足：全部 included
  - 预算不足：priority 11 先丢、10 摘要化、必留（1-4）全保留
  - forcedContext: include 强制保留、exclude 排除、edit 替换 content
  - buildFromManifest: 不调 Provider.build，直接用 manifest
- **token-budget**：
  - resolveModelWindow: 模板有窗口/无窗口/默认 16000
  - 估算：中文 100 字 -> ~150 token
  - 压缩：超预算按优先级裁剪

### 3.2 集成测试
- `context-builder.integration.spec.ts`：
  - 建项目+大纲+角色+记忆+章节 -> buildPreview -> manifest 含 8 分区
  - 大量记忆场景 -> 验证低优先级压缩、必留不丢
  - manifest 复用：buildPreview -> forcedContext 编辑 -> buildFromManifest -> prompt 与预览一致
- `generateChapter.integration.spec.ts`：
  - 不传 manifest：兼容旧流程，正常生成
  - 传 manifest：不重复检索（验证 vectorIndexService.search 调用次数）

### 3.3 回归测试
- 现有 `tests/e2e/web/09-longwriting.spec.ts` 章节生成用例通过
- 生成内容质量不降（人工抽检）

---

## 4. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| 模型 contextWindow 字段不存在 | 高 | 中 | 查类型定义，无则扩展 ProviderTemplate 类型 + 默认 16000；不阻塞 |
| Provider 并行向量检索慢 | 中 | 中 | 并行量小（2-3 个 provider 检索），可接受；必要时串行化 |
| token 估算不准导致超窗口 | 中 | 高 | 安全边际 1000 + 压缩策略兜底；估算偏保守 |
| 重构 generateChapter 破坏现有流程 | 中 | 高 | 保留旧方法签名兼容；E2E 回归；灰度（feature flag 控制新旧流程） |
| forcedContext 编辑后 token 超预算 | 低 | 中 | 编辑后重新核算，超预算时提示用户或自动压缩低优先级 |
| 提取的工具函数与原逻辑不一致 | 中 | 中 | 提取时保持逻辑等价，单测覆盖原函数行为 |

---

## 5. 交付物清单

- [ ] `context.types.ts` + `context-provider.interface.ts`
- [ ] 8 个 Provider 实现 + 单测
- [ ] `context-builder.service.ts`（编排+预算+压缩+forcedContext+manifest 复用）
- [ ] `token-budget.util.ts` + 单测
- [ ] generateChapter 重构 + 工具函数提取
- [ ] IPC context:buildPreview + preload + Web controller
- [ ] 类型导出到 shared/types
- [ ] 集成测试（buildPreview / manifest 复用 / generateChapter 兼容）
- [ ] 回归测试通过

---

## 6. 验收检查表

- [ ] generateChapter 上下文来自 ContextBuilder
- [ ] 记忆/设定按向量相关性检索（不再章节号截断）
- [ ] maxTokens 动态，5000 字章节不截断
- [ ] 预算超限按优先级压缩，必留分区不丢
- [ ] buildPreview 返回 manifest
- [ ] forcedContext include/exclude/edit 生效
- [ ] generateChapter 接收 manifest 不重复检索
- [ ] 模型窗口未知默认 16K
- [ ] 现有章节生成回归通过

---

## 7. 后续衔接

本步骤完成后：
- **步骤 2 ExtractionPipeline**：章节完成后调 indexChapter/upsertEntity，让 ContextBuilder 有向量数据可检索
- **步骤 3 故事知识图谱**：新增 GraphProvider 注册到 ContextBuilder，图扩展上下文
- **步骤 4 时间线**：新增 TimelineProvider
- **步骤 5 伏笔**：新增 ForeshadowProvider
- **步骤 6 前端**：消费 buildPreview 的 manifest 实现上下文预览面板

**接口冻结**：ContextProvider 接口、ContextManifest 结构、buildPreview/buildFromManifest 方法签名在本步骤冻结，后续步骤按此扩展（仅新增 Provider，不改 ContextBuilder 主逻辑）。
