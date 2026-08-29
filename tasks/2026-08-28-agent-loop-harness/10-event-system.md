# 10 · 通用事件系统（Platform Event System）

> Agent Loop Harness ｜ 2026-08-28 ｜ 状态：设计中 ｜ 配套：[01-design-spec.md](./01-design-spec.md)、[02-implementation-plan.md](./02-implementation-plan.md)
> 定位：**平台级公共底座**，不属于工作流引擎私有。journal、任务树调度、记忆代谢、通知/待办等后续模块全部构建在本系统之上。

## 1. 目标与范围

**目标**：为 PC（Electron+SQLite）与 Web（PostgreSQL）双端提供统一的事件发布/订阅/存储/重放能力，替代目前散落的四套私有机制（见 §2），让任何模块都能以同一契约发事件、订事件、查历史、做恢复。

**范围内**：

- 统一事件信封（envelope）与命名规范；
- 持久化事件存储（双端各一份 DDL）；
- 四种投递通道抽象：进程内总线、持久化订阅（游标）、主进程→渲染进程 IPC、Web 端 SSE/WebSocket；预留 LAN 跨进程通道；
- 发布订阅 API（通配符、聚合过滤）、重放 API、死信队列、背压限流、保留与归档、安全隔离；
- 与现有引擎事件机制的迁移关系：引擎降级为本平台的一个 producer。

**非目标**：

- 不做跨设备事件同步协议本身（LAN 传输属 `tasks/2026-08-27-lan-collab/01-identity-discovery.md`，本文只预留接口）；
- 不替代工作流 journal（`workflow_run_events`，01 §3）——journal 是引擎恢复的事实源，本系统是跨模块通信与观测的通用设施，二者关系见 §9；
- 不做消息队列级吞吐优化（事件量级：人机交互场景，千条/日级）。

## 2. 现状与差距（代码证据）

现存四套互不相通的事件机制：

1. **进程内领域事件总线** `src/core/modules/workflow/trigger/domain-event-bus.ts`：`DomainEvent { name, userId, payload, occurredAt }`（:15-20），`globalThis` 单例（:51-52），`publishDomainEvent` 用 try/catch 包裹不影响主流程（:55-61）。**纯内存、无持久化、无重放、无投递保证**——进程崩溃后事件蒸发，事件触发器可能漏触发。
2. **触发器消费与限流** `src/core/modules/workflow/trigger/workflow-trigger-scheduler.service.ts`：`subscribeDomainEvents` 订阅全量事件后按内存索引匹配（:99、:223-249）；滑动窗口限流 `EVENT_TRIGGER_MAX_PER_MINUTE = 20`（:39、:252-263），内存实现，重启清零。
3. **引擎→前端单通道推送**：引擎产生 `WorkflowRunEvent` 判别联合（`src/shared/types/workflow.types.ts:735-778`，五种 type），经 `makeEngineDeps` 的 `events.emit` 走 `getEventEmitter().emit('wf:run-event', ...)`（`workflow-run.service.ts:455-462`，通道常量 `workflow.types.ts:967`）。Electron 端 `ElectronBroadcastEventEmitter.emit` 广播所有窗口（`electron-event-emitter.ts:38-51`）；Web 端 `WebSocketEventEmitter.emit` 按 ALS userId 路由（`web-event-emitter.ts:80-105`）。
4. **Web SSE 通道** `src/web/server/api/workflow-api-router.ts`：`streamRunEvents`（:121-191）——快照先行、tap 订阅（`web-event-emitter.ts:71` 的 `tapEvents`）、订阅后复查防竞态（:183-190）、25s 心跳（:178）、终态关流；免登录分享端点做 token↔run 配对校验（:360-368）。载荷复用 `wf:run-event`。

差距对照本设计要求：

| 要求 | 现状 | 差距 |
|------|------|------|
| 统一信封 | 四套各异（DomainEvent / WorkflowRunEvent / SSE snapshot） | 无 id、causation、schema_version |
| 持久化存储 | 无 | 崩溃即丢，无法重放/审计 |
| at-least-once | 至多一次（emit 即发即忘） | 触发器、任务树调度会漏事件 |
| 通配符订阅 | 事件触发器仅精确名匹配（scheduler :224） | 无 |
| 死信/重试 | 无（emit 失败仅 warn，`workflow-run.service.ts:460`） | 无 |
| 租户隔离 | Web 端靠 emit 时刻 ALS userId 路由（web-event-emitter :80-92），Electron 广播不过滤 | 事件自身不带租户字段，路由依赖调用上下文 |
| 通用性 | 总线命名 Workflow*、住在 workflow 模块内 | 其他模块（记忆代谢、通知）无法复用 |

