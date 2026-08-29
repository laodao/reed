# 16 · 任务树与规划调度（Task Tree & Planning/Scheduling）详细设计

> Agent Loop Harness ｜ 2026-08-28 ｜ 配套总纲：[01-design-spec.md](./01-design-spec.md) §5（支柱三）、§6（失败处理链）；分期：[02-implementation-plan.md](./02-implementation-plan.md) M3。
> 本文是模块级施工文档。所有表名/字段名沿用总纲 §5.1；本文补充的字段与机制一律标注 **（本文新增）**。事件系统本体见 [10-event-system.md](./10-event-system.md)，本文只定义消费契约。

---

## 1. 目标与范围

**目标**：把总纲 §5"任务管理（任务树 + 递归规划）"落到可编码的详细设计——

- `agent_tasks` 表完整 DDL（SQLite/PostgreSQL 双端）与 `workflow_runs` 加 `task_id` / `parent_run_id` 的迁移（引擎扩展点 E5）；
- 任务状态机全集（进入条件 / 退出动作 / 异常分支 / cancelled 级联）；
- Planner：分解 prompt 结构、任务 DAG JSON 输出 schema、验收标准生成要求、深度/扇出上限；
- 静态规划（整树人工批准）与动态重规划（局部子树）流程；
- 就绪驱动调度器：基于 10 号事件系统的"依赖完成 → 解锁后继"，与引擎互斥策略的关系；
- 子树预算体系（token / 迭代 / 时长）与耗尽升级；
- 运行森林镜像任务树的查询视图；
- 失败级联影响矩阵；与 AgentRuntime / 质量门的接口契约。

**非目标**：多智能体协作（总纲 §12）；审批人指派/待办中心（M4，见 lan-collab 文档）；跨进程分布式调度（事件总线是进程内的，见 §7/§12）。

---

## 2. 现状与差距（代码证据）

| 资产/缺口 | 证据 | 对本模块的意义 |
|---|---|---|
| sub-workflow 节点：`startRun(triggerType='subflow', triggerInfo:{parentRunId})` 后 **500ms 轮询** `getRunDetail` 至终态，超时 `subflowTimeoutMs=600_000`；子运行 `skipped`（互斥）→ 节点直接 failed 不重试 | `src/core/modules/workflow/nodes/sub-workflow-nodes.ts:49-81`、`src/shared/types/workflow.types.ts:1091` | 现有"父等子"是**占住一个任务槽的轮询**，任务树必须改为**事件驱动派生**（总纲 §5.3） |
| 同工作流单实例互斥：`findMutexHolders` 命中 pending/running/waiting_review 即记 skipped | `src/core/modules/workflow/workflow-run.service.ts:80-93`；状态集合 `workflow-run.repository.ts:85-89`（`MUTEX_RUN_STATUSES`） | 任务树并发执行同一定义的多个 sub_workflow 子任务会互相 skipped——M3 需"互斥即排队"，M4 由 E6 放开（§5.5） |
| 引擎终态 `finalize` 只写库 + `emitRunStatus`（前端单通道 `wf:run-event`），**不向领域事件总线发布 run 终态事件** | `workflow-engine.service.ts:1682-1701`；总线埋点现状仅 kb/image/voice/translation（`domain-event-bus.ts:54-61` 及调用方） | 调度器的就绪驱动依赖 10 号事件系统补齐 run 终态领域事件（§9.1） |
| 领域事件总线为进程内 `EventEmitter` 单例，`publish` 自动携带 ALS userId，`safePublish` try/catch 不影响主流程；**无持久化** | `domain-event-bus.ts:27-61` | 事件丢失场景必须由 boot 对账兜底（§7） |
| 运行记录与 checkpoint：`workflow_runs`（图快照、状态机、`resumed_from_run_id`）+ `workflow_node_runs`（`(run_id,node_id,iteration_index)` 唯一） | `create-workflow-tables.ts:81-185` | `workflow_runs` 加列镜像任务树（E5） |
| 迁移约定：单文件、幂等、`isPg` 分支、`ensureTable/checkColumnExists/ensureIndex` 助手；接入点 Electron `runMultiTenantMigrations()` + Web `initDatabase()` | `migrations/create-workflow-tables.ts:11-14`、`add-workflow-share-token.ts:13-45` | 本文 DDL 按此风格施工（§4） |
| 多租户：业务表必有 `user_id` 列，BaseRepository `scoped` 按 ALS userId 自动过滤/填充 | `src/core/database/base-repository.ts:1-14` | 总纲 `agent_tasks` DDL 未含 `user_id`，本文补上（§4，本文新增） |
| 审核挂起/恢复、journal、handler resume 回调 | 总纲 §3（E1/E2/E3），本文 M1 前置依赖 | escalated 升级人工复用该机制（§6.3） |

