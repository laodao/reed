# 领域共学空间 M3-B 进度记录:间隔复习

日期:2026-09-09 · 分支 feat/domain-learning · 依据 m3-implementation-plan.md §1 M3-B

## 完成内容

1. **数据**:dl_project 增 `review_settings` 列(DlReviewSettings {enabled, intervalMin, limit},默认关闭/1440min/10 条);ensureColumn 老库升级 + DDL 补列;仓储 DTO/parse/patch/create 支持 review。
2. **纯规则** `rules/learning-review.rules.ts`:`lastReviewTime`(取 mastery_log 终点 mastered 或 review/lesson_ack/self_test 触发的最新时间,无记录回落 createdAt)、`pickReviewCandidates`(mastered/review 且逾期,按最久未复习优先、limit 截断)、`normalizeDlReviewSettings`。
3. **服务**(LearningGraphService):`listReviewDue`(项目日志全量→规则候选→DlReviewDueItem 明细)、`reviewDone`(mastered/review→mastered + trigger=review 审计作为下次间隔基准;非掌握态拒绝);复用既有 `markReview`(manual→review)作为「标需复习」。mastery-log 仓储补 `listByProject` 与 append 注入 `at`。
4. **IPC/接线**:dl:get/set-space-review、dl:review-due(带 settings+items,未启用返回空)、dl:ack-need-review、dl:review-done;preload/channel-map/store 契约与封装(reviewDue 状态、saveReviewSettingsOf/fetchReviewDue/needReviewOf/reviewDoneOf/reviewSettingsOf)。
5. **前端**:DomainAtlas「空间设置」新增「间隔复习」组——启用/周期/每轮条数保存;到期队列逐条 [开始复习](agent tutor 一轮,仍基于 agent-harness)/[完成](reviewDone 刷新基准)/[标需复习](markReview),附过程注记。

## 测试与回归

- learning-review.rules.spec 3 passed + learning-graph.service.spec 新增 2(到期出列/完成刷新基准/非掌握拒绝;markReview→reviewDone 全链);
- dl 全套 9 文件 47 passed(含 migration-utils 补列);vue-tsc 相关文件零新增错误;
- 真机 CDP(dev 重启后):set-space-review 持久化回读;review-due 出 2 条(mastered 逾 60min);reviewDone 一条后队列即时移除该概念——全链通过。

## 变更文件

- 新增:`rules/learning-review.rules.ts`、`tests/.../learning-review.rules.spec.ts`
- 修改:shared types、dl-project.entity/repository、create-domain-learning-tables、dl-mastery-log.repository、learning-graph.service(+spec)、domain-learning.handler、preload、channel-map、stores/domain-learning、views/domain-learning/DomainAtlas.vue

## 下一步

- M3-C:统计与导出(dl:get-space-stats 聚合+前端面板、讲义合集 md 导出、Atlas 地图 PNG(必要时 PDF 评估))。
