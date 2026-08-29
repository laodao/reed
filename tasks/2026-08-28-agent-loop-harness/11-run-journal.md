# 11 · 工作流运行事件溯源与恢复（Run Journal）

> Agent Loop Harness ｜ 2026-08-28 ｜ 配套文档：[01-design-spec.md](./01-design-spec.md) §3 / [02-implementation-plan.md](./02-implementation-plan.md) M1
> 主题：`workflow_run_events` 日志、崩溃恢复状态机、handler `resume()` 回调、节点内状态 API、幂等与兼容降级。
> 标注约定：与 01/02 文档冲突的概念一律以 01/02 为准；本文补充的表字段/事件类型/接口成员标注"（本文新增）"。

---

## 1. 目标与范围

**目标**：把工作流引擎的在途调度状态从"纯内存 + 事后标 interrupted"升级为"事件溯源（event sourcing）"——每次状态变迁先落追加式日志再改内存，进程崩溃/重启后从重放日志重建 `RunExecution` 继续执行；挂起（waiting_review）的 run 跨重启可直接接受审批决策；节点内（agent 循环）中间状态可持久化、崩溃后续跑。

**范围**：

- 新表 `workflow_run_events`（引擎私有强一致日志，双端 DDL）；
- 引擎写入路径改造（E1）、boot 恢复状态机重写（`recoverOnBoot`）、`reviewDecide` 对非活跃挂起 run 的 rehydrate 路径；
- `workflow_node_runs.state_json` 列 + context state API（E2）、handler 可选 `resume()` 回调（E3）；
- 快照机制、幂等键方案、旧格式 run 兼容降级、日志保留策略。

**非目标**：不改变引擎调度语义（pump/边激活/循环驱动逻辑本身不动）；`agent_trajectories` 表（AgentRuntime 迭代轨迹）不在本文（见 01 §3.3 与 12 号文档）；通用事件平台的数据模型不在本文（见 10-event-system.md）。

## 2. 现状与差距（代码证据）

引擎现状（均已读码核实）：

- **在途状态纯内存**：`activeExecutions: Map<runId, RunExecution>`（`src/core/modules/workflow/engine/workflow-engine.service.ts:349`）；`RunExecution` 持有 `variables`/`rootScope`/`loopScopes`/`loopDrivers`/`runCounts` 等全部调度态（`:204-346`）；`ScopeState.activationSeqs`/`activationCounter` 是边激活序号唯一载体（`:151-156`）。进程退出即全丢。
- **boot 恢复是"标记式"而非"重建式"**：`recoverOnBoot`（`src/core/modules/workflow/workflow-run.service.ts:387-433`）把 running/pending 一律标 `interrupted`/`timed_out`；waiting_review 保持挂起但**不接受决策**——`reviewDecide` 在非活跃 run 上直接返回"请先续跑"（`:280-285`），即 01 §1.2 短板 S1。
- **挂起是一次性终态**：`applyReviewDecision`（`workflow-engine.service.ts:490-578`）直接把节点标 succeeded、算 route、激活出边（`:553-570`），handler 不会被重新调用——S2。
- **节点内无状态**：handler 契约"禁止在 handler 内保存跨调用的可变状态"（`engine/node-handler.ts:10-11`），`WorkflowNodeContext`（`:25-65`）无 state API——S3。
- **已有的持久化资产**：`workflow_node_runs` 按 `(run_id, node_id, iteration_index)` 唯一（`src/core/database/migrations/create-workflow-tables.ts:204-212`），是成功节点的 checkpoint 事实源；`resumeRun`（`workflow-run.service.ts:298-348`）用 `findSucceededWithOutput` 装配 `resumedCheckpoints` 新建 run；`hydrateCheckpoints`（`workflow-engine.service.ts:1492-1533`）据此重建根作用域变量与边激活。**但它只能恢复"成功节点"，恢复不了挂起点、循环进度、merge 到达数、激活序号——且是"新 run"而非"原 run 继续"。**
- **挂起/恢复机器本身完整**：`handleReviewSuspend`（`:1080-1125`）落 `wait_expires_at` 与 payload；`resumeReview`/`resumeSuspended`（`:454-487`、`:583-627`）续驱；`tickReviewTimeouts`（`:633-677`）处理超时策略。这些逻辑全部保留，只是其输入（内存态）改为可重建。

**差距**：缺一张 append-only 的状态变迁日志和"日志 → RunExecution"的投影函数。其余地基（checkpoint、挂起、看门狗、ticker）都在。

## 3. 概念模型

### 3.1 三套"事件"的边界（与 10 号通用事件系统的关系）

项目内存在三个易混淆的事件机制，本文的 journal 是第三个：

| 机制 | 形态 | 一致性 | 消费者 | 定位 |
|------|------|--------|--------|------|
| `wf:run-event` 推送 | 内存广播（`getEventEmitter`，`workflow-run.service.ts:455-463`） | 尽力而为，丢了不补 | 前端 UI | 实时展示 |
| 通用事件平台（10-event-system.md，现有 `domain-event-bus.ts` 的平台化演进） | 进程内/跨模块 pub/sub + 持久化投递 | 异步、至少一次 | 事件触发器、任务树调度、其他业务模块 | **模块间集成**，通用平台能力 |
| **`workflow_run_events`（本文 journal）** | 同库 append-only 表 | **强一致：先写日志后改内存，与状态变迁同生共死** | 仅引擎自身（恢复投影） | **引擎私有的状态事实源** |