**差距小结**：任务树是纯新增子系统；三块地基（journal 恢复、run 终态领域事件、互斥放开）分别由 M1、10 号事件系统、E6 提供，本文只在契约层对接，不重复实现。

---

## 3. 概念模型

```
AgentTask（任务节点）                WorkflowRun（运行实例）
  ├─ root_id ──────────────┐         ├─ task_id ──────────→ agent_tasks.id（E5 新列）
  ├─ parent_id ── 树骨架    │ 1:0..1  ├─ parent_run_id ────→ workflow_runs.id（E5 新列）
  ├─ depends_on ── 兄弟间DAG │◄────────┘  （任务可重试：同一 task 多 run，run_id 记最近一次）
  └─ executor: agent_loop / sub_workflow:<defId> / human
```

- **任务树**：`parent_id` 表达分解层级；**任务 DAG**：同层兄弟间用 `depends_on_json`（任务 id 数组，本文新增）表达执行依赖——Planner 输出的是"树 + 层内 DAG"的复合结构。
- **运行森林**：每个被执行的任务派生 0..N 次 run（重试/续跑产生多次），run 通过 `task_id` 挂到任务、通过 `parent_run_id` 挂到父任务的 run——UI 树形展示的数据源（§5.7）。
- **plan_version（本文新增）**：每次重规划 +1；被子树重规划淘汰的任务保留行（status=cancelled + `superseded` 标记于 result_json），审计可追溯。
- 三个角色：**Planner**（分解/重规划，LLM）、**TaskScheduler**（就绪驱动调度，确定性代码）、**TaskService**（状态机唯一写者）。状态机迁移只允许经 TaskService 方法发生（与 workflow-run.repository "仓库不校验状态机" 的分层一致，引擎侧惯例见 `workflow-run.repository.ts:6`）。

---

## 4. 数据模型

### 4.1 `agent_tasks`（总纲 §5.1 + 本文新增字段）

字段口径差异说明：`user_id`（多租户必需，本文新增）；`depends_on_json`、`plan_version`、`executor_config_json`、`usage_json`、`error`、`started_at`、`finished_at`（本文新增）。JSON 列双端均 TEXT/text，应用层序列化（与 `graph_snapshot` 同惯例）。

**SQLite（PC）**：

```sql
CREATE TABLE agent_tasks (
  id                  TEXT PRIMARY KEY,               -- task_<ts>_<rand>
  user_id             TEXT,                           -- （本文新增）多租户行级隔离
  parent_id           TEXT,                           -- NULL = 根任务
  root_id             TEXT NOT NULL,
  depth               INTEGER NOT NULL,               -- 根=0，上限默认 4（总纲 §5.1）
  title               TEXT NOT NULL,
  spec_json           TEXT NOT NULL,                  -- { goal, acceptance[], inputContract, outputContract, category, riskLevel }
  status              TEXT NOT NULL,                  -- 见 §6.1 九态
  executor            TEXT NOT NULL,                  -- agent_loop / sub_workflow:<definitionId> / human
  executor_config_json TEXT,                          -- （本文新增）{ inputs?, guardrails?, verifierProfile? }
  depends_on_json     TEXT NOT NULL DEFAULT '[]',     -- （本文新增）同树任务 id 数组（兄弟 DAG）
  plan_version        INTEGER NOT NULL DEFAULT 1,     -- （本文新增）重规划代数
  run_id              TEXT,                           -- 最近一次派生的 run
  budget_json         TEXT,                           -- { maxTokens, maxIterations, maxDurationMs, deadlineAt }
  usage_json          TEXT,                           -- （本文新增）{ tokens, iterations, toolCalls, elapsedMs } 子树累计
  quality_score       REAL,
  result_json         TEXT,                           -- { output?, supersededByPlanVersion?, escalationReason? }
  error               TEXT,                           -- （本文新增）最近失败原因（可读）
  retry_count         INTEGER NOT NULL DEFAULT 0,
  started_at          DATETIME,                       -- （本文新增）
  finished_at         DATETIME,                       -- （本文新增）
  created_at          DATETIME,
  updated_at          DATETIME
);
CREATE INDEX idx_agent_tasks_user       ON agent_tasks (user_id);
CREATE INDEX idx_agent_tasks_parent     ON agent_tasks (parent_id);
CREATE INDEX idx_agent_tasks_root_status ON agent_tasks (root_id, status);
CREATE INDEX idx_agent_tasks_run        ON agent_tasks (run_id);
```