另有一个现成的"第二消费者"证据：`app-session.service.ts:283` 经 `tapEvents` 桥接 `wf:run-event` 写会话卡片——说明跨模块订阅需求已实际存在，当前只能挂在 IPC 推送通道上，属错位用法。

## 3. 概念模型

```
 Producer（引擎 / kb / AgentRuntime / 任务树 / 任意模块）
    │  publish(input)            ┌── 事务内写 platform_events（分配全局 seq）
    ▼                            │
 EventBus（core 服务，双端同源）──┤── 提交后进程内分发（匹配订阅 → 各通道）
    │                            └── 后台 dispatcher 扫表补偿（崩溃恢复）
    ▼
 Channel（投递通道抽象）
    ├─ inproc   本进程订阅者（持久消费者带游标 → at-least-once）
    ├─ ipc      Electron 主→渲染（复用 IEventEmitter）
    ├─ ws/sse   Web 端 WS 推送 + REST SSE 流（复用 web-event-emitter / streamRunEvents）
    └─ lan      【预留】跨进程/跨设备（ingest API + id 去重）
```

核心概念：

- **Event（事件）**：不可变事实记录，信封见 §4/§5。以全局 `seq` 排序（发生顺序的唯一权威；`occurred_at` 仅供展示，多实例时钟不可信）。
- **Aggregate（聚合）**：事件的归属实体 `{kind, id}`，如 `{kind:'workflow_run', id:runId}`、`{kind:'agent_task', id:taskId}`。**同一聚合的事件有序**（由全局 seq 蕴含），订阅者可按聚合过滤。
- **Subscription（订阅）**：类型模式（支持 `*` 后缀通配，如 `workflow.run.*`、`kb:*`、`'*'`）+ 聚合过滤 + 租户作用域。
- **Consumer（持久消费者）**：有名字的订阅（如 `task-scheduler`、`memory-metabolism`），在 `platform_event_cursors` 持有游标，ack=游标前移，实现 at-least-once；匿名订阅为至多一次（UI 推送类）。
- **Channel（通道）**：投递路径插件，见 §5.4。

## 4. 数据模型

三张新表（均为本文新增，与 01 §3 的 `workflow_run_events` 不冲突、不合并）。迁移按项目惯例写成单个幂等迁移文件（参照 `src/core/database/migrations/create-workflow-tables.ts:22-32` 的 `ensureTable/ensureIndex` 模式），SQLite/PG 双 DDL 由 `isPg` 开关切换（`:36-185`）；接入点为 Electron `runMultiTenantMigrations()` 与 Web `initDatabase()`（文件头注释 :11-13）。

### 4.1 `platform_events`（事件存储）

SQLite：

```sql
CREATE TABLE platform_events (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,  -- 全局单调递增，排序权威
  id              TEXT NOT NULL UNIQUE,               -- uuid；LAN ingest 去重键
  user_id         TEXT,                               -- 租户作用域（发布时 ALS 快照）
  type            TEXT NOT NULL,                      -- 'workflow.run.*' / 'kb:*' 等
  aggregate_kind  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  actor_kind      TEXT NOT NULL,                      -- user / system / agent / workflow
  actor_id        TEXT,
  payload_json    TEXT,                               -- ≤64KB，禁带密钥（§8）
  causation_id    TEXT,                               -- 引发本事件的事件/命令 id
  correlation_id  TEXT,                               -- 贯穿一条业务链路的 id
  occurred_at     DATETIME NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL                   -- 落库时间（恢复/排查用）
);
CREATE INDEX idx_pe_type       ON platform_events (type, seq);
CREATE INDEX idx_pe_aggregate  ON platform_events (aggregate_kind, aggregate_id, seq);
CREATE INDEX idx_pe_user_seq   ON platform_events (user_id, seq);
CREATE INDEX idx_pe_occurred   ON platform_events (occurred_at);
```

