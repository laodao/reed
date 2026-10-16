# 10 · 通用事件系统（Platform Event System）

> Agent Loop Harness ｜ 2026-08-28 ｜ 状态：M1 核心已实施（实施记录见文末） ｜ 配套：[01-design-spec.md](./01-design-spec.md)、[02-implementation-plan.md](./02-implementation-plan.md)
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
2. **保留策略默认值**：**已定（M4 落地，见 §16）**——通用默认 90 天；人工/挂起类（`workflow.run.review-*`）全量保留（`DEFAULT_KEEP_FOREVER_PATTERNS`）；归档目录 Electron=`<数据根>/event-archives`、Web=`<rootDataPath>/event-archives`（系统级跨租户归档不能落 Web 按用户隔离目录）。暂不按租户配置：阈值为代码常量 + 构造注入（`EventArchiveOptions`/`EventBusDriverOptions.rateLimits`），运营化配置（settings 表）留待后续有实际需求再做。
3. **通配符语法分叉**：存量冒号名（`kb:*`）与点分层名（`workflow.run.*`）长期并存还是统一迁移？**已定**（与 15/16/17 号文档对齐后定稿）：并存为正式约定——领域事件冒号式（`agent:*`/`workflow:*`/`kb:*`）、引擎 run 生命周期点分层（`workflow.run.*`），见 §5.1；存量触发器定义的 `eventName` 不做数据迁移。
4. **LAN ingest 的 seq 语义**：远端事件按本地 seq 插入会打乱"聚合内全局有序"（跨设备同聚合并发写）。V1 可接受（LAN 协作以人为节奏），严格有序需向量时钟，留待 lan-collab 立项评估。
5. **系统级消费者清单治理**：`user_scope='*'` 的消费者是跨租户特权面，是否需要在 settings 表维护白名单并在 boot 时校验？倾向 M4 随权限体系一并处理。

---

*术语与契约一致性自查：`workflow_run_events`/`agent_tasks`/`memory_entries` 表名、E1-E6 扩展点、S1-S8 短板编号、M1-M4 分期均与 [01-design-spec.md](./01-design-spec.md) / [02-implementation-plan.md](./02-implementation-plan.md) 对齐；本文新增对象均已就地标注。*

---

## 13. M1 实施记录（2026-08-29）

### 实际文件清单

| 文件 | 内容 |
|------|------|
| `src/shared/types/event.types.ts` | §5 全部契约类型：PlatformEvent / PublishInput / SubscriptionFilter / SubscribeOptions / ReplayQuery / EventHandler / Subscription / DeadLetter / EventBus / QueryRunnerLike / ChannelKind / EventChannel / EventAdmin（后两者仅类型，实现属后续批次） |
| `src/core/database/entities/platform-event.entities.ts` | 三表 Entity（platform_events / platform_event_cursors / platform_event_dead_letters），已登记 barrel `entities/index.ts` |
| `src/core/database/migrations/create-platform-event-tables.ts` | 双端幂等迁移（ensureTable/ensureIndex 模式，SQLite/PG 双 DDL、isPg 开关、`?`/`$1` 占位符） |
| `src/electron/database/index.ts` / `src/web/server/index.ts` | 迁移登记（runMultiTenantMigrations / initDatabase，紧随 createWorkflowTables） |
| `src/core/database/repositories/platform-event.repository.ts` | BaseRepository 派生仓库：publish 走 scoped（ALS 注入 userId）；replay 走 scoped.qb；dispatcher 扫表/ingest 走裸 repo（§4.4 既定例外，注释已确认安全性） |
| `src/core/services/event-system/event-matcher.ts` | 通配符匹配纯函数（`'*'`/前缀/全等 + 聚合 AND） |
| `src/core/services/event-system/payload-guard.ts` | §8 守卫：密钥键名顶层拒绝 + 深层 warn、64KB 上限、循环引用拒绝；返回序列化结果复用 |
| `src/core/services/event-system/event-bus.service.ts` | PlatformEventBus（publish/subscribe/replay/ingest + dispatcher pump + 退避/DLQ + 兜底扫描）+ 单例访问器（getEventBus / getEventBusIfReady / stopEventBus） |
| `src/core/services/event-system/index.ts` | 公共出口 |
| `src/core/modules/workflow/trigger/domain-event-bus.ts` | `publishDomainEvent` 适配器化（见偏差 1） |
| `src/core/modules/workflow/workflow-boot.ts` | boot 装配 step 0：启动平台事件总线（双端共用入口，失败不致命） |
| `tests/unit/migrations/create-platform-event-tables.spec.ts` | 迁移单测（建表/索引、连跑两次幂等、schema-drift 对齐、游标唯一键） |
| `tests/unit/core/services/event-system/event-matcher.spec.ts` | 通配符匹配矩阵 + 聚合 AND |
| `tests/unit/core/services/event-system/payload-guard.spec.ts` | 密钥键名矩阵 / 64KB / 循环引用 |
| `tests/unit/core/services/event-system/event-bus.spec.ts` | 投递语义（含租户隔离、聚合过滤、tx 路径）、退避 5 次进 DLQ + 毒消息跳过、崩溃恢复（写库未分发→重建 bus→补偿投递）、replay、ingest 去重 |
| `scripts/verify-pg-platform-event-tables.ts` | PG 无实体 DataSource 直验脚本（PG 全套件被存量 datetime 实体问题阻塞，按 §10 允许的替代路径） |