**PostgreSQL（Web）差异**：`TEXT→varchar`（主键/枚举类短串；无 length，与 entity 对齐防 schema-drift 误报，见 `add-workflow-share-token.ts:21-22`），大 JSON 列 `TEXT→text`，`DATETIME→timestamp`，`REAL→double precision`；索引同。占位符差异仅在迁移助手内部（`?` vs `$1`，`create-workflow-tables.ts:234-250`），DDL 本体无占位符。

迁移文件：`src/core/database/migrations/create-agent-tasks.ts`（新），风格对齐 `create-workflow-tables.ts`（`ensureTable` + `ensureIndex`，幂等），接入 Electron `runMultiTenantMigrations()` 与 Web `initDatabase()` 两处。

### 4.2 `workflow_runs` 加列迁移（E5）

`src/core/database/migrations/add-workflow-run-task-link.ts`（新），风格对齐 `add-workflow-share-token.ts`（`checkColumnExists` 幂等加列）：

```sql
ALTER TABLE workflow_runs ADD COLUMN task_id        TEXT;    -- PG: varchar
ALTER TABLE workflow_runs ADD COLUMN parent_run_id  TEXT;    -- PG: varchar
CREATE INDEX idx_wf_run_task   ON workflow_runs (task_id);
CREATE INDEX idx_wf_run_parent ON workflow_runs (parent_run_id);
```

- `task_id`：该 run 服务的任务（NULL = 普通工作流运行，向后兼容）。
- `parent_run_id`：派生它的父任务的 run（sub-workflow 动态派生时填写；现有 sub-workflow 节点只用 `trigger_info.parentRunId`，迁移不改旧行为）。
- Entity 同步：`workflow-run.entity.ts` 加 `taskId`/`parentRunId`；`WorkflowRunRecord`/`CreateWorkflowRunInput` 加同名可选字段（`workflow-run.repository.ts:35-69`）。
- **双端注意**：存量库两列均为 NULL，无需数据回填；schema-drift 检查按 affinity 族比对（`create-workflow-tables.ts:8-9`），varchar/TEXT 族一致即可。

---

## 5. 接口设计

模块位置：`src/core/services/agent-runtime/task-tree/`（与总纲 §7.1 的 `planner.ts` 同包；TaskService/Scheduler 是 harness 侧服务，不属于引擎）。

### 5.1 共享类型（`src/shared/types/agent-task.types.ts`，新）

```ts
export const AGENT_TASK_STATUSES = {
  pending: 'pending', planning: 'planning', ready: 'ready', running: 'running',
  verifying: 'verifying', succeeded: 'succeeded', failed: 'failed',
  cancelled: 'cancelled', escalated: 'escalated',
} as const
export type AgentTaskStatus = keyof typeof AGENT_TASK_STATUSES
export const AGENT_TASK_TERMINAL_STATUSES: ReadonlySet<string> =
  new Set(['succeeded', 'failed', 'cancelled', 'escalated'])  // escalated 见 §6.1 注

export interface AgentTaskSpec {            // spec_json 内容
  goal: string
  acceptance: string[]                      // 验收标准（自然语言断言，Verifier 逐条检查）
  inputContract?: Record<string, unknown>   // 输入 schema 描述
  outputContract?: Record<string, unknown>  // 输出 schema 描述（规则验证层直接用）
  category?: string                         // 验证器组合选择依据（总纲 §6.4）
  riskLevel?: 'low' | 'medium' | 'high'
}
export interface TaskBudget { maxTokens?: number; maxIterations?: number; maxDurationMs?: number; deadlineAt?: number }
export interface TaskUsage  { tokens: number; iterations: number; toolCalls: number; elapsedMs: number }
```

### 5.2 Planner 输出 schema（任务 DAG JSON）

```ts
export interface TaskPlanJSON {             // Planner LLM 输出的严格 schema（JSON Schema 校验，S5 修复后走 jsonSchema）
  version: 1
  tasks: Array<{
    key: string                             // 计划内局部键（如 "t1"），落库时映射为真实 id
    parentKey: string | null                -- 树边
    dependsOn?: string[]                    -- 层内 DAG 边（key 引用）
    title: string
    spec: AgentTaskSpec                     -- 必须含 ≥1 条可检验的 acceptance
    executor: 'agent_loop' | `sub_workflow:${string}` | 'human'
    executorConfig?: { inputs?: Record<string, unknown>; guardrails?: { maxIterations?: number; maxTokens?: number }; verifierProfile?: string }
    budgetShare?: number                    -- 0-1，占父预算比例（§5.6）
  }>
}
export interface Planner {
  decompose(input: { goal: string; context?: Record<string, unknown>; parentTask?: AgentTaskRecord; constraints: PlanConstraints }): Promise<TaskPlanJSON>
  replan(input: { task: AgentTaskRecord; failureContext: { error?: string; defects?: string[]; qualityScore?: number }; constraints: PlanConstraints }): Promise<TaskPlanJSON>
}
export interface PlanConstraints { maxDepth: number; maxFanoutPerNode: number; maxTasksPerTree: number; remainingBudget: TaskBudget }
```