PostgreSQL 差异（仅列类型与占位符，结构/索引同名）：

- `seq BIGSERIAL PRIMARY KEY`（SQLite 的 `AUTOINCREMENT` 行写法去掉，靠 BIGSERIAL 自增）；
- `TEXT` → `varchar`（无长度）或 `text`：`id/user_id/type/aggregate_kind/aggregate_id/actor_kind/actor_id/causation_id/correlation_id` 用 `varchar`，`payload_json` 用 `text`；
- `DATETIME` → `timestamp`；
- 原生 SQL 处占位符用 `$1,$2,...` 而非 `?`（历史教训，见 02 §横切）；迁移内 `checkTableExists` 分别查 `information_schema.tables` / `sqlite_master`（参照 create-workflow-tables.ts:234-251）。

> 设计决策（本文新增）：**不用 PG jsonb**，payload 两端统一 text+JSON 序列化——与现有工作流表（`payload_json`/`triggers` 等 text 列）一致，避免双端查询语法分叉。查询过滤只走索引列，不走 payload 内字段。

### 4.2 `platform_event_cursors`（持久消费者游标）

```sql
-- SQLite；PG 差异同 4.1（varchar/timestamp，占位符 $1）
CREATE TABLE platform_event_cursors (
  id            TEXT PRIMARY KEY,              -- uuid
  consumer_name TEXT NOT NULL,                 -- 'task-scheduler' 等
  user_scope    TEXT NOT NULL DEFAULT '*',     -- 消费者租户作用域；'*'=系统级跨租户
  last_seq      INTEGER NOT NULL DEFAULT 0,    -- 已成功处理的最大 seq（ack）
  retrying_seq  INTEGER,                       -- 正在重试的事件 seq（< last_seq 不可能）
  retry_count   INTEGER NOT NULL DEFAULT 0,
  next_retry_at DATETIME,                      -- 退避后的下次重试时刻
  last_error    TEXT,
  updated_at    DATETIME NOT NULL
);
CREATE UNIQUE INDEX uq_pec_consumer ON platform_event_cursors (consumer_name, user_scope);
```

> `user_scope` 用 `'*'` 而非 NULL 表达系统级，规避 SQLite 复合唯一键对 NULL 的宽松语义与 PG 主键 NOT NULL 约束差异（本文新增）。

### 4.3 `platform_event_dead_letters`（死信队列）

```sql
-- SQLite；PG 差异同 4.1
CREATE TABLE platform_event_dead_letters (
  id              TEXT PRIMARY KEY,
  consumer_name   TEXT NOT NULL,
  user_scope      TEXT NOT NULL,
  event_seq       INTEGER NOT NULL,            -- 指向 platform_events.seq
  event_json      TEXT NOT NULL,               -- 事件快照（事件被归档清理后仍可排查）
  error           TEXT,
  attempts        INTEGER NOT NULL,
  first_failed_at DATETIME NOT NULL,
  last_failed_at  DATETIME NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending / requeued / discarded
  created_at      DATETIME NOT NULL
);
CREATE INDEX idx_pedl_consumer ON platform_event_dead_letters (consumer_name, status);
```

### 4.4 多租户行级隔离

三表均带 `user_id`/`user_scope` 语义；repository 继承 `BaseRepository` 走 `scoped`（`src/core/database/base-repository.ts:5-14` 的 ALS 行级隔离机制）。例外：dispatcher 扫表补偿需跨租户推进游标，用裸 `repo` 并在代码注释中显式确认安全性（基类 :10 的既定例外流程）。

## 5. 接口设计

全部接口为本文新增，落在 `src/core/services/event-system/`（不放进 workflow 模块）。类型定义放 `src/shared/types/event.types.ts`（双端契约，参照 workflow.types.ts 的地位）。

### 5.1 信封与发布