### 与设计的偏差及原因

1. **`publishDomainEvent` 保留进程内同步分发 + 追加平台落库，而非完全替换为 bus.publish**。§9 写"内部转 bus.publish"，但平台 bus.publish 是异步且依赖 DB；存量触发器测试套件（trigger-scheduler.spec.ts）无 DB 环境、断言同步分发语义。完全替换会导致存量套件全灭与触发器链路实时性回归。现实现：内存 EventEmitter 同步分发不变（订阅方零改动），同时转发 `bus.publish` 落库（fire-and-forget + try/catch，主流程不受影响语义保持）；平台总线未启动（boot 早期/无库测试）时静默跳过，行为与存量纯内存等价。聚合推导：kind 取事件名首段，id 取 payload 首个 `*Id` string 值（兜底事件名）。
2. **PG 端 seq 实际为 SERIAL 而非 BIGSERIAL（Web 路径）**。Entity 声明 `type:'integer'`（better-sqlite3 自增主键强制 INTEGER，实测 bigint 报 "AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY"）；Web 端 `ds.synchronize()` 先于迁移建表 → 实际落 SERIAL。迁移 DDL 仍按 §4.1 写 BIGSERIAL（迁移先建表的场景，如 PG 直验脚本，实测 bigint ✓）。千条/日量级 int4（21 亿）足够；如需严格一致，后续把 Web 建表切到迁移优先。
3. **SubscribeOptions 未加 userScope 字段**。消费者租户作用域按 §8 语义内部推导：订阅时刻 ALS userId，无 ALS 时 `'*'` 系统级（代码评审登记点即订阅调用处）。
4. **匿名进程内订阅暂不做事件级租户过滤**（与存量 domain-event-bus 语义一致：发布捕获 userId、订阅方自行过滤）；命名消费者的 DB 侧 scope 过滤是完整实现的。M1 尚无匿名订阅用户（ipc/ws/sse 通道后续批次接入时再收紧）。
5. **DLQ `first_failed_at` 用内存映射追踪首轮失败时刻**，重启后丢失则回落 last_failed_at（DDL 未含该列，游标表不含 first-failure 字段，M1 不扩表）。
6. **tx 路径不做提交后即时分发**（提交时机对 bus 不可知）：统一由 dispatcher 兜底扫描补投（≤2s）。回滚即无幻影投递，语义比"乐观分发"更安全。
7. **新建游标 last_seq=0 → 重放全部历史匹配事件**：§6.3 boot 扫表的直白语义。事件触发器后续迁移为命名消费者时需评估是否从"当前最大 seq"起订（届时再定，M1 无命名消费者接入存量链路）。
8. **退避重试由兜底扫描驱动**（不另起 setTimeout 计时器）：重试粒度受 sweep 间隔约束（生产 2s，测试注入 10ms），配合注入式 `retryDelaysMs` 替代 fake timer（DB 异步与 fake timer 组合易挂起）。

### 验证结果（2026-08-29，feat/plugin-arch）