### 5.3 TaskService（状态机唯一写者）

```ts
export interface TaskService {
  createRootTask(input: { goal: string; context?: Record<string, unknown>; budget: TaskBudget; constraints?: Partial<PlanConstraints> }): Promise<AgentTaskRecord>
  /** 静态规划：根任务 planning → Planner → 子树落库（plan_version=1）→ 整树转 pending（等批准） */
  planTree(rootId: string): Promise<{ planVersion: number; taskCount: number }>
  /** 人工批准计划（总纲 §5.2 硬性约束）→ 无依赖任务解锁为 ready */
  approvePlan(rootId: string, planVersion: number, operatorId: string): Promise<void>
  /** run 终态回调（事件驱动入口，§5.5） */
  onRunTerminal(evt: RunTerminalEvent): Promise<void>
  /** 取消级联（§6.2） */
  cancelTask(taskId: string, reason: string, operatorId: string): Promise<{ cancelledCount: number }>
  /** 动态重规划（§6.4）：task 的子树作废重分解 */
  replanSubtree(taskId: string, failureContext: { error?: string; defects?: string[]; qualityScore?: number }): Promise<{ planVersion: number }>
  /** escalated 人工裁决 */
  resolveEscalation(taskId: string, decision: 'retry' | 'replan' | 'accept_partial' | 'cancel', operatorId: string, comment?: string): Promise<void>
  /** UI 树形视图（§5.7） */
  getTaskTree(rootId: string): Promise<TaskTreeView>
}
```

### 5.4 TaskScheduler（就绪驱动，薄）

```ts
export interface TaskScheduler {
  start(): Promise<void>   // 订阅 RunTerminalEvent（10 号事件系统）；boot 对账（§7-F3）
  stop(): void
  /** 扫描某树内所有"依赖全部 succeeded"的 pending 任务 → ready → 逐个 dispatch */
  unlockReady(rootId: string): Promise<AgentTaskRecord[]>
}
```

### 5.5 与引擎/互斥的关系

- **dispatch 规则**：`executor=agent_loop` → 直接驱动 `AgentRuntime.run(task, host)`（总纲 §7.2），不落 workflow_runs（run_id 记 harness 内部轨迹 id，见开放问题 §12-3）；`executor=sub_workflow:<defId>` → `runService.startRun({ definitionId, triggerType:'subflow', inputs: 由 executorConfig.inputs 渲染, triggerInfo:{ source:'task-tree', parentRunId: 父任务runId, taskId } })`，并把返回的 run.id 写回 `agent_tasks.run_id`、`workflow_runs.task_id/parent_run_id`（E5 列，startRun 入参扩展 `taskId/parentRunId`，本文新增字段透传）。
- **互斥冲突处理（本文新增决策）**：M3 阶段 `findMutexHolders` 语义不变；startRun 返回 `skipped` 时**任务保持 ready 并延迟重派**（指数退避，上限 5min），不视为失败——与 sub-workflow 节点"skipped 即 failed"（`sub-workflow-nodes.ts:56-58`）语义不同，因为任务树调度器可以在树级排队而非占槽轮询。M4 由 E6 放开互斥（按业务键维度）后此退避自然消失。
- **并发上限**：树内同时 running 的任务数默认 5（可配，本文新增 `maxConcurrentTasksPerTree`）；引擎侧仍受 `maxConcurrentRuns`（默认 3，`workflow.types.ts:1042`）约束，排队语义复用 `workflow-run.service.ts:60,240-246` 的 FIFO 队列，任务树不另建运行队列。

### 5.6 预算体系

- **分配**：根任务由创建者给定 `budget`；Planner 输出 `budgetShare`（子任务占父比例，Σshare ≤ 1，校验失败则按子任务数均分兜底）；递归分解时子树预算 = 父剩余 × share。depth 上限默认 4（总纲 §5.1），`maxFanoutPerNode` 默认 8、`maxTasksPerTree` 默认 64（本文新增，防爆）。
- **消耗追踪**：`usage_json` 沿树向上累计——agent_loop 任务从 `agent_trajectories` 的 usage 汇总（总纲 §3.3）；sub_workflow 任务从 run 的 token 观测（M2 范围）汇总；时长用 `finished_at - started_at` 子树和。写入时机：任务终态时一次性结算 + running 中每轮迭代增量（harness 侧）。
- **耗尽升级**：任一维度超限 → 该任务转 escalated（`escalationReason: 'budget_exhausted:<dim>'`），**不静默续烧**（总纲 §5.2）；根任务 budget 耗尽 → 整树挂起级升级人工（见 §6.3）。