```ts
/** 统一事件信封（platform_events 行的内存形态） */
export interface PlatformEvent<P = unknown> {
  seq: number                       // 存储分配，发布前不可知
  id: string                        // uuid
  userId: string | null             // 发布时 ALS userId 快照（getCurrentUserId）
  type: string                      // 命名规范见下
  aggregate: { kind: string; id: string }
  actor: { kind: 'user' | 'system' | 'agent' | 'workflow'; id: string | null }
  payload: P
  causationId: string | null
  correlationId: string | null
  occurredAt: number                // epoch ms（展示用；排序以 seq 为准）
  schemaVersion: number
}

export interface PublishInput<P = unknown> {
  type: string
  aggregate: { kind: string; id: string }
  actor?: PlatformEvent['actor']    // 缺省 { kind:'system', id:null }
  payload: P
  causationId?: string
  correlationId?: string
  schemaVersion?: number            // 缺省 1
}

export interface EventBus {
  /** 写库（同事务可选）→ 提交后进程内分发。绝不抛给业务主流程（safePublish 语义）。 */
  publish<P>(input: PublishInput<P>, opts?: { tx?: QueryRunnerLike }): Promise<PlatformEvent<P> | null>
  subscribe(filter: SubscriptionFilter, handler: EventHandler, opts?: SubscribeOptions): Subscription
  replay(query: ReplayQuery): AsyncIterable<PlatformEvent>
  /** LAN 预留：远端事件入库（保留原 id 去重，分配本地 seq） */
  ingest<P>(event: Omit<PlatformEvent<P>, 'seq'>): Promise<'stored' | 'duplicate'>
}
```

类型命名规范（本文新增，与 15/16/17 号文档对齐后定稿）：**领域事件沿用冒号式命名空间**——`agent:*`、`workflow:*`、`kb:*`（与存量 `kb:document-completed`、`wf:run-event` 惯例一致，常量目录 `WORKFLOW_EVENT_NAMES`，`workflow.types.ts:970-978`）；**点分层语法 `domain.entity.action` 仅用于引擎 run 生命周期事件**（`workflow.run.*` 族）。两种语法并存为正式约定，不做统一迁移；通配符统一按段匹配（`agent:*` 匹配全部 agent 领域事件，`workflow.run.*` 匹配 run 生命周期族）。

已登记的 agent 领域事件（冒号式；实现时常量入 `WORKFLOW_EVENT_NAMES`）：

| 事件名 | 发布方 | payload 摘要 | 定义文档 |
|--------|--------|--------------|----------|
| `agent:task-terminal` | AgentRuntime / 引擎 run 终态投影 | `{ runId, taskId, outcome, qualityScore }` | [15-memory-flywheel](./15-memory-flywheel.md) |
| `agent:verification-completed` | 质量门 Verifier 验收终态 | `{ runId, taskId, passed, qualityScore }` | [15-memory-flywheel](./15-memory-flywheel.md)（消费协议）/ [17-quality-gate](./17-quality-gate.md)（发布方） |
| `agent:task-status-changed` | TaskService 任务状态迁移 | `{ taskId, fromStatus, toStatus, reason?, operator? }`；UI 刷新/待办中心用 | [16-task-tree](./16-task-tree.md) |
| `agent:plan-approval-requested` | Planner/TaskService 整树计划送审 | 根任务 id + 计划摘要（详见 16 §6.3） | [16-task-tree](./16-task-tree.md) |
| `agent:escalation-created` | TaskService 升级人工 | 任务 id + 升级原因（详见 16） | [16-task-tree](./16-task-tree.md) |

引擎 run 生命周期事件用点分层 `workflow.run.*` 族（`run-status`/`review-requested`/`review-decided` 等，映射见 §9）。journal 事件类型（`run_started` 等下划线名，含质量门的 `verify_completed`/`task_escalated`）是引擎私有日志、不进本平台，其枚举归 [11-run-journal](./11-run-journal.md) §4.3。

### 5.2 订阅与游标

```ts
export interface SubscriptionFilter {
  types: string[]                              // 精确名或 '前缀*'；'*' 全量
  aggregate?: { kind?: string; id?: string }   // 缺省不过滤
}

export interface SubscribeOptions {
  /** 命名即持久消费者（建/续游标，at-least-once）；匿名=至多一次（UI 推送） */
  consumerName?: string
  /** 持久消费者缓冲上限，满则转入"拉模式"（§7 背压）。默认 1000 */
  maxInFlight?: number
}

export type EventHandler = (event: PlatformEvent) => Promise<void> | void

export interface Subscription {
  readonly id: string
  unsubscribe(): Promise<void>
}

export interface ReplayQuery {
  types?: string[]
  aggregate?: { kind?: string; id?: string }
  since?: number; until?: number   // occurred_at 时间窗（ms）
  afterSeq?: number                // 断点续放
  limit?: number                   // 缺省 1000，硬上限 10000
}
```

