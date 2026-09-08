# 领域共学空间：前端界面原型（2026-09-08）

## 目标（用户指令收敛）

用户："把原型做出来我看看" → 追问确认后 → **只要原型，后端业务可以先不做**。
最终形态 = **纯前端三栏界面原型**（样例数据填充，原型界面豁免），后端 dl_* 服务/skill/AI 均不实现。

## 交付文件（全部为新文件/增量）

- `src/renderer/src/packs/domain-learning/index.ts`（新）：前端 pack——路由 `/domain-learning` + 菜单「领域学习」插到知识库前（menuInsertBefore='/knowledge-base'）
- `src/renderer/src/packs/index.ts`（改）：注册 domainLearningPack
- `src/renderer/src/views/domain-learning/mock-data.ts`（新）：演示样例——领域「检索增强生成 RAG」：9 概念节点（3 分组×掌握度）/ 10 关系边 / 3 篇讲义 markdown（含 mermaid 流程图+对比表格+类比+自测）/ 5 轮追问对话（覆盖讲义有据 / 先验待确认 / 资料不足→开新研究 三类回答形态）
- `src/renderer/src/views/domain-learning/MarkdownViewer.vue`（新）：bytemd Viewer 惰性加载封装（gfm/highlight/frontmatter/math/mermaid）
- `src/renderer/src/views/domain-learning/DomainLearningSpace.vue`（新）：三栏主页面

## 页面形态（对齐 design.md §4.1）

- 顶部：空间名/目标 + 掌握度进度条 + 继续学习；右上角「界面原型·后端未接入·演示数据」角标
- 左栏 知识地图：按 基础概念/检索链路/生成与评估 分组的概念树，掌握度着色圆点（绿=已理解/橙=学习中/灰=待学）+ 图例 + 底部"研究进度"示意
- 中栏 讲义：标题+概念标签，bytemd 渲染 markdown（mermaid 图/表格/类比/自测），底部 [懂了✓][没懂再讲一遍] 反馈按钮
- 右栏 追问对话：演示问答轮（来源标注：讲义§+KB / 模型先验·待验证 / 资料不足→登记新研究），底部输入框（原型占位回复）；"未解问题 N" 计数

## 交互（前端真实状态，无后端）

- 点击左栏概念 → 中栏切讲义（有讲义概念显示全文；无讲义概念显示"讲义生成中"空态）
- 懂了/没懂 → 概念掌握度本地推进 + 顶部进度文案更新
- 初始默认选中第一课（RAG 总览，含 mermaid 流程图）

## 验证（dev 启动 + CDP 冒烟）

- 清理了残留 dev 实例后干净启动（5173 + CDP 9222）
- 导航 #/domain-learning：title「领域学习 - The Bot」，三栏关键元素齐全
- 讲义渲染：第 1 课正文/对比表格/类比齐全，mermaid 流程图 svg 渲染成功（svgCount=1）
- 点击无讲义概念"向量检索" → 正确显示讲义生成中占位；控制台无错误
- 截图：progress/_dlproto_1.png（讲义态）、_dlproto_2.png（空态占位），临时脚本不入库

## 状态

- 原型完成待用户 GUI 查看（左侧菜单新增「领域学习」入口 / 直接 #/domain-learning）
- 未提交（等明确指令）；进度文件本文件；设计文档在 tasks/2026-09-07-domain-learning-space/design.md

## v2 迭代（用户反馈后，2026-09-08）

用户反馈两点：① 只能学习一个主题？应有主题列表，点击进空间页；② 如何整体展现主题知识体系？

改动：
- `mock-data.ts` 重构为**多主题**：SpaceProject（id/name/goal/tagline/goalLevel/concepts/relations/lessons/turns）；示例主题 RAG（完整）+ 扩散模型（轻量）；新增 spaceStats()、buildKnowledgeGraphMermaid()（分组 subgraph + 掌握度着色 + 关系边标签的全景图生成）。
- 新增 `views/domain-learning/DomainLearningHome.vue`：**主题列表页**——卡片（目标/进度条/掌握度统计/继续学习），含"新建主题"占位卡（禁点）。
- `DomainLearningSpace.vue` 重构：按路由 `:id` 取主题（watch route.params.id）；头部加「主题列表」返回 + 「知识全景」按钮；**知识全景弹层**渲染整幅 mermaid 关系图（图例 + 分组着色 + 关系边）。
- `packs/domain-learning/index.ts`：两条路由 `/domain-learning`（列表）与 `/domain-learning/:id`（空间），version 0.0.2。

CDP 验收全绿（错误零）：列表页 3 卡（RAG/扩散/新建占位）→ 点 RAG 进空间（讲义+mermaid+问答齐）→ 全景弹层（svg 关系图 + 节点/边文本命中）→ 返回列表 → 进扩散模型主题正常。
截图：progress/_dlproto_home.png / _dlproto_graph.png（不入库）。