### 5.7 运行森林视图（UI 数据源）

```ts
export interface TaskTreeView {
  root: AgentTaskRecord
  nodes: Array<AgentTaskRecord & {
    children: string[]                      -- 子任务 id
    runs: Array<{ id: string; status: WorkflowRunStatus; parentRunId: string | null; startedAt: Date | null; durationMs: number | null }>  -- 按 workflow_runs.task_id 反查
    subtreeQuality: number | null           -- 子树质量分聚合（总纲 §6.4：均值 × 权重）
    subtreeUsage: TaskUsage                 -- 子树预算消耗合计
  }>
}
```

SQL 形态：`agent_tasks` 按 `root_id` 一次取出 + `workflow_runs WHERE task_id IN (...)` 一次取出，内存组树；不建物化视图。

---

## 6. 状态机与关键时序

### 6.1 任务状态机全集

| 状态 | 进入条件 | 退出动作/去向 | 异常分支 |
|---|---|---|---|
| `planning` | 根任务创建后（静态规划）；或 replanSubtree 触发（该任务自身） | Planner 成功 → 子任务落库，本子任务集转 `pending`，根转 `pending`（待批准） | Planner 输出 schema 校验失败/LLM 失败 → 重试 1 次 → 仍败转 `failed`（error='plan_failed'） |
| `pending` | 落库初始态；或计划批准后依赖未满足 | 依赖全 succeeded 且计划已批准 → `ready` | 父取消 → `cancelled`（级联） |
| `ready` | 依赖解锁（unlockReady） | dispatch 成功 → `running`（写 started_at/run_id） | dispatch 互斥 skipped → 留 `ready` 退避重派（§5.5）；dispatch 抛错 → `failed` |
| `running` | dispatch 成功 | run 终态事件到达：succeeded → `verifying`；failed/cancelled/timed_out/interrupted → 进失败链（§6.4） | 进程崩溃 → boot 对账重驱动（§7-F3） |
| `verifying` | run succeeded | Verifier 四层（总纲 §6.2）：通过 → `succeeded`（写 quality_score/result_json，触发 unlockReady） | 验证失败 → 失败链；验证器自身异常 → 按验证失败处理（保守） |
| `succeeded` | 验收通过 | 终态；回写知识飞轮成功计数（总纲 §6.4） | — |
| `failed` | 失败链耗尽（重试+重规划均失败）且非升级路径 | 终态；父任务阻塞（§7.2 矩阵） | — |
| `escalated` | 重试耗尽/重规划失败/预算耗尽/质量灰区人工 | resolveEscalation：retry → `ready`；replan → `planning`；accept_partial → `succeeded`（quality_score 按人工给定，result_json 记 `acceptedBy`）；cancel → `cancelled` 级联 | 等待期间父取消 → `cancelled` |
| `cancelled` | 父级级联 / 人工取消 / 重规划作废 | 终态 | — |

注：`escalated` 是"终态化的等待态"——对调度器视为阻塞（不解锁后继），对 UI 视为待办；列入 `AGENT_TASK_TERMINAL_STATUSES` 仅为对账扫描口径，人工裁决后可再迁移（上表已列）。

### 6.2 取消级联时序（文字时序图）

```
Operator → TaskService.cancelTask(T2)
  1. TaskService 读 T2 子树（root_id 内 parent 链递归，单查 root_id 全量后内存过滤）
  2. 按 depth 降序（叶子优先）逐任务 CAS：
     - pending/planning/verifying/escalated → cancelled（直接落库，无副作用要收）
     - running 且 executor=sub_workflow → runService.cancelRun(run_id)（workflow-run.service.ts:249-268；
       活动运行引擎取消，排队运行改库）；run 终态事件回来后 onRunTerminal 见 task 已 cancelled → 跳过失败链
     - running 且 executor=agent_loop → host.abort()（AgentRuntime 护栏入口，总纲 §7.3）
     - ready → cancelled（若已 dispatch 在飞，dispatch 前二次校验 status 仍=ready，见 §7-F4）
  3. T2 自身 → cancelled（记 reason/operator）
  4. 父任务 T1：检查其余子任务——若全部终态且存在 cancelled → 按 §7.2 矩阵决定 T1 走向（默认 failed: 'child_cancelled'）
  5. publish 'agent:task-status-changed'（本文新增领域事件，UI 刷新/待办中心用）
```