- 迁移单测：SQLite 内存库连跑两次幂等 ✓；schema-drift（Entity vs DDL）ok ✓；游标唯一键冲突拒绝 ✓
- PG 直验（localhost:5439/the_bot_test）：3 表 + 6 索引齐全、seq=bigint（BIGSERIAL）、连跑两次幂等、写入冒烟 ✓
- 新增单测：event-system + 迁移共 4 个 spec 全绿（55 用例）；存量 trigger-scheduler 套件 11/11 绿（适配器兼容）
- 全套件抽样基线对比：app.repository / create-builtin-apps / app-list / tool-call / multi-tenant / workflow-repositories 等失败数与改动前基线完全一致（存量失败，非本次引入）
- typecheck：974 → 974，净增 0（新文件 0 错误）
- `npx electron-vite build` 通过
- 恢复 Electron ABI（`npm run rebuild:electron`）后冒烟：`scripts/e2e-pack-smoke.cjs` 6/6 通过；boot 日志确认三表在真库创建 + `[EventBus] 平台事件总线已启动`

### 实施中发现并修复的存量坑

- TypeORM SelectQueryBuilder `.where()` 会清空既有 wheres——`scoped.qb` 注入的租户条件曾被 replayBatch 的 `.where()` 覆盖（已改 andWhere 并注释）；这是 scoped.qb 使用方的通用陷阱。
- AsyncLocalStorage 不随异步生成器迭代传播——replay 的租户快照必须在同步调用点捕获（生成器体首次迭代时已不在调用方 ALS 内）。

---

## 14. M1 收尾实施记录（2026-08-29，第二批：ipc/ws 通道 + 引擎 producer 适配器）

### 实际文件清单

| 文件 | 内容 |
|------|------|
| `src/core/services/event-system/workflow-run-event-map.ts` | §9 事件类型映射表（五型 ↔ `workflow.run.*`，`WORKFLOW_RUN_EVENT_TYPE_MAP` 单一事实源 + 逆映射）+ `translateRunPlatformEvent`（平台事件 → 五型载荷重建 type）+ 通道默认订阅类型集 `workflow.run.*` + 聚合 kind 常量 `workflow_run` |
| `src/core/services/event-system/channels/ipc.channel.ts` | ipc 通道（§5.4）：匿名订阅 `workflow.run.*` → 翻译回五型载荷 → `getEventEmitter().emit('wf:run-event', ...)`；emit 用事件自带 userId 包裹 ALS（tap 消费者租户上下文与存量直推一致）；未登记映射类型跳过；start/stop 幂等 |
| `src/core/services/event-system/channels/ws.channel.ts` | ws 通道（§5.4）：同 ipc 角色，走 WebSocketEventEmitter；按事件自带 userId 路由（runWithUser 包裹 emit），不再依赖 emit 时刻 ALS 上下文；userId 为 null 不广播（emitter 既有防串数据语义） |
| `src/core/services/event-system/workflow-run-producer.ts` | 引擎 producer 适配器 `createWorkflowRunEventProducer(fallbackEmit, {getBus})`：emit → 派生平台事件（映射表类型、aggregate={workflow_run,runId}、actor=workflow、correlationId=runId、载荷剥离 type）；Promise 链串行化保序；总线未就绪/落库 null/抛错 → 回退存量直推（前端推送不断、不影响恢复，§9 第一行契约） |
| `src/core/modules/workflow/engine/ports.ts` | `WorkflowEventPort.emit` 增加可选 `opts.causationId`（journal 事件 id 透传位；引擎调用点零改动） |
| `src/core/modules/workflow/workflow-run.service.ts` | `makeEngineDeps` 的 events 改用 producer 适配器包装存量直推（直推保留为兜底路径） |
| `src/core/modules/workflow/workflow-boot.ts` | `initWorkflowSubsystem(opts?: { eventChannels? })`：总线启动成功后挂接通道（失败不致命）；`resetWorkflowSubsystem` 停通道 |
| `src/electron/index.ts` / `src/web/server/index.ts` | 分别传入 `new IpcEventChannel()` / `new WsEventChannel()` |
| `src/core/services/event-system/index.ts` | 公共出口补齐（映射表 / producer / 两通道） |
| `src/core/services/event-system/event-bus.service.ts` + `src/core/database/repositories/platform-event.repository.ts` | 存量坑修复：`globalThis.crypto.randomUUID` → `node:crypto` randomUUID（见下方存量坑） |
| `tests/unit/core/services/event-system/workflow-run-event-map.spec.ts` | 映射表单测：五型全集覆盖、双向往返、值唯一、未登记类型 null、翻译重建 |
| `tests/unit/core/services/event-system/run-event-channels.spec.ts` | ipc/ws 通道同构断言：五型载荷字段级相等、按事件自带 userId 包裹 emit、未映射跳过、start/stop 幂等 |
| `tests/unit/core/services/event-system/workflow-run-producer.spec.ts` | producer：派生字段断言、causationId 透传、保序链、三类失败隔离（落库 null / 抛错 / 总线未就绪均回退直推）、单事件失败不卡死后续 |
| `scripts/e2e-event-system-run-push.cjs` | 前端实测脚本（CDP 9333）：建图发布 → preload `onRunEvent` 订阅 → startRun → 断言收到五型载荷至终态 |

