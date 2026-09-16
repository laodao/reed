# 领域学习：空态下「研究此概念」的 agent 活动行改到按钮下方居中显示

日期：2026-09-14
用户原话：「知识点内容界面，当没有内容时，点击研究此概念，agent的输出不应该显示在顶部，应该在研究此概念按钮的下面居中滚动显示，表示agent在工作即可。」

## 现象

- 选中一个**没有讲义**的知识点，中栏显示 `el-empty`「本概念讲义生成中」+「研究此概念」按钮。
- 点击后 agent 长任务开始，活动行（`AgentActivityStrip`）原本挂在**空间页顶部**（初级概念区上方的一行），
  离触发按钮很远；用户希望改成贴在按钮下方、居中滚动显示"系统正在做什么"。

## 改动（`src/renderer/src/views/domain-learning/DomainLearningSpace.vue`）

1. **顶部活动行让位**：`<AgentActivityStrip>` 顶部那份增加条件 `!currentConceptNoCard`，
   即"选中的概念没有讲义"时不在顶部显示（避免跑两份 / 位置错误）。
2. **空态内新增一份**：无讲义分支里，`el-empty` 之后追加
   `<AgentActivityStrip :space-id="spaceId" class="research-activity" />` →
   活动行出现在「研究此概念」按钮下方。
3. **新增计算属性** `currentConceptNoCard`（非空主题 + 有选中概念 + `!card`），
   顶部/空态两份互为排他（不会同时挂两份订阅）。
4. **样式**：`.empty-body` 改为 `flex-direction: column` 且 `align-items/justify-content: center`
   （让 `el-empty` 与活动行纵向堆叠、整体居中）；新增 `.research-activity`（`max-width: 440px`、居中）。

## 说明 / 取的是既有行为

- 「滚动」沿用 `AgentActivityStrip` 现有语义：`pushActivityLine` 保留最新 3 行滚动小字（`shared/utils/domain-learning-activity`，
  已单测）；本轮不新增"滚动条式"长列表。
- 活动行内容仍是**空间级** research/task 进度（与顶部那份同通道），只换了位置；空态下发起补全知识地图等
  task 时同样会显示在这里，合理（都是 agent 在这块内容附近工作）。

## 验证

- `npx vue-tsc --noEmit` 过滤 `DomainLearningSpace.vue / AgentActivityStrip.vue`：无报错。
- 该视图无既有单测（Giant SFC），本次为模板/样式 + 一个派生计算属性，未加测试，需真人点一遍确认视觉。
- HMR 热更，无效果则重启 `npm run dev`。