### 6.3 静态规划全流程时序

```
User → createRootTask(goal, budget)            → 根任务 planning
TaskService → Planner.decompose(constraints)   → TaskPlanJSON（schema 校验 + 深度/扇出/总数校验）
TaskService → 落库整树（pending, plan_version=1, 根预算 × budgetShare 计算各子树 budget_json）
TaskService → 向宿主抛"计划批准"挂起（工作流宿主=human-review 节点，总纲 §5.2；payload=整树 JSON）
Operator 批准 → approvePlan(rootId, planVersion=1) → unlockReady → dispatch 无依赖任务
...每个 run 终态 → RunTerminalEvent → onRunTerminal → verifying → succeeded → unlockReady...
根任务全部子树 succeeded → 根任务自身 verifying（聚合产出过根验收）→ succeeded → 飞轮蒸馏触发（总纲 §4.2）
```

### 6.4 动态重规划时序

```
触发（三选一，总纲 §5.2/§6.3）：
  a) run failed 且 retry_count ≥ maxRetry（默认 3，本文新增树级配置）
  b) verifying 后 quality_score < replanThreshold（默认 0.6，灰区下界，与总纲 §6.2 灰区一致）
  c) resolveEscalation(decision='replan')
流程：
  1. TaskService.replanSubtree(T)：T 的活子任务（非终态）按 §6.2 级联 cancelled；已完成兄弟保留
  2. T 的既有子任务批次 result_json.supersededByPlanVersion = plan_version+1（行保留，审计）
  3. Planner.replan(failureContext 带缺陷列表) → 新子树落库（plan_version+1，depth 从 T.depth+1 续算）
  4. 新子树是否需人工批准：plan_version=1 已批准过的树，重规划默认走"变更摘要人工确认"（轻量批准，本文新增；
     可配置为自动——见 §12-1）
  5. 批准后新子树 pending → unlockReady 续跑；T 的 retry_count 归零（新一轮预算内尝试）
  6. 重规划次数上限 replanLimit=2（本文新增）耗尽 → T → escalated
```

---

## 7. 失败模式与边界情况（逐条崩溃点分析）

领域事件总线是进程内无持久化的（`domain-event-bus.ts`），journal（11 号 run-journal/`workflow_run_events`，总纲 §3）是持久事实源。因此所有"事件丢失"类问题统一由 **boot 对账**兜底：启动时扫描 `agent_tasks.status IN (running, verifying, escalated)` 且 `run_id` 指向终态 run 的任务，重放 `onRunTerminal` 等价逻辑（幂等）。

### 7.1 崩溃点逐条分析（F1-F7）

- **F1 · 崩溃在 createRootTask 落库后、Planner 返回前**：根任务卡在 `planning`。boot 对账发现 `planning` 超过 10min（本文新增启发阈值）→ 转 `failed: 'plan_interrupted'`，用户可重新发起（重试语义=新建根任务，不复活旧 planning，避免半棵计划树）。
- **F2 · 崩溃在 TaskPlanJSON 校验通过后、子任务批量落库中途**：子任务落库必须**单事务**（TypeORM `transaction`，双端一致）；事务外不留半成品。崩溃=整批回滚，根任务仍 `planning`，按 F1 处理。
- **F3 · 崩溃在 run 已终态、RunTerminalEvent 已发布但 onRunTerminal 未执行（事件丢失）**：事件是内存广播，进程死即丢。boot 对账按上文规则补驱动；`onRunTerminal` 内部以 CAS（`UPDATE agent_tasks SET status=? WHERE id=? AND status='running'`）保证幂等——事件路径与对账路径并发也只生效一次。SQLite 端写串行由既有 serial gate 保证（`sqlite-serial-gate.ts`），PG 端依赖行锁。
- **F4 · 崩溃在 dispatch 决策（ready→running CAS 成功）之后、startRun 返回之前**：任务已是 running 但 run_id 未写。对账时按 `workflow_runs.trigger_info` 内的 `taskId`（§5.5 透传，本文新增）反查在途 run 补写 run_id；查不到 → 任务转回 `ready` 重派（startRun 未生效，无副作用泄漏——startRun 第一步是查定义，见 `workflow-run.service.ts:76-93`，建行即 `runs.create`，若建行成功 trigger_info 必含 taskId）。
- **F5 · 取消级联中途崩溃**：子树一半 cancelled 一半活着。boot 对账增加规则：`status=cancelled` 的任务其非终态后代 → 续级联（级联函数本身幂等，重入安全）；running 后代的 run 由引擎自身 boot 恢复先落 interrupted（M1 journal 恢复后可能继续跑——此时 onRunTerminal 见任务已 cancelled，直接忽略终态结果，不写 result）。
- **F6 · 重规划期间旧子树仍有 running 任务**：replanSubtree 先走 §6.2 级联再等活 run 终态收口（取消是异步的，引擎取消不可取消节点靠 orphan 兜底，见 `node-handler.ts:12-13`）；新子树落库**不等待**旧 run 完全停止，但新子树预算按 T 的剩余预算重算，旧 run 的迟到消耗计入 usage（保守多计，防超支）。
- **F7 · 双跑同一任务**：事件路径 + boot 对账路径同时对同一 ready 任务 dispatch。防法：dispatch 前 CAS `ready→running`（F3 同机制），CAS 失败即放弃；sub_workflow 侧还有 `findMutexHolders` 兜底（重派=skipped→退避，无重复执行）。
- **边界：escalated 任务的 run 迟到终态**：onRunTerminal 见任务非 running 态 → 只补 usage/轨迹关联，不改状态。
- **边界：Planner 生成环依赖/引用不存在 key/越界 depth**：TaskPlanJSON 落库前确定性校验（拓扑排序可解、key 闭包、深度/扇出/总数上限），任一违例视为 Planner 失败（§6.1 planning 行）。