原则：**journal 不是事件平台的一个 topic，也不复用其表**。原因：① journal 写入在引擎状态变迁的关键路径上，必须同步、有序、可事务对齐，事件平台的异步投递语义会破坏崩溃一致性保证；② journal 的 `seq` 是 run 内严格单调的重放序号，事件平台无此约束；③ journal  retention 与 run 生命周期绑定（随 run 删除/归档），事件平台有自己的保留策略。反向的桥是单向的：引擎在 journal 落库**之后**，可把少量里程碑（run 终态、挂起请求）翻译成领域事件发布到事件平台（fire-and-forget，绝不在恢复关键路径上），供任务树调度（01 §5.3）等模块消费——该桥在 M3 接线，本文只预留 `run_finished` 事件的发布点。

### 3.2 核心不变量

1. **追加顺序即因果顺序**：同一 run 内 `seq` 严格单调（内存计数器同步分配，`UNIQUE(run_id, seq)` 兜底），重放 `ORDER BY seq` 得到唯一确定的 `RunExecution`。
2. **先日志后内存**：任何内存状态变更（边激活、节点状态推进、挂起、决策应用）之前，对应事件已 `await` 落库。日志写入失败 = 该 run 立即失败终态（不可继续执行一个没有持久化日志的调度）。
3. **重放只重建调度状态，不重放副作用**：handler 的副作用（HTTP/邮件/写库）只在真实执行时发生；在途节点（launched 未 completed）重启后**重新执行**（见 §5.6 幂等）。
4. **journal 是唯一事实源，`workflow_node_runs` 是投影**：两者可能因崩溃产生短暂不一致（日志领先于行），恢复时以 journal 为准修复 node_run 行。

### 3.3 快照

纯事件重放的恢复时长与事件数线性相关。快照 = 某 `seq` 处投影结果的整体序列化，本身作为一条 `type='snapshot'` 事件落表（`seq` = 快照点），恢复时"最近快照 + 其后事件增量重放"。快照不引入新表。

## 4. 数据模型

### 4.1 新表 `workflow_run_events`（E1，双端 DDL）

```sql
-- SQLite（PC 端）
CREATE TABLE workflow_run_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  run_id       TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  type         TEXT NOT NULL,
  node_id      TEXT,
  scope_key    TEXT,          -- （本文新增）作用域键：'root' 或 '<loopNodeId>:<iterationIndex>'
  payload_json TEXT,
  created_at   DATETIME
);
CREATE UNIQUE INDEX uq_wf_runevent_seq  ON workflow_run_events (run_id, seq);
CREATE INDEX        idx_wf_runevent_run  ON workflow_run_events (run_id);
CREATE INDEX        idx_wf_runevent_user ON workflow_run_events (user_id);

-- PostgreSQL（Web 端）：TEXT→varchar（payload 用 text）、DATETIME→timestamp；占位符 $1,$2（同既有迁移约定）
CREATE TABLE workflow_run_events (
  id           varchar PRIMARY KEY,
  user_id      varchar,
  run_id       varchar NOT NULL,
  seq          integer NOT NULL,
  type         varchar NOT NULL,
  node_id      varchar,
  scope_key    varchar,
  payload_json text,
  created_at   timestamp
);
-- 索引同名同列
```

迁移文件（本文新增）：`src/core/database/migrations/create-workflow-run-events.ts`，幂等风格、双端 `ensureTable/ensureIndex` 复用 `create-workflow-tables.ts:217-289` 的工具模式；接入点不变——Electron `src/electron/database/index.ts runMultiTenantMigrations()`、Web `src/web/server/index.ts initDatabase()`（接入点清单见 `create-workflow-tables.ts:11-13`）。新增 `WorkflowRunEventEntity`（`src/core/database/entities/workflow-run-event.entity.ts`）+ `WorkflowRunEventRepository`（继承 `BaseRepository`，`user_id` 自动注入；boot 扫描沿用跨租户裸扫描 + 按 userId 重建 ALS 的既有纪律）。

### 4.2 `workflow_node_runs` 加列（E2）

```sql
ALTER TABLE workflow_node_runs ADD COLUMN state_json TEXT;  -- PG: text
-- 幂等加列复用 addColumnIfMissing 模式（create-tool-tables.ts:82-88）
```

`state_json`：节点内中间状态（agent 循环对话历史、迭代计数等），**可变行**（随 `saveState` 覆盖写），不是 append-only——它与 journal 的分工：journal 记"调度层发生了什么"，state_json 记"节点内部进行到哪"。

### 4.3 事件类型全集与 payload

常量（本文新增，放 `@shared/types/workflow.types`，沿用"常量唯一源"纪律）：`WORKFLOW_JOURNAL_EVENT_TYPES`。01 §3.2 列出的 7 种全部保留原名，补充 5 种（标注 本文新增），另收编质量门追加的 2 种（标注 17-quality-gate 新增）：