匹配规则（与现有触发器等值过滤正交）：`types` 元素以 `*` 结尾按前缀匹配，否则全等；`'*'` 匹配一切。聚合过滤两个字段都给定时为 AND。

### 5.3 死信与运维 API

```ts
export interface EventAdmin {
  listDeadLetters(filter: { consumerName?: string; status?: 'pending' | 'requeued' | 'discarded' }): Promise<DeadLetter[]>
  /** 重新投递：事件仍在库 → 把该消费者游标回拨到 event_seq-1；已归档 → 直接重放入库（新 seq） */
  requeue(deadLetterId: string): Promise<void>
  discard(deadLetterId: string): Promise<void>
  consumerStats(): Promise<Array<{ consumerName: string; lastSeq: number; lag: number; retrying: boolean }>>
}
```

### 5.4 通道抽象

```ts
export type ChannelKind = 'inproc' | 'ipc' | 'ws' | 'sse' | 'lan'

export interface EventChannel {
  readonly kind: ChannelKind
  /** bus 启动时挂接；通道内部自行决定订阅哪些事件（如 ipc 通道只桥 workflow.run.*） */
  start(bus: EventBus): void
  stop(): void
}
```

四个内置通道：

- **inproc**：dispatcher 主循环，驱动全部 `subscribe()` 注册者；
- **ipc**（Electron）：订阅约定类型集（默认 `workflow.run.*` + 显示声明的通道映射），翻译为既有 IPC 通道（`wf:run-event` 等）后调 `IEventEmitter.emit`——**前端零改动**（§10 迁移）；
- **ws**（Web）：同 ipc 角色，走 `WebSocketEventEmitter`（ALS userId 路由逻辑下沉到按事件自带 `userId` 路由，不再依赖 emit 时刻上下文）；
- **sse**（Web）：`streamRunEvents` 改造为消费 `aggregate={kind:'workflow_run',id:runId}` 的 replay+订阅混合流，快照先行/心跳/终态关流语义原样保留；
- **lan**（预留）：仅定义 `EventBus.ingest` 去重契约，传输实现属 lan-collab 01。

### 5.5 投递语义（约定，写入 handler 契约注释）

- **at-least-once** 仅对命名持久消费者生效；ack = handler 成功后游标前移（`last_seq` 单调不退）。
- **消费者幂等约定**：handler 必须以 `(event.aggregate.kind, event.aggregate.id, event.id)` 或业务幂等键去重；重放只重建状态、不重放副作用（与 01 §3.4 同原则）。
- **每聚合有序**：同一 aggregate 的事件按 seq 升序投递；dispatcher 对同一消费者串行派发（并发收益小、保序成本高，量级允许）。

## 6. 状态机与关键时序

### 6.1 事件生命周期

```
[published] 写库成功（seq 分配）
   ├─→ inproc 分发命中订阅 → [delivering] → handler 成功 → [acked]（游标前移）
   │                                       → handler 失败 → [retrying]（retry_count++，next_retry_at=退避）
   │                                                          → 成功 → [acked]
   │                                                          → 达上限(5 次) → [dead]（写 DLQ，游标跳过该 seq 前移）
   └─→ 保留期届满 → [archived]（导出 JSONL.gz 后删行）
```

游标状态字段迁移（`platform_event_cursors`）：空闲 `(retrying_seq=NULL)` → 失败 `(retrying_seq=seq, retry_count=1, next_retry_at=now+backoff)` → 重试中循环 `retry_count++` → 恢复 `(retrying_seq=NULL, retry_count=0, last_seq=seq)` 或死信 `(retrying_seq=NULL, last_seq=seq, DLQ 增行)`。退避序列（本文新增）：1s → 2s → 4s → 8s → 16s，上限 5 次进死信。

### 6.2 发布时序