---

### 7.2 失败级联策略（影响矩阵）

子任务 T 终态对其父 P 与兄弟 S 的影响（默认策略，可按 `executor_config_json.verifierProfile` 覆盖，本文新增配置点）：

| T 的终态 | 对依赖 T 的兄弟 S | 对父 P | 备注 |
|---|---|---|---|
| succeeded | 依赖计数 -1，全达成则 S→ready | 子树质量分聚合刷新 | 正常路径 |
| failed（失败链耗尽） | S 永久阻塞保持 pending（不级联取消——人工决定） | P 保持 running/verifying 等人工；P 的 spec 验收无法达成时由人工 escalate P | **默认不自动传染**（失败链已含重试+重规划） |
| escalated | 同 failed 的阻塞语义 | P 可见升级徽标 | 人工裁决后按裁决结果重算 |
| cancelled（父级联） | 随 P 一起级联 | — | 级联是自顶向下的唯一取消源 |
| 预算耗尽 → escalated | 同 escalated | P 的预算余量重算 | §5.6 |

根任务失败 = 整树 failed；根的 `quality_score` 取各子树验收分加权（权重=budgetShare），供飞轮 episode 记录（总纲 §4.1 L2）。

---

## 8. 安全与权限

- **多租户**：`agent_tasks` 走 BaseRepository scoped（user_id 自动过滤/填充）；boot 对账为跨租户裸扫描，必须按 userId 分组 `runWithUserAsync` 后再处理（同 `workflow-run.repository.ts:8-10,235-241` 纪律）。
- **操作鉴权**：approvePlan / resolveEscalation / cancelTask 校验 operatorId 与任务 user_id 归属（Web 端必须经已注册且鉴权的 IPC/REST 暴露——横切约定，02 计划 §横切）；M4 接 E6 的操作者校验后升级为 assignee 语义。
- **Prompt 注入面**：Planner 输入拼接用户 goal 与 failureContext（含 agent 产出的 error/defects 文本）——failureContext 一律作为数据块包裹（分界标记 + 长度截断 4k，本文新增），不得拼进指令位；Planner 输出经 JSON Schema 严格校验后才落库（不信任 LLM 的任何字段，executor 白名单枚举校验）。
- **出网/凭据**：任务树本身不触网；其派生的 agent_loop/sub_workflow 沿用既有 SSRF 闸门与凭据注入纪律（总纲 §9），LLM 不可见明文凭据。

## 9. 与其他模块的契约