### 与设计的偏差及原因

9. **causationId 暂为 undefined（journal 尚未实施）**。§9 约定"引擎在 journal 追加后派生平台事件、causationId 回填 journal 事件 id"，但 `workflow_run_events` journal 属 [11-run-journal](./11-run-journal.md)、本仓库尚无实现。本批派生点挂在 `makeEngineDeps` 的 `events.emit`（引擎事件唯一出口），`WorkflowEventPort.emit` 已加可选 `opts.causationId` 透传位，journal 落地后由引擎调用点补传即可，适配器与通道零改动。
10. **存量直推保留为兜底而非删除**。producer 在总线未就绪 / publish 返回 null / publish 抛错时回退 `getEventEmitter().emit('wf:run-event')` 直推——§9"前端零改动"+"平台事件失败不影响恢复"的双重契约下，这是保证前端实时推送不断的最小代价；正常路径（总线就绪）事件只走"总线→通道"一条，无双发。
11. **`app-notify` 节点的 notify 事件未走平台总线**（`ai-nodes.ts` 直接 `getEventEmitter().emit`，不经过引擎 events.emit）。保持原样不动（最小改动）；后续如需 notify 也入平台事件，改走 producer 即可，前端无感。
12. **ipc/ws 通道为匿名订阅（至多一次）**，与存量 fire-and-forget 推送语义一致；崩溃窗口漏投由前端刷新/轮询兜底（UI 推送类本就至多一次，§5.2）。sse 通道平台化（streamRunEvents 改 replay+订阅混合流）仍属 M2。

### 验证结果（2026-08-29，feat/plugin-arch）

- 新增单测 21 用例全绿；event-system 目录合计 6 spec / 76 用例全绿；存量 workflow 模块套件 522 过 / 7 失败（tool-call、tool.service 加密、yt-dlp，与基线一致的存量失败，非本次引入）
- typecheck：974 → 974，净增 0；`tsconfig.web-server.json` 无新增错误（351 存量为 esModuleInterop 等配置级问题）；`npx electron-vite build` 通过
- 恢复 Electron ABI 后冒烟 `scripts/e2e-pack-smoke.cjs` 6/6 通过；boot 日志确认 `[EventBus] 平台事件总线已启动` + `[IpcEventChannel] 已挂接（订阅 workflow.run.* → wf:run-event）`
- **wf:run-event 前端实测**（`scripts/e2e-event-system-run-push.cjs`）：真实 run（start→message→end）前端经 preload `onRunEvent` 收到 9 条事件（node-status×6 + node-progress×1 + run-status×2），序列为 running → 各节点 → succeeded；`platform_events` 表直查确认同 run 9 条 `workflow.run.*` 事件落库（aggregate/correlation=runId、actor=workflow）；全程无 producer 回退日志——前端推送链路已完整切换到"引擎 → 平台总线 → ipc 通道 → wf:run-event"

### 实施中发现并修复的存量坑（第二批）

- **Electron 主进程无 `globalThis.crypto`**（WebCrypto 全局未暴露）——M1 核心的 `generateUuid`（event-bus.service 与 platform-event.repository 两处）在真机 boot 挂接通道时抛 `TypeError: Cannot read properties of undefined (reading 'randomUUID')`，vitest（Node 24）不暴露此问题。已统一改 `node:crypto` 的 `randomUUID`（项目存量惯例）。
- logger 对 Error 第二参数序列化为 `{}`（Error 属性不可枚举）——通道挂接失败的 catch 已改为显式拼接 `e.stack`，否则真机排障无栈可看。

---

## 15. M2 实施记录（2026-08-29：EventAdmin + SSE 平台化 + app-session 桥迁移）

### 实际文件清单

