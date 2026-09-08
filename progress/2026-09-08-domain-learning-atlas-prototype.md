# 知识全景 Atlas 前端原型（2026-09-08）

## 目标与执行口径（用户确认）

1. **图谱技术统一长文写作的自绘 SVG**（先核实 GraphView.vue：纯自绘、无图库依赖，自带力导向布局/视口缩放/节点拖动/点击高亮邻居）→ Atlas 用同源实现，不引入 G6/vis-network。
2. 领域画像按建议执行；3. mock 示例 T5 金融合规 + T7 前沿技术；4. M1 骨架范围可以。
5. **原型不套 TDD**（纯前端 mock、无后端逻辑，构建+CDP 真机走查验证）；**后端 dl_* 不做**。

## 交付文件

- `mock-data.ts`（改）：新增两个画像演示空间——`fincompliance`（金融合规·反洗钱，法规驱动 T5）、`llmfrontier`（大模型前沿，论文驱动 T7），各带 concepts/relations/lessons/turns；ConceptNode.kind 放宽为 string。
- `atlas-data.ts`（新）：Atlas 类型化图谱数据——13 种知识节点类型元数据（concept/theory/method/paper/regulation/procedure/standard/case/person/benchmark/data/controversy/principle，各带中文标签+颜色）；领域画像 ATLAS_PROFILE（T5 法规驱动侧重 regulation/procedure/case…；T7 论文驱动侧重 paper/method/benchmark/controversy…）；T5/T7 两个深度图谱（含法规效力/施行属性、论文年份/组织、关联内容列表等档案字段）；普通空间回退生成（buildFallbackAtlas）。
- `AtlasGraph.vue`（新）：自绘 SVG 力导向图谱——布局（排斥+边吸引+中心引力+碰撞分离，同源长文 GraphView）、viewBox 缩放/滚轮锚点/平移/适应、节点拖动、mousedown 即选中→高亮一阶邻居其余淡化、双击上抛下钻、类型着色+图例+掌握度学习态虚线外圈。
- `DomainAtlas.vue`（新）：Atlas Tab 页——顶栏（返回+领域名+画像标签+全图/回空间）、画像侧重条、左大纲树（类型着色/点击定位）、中 AtlasGraph（面包屑：全领域>节点·子图谱）、右节点档案（定义/关键属性/关联内容/直接关系/打开子图谱/去学它）。
- `packs/domain-learning/index.ts`（改）：+路由 `/domain-learning/:id/atlas`（title 知识全景）。
- `DomainLearningSpace.vue`（改）：移除知识全景 mermaid 弹窗，「知识全景」按钮 → preloadTab 新开 Atlas Tab。

## 修复记录

1. svg 节点点击需命中 circle（pointer-events visiblePainted）——验收用真实鼠标坐标点 circle。
2. 单击档案不弹：原把选中放 mouseup 判定过严 → 对齐长文"mousedown 即选中"。
3. 图内淡化不生效：AtlasGraph 内部 selectedId 只跟 props.focusId → mousedown 同步内部高亮 + 空白 mouseup 清选。

## 验证（CDP 真机，零页面错误）

- 列表 4 主题；空间页知识全景 → Atlas 链路通。
- T5 金融合规首屏 13 节点；点《反洗钱法》(2025修订)：高亮 4（+约束反洗钱/要求客户尽职调查/对标FATF）、淡化 9；档案=定义/效力=法律/施行=2026-01-01/关联内容/直接关系3条；双击 → 子图谱（13→4 节点+面包屑）。
- T7 大模型首屏 13 节点；论文节点正确着 #F0A020（类型化着色生效）；侧重条"论文驱动"、基准/争议节点在列。
- 截图：progress/_atlas_t5_full/focus/_atlas_t7*.png（不入库）。

## 状态

原型完成待用户 GUI 走查（领域学习 → 金融合规/大模型前沿 → 知识全景）。未提交；进度记录本文件；设计文档 tasks/2026-09-07-domain-learning-space/atlas-design.md（已更新：技术=自绘 SVG 统一长文；原型不套 TDD；M1 范围）。
