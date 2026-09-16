# 主题学习空间：起步研究（生成首批知识）的 Agent 执行过程改到提示框内

日期：2026-09-13
指令：「主题知识界面，点击生成首批知识时，agent 的执行过程，不应该显示在顶部，
应该显示在生成首批知识按钮所在提示框的下面。」

## 现象与根因

- **主题学习空间页**（`DomainLearningSpace.vue`）：`AgentActivityStrip`（滚动显示"正在检索/正在落库…"）
  挂在**页面顶部**（原第 21 行，页头与方案条之间），而「生成首批知识」按钮在中栏起步卡片里——
  反馈离触发点很远。
- **知识全景页**（`DomainAtlas.vue:117`）本来就把活动行放在起步卡片内、按钮下方——两页不一致。

## 改动（3 处，只在主题学习空间页）

1. 顶部活动行加守卫：`v-if="spaceId && !isEmptySpace"` —— 空主题起步态让位（避免同一轮出现两份活动行）；
2. 起步卡片内、按钮下方新增活动行：`<AgentActivityStrip v-if="spaceId" :space-id="spaceId" class="boot-activity" />`
   （位置与知识全景页一致：按钮 → 活动行 → 失败/未产出提示）；
3. 样式 `.boot-card .boot-activity { margin: 12px 0 0; text-align: left }`（卡片本体文字居中，活动行左对齐）。

非空空间里的长任务（研究此概念、补全知识地图）**仍保留置顶活动行**，本次未动。

**为什么不会"跑一半又跳回顶部"**：`isEmptySpace` 只在空间视图刷新时变化，而 `refreshView()`
只在整轮结束（`bootResearch` / `researchConcept` / `onPlanDriven` / task 收尾）后调用，
不在轮次中途调用——所以起步轮全程活动行都留在卡片内；等首批概念真正落库、视图刷新后，
卡片消失、活动行才回到顶部（此时空间已非空，符合预期）。

## 验证（TDD：先写失败测试，再实现）

新增 `tests/unit/renderer/domain-learning/space-boot-activity.spec.ts`（2 例，页面级 DOM 断言）：

1. **空主题（起步态）**：活动行只有 1 个，且位于 `.boot-card` 内、DOM 顺序排在按钮之后；
2. **非空空间**：起步卡片不出现，活动行不在卡片内（置顶保留）。

流程与结果：

- 实现前跑该 spec → **1 例失败**（活动行不在起步卡片内），确认测试真锁住了需求；
- 实现后 → **2 例全绿**；
- 回归：`npx vitest run tests/unit/renderer/domain-learning` → **10 文件 / 81 例全绿**；
- `npx eslint <改动文件>` → **0 error**（仅 1 条既有 `no-explicit-any` warning，位于本次未触碰的第 1633 行）；
- `npx vue-tsc --noEmit` 过滤本次文件 → **无类型错误**（仓库其他文件存在既有存量错误，与本次无关）。

## 界面查看

渲染进程 dev server（5173）在跑，改动已由 Vite HMR 应用；若窗口停留在其他页，
重新进入主题学习空间即可看到：点「生成首批知识」后，活动行出现在按钮正下方。