| 文件 | 内容 |
|------|------|
| `src/shared/types/event.types.ts` | `SubscribeOptions.startFrom`（'earliest' 缺省 / 'latest' 起订当前最大 seq，仅新建游标生效）；EventAdmin 注释更新为已落地 |
| `src/core/database/repositories/platform-event.repository.ts` | 新增 `getMaxSeq` / `countEventsAfterSeq`（lag，与扫表同口径）/ `ensureCursor` 加 `initialLastSeq` / `rewindCursor`（管理面回拨，故意打破单调不退；无游标时按回拨位新建）/ `findDeadLetterById` / `updateDeadLetterStatus` |
| `src/core/services/event-system/event-bus.service.ts` | subscribe 支持 `startFrom:'latest'`（ensureCursor 前读 maxSeq 作起始位；无竞态——之后发布的事件 seq 更大，pump 照常拾取）；新增 `kickConsumer(name, scope)` 管理面手动追赶入口（未订阅时静默跳过，兜底扫描收口） |
| `src/core/services/event-system/event-admin.service.ts` | EventAdmin 实现（§5.3）：listDeadLetters（consumerName/status 过滤 + 快照解析回信封）/ requeue 两分支（在库→rewindCursor(event_seq-1)+kickConsumer；已归档→ingest 快照重放入库，保留原 id 去重键、分配新 seq）/ discard / consumerStats（lag=作用域内 seq>last_seq 事件数，retrying=retrying_seq 非空）；`getEventAdmin()` 惰性单例 |
| `src/electron/ipc/handlers/event-admin.handler.ts` | 管理面 IPC：`event-admin:list-dead-letters` / `requeue-dead-letter` / `discard-dead-letter` / `consumer-stats`，统一 IpcResponse 包装 |
| `src/electron/index.ts` / `src/web/server/api/register-channels.ts` | 双端注册管理面 handler。鉴权（§8）：Web 经 `POST /api/ipc/event-admin:*` 暴露，ipc-router 全局 `requireAuth`（ipc-router.ts:20）；Electron 走 ipcMain（单用户桌面信任模型，与既有全部 handler 同级） |
| `src/core/services/event-system/run-event-stream.ts` | sse 通道平台化（§5.4 sse 行）：`createRunEventStream(bus, runId, ownerUserId)` ——先匿名订阅缓冲实时事件→replay 聚合 {workflow_run, runId} 历史（replay 用 runWithUser 包 ownerUserId，规避 async generator ALS 坑）→置 replayDone 后同步冲刷缓冲（seq 有序、event.id 去重）→实时直通；replay 失败降级纯实时（不致命）；异租户事件回调处过滤（匿名订阅无 DB 侧过滤，M1 偏差 4） |
| `src/web/server/api/workflow-api-router.ts` | streamRunEvents 内部切换：bus 就绪 → createRunEventStream；未就绪 → 回退存量 tapEvents。端点契约不变（快照先行 / 25s 心跳 / 终态 done 关流 / 分享 token↔run 配对校验 / 五型载荷）；`createWorkflowApiRouter` 新增可注入 `getEventBus`（缺省 `getEventBusIfReady`） |
| `src/core/modules/app/app-session.service.ts` | 事件桥迁移（§9 末行）：`attachEventConsumer(bus)` 注册命名持久消费者 `APP_SESSION_EVENT_CONSUMER='app-session-bridge'`（startFrom='latest'；系统级 user_scope='*'，§8 登记点即此）；幂等按 event.id 去重（内存 Map，1 万上限 FIFO 淘汰）；平台事件经 translateRunPlatformEvent 翻译后走原 handleRunEvent |
| `src/core/modules/workflow/workflow-boot.ts` | 事件桥接线：总线就绪 → attachEventConsumer；不可用 → 回退存量 tapEvents 桥 |
| `tests/unit/core/services/event-system/event-admin.spec.ts` | EventAdmin 全路径：list 过滤/DTO、requeue 在库分支（真实 DLQ 流 → 回拨 → 重投成功 → requeued）、无游标时按回拨位新建、归档分支（ingest 新 seq + 正常分发）、总线未就绪报错、状态守卫、discard、consumerStats（lag/租户口径/retrying） |
| `tests/unit/core/services/event-system/run-event-stream.spec.ts` | 混合流源：replay 先行 + 窗口缓冲 seq 保序 + id 去重 + 异租户/未映射类型跳过 + 订阅过滤面断言 + close 注销 + replay 失败降级 |
| `tests/unit/web/workflow-api-router-sse-bus.spec.ts` | 路由级集成（真实 bus + 内存 SQLite + express）：快照→replay 历史→实时→终态 done 关流、异租户过滤、终态即关流、他人 404 |
| `tests/unit/core/modules/app/app-session-event-consumer.spec.ts` | 消费者订阅面（consumerName/startFrom/types）+ 挂接幂等 + event.id 去重（同 id 两投一卡）+ 扩展类型跳过 + 异常隔离 |
| `tests/unit/core/services/event-system/event-bus.spec.ts` | +2 用例：startFrom='latest' 不补历史/之后正常投递；缺省 earliest 补投历史（偏差 7 语义保持） |

