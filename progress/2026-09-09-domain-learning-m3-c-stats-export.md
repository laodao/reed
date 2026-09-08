# 领域共学空间 M3-C 进度记录:统计与导出

日期:2026-09-09 · 分支 feat/domain-learning · 依据 m3-implementation-plan.md §1 M3-C

## 完成内容

1. **共享类型**:`DlSpaceStats`(概念/研究/讲义/关系/问答/复习到期)与 `DlLessonDigest`(讲义合集 md)。
2. **服务**(LearningViewService):
   - `buildSpaceStats`:从 dl_* 全量聚合——概念掌握态、research 态分布、每概念最新版讲义 published/draft 计数(card 仓储补 `listByProject`)、关系(前置/已确认)、问答(open/answered)、复习到期(启用 review 设置时按 learning-review.rules 计);
   - `buildLessonDigest`:目录树序遍历(顶层 group → 子层,根层概念独立),仅收录**有讲义**的概念;每概念输出类型/掌握度/状态 + 区内容(按层数 # 标题)+ 相关著作 + 证据来源,md 头部带目标/收录数/导出时间。
3. **IPC/接线**:`dl:get-space-stats`、`dl:export-lesson-digest`;preload/channel-map/store(getSpaceStats/exportLessonDigestOf + spaceStats 状态)。
4. **前端**(DomainAtlas 顶栏):「统计」popover(概念/讲义/关系/问答/复习到期 快照行);「导出讲义」按钮(经 IPC 取 md → Blob 下载「讲义合集-<空间>.md」);「导出 PNG」按钮(把当前 `force-graph-svg` 克隆并把计算样式内联后序列化为 dataURL → canvas(2x) → PNG 下载;非图谱视图给提示)。PDF 评估:无现成 PDF 基建,本期以 md+PNG 覆盖导出面(必要时另立 M4 评估)。

## 测试与回归

- 新增 learning-view.service.spec 2(统计聚合+开关计数;digest 树序/区内容/著作/证据);dl 全套 9 文件 48 passed;vue-tsc 相关零新增;
- 真机 CDP(重启后):get-space-stats 返回 total6/mastered2/draft7/openQ2/prereq5/reviewDue1;export-lesson-digest count6、len≈15k、含「贝叶斯」与「证据来源」、filename 正常——通过。
- 附带观察:M2-F 后启用过的周期推进(interval 5min,autoResolveOpenQuestions)在本时段真实运行,自行将部分 open 未解问题回填并沉淀出更多概念/讲义草稿(openQ 5→2、total 4→6),侧面验证 M2-C 调度闭环。

## 变更文件

- 修改:shared types、dl-card.repository、learning-view.service、domain-learning.handler、preload、channel-map、stores/domain-learning、views/domain-learning/DomainAtlas.vue
- 新增:tests/unit/core/packs/domain-learning/learning-view.service.spec.ts

## 下一步

- M3 收口:真机纵线复核(复习队列 UI、统计/导出按钮、图谱 PNG 走查)+ 汇总记录;push 待用户指令。
