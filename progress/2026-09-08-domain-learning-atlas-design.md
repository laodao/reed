# 知识全景 Atlas：领域类型学研究 + 重设计（2026-09-08）

## 背景

用户对原型"知识全景弹窗"反馈：全景不是对话框/一张图；应独立 Tab 页、体系化展示不同类型知识、节点可点进子图谱、领域类型侧重不同（研究型 vs 应用型只是举例）。要求：先总结领域类型全谱与各自侧重/展示适配，深度重新设计。

## 研究结论（web 检索验证）

- Biglan 学科分类三维（共识度/纯应用/生命性）；Bloom/Marzano 知识维度（事实/概念/程序/元认知）；知识可视化表示选择研究（知识性质→图式匹配）；Obsidian/Heptabase/Kumu 的"全局→聚焦→详情"语义缩放范式。
- 落地：领域画像(profile) 驱动 Atlas —— 类型节点全集 + 关系分层 + 多视图 + 档案。

## 设计交付（tasks/2026-09-07-domain-learning-space/atlas-design.md）

1. 领域类型学：
   - 三维轴（共识度/实践度/对象）；
   - 7 大类（T1 形式科学 / T2 实证科学 / T3 人文社科 / T4 工程技术 / T5 专业实务 / T6 技艺创作 / T7 前沿交叉），各带知识侧重与展示方式；
   - 节点类型全集 16 种（concept/fact/definition/axiom/theory/method/artifact/paper/standard/regulation/procedure/case/person/controversy/principle 等）+ 关系分层；
   - 8 种展示视图（网络图/分类树/时间线/矩阵/流程/三层结构/档案/架构图），标注适配类型与领域默认。
2. Atlas 概念：独立 Tab 页 `/domain-learning/:id/atlas`；页面=左大纲树+主视图(画像驱动切换)+右节点档案；三级交互（全局→点击聚焦一阶邻居→打开子图谱下钻+面包屑）；档案含"关联内容"分区（论文/方法/规范/案例/最新成果）。
3. 领域画像联动表（7 类各自的默认/增强视图与额外呈现）。
4. 数据模型影响（dl_concept+node_type / 关系类型扩展 / dl_project+profile）。
5. 前端：图谱库选型 AntV G6 v5（备选 vis-network）；组件拆分（DomainAtlas/AtlasGraph/AtlasTree/AtlasTimeline/AtlasMatrix/NodeProfile）；mock 造 2 画像示例。
6. 阶段：M1 骨架+主图+大纲树+档案+2 画像示例 mock → M2 增强视图+profile 可视化+后端打通 → M3 跨域/更新流/导出。

## 状态

- atlas-design.md 已落盘待评审；未编码、未提交。