### 与设计的偏差及原因

13. **EventAdmin 落地提前到 M2**（§5.3 类型注释原写"M3 实现"）：本批任务范围含 EventAdmin，DLQ 无消费者观测无法闭环，故一并落地。
14. **requeue 在库分支的连带重投**：游标回拨到 event_seq-1 后，pump 会重扫该 seq 之后本消费者"已跳过/已处理"的全部匹配事件（不只死信那一条）——§5.3 的直白语义，at-least-once 下由消费者幂等约定兜底（§5.5），EventAdmin 注释已写明。
15. **归档重放入库走 `bus.ingest`**（保留快照原 id 作去重键）：归档已删行故无唯一键冲突；若 id 竟仍在库（归档半截）则 ingest 返回 duplicate，requeue 报"请人工核查"且不收口死信。总线未就绪时归档分支拒绝操作（rewind 分支不受影响——游标落库后由兜底扫描/下次订阅补投）。
16. **app-session 幂等键为进程内存 event.id 集**（非持久化）：§7.2 的"handler 成功但 ack 前崩溃"窗口在重启后会重投一次，内存集丢失理论上可能重复写一张卡——接受该残余风险（窗口极小、卡片为用户可读副本、finishSucceeded 等终态收口本身幂等）；持久化幂等键（如 metadata 唯一约束）留待通知/待办迁移（M4）统一评估。
17. **finishIfTerminal 补 closed 守卫**：混合流下 replay 历史可能含终态事件（快照非终态→replay 期间 run 已终态），不重入 send-after-end 才会安全；存量 tap 路径同受益（原实现存在双 done 隐患）。端点契约不变。
18. **Web 管理面未开独立 REST 路由**：复用 ipc-router 的 `POST /api/ipc/<channel>`（全局 requireAuth）即满足 §8"鉴权 REST"；若后续要给 DLQ 做运营后台 UI，再按资源型 REST 风格单独开面（TODO，非本批阻塞项）。

### 验证结果（2026-08-29，feat/plugin-arch）

- 新增单测 23 用例全绿（event-admin 8 / run-event-stream 5 / sse-bus 路由级 4 / app-session 消费者 4 / event-bus startFrom 2）；event-system + app + web 路由相关 14 spec / 152 用例全绿（含存量 tap 回退路径 workflow-api-router.spec 与存量 app-session.spec 无回归）
- 全套件（tests/unit，SKIP_PG_TESTS）：2676 过 / 68 失败——失败面（app.repository、assets/episode-production 资产系、tool-call、tool.service 加密、yt-dlp、StageHeaderBar/app-list 渲染系、create-builtin-apps）与 M1 记录的存量基线一致，无本批引入（本批触及面 event-system / app-session / workflow-api-router 全绿）
- typecheck：974 → 974，净增 0；`tsconfig.web-server.json` 351 → 351 存量（无新增）
- Web 侧 SSE 未做整机实测（应用占用 CDP 9333 不动）：以路由级集成测试（真实 bus + 内存 SQLite + express 真起服务）+ 编译覆盖代替，平台化前后端点契约由存量 tap 套件（回退路径）与新 bus 套件（平台路径）双侧锁定
- Electron 侧 EventAdmin IPC 未做真机点击验证（本批不重启应用）：handler 为薄适配层，业务路径已被 event-admin.spec 覆盖

---

## 16. M3/M4 收口实施记录（2026-08-29：背压拉模式 + 限流泛化 + 保留与归档）

### 实际文件清单