```
Producer            EventBus              DB                Dispatcher
   │ publish(input)    │                   │                    │
   │──────────────────→│ INSERT(seq 分配)  │                    │
   │                   │──────────────────→│                    │
   │                   │ ok                │                    │
   │                   │←──────────────────│                    │
   │ 返回 event        │ notify(commit)    │                    │
   │←──────────────────│───────────────────────────────────────→│
   │                   │                   │                    │ 匹配订阅 → 各 handler（串行/聚合有序）
   │                   │                   │                    │ 成功 → UPDATE cursor.last_seq
```

### 6.3 崩溃恢复时序（dispatcher 扫表补偿）

```
boot → EventBus.start()
  → 对每个活跃游标：SELECT * FROM platform_events
      WHERE seq > cursor.last_seq ORDER BY seq LIMIT 200
  → 逐条投递（与正常路径同一 handler）→ 游标前移
  → 追平后转入实时分发；此后每 2s 兜底扫描一次（防分发窗口崩溃漏投）
```

### 6.4 引擎挂起挂接（agent 人工请求）

```
AgentRuntime: decision=human_request
  → host.suspend → 引擎 node_suspended（journal 写 workflow_run_events，E1）
  → 引擎 publish({type:'workflow.run.review-requested', aggregate:{workflow_run,runId}, causationId:<journal event id>})
  → ipc/ws 通道推前端；通知模块（M4）以 consumerName='notify' 持久订阅，崩溃后补投不丢待办
  → 人工决策 → reviewDecide → publish('workflow.run.review-decided', causationId=上一条 id)
  → 引擎 resume 回调（E3）→ AgentRuntime 继续循环
```

## 7. 失败模式与边界情况

逐条按"崩溃点"分析：

1. **崩溃在 INSERT 之后、notify 之前**：事件在库未分发 → boot 扫表补偿重投（§6.3）。结论：不丢，可能延迟一个启动周期。
2. **崩溃在 handler 成功后、游标 UPDATE 前**：重投同一事件 → 消费者幂等约定兜底（§5.5）；这就是 at-least-once 的代价，不可消除，只能约定。
3. **崩溃在业务动作与 publish 之间**（如 startRun 已建 run 但事件未发）：事件丢失。缓解：能同事务的用 `publish(input, {tx})`；不能的接受丢失并文档化——工作流 run 状态的事实源是 journal（E1），平台事件不承担恢复职责。
4. **handler 永久抛错**：retrying 状态按退避重试 5 次 → DLQ，**游标跳过该 seq 前移**（毒消息不阻塞后续事件）；人工 requeue/discard 收口。
5. **订阅者回调异常传染**：每个 handler 独立 try/catch（沿袭 domain-event-bus 与 tapEvents 的既有做法），单订阅者异常不影响其他订阅者。
6. **seq 空洞**（事务回滚/DELETE 归档）：消费者不得假设 seq 连续；游标语义是"≤ last_seq 均已处理"，重放按 `>` 比较，空洞无害。
7. **慢消费者/背压**：持久消费者 in-flight 队列达 `maxInFlight` → 自动切拉模式：实时分发跳过该消费者，靠 2s 兜底扫描按游标追赶；队列水位回落后切回推模式。匿名订阅者（UI）队列满直接丢弃并记 warn（至多一次语义允许）。
8. **限流**：生产者侧继承现有滑动窗口（`EVENT_TRIGGER_MAX_PER_MINUTE=20`，scheduler :39）并泛化为"每 (type, aggregate) 每分钟 N 次"可配阈值，超限事件记 `system.event.rate-limited` 后丢弃；事件触发器的自环/乒乓防护语义不变。
9. **跨时钟比较**：禁用 `occurred_at` 做顺序判断；回放时间窗查询允许边界重叠（闭区间），调用方按 id 去重。
10. **归档与游标竞态**：归档任务只清理 `seq < min(所有游标.last_seq)` 且超保留期的事件，保证未消费事件不被清掉；事件已归档但 DLQ 重放 → 走"直接重放入库"分支（§5.3）。
11. **双实例并发（Web 多端部署未来场景）**：本文单实例假设与现有调度器一致（scheduler :37 注释同款立场）；游标 UPDATE 用 `WHERE last_seq < :newSeq` 乐观条件防多实例回拨，多实例正式支持属 LAN/集群阶段。