| type | node_id | payload_json 结构 | 说明 |
|------|---------|-------------------|------|
| `run_started` | null | `{ triggerType, settings }` | （本文新增）run 创建时写首条事件——区分"有日志的新格式 run"与"无日志的旧格式 run"（§5.8 降级判据），并锚定配置链 |
| `edge_activated` | null | `{ scopeKey, edgeId, seq: number, sourceNodeId, targetNodeId }` | payload.seq = 分配的激活序号（= `activationSeqs` 值）；scope 级 |
| `node_launched` | ✓ | `{ scopeKey, nodeType, iterationIndex }` | `launchNode` 建/重置 node_run 行后写 |
| `node_suspended` | ✓ | `{ scopeKey, iterationIndex, reviewPayload, timeoutMs, timeoutPolicy, waitExpiresAt }` | 含挂起全部现场（`handleReviewSuspend` 的 state 字段快照） |
| `node_completed` | ✓ | `{ scopeKey, iterationIndex, output, routeTaken, completedSeq }` | 含 merge 输出等终态输出 |
| `node_failed` | ✓ | `{ scopeKey, iterationIndex, error, retryCount, disposition }` | `disposition: 'retry_scheduled' \| 'fail_edge' \| 'iteration_skipped' \| 'fatal'`（本文新增）——重放据此恢复 retryCount/failed/scope.failed/pendingFailureError |
| `review_decided` | ✓ | `{ scopeKey, iterationIndex, decision, comment?, editedValues?, choice?, decidedAt, route }` | editedValues 为白名单过滤后的值（与 `applyReviewDecision` 落库口径一致，`workflow-engine.service.ts:565`）；（M4 预留 `decidedBy`，E6 操作者留痕） |
| `loop_started` | ✓（loop 节点） | `{ parentScopeKey, listSize }` | （本文新增）循环驱动开始 |
| `loop_iteration_settled` | ✓ | `{ iterationIndex, result, skipped }` | （本文新增）迭代收敛，重建 `LoopDriver.results` 的依据 |
| `loop_completed` | ✓ | `{ scopeKey, output, routeTaken }` | （本文新增）loop 节点成功出 loop-done 边 |
| `snapshot` | null | 见 §4.4 | （本文新增）投影快照 |
| `run_finished` | null | `{ status, error?, stats }` | 终态锚点；重放遇到即终止投影 |
| `verify_completed` | ✓ | `{ taskId, attempt, decision, score }` | （17-quality-gate 新增）质量门一次评估落 `task_verifications` 后写；decision ∈ pass/retry/replan/escalate |
| `task_escalated` | ✓ | `{ taskId, reason, defectsSummary }` | （17-quality-gate 新增）任务升级人工；reason=升级原因，defectsSummary=缺陷摘要 |

### 4.4 快照 payload 结构（本文新增）

```json
{
  "v": 1,
  "suspended": false,
  "variables": { "<nodeId>": { "…output" } },
  "llmHistory": [{ "role": "user", "content": "…" }],
  "runCounts": { "<nodeId>": 3 },
  "scopes": [{
    "key": "root", "iterationIndex": 0, "activationCounter": 17,
    "activationSeqs": { "<edgeId>": 12 },
    "states": [{ "nodeId": "…", "status": "…", "retryCount": 0, "output": {},
                 "routeTaken": null, "reviewPayload": null, "reviewTimeoutMs": null,
                 "reviewTimeoutPolicy": "fail", "waitExpiresAt": null, "completedSeq": 12,
                 "startedAtMs": 0 }],
    "mergeArrivals": { "<nodeId>": { "<sourceNodeId>": {} } },
    "forcedMergeNodeIds": [], "loopOwnerId": null, "iterationSkippedByPolicy": false,
    "loopPseudoVars": {}
  }],
  "loopDrivers": [{ "loopNodeId": "…", "results": [], "listSize": 10, "parentScopeKey": "root" }]
}
```

**触发策略**（本文新增）：① 每 run 每 200 条事件一次（常量 `WORKFLOW_JOURNAL_DEFAULTS.snapshotEveryEvents = 200`，可被 definition.settings 覆盖）；② **每次进入挂起时强制一次**——挂起 run 可能等人数天，且是 rehydrate 最高频场景，快照令其恢复 O(1)；③ run 终态不做（日志整体进入保留/归档流程，§5.10）。快照写失败不阻断执行（降级为纯增量重放），与日志写失败的"run 失败"语义刻意不同——快照是优化不是事实源。

## 5. 接口设计

### 5.1 JournalPort（E1，本文新增，挂到 `engine/ports.ts` 的 `WorkflowEngineDeps`）

```ts
/** 引擎对运行事件日志的唯一写入/读取端口（生产实现 = WorkflowRunEventRepository 薄封装） */
export interface WorkflowJournalPort {
  /** 追加事件。seq 由引擎同步分配后传入；实现必须保证 (runId, seq) 唯一约束冲突时抛错 */
  append(event: JournalEventInput): Promise<void>
  /** 按 seq 升序读取 run 的全部事件（恢复用；fromSeq 用于快照后增量） */
  listByRun(runId: string, fromSeq?: number): Promise<JournalEventRecord[]>
  /** 最近一条快照事件（无则 null） */
  latestSnapshot(runId: string): Promise<JournalEventRecord | null>
  /** 该 run 是否已有任何事件（新/旧格式判据） */
  hasEvents(runId: string): Promise<boolean>
  /** 随 run 历史删除（deleteRun 级联）与保留策略清扫 */
  deleteByRun(runId: string): Promise<number>
  deleteTerminalBefore(threshold: Date, opts: { keepReviewedRuns: boolean }): Promise<number>
}

export interface JournalEventInput {
  runId: string; seq: number; type: WorkflowJournalEventType
  nodeId?: string | null; scopeKey?: string | null
  payload?: Record<string, unknown> | null
}
export interface JournalEventRecord extends JournalEventInput { id: string; createdAt: Date }
```