- **9.1 · 10 号事件系统（[10-event-system.md](./10-event-system.md)）**：本模块消费其 `RunTerminalEvent`（run 终态领域事件，payload 至少含 `{ runId, status, taskId?, parentRunId?, definitionId, error? }`；事件名与发布点以该文档为准，预期在引擎 `finalize` 与 `workflow-run.service` 兜底落库两处发布）。本模块向其登记**新增领域事件名**（本文新增，写入 `WORKFLOW_EVENT_NAMES` 同款常量目录，`workflow.types.ts:970-978`）：`agent:task-status-changed`、`agent:plan-approval-requested`、`agent:escalation-created`。用户强调事件管理是通用平台能力——本模块**不私有化事件通道**，只定义事件契约。
- **9.2 · AgentRuntime（总纲 §7）**：TaskService 传入的 `AgentTaskRecord` 即总纲伪代码的 `task: AgentTask`；`host.saveState/loadState` 由宿主提供，任务树侧额外要求 host 在每轮迭代回报 usage 增量（签名扩展 `host.reportUsage(delta: TaskUsage)`，本文新增）。收敛后 `AgentResult.verification` 不回任务树——验证由 TaskService 在 `verifying` 态统一调 Verifier（单一验证入口，避免双判）。
- **9.3 · 质量门（总纲 §6 / 17-quality-gate 文档）**：TaskService→`Verifier.verify(task, output)`；返回 `{ passed, score, defects[], layer }`。`defects` 喂回重试（Reflexion）与 `Planner.replan` 的 failureContext。
- **9.4 · 知识飞轮（总纲 §4）**：任务终态是蒸馏触发点（L2 episode 原料：goal + 轨迹摘要 + quality_score）；`memory_entries.source_task_id` 关联本表 id。
- **9.5 · 工作流引擎（E5/E6）**：E5 加列见 §4.2；E6 放开互斥前本模块按 §5.5 退避排队，**不绕过** `findMutexHolders`。
- **9.6 · human-review/挂起恢复（E1-E3）**：计划批准与 escalated 裁决在工作流宿主下复用 waiting_review + resume 回调（总纲 §3.2）；非工作流宿主（聊天）由各自 AgentHost 实现等价挂起。

## 10. 测试策略

- **状态机单测**：§6.1 迁移表全枚举驱动（合法迁移断言 + 非法迁移拒绝），纯内存 fake repository。
- **Planner 输出校验单测**：环依赖/悬空 key/超深/超扇出/超总数/缺 acceptance 各一例拒绝用例；`budgetShare` 求和 >1 的兜底均分。
- **取消级联集成测**：3 层树（含 running sub_workflow、ready、escalated 混合）级联后全树终态断言；中途崩溃（在级联第 2 步后重启进程）→ boot 对账续级联（F5 复现）。
- **事件丢失对账测**：kill 在 run finalize 后、事件消费前（F3/F4 两个 kill 点），重启后任务被正确推进且无双跑（CAS 断言 dispatch 只生效一次）。
- **双端迁移测**：SQLite 内存库 + PG 容器各跑 `create-agent-tasks` / `add-workflow-run-task-link` 两次（幂等），schema-drift 检查通过。
- **端到端（M3 验收，02 计划）**：3 层分解任务人工批准后全链路过质量门；必败子任务走完 重试→重规划→escalated。

## 11. 里程碑拆解

| 期 | 本模块内容 |
|---|---|
| M1 | 无直接交付；消费 E1 journal / E2 state / E3 resume（escalated 跨重启人工裁决依赖之）。`WORKFLOW_EVENT_NAMES` 新事件名常量可随 10 号事件系统提前落 |
| M2 | 依赖 M2 的 token 成本观测（sub_workflow 任务 usage 汇总数据源） |
| M3 | **全量**：§4 两处迁移、TaskService/Planner/TaskScheduler、静态规划 + 整树人工批准、动态重规划、预算体系、§5.7 树视图数据 API + UI、失败级联矩阵默认策略 |
| M4 | E6 放开互斥后移除 §5.5 退避排队；escalated 接入待办中心；ep/longwriting 迁移时以其编排需求校准 Planner 约束默认值 |

## 12. 开放问题

1. **重规划的人工批准粒度**：02 计划开放问题 3 建议 M3 整树一次批准；本文 §6.4-4 暂定为"变更摘要轻量批准"，是否在 M3 就允许配置为全自动（低风险类目），待产品决策。
2. **跨进程/多实例部署**：事件总线进程内、boot 对账单实例假设。Web 端若多副本部署，就绪驱动与对账需要 leader 选举或 DB 锁——本期不做，写入 10 号事件系统开放问题。
3. **agent_loop 任务的 run_id 口径**：harness 直驱时是否也建行到 `workflow_runs`（统一运行森林视图）还是只记 `agent_trajectories` 会话 id——倾向后者（引擎表不被 harness 污染），待 11 号/12 号文档对齐。
4. **预算耗尽时的在飞 token**：usage 是事后结算，耗尽判定有滞后；是否需要 guardrails 在 LLM 调用前做预估拦截（与 S6 的 provider 层配额联动），待 17-quality-gate/guardrails 文档对齐。

---

*一致性自查：表名 `agent_tasks`、列名（parent_id/root_id/depth/spec_json/status/executor/run_id/budget_json/quality_score/result_json/retry_count）、扩展点编号 E1-E6、短板编号 S5/S6、分期 M1-M4 均与 01-design-spec.md / 02-implementation-plan.md 一致；新增字段与机制均已标注"（本文新增）"。*