| 文件 | 内容 |
|------|------|
| `src/core/services/event-system/event-rate-limit.ts` | §7.8 生产者侧限流：`EventRateLimiter`（滑动窗口，每 (type, aggregate) 每分钟 N 次）+ `DEFAULT_EVENT_RATE_LIMITS` 类型族默认阈值（首条命中生效：`system.event.*` 不限防自限死循环；`workflow.run.*` 不限——run 生命周期含高频 node-progress，前端实时推送依赖之，存量本无限流，误杀会卡死 UI 进度；其余 20/分钟沿袭 EVENT_TRIGGER_MAX_PER_MINUTE 语义）+ `RATE_LIMITED_EVENT_TYPE` marker 节流（每 key 每窗口至多一条，防限流自身成为风暴源） |
| `src/core/services/event-system/event-bus.service.ts` | §7.7 背压：命名消费者 in-flight 水位（dispatch 踢泵 +1 / deliver ack·死信 -1，重试态不扣）达 maxInFlight（缺省 1000，SubscribeOptions 覆盖）→ 拉模式跳过实时踢泵、2s 兜底扫描按游标追赶；水位回落到一半以下（滞回）切回推模式并立即踢泵。匿名订阅者 in-flight 达 anonymousMaxInFlight（缺省 1000）→ 丢弃 + 按订阅者节流 warn。§7.8 接线：publish 载荷守卫后限流闸门，超限记 marker（沿用被限聚合、actor=system/event-rate-limiter、不进调用方事务）后丢弃返回 null。`getConsumerPressure` 水位观测口 |
| `src/core/services/event-system/event-archive.service.ts` | §6.1 [archived] / §7.10 / §12.2 归档作业：`EventArchiveService`（setInterval 每日，与审核超时 ticker 同款基建；boot 不立即跑避免拖慢启动）——只清 seq < min(所有游标.last_seq) 且超保留期且不命中全量保留类型的事件，导出 JSONL.gz（`platform-events-<首seq>-<末seq>-<时间戳>.jsonl.gz`）落盘成功后才删行；删除前事务内重读游标下界（§7.10 竞态守卫），下界收紧则只删仍安全部分并本轮即停。默认策略：通用 90 天 + `workflow.run.review-*` 全量保留。归档目录：Electron=`<数据根>/event-archives`、Web=`getAppDataPath()`=rootDataPath（系统级跨租户，不落 Web 按用户隔离目录）。单例 `startEventArchiveJob/stopEventArchiveJob`（重启动幂等） |
| `src/core/database/repositories/platform-event.repository.ts` | 归档配套：`getMinCursorLastSeq(manager?)`（无游标返回 null → 保守不归档）/ `findArchivableEvents`（seq 上界 + occurred_at 截止 + NOT 全量保留模式，跨租户裸扫描既定例外）/ `deleteEventsBySeqs(seqs, manager?)`（事务内删除） |
| `src/core/modules/workflow/workflow-boot.ts` | boot 装配 step 0.2：总线启动成功后启动归档作业（失败不致命）；reset 停表 |
| `src/shared/types/event.types.ts` | `SubscribeOptions.maxInFlight` 注释更新为 M3 已生效语义 |
| `src/core/services/event-system/index.ts` | 公共出口补齐（限流 / 归档） |
| `tests/unit/core/services/event-system/event-backpressure.spec.ts` | §7.7/§10 背压：阻塞 handler + 100 条事件 → 拉模式切入/切回断言（getConsumerPressure）+ 无丢失无重复 + 聚合内 seq 严格单调 + 游标追平；推模式正常路径不降级（关兜底验证实时分发）；匿名队列满丢弃不补投 |
| `tests/unit/core/services/event-system/event-rate-limit.spec.ts` | §7.8：类型族默认阈值 / 首条命中生效 / 滑动窗口恢复 / marker 节流；bus 接线（超限返回 null 不落库 + 25 条洪峰只记 1 条 marker + marker 字段断言）；workflow.run.* 50 连发零误杀；不同聚合独立窗口 |
| `tests/unit/core/services/event-system/event-archive.spec.ts` | §7.10：正常归档（游标上界/保留期/全量保留三维过滤 + JSONL.gz gunzip 还原 + 剩余行精确断言）；无游标保守跳过；**竞态单测**（beforeDelete 钩子新建 last_seq=0 游标 → 本轮一条不删）；多批次分文件；start/stop 幂等 + runArchiveOnce 防重入 |
| `tests/unit/core/services/event-system/event-bus.spec.ts` | 既有用例去竞态：ack 游标断言改为 waitFor 追平（见偏差 20） |

### 与设计的偏差及原因