引擎侧新增私有方法 `appendEvent(exec, type, nodeId?, payload?)`：同步 `exec.nextEventSeq++` 分配 seq 后 `await deps.journal.append(...)`；失败则 `finalize(exec, 'failed', '运行日志写入失败')` 并中止调度（不变量 2）。

### 5.2 写入点清单（引擎改动锚点）

| 事件 | 写入位置（现状代码行） | 时机 |
|------|------------------------|------|
| `run_started` | `WorkflowRunService.startRun`（`workflow-run.service.ts:165-174` 建 run 后）/ `resumeRun`（`:316-326`） | run 建行后立即写（launch 前） |
| `edge_activated` | `activateEdge`（`workflow-engine.service.ts:1451-1469`）、`hydrateCheckpoints`（`:1514/1527/1529`）、循环体入口激活（`:1288`） | 内存 `activationSeqs.set` **之前** await |
| `node_launched` | `launchNode`（`:906-929` 建行/重置后） | 建行成功后、handler 调用前 |
| `node_suspended` | `handleReviewSuspend`（`:1090-1108`） | state 变更与 patchNode 前 |
| `node_completed` | `handleNodeSuccess`（`:1062-1068`）、`completeLoop`（`:1411-1415`→同写 `loop_completed`）、`applyReviewDecision`（`:553-560`，与 `review_decided` 相邻两条） | state/patchNode 前 |
| `node_failed` | `handleNodeFailure` 四个分支（重试 `:1140-1146`、fail 边 `:1167-1172`、迭代跳过 `:1190-1195`、fatal `:1207-1213`） | 各分支 state 变更前，disposition 对应 |
| `review_decided` | `applyReviewDecision` 入口校验通过后（`:502-551`） | output/route 计算后、state 变更前 |
| `loop_started` / `loop_iteration_settled` | `executeLoopNode`（`:1262-1264`）/ `driveLoop` 的 results.push 处（`:1300/1307`）与 `continueLoop`（`:1356-1358`） | driver 状态变更前 |
| `run_finished` | `finalize`（`:1682-1701`） | patchRun 前 |
| `snapshot` | 追加计数器达到阈值 / `handleReviewSuspend` 末尾 | 投影序列化后写 |

注：`edge_activated` 使 `activateEdge` 由同步变异步——它当前被 `activateOutgoing`/`computeReady` 重执行块外的纯同步路径调用，改造时整链改 async（pump 内部已是 async，无外部同步调用方依赖其同步性；这是本设计对引擎唯一的签名级侵入）。每批出边激活合并为一次 `append` 批量调用（payload 数组）以控制写放大（本文新增 `appendBatch`，语义同逐条 append、seq 连续分配）。

### 5.3 恢复投影（本文新增模块 `engine/journal-replay.ts`）

```ts
/** 纯函数投影：事件流 → RunExecution 调度态。被 boot 恢复、reviewDecide rehydrate、单测共用 */
export function replayJournal(
  input: ExecuteRunInput,
  events: JournalEventRecord[],
  snapshot?: JournalEventRecord | null
): RehydratedExecution

export interface RehydratedExecution {
  /** 重建完成、已注册进 activeExecutions 的执行体（由引擎内部构造，含 graph 邻接表） */
  exec: RunExecution            // 引擎内部类型，模块外不透出
  suspended: boolean            // 重建后处于挂起（等待 reviewDecide / ticker）
  nextEventSeq: number
  /** 在途节点（launched 未终态/未挂起）——恢复后需重执行 */
  inflightNodes: Array<{ nodeId: string; scopeKey: string; iterationIndex: number }>
}
```

引擎新增（本文新增）：

```ts
// WorkflowEngineService
async rehydrate(runId: string): Promise<boolean>  // 读 run 行+日志 → replayJournal → 注册 → 修复 node_run 投影 → 在途节点重执行或挂起等待
async ensureActive(runId: string): Promise<boolean> // active 则 true；否则若库中 status∈{pending,running,waiting_review} 且有日志 → rehydrate；单飞（per-runId Promise 去重）
```

### 5.4 `reviewDecide` rehydrate 路径（修 S1，本文新增流程）

`WorkflowRunService.reviewDecide` 改为：`engine.resumeReview` 返回 false 时 → 查 run 行，若 `status='waiting_review'` 且 `journal.hasEvents` → `await engine.ensureActive(runId)` → 重试 `resumeReview` 一次；仍 false 才返回原错误文案。旧格式 run（无日志）行为不变（§5.8）。

### 5.5 节点 state API（E2）与 handler 契约修订（E3）

