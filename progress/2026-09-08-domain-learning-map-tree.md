# 领域学习空间：左栏知识地图 → 可折叠大纲树（2026-09-08）

## 需求

用户质疑：左栏知识地图平铺分组展示能否承载"非常多知识点/子领域"。讨论结论：平铺不可扩展（无层级/无折叠/无父级聚合/无搜索），选定方案 = **树形大纲**（默认只展开当前学习分支 + 聚合掌握度 + 搜索/掌握度过滤）。用户确认"好，开始"。

## 改动

### mock-data.ts
- 新增 `KnowledgeTreeNode`（树节点：非叶=分支/模块带 children；叶=conceptId 引用概念）+ `SpaceProject.tree?`（显式大纲树）。
- `fallbackTreeOf(space)`：老主题（无 tree）自动按 concepts[].group 生成两级树。
- `collectLeafConceptIds()`：收集叶子概念 id（保留备用）。
- 新增第 5 个演示主题 **ml「机器学习 · 从基础到深度」**：紧凑表驱动生成 66 概念（5 大分支：数学基础/监督/无监督/深度学习/训练评估，14 模块），树 = 分支→模块→概念 三层，演示进度：数学基础 mastered、监督学习 partial。

### DomainLearningSpace.vue（左栏）
- 平铺分组 → **树形行渲染**（mapRows computed 扁平化：层级缩进 + 分支可折叠 + 叶子可选）。
- 分支行带**聚合掌握度**徽标 `mastered/total`（随 markMastered/markConfused 实时更新，整支完成变绿）。
- 顶栏**搜索框**（名/中文/英文模糊）+ **掌握度过滤**下拉（全部/待学/学习中/已理解）。
- 语义：搜索中或过滤非 all 时命中分支强制展开（全局视图）；平时按 expandedBranches 集折叠；「继续学习」与叶选中都会 expandPathTo 展开当前学习链。
- 默认选中第一个 learning（无则 todo）概念并展开其分支链。
- CSS：删除旧 .map-group/.map-node 样式，新增 map-filters/tree-branch/tree-leaf 等。

## 修复（验收中发现的坑）
1. 误删 mapRows computed 闭合 → 重建完整（含掌握度过滤强制展开分支）。
2. `treeRoots` 未初始化 TDZ：watch immediate 在 computed 声明前触发 → 去掉 immediate，首次加载交由 onMounted（此时全部 computed 已就绪）。

## 验证（CDP，零页面错误）
- 列表 6 卡片（5 主题 + 新建占位），进 ml 空间正常。
- 首屏：5 分支行聚合（数学基础 9/9 绿、监督学习 3/11…），学习链「监督学习→分类」自动展开，4 叶可见。
- 折叠：点「深度学习」展开 3 模块行。
- 待学过滤：强制展开命中分支 → 19 分支行 + 27 待学叶可见（含 K-Means/PCA/t-SNE…）。
- 截图 progress/_ml_tree_collapsed.png / _expanded.png（不入库）。

## 状态
原型走查待用户确认。未提交；本文件进度记录。
