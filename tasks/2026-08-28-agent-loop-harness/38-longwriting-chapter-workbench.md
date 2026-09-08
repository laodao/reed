# 38 · 长文写作「章节工作台」详细设计与实施计划

> 依据：`prototype/longwriting-context-panel.html`（章节工作台原型 v2 · 可交互）
> 分支：feat/agent-harness ｜ 前置：HostKit/知识飞轮/图谱 provider（36/37 号）

## 1. 原型解读（设计意图）

原型的核心不是改版式，而是给章节生成加**上下文的可视化与可控化**：

- 三栏布局：大纲树 ｜ 章节编辑器 ｜ **上下文预览面板（新增核心）**；
- 生成前，右栏展示「本次生成将注入的全部上下文」：故事概要 / 世界观 / 涉及角色 /
  涉及地点 / 大纲节点 / 预写提纲 / 图谱事实 / 前文章节——逐条带勾选框；
- **token 预算条**：估算总量 vs 模型窗口（如 DeepSeek-Chat · 32K），超限前预警；
- 「⚡ 预览」看组装后的最终提示词；「↺ 重置选择」恢复默认；「✦ 生成章节（含上下文）」
  按勾选项生成；支持「编辑上下文项」对单项文本微调。

价值：章节质量差的第一原因往往是上下文缺失/污染——把组装从"黑盒"变成"可审可改"。

## 2. 现状与差距

| 能力 | 现状 | 原型要求 |
|---|---|---|
| 上下文组装 | `longwriting-ai.service.ts` generateChapter 内联拼 prompt（概要/世界观/角色含实体状态/地点/大纲/预写/图谱/前文），**不可见不可控** | 结构化清单 + 可勾选 + 可预览 |
| token 预算 | 无展示 | 预算条 + 超限预警 |
| 章节生成 | `lw:generateChapter` 流式（eventId → longwriting:generate 通道） | 保留；新增按勾选上下文生成的平行入口 |
| 三栏布局 | ChapterStage 已有大纲树 + 章节卡（两栏） | 增右栏面板 |

## 3. 详细设计

### 3.1 后端：ChapterContextAssembler（单一事实源）

新模块 `src/core/platform/services/longwriting/chapter-context.ts`：

```ts
interface ChapterContextItem {
  id: string            // `${sectionKey}:${entityId|key}`（稳定，供勾选）
  sectionKey: 'overview' | 'background' | 'character' | 'location'
            | 'outline' | 'prewrite' | 'graph' | 'prevChapters'
  title: string         // 「林锋（主角）」「3.1 码头夜话 提纲」
  text: string          // 注入 prompt 的原文（复用 aiService 既有 build* 方法）
  tokens: number        // 本地估算（UTF-8 字节/4，与 ContextManager 同款）
  defaultChecked: boolean
}
interface ChapterContextResult {
  items: ChapterContextItem[]
  promptText: string    // 按默认勾选组装的正文段（预览=实际，防两套逻辑漂移）
  estimateTokens: number
  windowTokens: number  // 模型窗口（providerConfig.modelId → capabilities；缺省 32768）
}
```

- `assembleChapterContext(db, projectId, outlineId, chapterNumber)`：**复用** generateChapter
  既有的取数与 build* 方法（角色/地点实体状态切片、图谱段、回忆段、预写、前文摘要），
  产出 items + promptText——预览与真实生成共享同一组装输出，绝不两套逻辑；
- 生成路径改造：`generateChapter` 增加可选 `contextControl?: { enabledItemIds: string[];
  itemTextOverrides?: Record<string,string> }`——组装后按勾选/覆写过滤重建正文段，
  其余（系统提示词、任务骨架、字数/文风约束）不受控；
- 勾选项被禁用时的段落降级：整段全禁才移除该分节标题；部分禁用只移除条目文本。

### 3.2 IPC（lw:* 双端）

- `lw:chapter-context-preview` `{projectId, outlineId, chapterNumber}` →
  `ChapterContextResult`（不含系统提示词——那是固定纪律不开放编辑）；
- `lw:generateChapterWithContext` `{projectId, outlineId, chapterNumber, targetWords,
  style, extraPrompt, enabledItemIds, itemTextOverrides}` → 与 generateChapter 同款
  流式（eventId → longwriting:generate 通道），落版本/字数回写复用既有链路。

### 3.3 前端（ChapterStage 三栏）

- 新组件 `components/longwriting/story/ChapterContextPanel.vue`：
  - token 预算条（进度条 + 数字；>90% 转红并建议取消低优先条目）；
  - 分区折叠列表：分区标题勾选（全选/全不选联动）+ 条目勾选 + 条目 token 数；
  - 「编辑上下文项」：条目文本 textarea 微调（itemTextOverrides，仅本轮生效）；
  - 「⚡ 预览」：弹窗只读展示 promptText（按当前勾选实时重组）；
  - 「↺ 重置选择」「✦ 生成章节（含上下文）」。
- ChapterStage 布局：章节写作阶段 `stage-content` 变三栏（大纲树 | 编辑器 | 面板，
  面板 300px 可折叠）；生成按钮按面板开关分流到 with-context 入口；流式/版本/
  导出等既有行为零改动。

## 4. 实施计划（子任务）

| # | 任务 | 产出 | 依赖 |
|---|---|---|---|
| LW-9a | ChapterContextAssembler（items + promptText + 预算） | chapter-context.ts + 单测 | 无 |
| LW-9b | generateChapter contextControl 参数 + 2 个 IPC + preload/channel-map | 可调用的服务 | LW-9a |
| LW-9c | ChapterContextPanel.vue 组件 | 面板 UI | LW-9b |
| LW-9d | ChapterStage 三栏接线 + 生成按钮分流 | 端到端可用 | LW-9c |
| LW-9e | 真机实测（预览一致性/勾选生成/token 条） | 截图+记录 | LW-9d |

## 5. 明确不做（本批）

- 大纲/角色等其他阶段的上下文预览（原型只定义了章节写作阶段；模式验证后复制）；
- 上下文项的持久化保存（勾选/覆写仅本轮生效——原型语义如此）；
- 替换 Agent 宿主写章路径（write_chapter 工具继续走既有组装；面板控制的是主界面
  手动生成路径——两条路径的最终统一登记为后续演进）。