```ts
// WorkflowNodeContext 新增成员（node-handler.ts）
interface WorkflowNodeContext<TConfig> {
  // ……现有成员不变……
  /** 持久化节点内中间状态（覆盖写 node_run.state_json；可 JSON 序列化；超 maxStateChars 拒绝）。
   *  崩溃/重启后本次执行被重放恢复时由 loadState 原样返回。每轮迭代末调用一次，勿高频调用。 */
  saveState?(state: unknown): Promise<void>
  /** 读取本节点本次执行的已存状态（首次执行为 undefined）。引擎在 relaunch/rehydrate 时从 state_json 注入 */
  loadState?(): Promise<unknown | undefined>
  /** 本次执行的稳定幂等键：${runId}:${nodeId}:${iterationIndex}，重执行/重试/恢复间不变（§5.7） */
  readonly executionKey: string
}

// WorkflowNodeHandler 新增可选成员
interface WorkflowNodeHandler<TConfig, TType> {
  // ……现有成员不变……
  /**
   * 人工决策回调（E3）。节点挂起（返回 waiting_review）后收到决策时：
   * - 声明了 resume：引擎回调本方法，携带决策与最近 saveState 的状态；
   *   返回值语义同 execute——可再次 waiting_review（多轮人机交互）、succeeded（出边）、failed。
   * - 未声明：维持旧"一次性终态"语义（节点直接 succeeded + 按决策出边），向后兼容。
   */
  resume?(
    ctx: WorkflowNodeContext<TConfig>,
    review: {
      decision: 'approve' | 'approve_with_changes' | 'reject' | 'timeout_approve' | 'timeout_reject'
      comment?: string
      editedValues?: Record<string, unknown>   // 已经过 editableFields 白名单过滤
      choice?: string
      decidedAt: string
    },
    state: unknown | undefined
  ): Promise<WorkflowNodeExecutionResult>
}
```

`applyReviewDecision` 改造（`:553-570` 段）：写 `review_decided` 事件后，查 registry handler——**声明了 `resume`**：patchNode 落 review 留痕（决策可见）但不标 succeeded、不激活出边，转而 `await handler.resume(ctx, review, await ctx.loadState())`，其结果走标准 `settle` 分发（succeeded → 现有成功路径；waiting_review → 重新走 `handleReviewSuspend`，写新 `node_suspended` 事件；failed → `handleNodeFailure`）；resume 抛异常 → `handleNodeFailure(retryable=false)`。**未声明**：现有逻辑原样（output 组装、白名单、choose 校验、route 激活全部不动）。

**handler 契约注释修订条文**（`node-handler.ts:7-16` 第 2 条改写）：

> 2. execute 必须可重入：同一 handler 实例可能被多个运行并发调用。**禁止把跨调用状态仅存于内存**；跨调用/跨崩溃需要保留的状态必须经 `ctx.saveState()` 落库，恢复时经 `ctx.loadState()` 取回。`signal.aborted` 后禁止产生副作用。

### 5.6 兼容矩阵：resume × 决策 × 结果

| handler.resume | 决策 | 引擎行为 |
|---|---|---|
| 未声明 | approve / timeout_approve | 旧语义：succeeded + approve 边（choose 模式校验 choice） |
| 未声明 | approve_with_changes | 旧语义：editedValues 白名单过滤后并入 output |
| 未声明 | reject / timeout_reject | 旧语义：reject 边；无边则 run failed（`:572-577`） |
| 声明 | 任意 | 回调 resume；返回 succeeded → 按 result.route/默认出边（不再自动套 approve/reject 边——route 由 handler 显式给）；返回 waiting_review → 再挂起（新 payload/timeout 生效，等待下一轮决策）；返回 failed → 标准失败处理（含重试/fail 边） |
| 声明 | 回调抛异常 | 节点 failed，retryable=false（不静默重试人工决策路径） |
| 声明，但 loadState 为空 | 任意 | 正常回调（state=undefined）——handler 必须容忍 state 缺失（旧库行/首挂起前未 saveState） |

### 5.7 非幂等节点的幂等键方案（落地 01 §3.4）

恢复重放**不**重放副作用，但在途节点会被**重新执行**——天然非幂等节点（发邮件、调外部写接口）需要防重：

1. 引擎提供稳定 `ctx.executionKey`（见 §5.5），节点把它作为对外调用的幂等键传给支持幂等的下游（如邮件服务的 dedupe key、支付接口的 idempotency-key）。
2. 下游不支持幂等键时，handler 用 state API 做"先记账后执行"模式：`saveState({ intent, effectKey })` → 执行副作用 → `saveState({ effectKey, done: true, resultRef })`；relaunch 时 `loadState()` 命中 `done` 直接返回留存结果，命中未 done 的 intent 由 handler 按业务决策（重查下游/人工兜底）。
3. 引擎层不做通用 effect-log 表（M1 非目标；若 M3 后多节点都需要，再沉淀为共享 helper——见 §12 开放问题 3）。

### 5.8 旧格式 run（无日志）的兼容降级

判据：`journal.hasEvents(runId) === false`（迁移前创建的 run 没有任何事件）。`recoverOnBoot` 对这类 run **完全保留现状语义**：running/pending → interrupted/timed_out；waiting_review → 保持挂起且 `reviewDecide` 仍返回"请先续跑"（`workflow-run.service.ts:281-285`），用户走 `resumeRun` 新 run 续跑。判据本身也写成 `rehydrate` 的第一道守卫，双保险。