19. **限流 marker 节流为"每 key 每窗口至多一条"**。§7.8 原文"超限事件记 system.event.rate-limited 后丢弃"若逐条记，洪峰 1 万条会产生 1 万条 marker——限流自身成了事件风暴源。marker 语义是"该 key 本窗口发生过限流"的观测信号而非逐条审计（被限事件的载荷本就不落库）。ingest（LAN 远端事件）不过限流——远端已被其本端策略约束。
20. **既有 event-bus 用例去竞态化**。「命名持久消费者…游标前移」用例原断言 `waitFor(received==2)` 后立即读游标，但 ack 落库在 handler push 之后（异步），本批 dispatch/deliver 链路插入水位计数后时序偏移暴露了该固有竞态（旧代码同样存在）。改为 waitFor 游标追平再断言，断言语义不变。
21. **背压 in-flight 是水位估计而非精确队列**。命名消费者本就是游标驱动（pump 扫表），"in-flight 队列"为虚拟计数：实时分发每踢 +1、deliver 收口 -1、下界 0；tx 路径/崩溃补偿事件不经实时分发不计入。该计数只用于推/拉切换，投递正确性始终由游标保证——§7.7 的"无丢失"在本架构下天然成立，背压的实际收益是削掉慢消费者期间的无效踢泵抖动。
22. **归档调度用 setInterval 而非 cron 库**。项目无 cron 依赖（现有调度基建=触发调度器 crontab 字段 + 各类 setInterval ticker），千条/日量级每日一次 setInterval 足够；boot 不立即跑（避免拖慢启动），手动触发走 `runArchiveOnce`。
23. **无游标时保守不归档**。§7.10 只规定了"seq < min(游标)"上界，未定义零游标语义；取保守解（未来 startFrom='earliest' 消费者可能依赖历史，§13 偏差 7），文件头注释已写明。
24. **已导出未删除的竞态残余允许跨文件冗余**。§7.10 竞态命中时本轮停删但文件已导出，下轮重扫会重复导出同一批（归档仅供审计，幂等删除由 seq 上界保证）；避免为去重引入归档清单表。

### app-session 幂等键持久化评估（§15 偏差 16 的 M4 评估项）

结论：**维持现状（内存 event.id 集），不做持久化**。理由：持久化需要去重存储（新表或 app_sessions 加约束列），触及存量表 DDL 且窗口极小（handler 成功→ack 之间的崩溃）；卡片为用户可读副本、终态收口（finishSucceeded 等）本身幂等，残余风险与改动成本不匹配。待通知/待办迁移（M4 后续）时若有 inbox 表天然唯一约束再统一收口。

### 验证结果（2026-08-29，feat/plugin-arch）

- 新增单测 15 用例全绿（backpressure 3 / rate-limit 7 / archive 5）；event-system 目录 11 spec / 106 用例全绿；相关存量套件（app-session、web 路由、迁移）无回归
- 全套件（tests/unit，SKIP_PG_TESTS）：2691 过 / 68 失败——较 M2 基线（2676/68）净增 15 用例全绿，失败数 68 不变且失败面与存量基线一致（无本批引入）
- typecheck：974 → 974，净增 0
- 未做真机归档作业实测（应用占用 CDP 9333 不动、本批不重启）：boot 接线为薄装配（与事件通道同款模式，已真机验证过同类路径），作业业务路径由 event-archive.spec 全覆盖


---

## 2026-09-06 修订：producer 公共底座（架构统一性抽象）

`event-system/event-producer.ts` 新增 `createPlatformEventProducer`：**保序链 +
失败降级**的共用件——此前 workflow-run-producer（引擎）与 agent EventBridge
（23 号 §7）各写一份同构骨架，按"能抽象共用就抽象共用"原则下沉到事件系统模块。
职责边界：底座管"怎么安全有序地发布"；类型映射/直推通道/delta 合批/降级策略
（引擎=回退存量直推，agent=仅 warn）仍属各 producer。重构以两侧既有测试为
行为门（引擎 7 例 + bridge 12 例 + 底座新增 6 例，全绿；零新增失败）。


### 2026-09-06 第二次修订：限流器语义（用户裁定）

超限行为从「marker 后丢弃返回 null」改为 **fail-fast 抛 `EventRateLimitError`**
（清晰报错：type/key/上限/窗口 + 调整指引；marker 事件与 warn 日志照旧保留）。
分类依据：safePublish 的 null 保留给**基础设施故障**（DB 不可用等，静默降级）；
限流是**策略违反**，与载荷违规（EventPayloadError）同走 fail-fast——
producer 的 onFailed 分支收到明确原因（workflow 回退直推/agent warn 记录）。
配套：缺省通配 20→600（风暴兜底量级，正常领域流量不可达）+ settings 键
`eventBus:rateLimits` 运行时覆盖（0=不限）。§7.8 原文按本节修订理解。
