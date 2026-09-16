# 进度：领域学习「知识点内容与版本管理」盘点（问答 + 文档产出）

日期：2026-09-15
类型：只读调研（**未改动任何业务代码**）

## 起因

用户连续三问：
1. 「领域学习模块，知识点内容，有没有版本管理？」
2. 「你说的讲义是什么？是知识点内容吗？」
3. 「要」（要一份完整的现状清单 + 缺口 + 补齐方案）

## 核查过程（事实来源均为代码，非文档推测）

- 读 8 张 `dl_*` 表 DDL（`create-domain-learning-tables.ts`）与全部领域学习 Entity/Repository，逐个确认有无 version/revision/审计列。
- 读 `dl-agent-actions.ts` 全文，确认讲义落库是 `version+1` 新建行（:478-496），新稿 `verification=null`。
- 读 `learning-graph.service.ts` 全文，确认 `dl_mastery_log` 有 4 处真实写入（:73,99,117,164），是唯一真实的变更审计。
- 全仓 grep 确认：`listVersionsByConcept()` 无调用者（死代码）；`dl:` 39 个 IPC 通道无版本历史通道；`dlDocs` 只有注册无写入者（整表休眠）。
- 前端 `DomainLearningSpace.vue:305-306` 确认只显示 `v{n}`，无历史/恢复入口。
- 对照平台既有完整版本管理范式：`workflow_definition_versions`（含 `wf:list-versions` / `wf:restore-version` + 前端恢复）、`lw_chapter_versions`。

## 结论

- **讲义（dl_card）有版本管理**，但只完成持久化：看不见、比不了、回不去。
- **知识点节点（dl_concept）字段（名字/定义/前置声明/备注）完全没有版本**，`patch()` 原地覆盖。
- 唯一例外是掌握度（`dl_mastery_log`）与方案确认（`dl_plan.revision`）。

## 产出

- `tasks/2026-09-07-domain-learning-space/content-version-management-audit.md`
  含：术语边界（知识点 ≠ 讲义）、逐对象盘点表、已确认缺口 A~E、平台既有范式对照、
  分层补齐方案（P0-1 历史可见 / P0-2 恢复 / P0-3 唯一索引 / P1-1 修订说明落库 /
  P1-2 `dl_concept_log` 节点审计 / P1-3 删除常态化 / P2 其他覆盖型内容）、
  TDD 测试点 7 项、验收标准、非目标、关键代码位置索引。

## 状态

盘点与方案文档完成，**尚未进入实现**。等待用户决定是否开工（建议顺序 P0-1 → P0-2 → P0-3 → P1-1）。