### 5.9 恢复状态机（boot 扫描 → 重建 → 续跑）

`recoverOnBoot` 重写后流程（逐步失败处理见 §7）：

```
scanBootRecoverable()（跨租户，status ∈ pending/running/waiting_review）
  → 按 userId 分组、runWithUserAsync（沿用 :404-431 纪律）
  → 逐 run：
     1. hasEvents == false → 旧语义降级（interrupted/timed_out/keptWaiting），计数同现状
     2. 过期 waiting_review（wait_expires_at < now）→ 不再直接标 interrupted；
        走 rehydrate 后由 tickReviewTimeouts 按 timeoutPolicy 处理（行为变更，本文新增）
     3. pending 且仅 run_started → 等价于从未 launch：直接 execute 全新执行
     4. 其余 → engine.rehydrate(runId)：
        a. 读 run 行 + graphSnapshot（缺失/解析失败 → 标 interrupted，error='图快照不可用'）
        b. latestSnapshot → 校验 v → 投影基线；快照损坏 → 回退 fromSeq=1 全量重放
        c. replayJournal 逐事件 apply（见下）→ RehydratedExecution
        d. 修复投影：以重建 states 为准 patchNode 对齐 workflow_node_runs 行（崩溃窗口产生的滞后）
        e. exec 注册 activeExecutions，重设 nextEventSeq，重臂看门狗（全额 maxDurationMs 重新计——
           挂起不计时语义延续；运行期已耗时长不做跨进程结算，本文新增决策）
        f. suspended → 不 pump，等 reviewDecide/ticker；
           否则 inflightNodes 逐个重置 node_run 行为 running（保留 state_json！区别于 C1 重执行
           的 :910-919 清空路径，本文新增 reset 变体）→ 走 launchNode 重执行（loadState 注入）→ pump 续跑
```

**replay apply 规则**（每事件类型一行语义）：`edge_activated`→设 `activationSeqs[edgeId]=payload.seq`、`activationCounter=max(counter, seq)`，并照 `activateEdge:1457-1468` 重建 mergeArrivals（从已恢复的源节点 state.output 取）；`node_launched`→建 NodeExecutionState(running)；`node_completed`→终态+output+routeTaken+completedSeq+写 variables；`node_failed`→按 disposition 恢复 retryCount / failed_recovered / iterationSkippedByPolicy / scope.failed+pendingFailureError；`node_suspended`→waiting_review 全字段+`exec.suspended=true`；`review_decided`→复核用（状态已由相邻 `node_completed` 表达，apply 时仅校验决策一致性，不一致按日志后者为准）；`loop_started`/`loop_iteration_settled`/`loop_completed`→重建 `loopDrivers`（results 逐条回填）与 `loopScopes` 壳；`run_finished`→该 run 实际已终态（boot 扫描竞态防御），放弃 rehydrate 并同步 run 行状态；`snapshot`→增量重放时跳过；`verify_completed`/`task_escalated`→审计留痕，不改变调度态（apply 为空操作，任务状态由 16 号任务树的 boot 对账重建）。

### 5.10 保留策略（落地 02 开放问题 1 的建议）

- `deleteRun`（`workflow-run.service.ts:376-379`）级联删 `workflow_run_events`（与 nodeRuns 同事务序）。
- 时间清扫（本文新增，`journal.deleteTerminalBefore`）：复用既有 ticker 模式每日跑一次——终态 run 且 `finished_at < now-30d` 的普通自动化 run 删日志；**含 `node_suspended`/`review_decided` 事件的 run 全量保留**（审计友好，waiting/人工类）；阈值与开关入 `WORKFLOW_JOURNAL_DEFAULTS` + settings 覆盖。归档压缩（导出冷储）留作 M3 后按需。

## 6. 状态机与关键时序

### 6.1 正常运行（含挂起决策）

```
startRun → 建 run 行 → append(run_started) → launch → execute
execute: append 已由各变迁点承担：
  pump → launchNode: 建 node_run 行 → append(node_launched) → handler.execute
    → succeeded: append(node_completed) → patchNode → setVariable → activateOutgoing(逐边 await append(edge_activated) → set activationSeqs)
    → waiting_review: append(node_suspended) → 改 state/patchNode/patchRun → append(snapshot) → execute 返回，exec 留 activeExecutions
reviewDecide → resumeReview → append(review_decided) → [handler.resume? → settle 分发 | 旧一次性终态] → append(node_completed) → 激活出边 → resumeSuspended 续驱
终态: append(run_finished) → patchRun → emit
```

### 6.2 崩溃恢复（运行中崩溃）

```
进程崩溃（任意点）
boot: recoverOnBoot → run R 状态 running、有日志
  → rehydrate: 读最近快照(seq=40) → 重放 seq 41..N
  → 投影修复 node_run 行（如 seq=48 的 node_completed 未及 patchNode 即崩溃 → 此处补齐）
  → 在途节点 A（seq=47 node_launched 无后续）→ 行重置 running（留 state_json）→ 重执行（loadState 命中 → 从断轮继续）
  → 已激活边/merge/循环 driver 全部回到崩溃前一刻 → pump 继续
```

