# 领域学习 M1-B 前半：排程规则 + project/graph 服务（2026-09-09）

## 上下文
承接 progress/2026-09-09-domain-learning-m1-data-layer.md（M1-A 已提交 95aae1dc，分支 feat/domain-learning）。
用户拍板：agent 能力基于 agent-harness；M1 验收不变。

## 本轮完成（TDD，13 passed）
1. 纯规则层 `src/core/packs/domain-learning/rules/learning-sequence.rules.ts`：
   - 概念/关系最小形状（RuleConcept/RuleRelation，不绑 shared 强类型，解耦复用）；
   - isMastered（review 需回访）、prerequisiteIdsOf（source→target 方向）、prereqsReady、isLearnable（group 不可学）、pickNextToLearn（门控扫描 + 图缺陷兜底插队）、CONFUSED_SPLIT_THRESHOLD=2 + shouldSuggestSplit。
2. `services/learning-project.service.ts`：createSpace（建空间 + 领域根 group）/get/list/setStatus/archive；不依赖 relations（精简注入）。
3. `services/learning-graph.service.ts`：ackMastered（前置门控拒绝 + mastery→mastered + mastery_log 审计 + attrs.confusedCount 清零）、ackConfused（计数+1、mastery→learning、达阈值 splitSuggested、区级 confusedSections 累计）、markReview、pickNextToLearn、buildTree（parent 层级大纲树）、stats（叶子统计）、pathTo、confirmRelation（人审置 verified）、neighbors。
4. 测试 2 文件：rules spec 6 项 + graph/project service spec 7 项（真实 better-sqlite3 + 迁移 + runWithUserAsync 租户断言）。全部绿；vue-tsc 对 domain-learning 后端零新增错误。

## 注意（过程踩坑）
- 规则层最初 import shared 强类型（Pick<DlRelationView,…>），仓储行转视图类型不匹配（string vs 字面量联合）→ 改为最小形状 RuleConcept/RuleRelation 后解耦。
- LearningGraphService 构造最初注入 projects/cards 未使用 → TS6138 → 精简为 concepts/relations/masteryLogs 三注入。
- PowerShell `(Get-Content -Raw) -replace | Set-Content -Encoding UTF8` 会把 UTF-8 中文文件写坏（转码乱码）→ 以后批量改文件一律用 edit/write 工具，勿用 Set-Content。

## 下一步
M1-B 后半：dl 宿主（基于 agent-harness）——需精读 ep-agent-harness.service.ts / ep-agent-tools.ts / host-kit / skill-nodes 等样板后编码：
- packs/domain-learning/index.ts（manifest + activate 注册 handler）
- services/dl-agent-harness.service.ts（DlResearchHost/DlTutorHost 两薄壳：createHostKit + getAgentLoopHarness + ApprovalCoordinator + dl:generate 事件通道）
- services/dl-agent-tools.ts（dl_research_concept/dl_enqueue_question/dl_propose_map_change 等，懒注册幂等）
- services/dl-graph-knowledge-provider.ts（StructuredKnowledgeProvider 通道 A）
- handlers/domain-learning.handler.ts（ipcBridge dl:* + wrap）
- builtin-packs.ts 登记

## 状态
未提交（M1-B 中途；待里程碑完成或用户指令提交）。未 push。