## 8. 安全与权限

- **租户作用域**：事件落库即固化 `userId`（发布时 ALS 快照，机制同 domain-event-bus :36-38）。订阅默认只见自己 `userId` 的事件；`user_scope='*'` 的系统级消费者（如记忆代谢）需在代码评审中显式登记。repository 层走 `BaseRepository.scoped` 自动过滤（§4.4）。
- **payload 禁带密钥**：publish 入口做键名扫描，命中 `/pass(word)?|secret|token|api[_-]?key|credential|private[_-]?key/i` 的顶层键**拒绝发布**（fail-fast 报错给生产者，不静默脱敏——静默会产生"看似发布成功"的幻觉）；深层嵌套键只做 warn 扫描。LLM 可见凭据的既有红线（01 §9"LLM 永远看不到明文凭据"）在事件层延续：工具执行结果入事件前由 tool-gateway 负责剔除凭据占位符。
- **payload 大小**：默认上限 64KB，超限拒绝并提示改用引用形态 `{ ref: { kind, id } }`（本文新增），与引擎输出截断策略（`WORKFLOW_DEFAULTS` output 截断）对齐思路。
- **SSE/分享面**：免登录分享端点维持 token↔run 配对校验与快照脱敏（workflow-api-router :360-368），平台化后仅暴露 `aggregate.kind='workflow_run'` 且 runId 匹配的 `workflow.run.*` 类型。
- **管理面**：`EventAdmin`（DLQ 操作、重放导出）仅注册到鉴权 IPC/REST，Web 端必须过 `requireAuth`（历史教训：Web 端 IPC 漏注册，见 02 §横切）。

## 9. 与其他模块的契约

| 模块 | 契约 | 说明 |
|------|------|------|
| 工作流引擎（01 §3，E1） | 引擎 journal `workflow_run_events` 是恢复事实源，**不动**；引擎在 journal 追加后派生平台事件（producer 适配器），`causation_id` 回填 journal 事件 id | 两套写同一事务可选；journal 成功而平台事件失败不影响恢复 |
| 事件触发器（scheduler） | `WorkflowTriggerScheduler.handleDomainEvent` 改为订阅 `subscribe({types:[...]}, ...)`，等值 match 过滤逻辑不变；`publishDomainEvent` 保留签名改为适配器（内部转 `bus.publish`），存量埋点零改动 | 类型名沿用冒号风格存量名 |
| 前端推送（wf:run-event） | ipc/ws 通道把 `workflow.run.*` 翻译回 `WorkflowRunEvent` 五型载荷走原通道（workflow.types.ts:735-778）；`WORKFLOW_RUN_EVENT_CHANNEL` 常量与 preload 订阅（`preload/index.ts:730`）不变，**前端零改动** | 事件类型映射表（本文新增）：`run-status→workflow.run.run-status` 等 |
| journal 详设（[11-run-journal.md](./11-run-journal.md)） | 消费本系统 `workflow.run.*` 做观测；恢复路径只读 journal，不依赖平台事件 | 职责切分见 §1 非目标 |
| 任务树调度（01 §5，M3） | `TaskService` 以 `consumerName='task-scheduler'` 持久订阅子 run 终态事件——替代"引擎事件总线驱动"的口头约定，崩溃补投由游标保证 | at-least-once + 任务状态机幂等 |
| 记忆代谢（01 §4，M3） | cron 作业 + 持久订阅 `workflow.run.finished`/`agent.task.*`；蒸馏触发即事件驱动 | 闸门人工批准事件进通知 |
| 通知/待办（lan-collab 05，M4） | 现有 tapEvents 桥（`app-session.service.ts:283`、lan-collab 05 §2.1）迁移为命名消费者；`lan` 通道 + `ingest` 为其跨设备预留 | 05 §2.4 的可靠性约定（inbox 以 DB 为准）与本系统 DLQ 互补 |

## 10. 测试策略

