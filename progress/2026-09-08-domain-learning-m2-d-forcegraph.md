# 领域共学空间 M2-D 进度记录:ForceGraph 公共力导向组件抽取

日期:2026-09-08 · 分支 feat/domain-learning · 依据 m2-implementation-plan.md §2 M2-D + design-v3 §11.2/atlas-design

## 完成内容

1. **新增 `components/common/ForceGraph.vue`**(公共力导向图引擎,自绘 SVG 无图库依赖):
   - 力导向布局(排斥+边吸引+中心引力+碰撞分离)与收尾纯碰撞去重;
   - viewBox 缩放/平移/适应(滚轮锚点缩放、拖拽平移、节点拖动),缩放比例经 `zoom` 事件外抛(宿主按钮/读数响应式);
   - 点击选中→高亮一阶邻居+其余淡化(节点/边统一),双击上抛,单击与背景点击分别出事件;
   - **结构重排键 `layoutKey`**:数据装载/下钻才重布局;同一布局键下仅增删可见集(如章节时间轴过滤)不重排,保持手动位置稳定;
   - 节点/边外观参数化(公共模型 color/radius/ring/edge label/title),样式色走双设计体系 CSS 变量兜底(`--color-*` 与 `--el-*`);
   - 类型独立 `components/common/force-graph.model.ts`(SFC <script setup> 不能导出类型,独立 .ts 供宿主导入)。
2. **AtlasGraph.vue 改薄壳**:保留对外契约(props nodes/edges/focusId; emits select/dblclick)与图例/缩放工具栏;focus 子图谱过滤与 dl→公共模型映射(类型色/半径/掌握度学习态外圈/关系标签)在壳内;图引擎交给公共组件。
3. **长文 GraphView.vue 改用公共组件**:删除本地 viewBox/布局/拖拽/淡化整套实现(约 430 行)与对应样式,改为 ForceGraph + fgNodes/fgEdges 映射 + click 开详情/background 清除;数据装载成功后 `graphVersion++` 触发一次重布局;章节过滤只动可见集不重排(位置稳定同旧)。

## 校验

- vue-tsc:ForceGraph/AtlasGraph/GraphView/force-graph.model 零类型错误(全仓 928 条为存量);
- 视觉/交互回归:留 M2-F 真机 CDP 走查(Atlas 与长文图谱渲染/缩放/拖动/点击详情/下钻)。

## 变更文件

- 新增:`components/common/ForceGraph.vue`、`components/common/force-graph.model.ts`
- 修改:`views/domain-learning/AtlasGraph.vue`、`components/longwriting/graph/GraphView.vue`

## 下一步

- M2-E:Atlas 增强视图按画像启用(时间线/矩阵/流程/三层结构;服务端派生聚合 + IPC + 前端视图切换)+ profile 可视化配置(建空间选画像调侧重)。
