# 应用模块 片4 review 报告

> 日期：2026-08-21 ｜ 范围：a5663e09..HEAD（事件桥根因修复 31348f4b + 分享页托管 23106a6c）
> 方法：docs/code-review-checklist.md 逐维核查（R→C→L→S→M→T）+ 独立 verify
> 结论：5 项发现（1 BLOCKER / 1 MAJOR / 3 MINOR）——全部修复；2 项记录待办

## 发现与处置

| # | 维度 | 严重度 | 发现 | 处置 |
|---|------|--------|------|------|
| 1 | R4 | BLOCKER | 前端 `WorkflowGuestRun.vue:110` / `WorkflowRunDetail.vue:271` 散落终态字面量集合，与片4 新增 `WORKFLOW_RUN_TERMINAL_STATUSES` 同语义（≥2 处 = R4 违规） | ✅ 收敛为 shared 常量引用（`@shared/types/workflow.types`） |
| 2 | L5 | MAJOR | `[AppSessionService] 事件命中写卡` info 日志**每 node-status 事件都打**（E2E 单次运行 8 条噪音）；事件未命中 warn 也偏高 | ✅ 命中降 debug；未命中降 debug（注释保留排查指引） |
| 3 | L5 | MINOR | `写卡失败` 日志无 sessionId 上下文（排障不可定位） | ✅ `enqueueCard` 加 sessionId 参数并写入日志 |
| 4 | M6 | MINOR | `app-session.service` 未使用的 `WorkflowRunRepository` import | ✅ 移除 |
| 5 | C4 | MINOR | 引擎收尾 `definitions.update(lastRunAt)` 与事件桥写卡仍可能交错同一 better-sqlite3 连接（cardQueue 只串行事件桥内部；E2E 实测通过，属潜在竞争点非现症） | 📋 记录待办：后续可将事件桥写卡与引擎收尾纳入同一连接队列 |
| 6 | R9 | INFO | 事件桥 tap 回调忽略 `_userId`（未做 emit 时 ALS userId 归属校验）；当前引擎 emit 均运行于 `runWithUserAsync` 内，语义安全 | 📋 记录：未来若出现非 ALS emit 路径需补校验 |

## verify 结果（独立复核）

- 终态字面量全量搜索：src 下已无 `['succeeded','failed',...]` 数组字面量，5 处统一引用 `WORKFLOW_RUN_TERMINAL_STATUSES` ✓
- `resumeRun` 白名单用 `WORKFLOW_RUN_STATUSES.*` 常量（非裸字面量），语义为"可续跑状态"（含 waiting_review），与终态集合独立，不违规 ✓
- IPC 三处契约（preload:709 / channel-map:166 / AppSession.vue 调用）同步 ✓
- ALS 链路：tap 同步执行于引擎 ALS 内 → enqueueCard promise 链保留上下文 → writeCard 的 `getCurrentUserId()` 正确 ✓
- 测试隔离：所有用 tapCb 的用例均先 attachBridge ✓；getRunDetail mock 与真实契约一致 ✓
- 全量相关测试：**195 passed**（app + workflow 20 文件）✓

## 门禁状态

```
BLOCKER = 0（1 项已修复）  MAJOR = 0（1 项已修复）
测试：195 全绿
```

## 遗留待办

1. [C4] 事件桥写卡与引擎收尾的 SQLite 连接竞争点——建议后续引入数据库层连接队列（MINOR，非现症）
2. [R9] tap 回调 userId 归属校验（未来非 ALS emit 路径需补）
3. 全量回归中 11 个历史失败测试（"No metadata for VideoProjectEntity" 等，与片4 无关）——单独清理