- **迁移单测**：SQLite 内存库 + PG（`npm run test:unit:pg`）各跑一遍建表/索引幂等（连跑两次无报错），schema-drift 检查过（entity 列族与 DDL 对齐，参照 create-workflow-tables.ts 头注释 :8-9）。
- **信封/匹配单测**：通配符匹配矩阵（`kb:*` vs `kb:document-completed`、`a.b.*` vs `a.b` 自身、`'*'`）；聚合过滤 AND 语义；密钥键名拒绝用例。
- **投递语义单测（fake timer + 内存 SQLite）**：handler 成功→游标前移；handler 失败→退避序列 1/2/4/8/16s 逐次触发；5 次后进 DLQ 且游标跳过；requeue 后重新投递。
- **崩溃恢复测试**：写事件后不分发直接重建 EventBus 实例 → boot 补偿投递到位；handler 成功后不更新游标 → 重启重投、消费者幂等键去重生效。
- **背压测试**：阻塞 handler + 100 条事件 → 切拉模式、兜底扫描追平、无丢失无乱序（按聚合断言 seq 单调）。
- **兼容测试**：存量 `publishDomainEvent` 埋点→触发器链路（scheduler 现有测试套件）全绿；`wf:run-event` 前端载荷快照比对（字段级相等）。
- **双端**：每个测试 SQLite/PG 各跑（项目既有 `pg:up/pg:down` 脚本），重点验证 `?` vs `$1` 占位符与 `BIGSERIAL` 行为。

## 11. 里程碑拆解（对齐 02 M1-M4）

- **M1（地基）**：三表迁移（双端）；信封与 `EventBus.publish/subscribe`；inproc 通道 + dispatcher 扫表补偿；ipc/ws 通道（翻译回 `wf:run-event`，前端零改动）；引擎 producer 适配器（journal 派生平台事件）；`publishDomainEvent` 适配器化。验收：杀进程重启后触发器订阅者不丢事件；现有工作流 UI 实时性无回归。
- **M2（工具生态与观测）**：`replay` API + `EventAdmin.consumerStats`；SSE 通道平台化改造（streamRunEvents 内部切换，端点契约不变）；轨迹视图的数据源（agent 迭代事件）经本平台投递。
- **M3（长程能力）**：持久消费者全面启用——`task-scheduler`（任务树解锁）、记忆蒸馏触发；DLQ + 退避重试上线（M1 可先只做一次性失败记日志）；背压拉模式。
- **M4（业务化收口）**：保留策略与归档作业（cron）；通知/待办迁移为命名消费者；`lan` 通道与 `ingest` 随 lan-collab 立项激活；限流阈值运营化配置。

## 12. 开放问题

1. **与 journal 的事务边界**：引擎 journal 追加与平台事件 publish 是否强制同事务？倾向：不强制（journal 是恢复事实源，事件丢失可接受，§7.3），但 `workflow.run.review-*` 两类（人工链路）建议同事务。待 M1 实施时按性能实测定。
2. **保留策略默认值**：沿用 02 开放问题 #1 的建议——人工/挂起类 run 的事件全量保留，普通自动化 run 终态 30 天后归档为 JSONL.gz（落 `exports/` 还是 `data/` 待决）；通用默认 90 天。是否需要按租户配置？
3. **通配符语法分叉**：存量冒号名（`kb:*`）与点分层名（`workflow.run.*`）长期并存还是统一迁移？**已定**（与 15/16/17 号文档对齐后定稿）：并存为正式约定——领域事件冒号式（`agent:*`/`workflow:*`/`kb:*`）、引擎 run 生命周期点分层（`workflow.run.*`），见 §5.1；存量触发器定义的 `eventName` 不做数据迁移。
4. **LAN ingest 的 seq 语义**：远端事件按本地 seq 插入会打乱"聚合内全局有序"（跨设备同聚合并发写）。V1 可接受（LAN 协作以人为节奏），严格有序需向量时钟，留待 lan-collab 立项评估。
5. **系统级消费者清单治理**：`user_scope='*'` 的消费者是跨租户特权面，是否需要在 settings 表维护白名单并在 boot 时校验？倾向 M4 随权限体系一并处理。

---

*术语与契约一致性自查：`workflow_run_events`/`agent_tasks`/`memory_entries` 表名、E1-E6 扩展点、S1-S8 短板编号、M1-M4 分期均与 [01-design-spec.md](./01-design-spec.md) / [02-implementation-plan.md](./02-implementation-plan.md) 对齐；本文新增对象均已就地标注。*