### 6.3 挂起跨重启决策（修 S1 的核心场景）

```
D1: 节点挂起 → append(node_suspended)+snapshot → 进程退出（挂起数天）
D3: 用户点批准 → reviewDecide → resumeReview=false（非活跃）
  → run 行 waiting_review 且有日志 → ensureActive → rehydrate（O(1)：snapshot+零增量）
  → exec 挂起态注册 → resumeReview 重试命中 → append(review_decided) → resume 回调/旧终态 → 续驱至终态
（若等待期间 waitExpiresAt 已过：boot rehydrate 后 ticker 首扫即按 timeoutPolicy 落 timeout_approve/reject/fail）
```

## 7. 失败模式与边界情况（逐条）

1. **崩溃于"append 成功 / 改内存前"**：日志领先内存——正是设计假定的常态；重放 apply 幂等，恢复后等价于该变迁已发生。node_run 行滞后由投影修复补齐（§5.9-d）。
2. **崩溃于"append 进行中"（insert 未提交）**：事件丢失、内存已丢——seq 出现空洞。恢复以日志为准：该变迁视为未发生。若丢失的是 `node_completed`，节点回到在途 → 重执行（幂等键兜底，§5.7）；若是 `edge_activated`，边未激活 → 下游未调度 → 与崩溃前内存相比"慢了一步"但一致。**不允许**出现"内存已改、日志无记录"还继续跑的情况——append 失败即 finalize 失败终态（不变量 2）。
3. **崩溃于"挂起 patchRun 与 snapshot 之间"**：run 行已 waiting_review、snapshot 未写——无碍，快照只是优化，rehydrate 走增量重放。
4. **seq 冲突**（`(run_id, seq)` 唯一约束报错）：只能是引擎 bug（计数器错位）或并发 rehydrate 双写——`ensureActive` 单飞去重防后者；前者 append 抛错 → run failed 终态，日志留证。
5. **快照 payload 损坏 / v 不匹配**：回退全量重放；全量重放中遇到 payload 不可解析的事件 → 放弃该 run 标 `interrupted`（error 记事件 seq），**不阻断**其他 run 的恢复（per-run try/catch）。
6. **boot 期间用户对同一 run 并发 reviewDecide**：`ensureActive` 单飞（同 runId 共享一个 Promise），后到者等同一重建结果；决策应用仍走 `resumeReview` 的状态校验（非 waiting_review 拒绝）。
7. **旧格式 run 与 `hasEvents` 判据竞态**：`run_started` 在 launch 前写（§5.2），不存在"新 run 已执行但无事件"的窗口；崩溃于"建 run 行 / 写 run_started 之间"→ 该 run 被判旧格式 → interrupted 降级，行为安全（等价于今天的崩溃结果）。
8. **resume 回调期间崩溃**：`review_decided` 已落库但回调结果未落——重启 rehydrate 到"已决策未生效"点：`review_decided` 的相邻 `node_completed` 缺失 → 恢复为"挂起已决策"态，**重新执行 resume 回调**（决策幂等：同一 decidedAt/decision 重放；handler 的 resume 必须容忍同一决策被回调两次——契约条文注明）。
9. **relaunch 在途节点时 state_json 超大/损坏**：`loadState` JSON 解析失败 → 视为 undefined（warn 日志），handler 从头执行（退化而非炸 run）。
10. **timeout 死线（run.timeout_at）在重启前已过**：boot 现行语义保留——先判 timed_out 再谈 rehydrate（超时 run 不重建，直接终态）。
11. **看门狗重臂全额时长**：崩溃前已跑 29min（上限 30min）的 run 恢复后再得 30min——宽松但简单；`timeout_at` 死线兜底总时长（看门狗与死线的分工沿用现状：`fireWatchdog:727-745` vs 服务层死线）。
12. **Web 端多实例部署**：当前 Web 端单进程假设（事件总线/调度器同进程）。若未来水平扩展，boot 恢复需加分布式锁（PG advisory lock）——本期不做，记入 §12。

## 8. 安全与权限

- **租户隔离**：`workflow_run_events.user_id` 由 `BaseRepository` 自动注入/过滤；boot/清扫的跨租户裸扫描沿用 `scanBootRecoverable` 同款纪律（扫出后按 userId `runWithUserAsync` 重建上下文再处理，`workflow-run.service.ts:404-431`）。
- **payload 敏感性**：journal 含审核 payload、节点输出、agent 状态——与同库 node_run/output_json 同级敏感，不新增外发通道；前端轨迹展示走 `agent_trajectories`（12 号文档），journal **不暴露** IPC/REST 读取接口（M1）；如 M2 加调试视图，需经既有鉴权注册（02 横切：Web 端 IPC 漏注册教训）。
- **决策留痕**：`review_decided` 的 `decidedBy`（M4，E6 操作者校验落地后填充）使 journal 成为审批审计的事实源；M1 阶段决策来源仍只有 runId+nodeId（现状 S7，不在本文修）。
- **注入面**：journal 无 SQL 拼接（TypeORM 参数化）；payload 一律 JSON 序列化落 text 列，回放 `safeParse` 降级（沿用 repository 现有模式）。
- **LLM 无关**：本模块不接触凭据/出网；非幂等节点的外部调用继续走 `validateOutboundUrl` 闸门（01 §9），幂等键不改变安全边界。

## 9. 与其他模块的契约

- **01-design-spec §3 / §10**：本文落地扩展点 **E1**（journal + boot 重放 + reviewDecide rehydrate）、**E2**（state_json + saveState/loadState）、**E3**（resume 回调）；事件类型在 01 §3.2 的 7 种上新增 5 种、另收编 17-quality-gate 的 2 种质量门事件（§4.3 已逐条标注）。E5（task_id/parent_run_id）属 M3 任务树文档，本文不动 `workflow_runs`。
- **10-event-system.md（通用事件平台）**：边界与桥见 §3.1——journal 私有、强一致、不进平台；`run_finished`/挂起请求的事件平台发布点由本文预留（`finalize`/`handleReviewSuspend` 内、journal 落库之后），具体事件名与载荷遵循 10 号文档的领域事件命名规范，M3 任务树调度（01 §5.3）是其首个消费者。
- **12 号（AgentRuntime/trajectory）**：agent-loop 节点是 §5.5 契约的首个实现者——`AgentHost.saveState/loadState` 映射到 `ctx.saveState/loadState`，`host.suspend` 映射为 handler 返回 `waiting_review`、决策经 `resume` 回调回到循环（01 §7.2 伪代码的 `host.suspend` await 点）；`agent_trajectories` 与 journal 共享"run 内单调 seq"机制但各自独立表。
- **lan-collab 04-workflow-assignment（M4，E6）**：assignee/操作者校验落在 `reviewDecide` 入口与 `review_decided.decidedBy`，本文的 rehydrate 路径必须在校验**之后**触发（决策合法性先于重建成本）。

## 10. 测试策略

- **投影单测**（内存 JournalPort 假实现，ports 模式现成）：构造事件流 → replayJournal → 断言 activationSeqs/mergeArrivals/loopDrivers/suspended 逐字段相等；快照+增量 ≡ 全量重放（性质测试，随机事件序列）。
- **崩溃窗口故障注入**：在 §7 的 1/3/8 三个窗口点用可注入时钟+假端口模拟崩溃（append 后、patchNode 前抛错重启），断言恢复后终态与无崩溃基线一致。
- **端到端（M1 验收）**：① 跑含 human-review 的图，挂起后杀进程重启，reviewDecide 直接批准成功续跑至终态；② agent-loop 循环第 3 轮杀进程，重启后从第 3 轮继续（state_json 命中），轨迹无空洞；③ 旧格式 run（测试库手工造无日志 run）重启后维持 interrupted 降级语义；④ resume 回调矩阵（§5.6 六行）逐行单测。
- **双端**：迁移在 SQLite 与 PG 各跑一遍（占位符 `$1` vs `?` 历史教训）；schema-drift 检查按 affinity 族通过（`create-workflow-tables.ts:7-9` 约定）。
- **回归**：现有引擎单测全量过（写入路径改造不得改变调度语义——用既有测试做防退网）。

## 11. 里程碑拆解

- **M1（地基，本期主体）**：`workflow_run_events` 双端迁移 + JournalPort；写入点全清单（§5.2）；replayJournal + rehydrate + recoverOnBoot 重写 + reviewDecide rehydrate；E2（state_json + context API）+ E3（resume 回调 + 契约注释修订）；旧格式降级；挂起强制快照（增量阈值快照可 M1 尾，性能不够再开）；§10 测试全项。对应 02 M1 验收第 2/3 条。
- **M2（工具生态与观测）**：journal 无新增；消费侧只有调试/审计视角的潜在需求（暂不暴露读取接口，见 §8）。
- **M3（长程能力）**：`run_finished` → 事件平台发布点接线（任务树调度消费）；保留策略清扫作业上线（复用 cron tick）；视使用面决定是否沉淀通用 effect-log helper（§5.7-3）。
- **M4（业务化）**：`review_decided.decidedBy` 填充 + 决策入口操作者校验（先于 rehydrate）；审批审计报表直接读 journal；多实例部署时再评估 boot 恢复分布式锁。

## 12. 开放问题

1. **快照体积**：挂起强制快照的 payload 含全量 variables/outputs，长流程可能接近 MB 级——是否需要快照内容截断策略（如变量只存引用、恢复时回查 node_run 行）？建议 M1 先不截断，实测后定。
2. **`edge_activated` 写放大**：扇出大的图每节点完成产生多条边事件；appendBatch 已缓解，是否需要"边激活批量合并为节点完成的子记录"进一步压缩？倾向保持独立事件（重放语义最直白）。
3. **effect-log 是否引擎化**：§5.7 的幂等记账目前由 handler 自理；若 M3 出现第三个非幂等节点，抽象为 `ctx.effects.runOnce(key, fn)` 共享 helper。
4. **Web 端多实例**：boot 恢复/rehydrate 的跨实例互斥（PG advisory lock 或 run 级 lease）本期不做——单实例是现行部署事实，水平扩展立项时一并设计。
5. **保留策略默认值**：30 天 + 人工类全量是否合适，需运营数据校准（与 02 开放问题 1 同源，本文给出落地机制，阈值可配）。
