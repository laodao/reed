# 12 · AgentRuntime 主运行时（Harness 核心）

> Agent Loop Harness ｜ 2026-08-28 ｜ 状态：设计中
> 上位文档：[01-design-spec.md](./01-design-spec.md)（总纲，共享契约以它为准）｜ 分期：[02-implementation-plan.md](./02-implementation-plan.md)
> 依赖文档：11-run-journal（journal / state_json / resume 回调，即总纲 E1-E3）、13-ai-tool-calling（AI 协议层，总纲 §8）

## ① 目标与范围

设计并实现独立的 **AgentRuntime**：LLM tool-call 循环运行时。它承载总纲 §7 的 Executor 职责——模型决策 → 工具执行 → 结果回填 → 收敛判定，每轮 `saveState` 落库，需要人工时经宿主挂起。

范围内：

- `src/core/services/agent-runtime/` 模块目录与各文件职责；
- `AgentHost` 接口与工作流 `agent-loop` 节点适配器（总纲 E4 的薄适配器）；
- 循环状态 schema 与持久化协议、主循环详设（收敛/并行 tool_call/落库时机）；
- 错误分类法与重试策略、挂起-恢复全流程、`agent_trajectories` 轨迹表；
- 流式输出直推前端、护栏强制执行点、与 Planner/Verifier/Memory 的 M3 接口。

范围外（明确不做）：引擎 journal 与 `resume()` 回调本体（11-run-journal）；provider tool-calling 协议实现（13-ai-tool-calling）；任务树/质量门/知识飞轮实现（M3，本文只留接口）；MCP（总纲 §12 非目标）。

## ② 现状与差距（代码证据）

现有机制（已核实）：

- 节点契约：`WorkflowNodeHandler.execute(ctx)` 单一入口，`WorkflowNodeExecutionResult` 三态（`succeeded` / `waiting_review` / `failed`），见 `src/core/modules/workflow/engine/node-handler.ts:76-111`。契约第 2 条要求"execute 可重入、禁存跨调用可变状态"（`node-handler.ts:10-11`）。
- 挂起机器：handler 返回 `waiting_review` 后，`handleReviewSuspend` 落库 node_run（payload 写入 `output_json`）、挂起整条 run、发 `review-requested` 事件（`workflow-engine.service.ts:1080-1125`）；`resumeReview` → `applyReviewDecision` 应用决策（`:454-487`、`:490-578`）。
- 引擎护栏默认值/硬上限：`WORKFLOW_DEFAULTS` / `WORKFLOW_LIMITS`（`src/shared/types/workflow.types.ts:1029-1092`）；`maxNodeRuns` 唯一计数点在 `launchNode`（`workflow-engine.service.ts:934-957`）——**只数节点启动次数，节点内循环不可见**（S6）。
- 进度推送：`emitProgress` 经引擎转发为 `wf:run-event` 的 `node-progress`（`workflow-engine.service.ts:1632-1641`）；节点也可直接 `getEventEmitter().emit(WORKFLOW_RUN_EVENT_CHANNEL, …)` 发 `notify`（先例：`src/core/modules/workflow/nodes/ai-nodes.ts:575-581`）。
- checkpoint：`workflow_node_runs` 表 `(run_id, node_id, iteration_index)` 唯一，`output_json` + `route_taken` 留痕（`src/core/database/entities/workflow-node-run.entity.ts:17-97`；双端 DDL 同文件分支生成，`src/core/database/migrations/create-workflow-tables.ts:134-185`）。

差距（与总纲 S 编号对应）：

| 差距 | 证据 | 对 harness 的影响 |
|------|------|-------------------|
| S3 节点内无中间状态持久化 | `node-handler.ts:25-65` context 无 state API | 50 轮循环崩溃 = 对话历史全丢 |
| S2 挂起是一次性终态 | `applyReviewDecision` 直接标 succeeded 出边（`workflow-engine.service.ts:553-570`），handler 不重入 | 人工干预后无法续跑循环 |
| S1 调度在途态纯内存 | `workflow-run.service.ts:280-287`（重启后决策被拒）、`recoverOnBoot:393-439` | 跨重启挂起不可用 |
| S4 AI 层无 tool-calling | `ChatContext`（`src/shared/types/message.types.ts:236-243`）、`ChatOptions`/`StreamCallback`（`src/core/providers/base-provider.ts:21-48`）均无 tools 概念 | 主循环无从发起 |

S1/S2/S3 由 11-run-journal（E1-E3）修复，S4 由 13-ai-tool-calling（总纲 §8）修复；**本文档建立在两者已落地的前提上**，只消费其 API，不重复设计。

## ③ 概念模型

```
宿主（AgentHost 实现者）                    AgentRuntime（本模块）
┌─────────────────────────────┐   ┌──────────────────────────────────────┐
│ agent-loop 节点 handler      │   │ run(task, host)                       │
│  ├ saveState → ctx.saveState │◄──┤  ┌─ while(!converged) ──────────────┐ │
│  ├ loadState → ctx.loadState │──►│  │ guardrails.check → llm.decide    │ │
│  ├ suspend   → waiting_review│◄──┤  │ → toolGateway.executeAll         │ │
│  ├ emitStream → wf:run-event │◄──┤  │ → trajectory.append → saveState  │ │
│  └ resume() 回调注入决策      │──►│  └──────────────────────────────────┘ │
└─────────────────────────────┘   │ verifier.verify（M3）→ AgentResult    │
                                  └──────────────────────────────────────┘
```

核心概念：

- **AgentTask**：一次循环的任务描述（目标、输入、工具白名单、预算）。M1 由 agent-loop 节点 config 构造；M3 可来自 `agent_tasks` 表行。
- **AgentLoopState**：循环的可持久化状态（messages、iteration、预算消耗、收敛标记、挂起点），是崩溃恢复的唯一依据。
- **Decision**：LLM 每轮的产出，三态之一：`final`（收敛答案）/ `tool_calls`（一组工具调用）/ `human_request`（请求人工）。
- **AgentHost**：宿主能力接口。Runtime 不认识工作流、不知道 SQLite/PG，全部持久化与挂起能力经 host 注入。
- **Trajectory**：每轮迭代的审计记录，写 `agent_trajectories` 表，独立于 node_run 主表（总纲 §3.3）。

## ④ 数据模型

### 4.1 `agent_trajectories`（本文新增表，总纲 §3.3 已定名）

SQLite（PC）：

```sql
CREATE TABLE agent_trajectories (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,
  run_id        TEXT NOT NULL,        -- 宿主的运行 ID（工作流宿主 = workflow_runs.id）
  node_id       TEXT,                 -- 宿主的定位维度（工作流宿主 = 图内节点 ID；其他宿主可为 NULL）
  seq           INTEGER NOT NULL,     -- (run_id, node_id) 内单调递增，与 journal 同一套 seq 语义
  iteration     INTEGER NOT NULL,     -- agent 循环轮次（0 起）
  kind          TEXT NOT NULL,        -- decision / tool_call / tool_result / human_request
                                      -- / human_decision / guardrail_stop / final
  name          TEXT,                 -- tool_call/tool_result 时为工具名；其余为 NULL
  payload_json  TEXT NOT NULL,        -- 结构化内容（见 4.3 写入协议）
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  duration_ms   INTEGER,
  created_at    DATETIME NOT NULL,
  UNIQUE(run_id, node_id, seq)
);
-- 索引：idx_agent_traj_run (run_id)、idx_agent_traj_user (user_id)
```

PostgreSQL（Web）：字段同名，类型映射 `TEXT→varchar`（`payload_json` 保持 `text`）、`DATETIME→timestamp`、`INTEGER→integer`，占位符 `$1,$2,…` 替代 `?`。迁移沿用 `create-workflow-tables.ts` 的 `pg: boolean` 双分支写法，PC/Web 成对提交（02 横切约定）。

多租户：`user_id` 由 `BaseRepository` 自动注入（与 `workflow_node_runs` 相同约定）。

### 4.2 循环状态（`AgentLoopState`，落库宿主侧，本文新增）

工作流宿主下持久化在 `workflow_node_runs.state_json`（E2，11-run-journal 提供）。schema：

```ts
/** agent-runtime/loop-state.ts（本文新增） */
export interface AgentLoopState {
  version: 1                          // schema 版本，迁移用
  task: AgentTaskSnapshot             // 任务快照（目标/白名单/预算上限），防 config 中途被改
  messages: AgentMessage[]            // 完整对话：system 不入列，启动时重建
  iteration: number                   // 已完成轮数（下一次 LLM 调用 = 第 iteration 轮）
  usage: { promptTokens: number; completionTokens: number; toolCalls: number }
  startedAtMs: number                 // 首轮墙钟，供 maxDurationMs 判定（挂起时长不计：见 ⑥）
  converged: boolean
  finalAnswer?: string
  lastToolSignature?: string          // 无进展检测用（§6.4）
  stagnantRounds: number              // 连续无进展轮数
  suspended?: {                       // 挂起点：仅 host.suspend 期间存在
    requestPayload: Record<string, unknown>
    suspendedAt: string
    waitMs: number                    // 恢复时累加，从时长预算中扣除
  }
  stopReason?: string                 // 终止原因（护栏/错误/人工驳回）
}
```

`AgentMessage = { role: 'user'|'assistant'|'tool'; content: string; toolCalls?: ParsedToolCall[]; toolCallId?: string; name?: string }`——与 13-ai-tool-calling 扩展后的消息类型对齐（`role:'tool'` 为总纲 §8.1 既定扩展）。

### 4.3 轨迹写入协议

- 每轮迭代写 1 条 `decision` + N 条 `tool_call` + N 条 `tool_result`（N = 本轮 tool_call 数）；挂起/恢复各写 1 条 `human_request`/`human_decision`；终止写 1 条 `final` 或 `guardrail_stop`。
- `payload_json` 内容按 kind：`decision`={thought, toolCalls 摘要}; `tool_call`={args}; `tool_result`={output 截断后 ≤ 8k 字符（本文新增阈值）或 error}; `final`={answer}。
- token 用量记在 `decision` 行（来自 `CallAIStreamResult.usage`，`ai-call.ts:492-495`）。
- 写入失败只记 warn 不中断循环（轨迹是审计件，不是状态件）；状态一致性只靠 `saveState`。

## ⑤ 接口设计

### 5.1 模块目录（`src/core/services/agent-runtime/`，总纲 §7.1 既定）

| 文件 | 职责 | M1 状态 |
|------|------|---------|
| `agent-runtime.service.ts` | 主循环编排（总纲 §7.2 伪代码的具体化） | 实现 |
| `loop-state.ts` | `AgentLoopState` schema、`initState`、序列化/反序列化 + version 迁移 | 实现 |
| `decision.ts` | `AgentDecision` 类型与 LLM 响应 → Decision 的归一化 | 实现 |
| `tool-gateway.ts` | 白名单装配、调用分发、并发执行、单调用超时、结果截断、调用计数 | 实现（M2 接 AgentToolRegistry） |
| `trajectory.ts` | `agent_trajectories` 写入（仓储封装，双端） | 实现 |
| `guardrails.ts` | maxIterations/maxTokens/maxToolCalls/maxDurationMs 检查与超限错误 | 实现 |
| `errors.ts` | 错误分类法（§6.5）与重试策略表 | 实现 |
| `host.ts` | `AgentHost` 接口定义 | 实现 |
| `planner.ts` / `verifier.ts` / `memory/` | 总纲既定模块 | **M1 仅空接口**（§5.5） |
| `nodes/agent-loop-node.ts` | 工作流宿主适配器（E4 四件套之一，放引擎 nodes 目录） | 实现 |

### 5.2 `AgentHost` 完整定义（本文新增，总纲 §7.2 已列方法名）

```ts
/** agent-runtime/host.ts */
export interface AgentHost {
  /** 启动时注入：无状态返回 null（首次运行） */
  loadState(): Promise<AgentLoopState | null>
  /** 每轮迭代末尾调用；宿主保证落库成功才返回（失败抛错 → 循环按崩溃处理） */
  saveState(state: AgentLoopState): Promise<void>
  /**
   * 请求人工。宿主挂起运行并阻塞等待决策；
   * 恢复后 resolve 决策值（人工输入/批准结果），Runtime 将其作为 tool 结果回填。
   * 工作流宿主实现 = 抛挂起而非真阻塞（见 5.3/⑥），此方法只在恢复路径被"续上"。
   */
  suspend(req: SuspendRequest): Promise<HumanDecision>
  /** 轨迹追加（fire-and-forget；内部吞错记 warn） */
  emitTrajectory(entry: TrajectoryEntry): void
  /** 流式增量直推前端（LLM delta/thinking/工具进度）；不进节点输出机制 */
  emitStream(event: AgentStreamEvent): void
  /** 取消信号（透传宿主 AbortSignal） */
  readonly signal: AbortSignal
}

export interface SuspendRequest {
  reason: string                                // 展示给审核人
  payload: Record<string, unknown>              // 审核上下文（草稿/待确认内容）
  timeoutMs: number | null                      // 透传 human-review 语义
}

export type HumanDecision =
  | { action: 'approve' | 'input'; values: Record<string, unknown>; comment?: string }
  | { action: 'reject'; comment?: string }      // 驳回 → Runtime 干净终止
```

### 5.3 工作流 agent-loop 节点适配器映射

| AgentHost 方法 | 工作流宿主实现 | 依据 |
|---|---|---|
| `saveState` | `ctx.saveState(state)` → `workflow_node_runs.state_json` | E2（11-run-journal） |
| `loadState` | `ctx.loadState()` | E2 |
| `suspend` | 先 `saveState`（写 `suspended` 挂起点），再 `return { status:'waiting_review', payload, timeoutMs }`；**Promise 永不 resolve**——execute 返回即挂起 | 引擎挂起机器 `:1080-1125` |
| `resume`（恢复半段） | handler 声明 `resume(decision, state)`（E3）：把 `HumanDecision` 塞进 Runtime 的恢复入口 `runtime.resume(state, decision)`，从挂起点续循环 | E3（11-run-journal） |
| `emitStream` | `getEventEmitter().emit(WORKFLOW_RUN_EVENT_CHANNEL, { type:'agent-stream', … })`（本文新增事件类型，见 §8） | 先例 `ai-nodes.ts:575-581` |
| `emitTrajectory` | `trajectory.append(...)` 写库 | §4.3 |
| `signal` | 透传 `ctx.signal` | `node-handler.ts:45` |

节点 config（本文新增字段）：`task`（模板化目标）、`toolWhitelist: string[]`、`maxIterations=20`、`maxTokens`、`maxToolCalls`、`maxDurationMs`、`model: { providerConfigId, modelId }`。输出 schema：`{ answer, iterations, usage, stopReason, trajectoriesSummary }`。

### 5.4 主循环签名与 Decision

```ts
/** agent-runtime/agent-runtime.service.ts */
export class AgentRuntimeService {
  constructor(deps: {
    llm: ToolCallingClient        // 13-ai-tool-calling 提供：decide(ctx): Promise<AgentDecision>
    tools: ToolGateway
    guardrails: Guardrails
    trajectory: TrajectoryWriter
    verifier?: Verifier           // M3
    memory?: MemoryAssembler      // M3
  }) {}
  run(task: AgentTask, host: AgentHost): Promise<AgentResult>
  /** 恢复入口：从 state.suspended 挂起点继续（⑥） */
  resume(state: AgentLoopState, decision: HumanDecision, host: AgentHost): Promise<AgentResult>
}

export type AgentDecision =
  | { type: 'final'; answer: string }
  | { type: 'tool_calls'; calls: ParsedToolCall[] }   // 可并行多个
  | { type: 'human_request'; reason: string; payload: Record<string, unknown> }
```

### 5.5 M3 留空接口（M1 只定义不实现）

```ts
export interface Planner {   // M3 任务树（总纲 §5）
  decompose(task: AgentTask): Promise<AgentTask[]>   // M1 不注入
}
export interface Verifier {  // M3 质量门（总纲 §6）
  verify(task: AgentTask, output: unknown): Promise<VerificationResult>
}
export interface MemoryAssembler {  // M3 飞轮读取（总纲 §4.2 装配环）
  assemble(spec: string, tokenBudget: number): Promise<string>  // 返回系统提示附加段
}
```

M1 行为：`deps.verifier` 缺省时 `AgentResult.verification = null`；`deps.memory` 缺省时系统提示不含记忆段。注入点已在构造函数预留，M3 不改主循环签名。

## ⑥ 状态机与关键时序

### 6.1 循环状态机（单轮内）

`idle → deciding（LLM 调用中）→ executing_tools | suspending | converged → verifying?（M3）→ done | stopped`

每轮边界 = `saveState` 成功。状态迁移穷举：

- `idle → deciding`：进入第 `state.iteration` 轮，`guardrails.check` 先行。
- `deciding → executing_tools`：decision=tool_calls；工具全部 settle（成功或错误均回填）→ 轨迹 → saveState → iteration+1 → 回 `idle`。
- `deciding → converged`：decision=final；写 `final` 轨迹 → saveState →（M3：verifier）→ 返回。
- `deciding → suspending`：decision=human_request；写挂起点 saveState → host.suspend → **execute 返回，进程内循环终结**。
- 任意态 → `stopped`：护栏超限 / 不可重试错误 / 人工 reject；写 `guardrail_stop` 或 final(error) → saveState(stopReason) → 返回 failed。

### 6.2 挂起-恢复时序（文字时序图）

```
Runtime                 agent-loop handler           引擎                    人工
  │ decision=human_request│                            │                       │
  │── saveState(suspended)│──► state_json 落库          │                       │
  │── host.suspend(req) ─►│── return waiting_review ─►│ handleReviewSuspend   │
  │                       │      （execute 终结）        │ run→waiting_review ─►│ 审核弹窗
  │ [进程可退出，状态在库]  │                            │                       │
  │                       │                            │ ◄── reviewDecide ────│ 批准/驳回/改后批准
  │                       │ ◄── resume(decision,state) │ applyReviewDecision   │
  │ ◄─ runtime.resume ────│      （E3 回调）            │   声明了 resume → 回调 │
  │ 决策→tool 结果回填     │                            │                       │
  │ messages.push(asToolResult(decision))               │                       │
  │── saveState(清除 suspended) ────────────────────────│                       │
  │ continue → 下一轮 LLM 调用（回到 §6.1 idle）         │                       │
```

**回到哪一行**：总纲 §7.2 伪代码中 `state.messages.push(asToolResult(resume)); continue;` 两行——恢复路径把它实现为 `runtime.resume()` 的入口动作，随后进入正常轮次。挂起期间引擎看门狗不计时（现有语义，`workflow-engine.service.ts:586-587`）；**时长预算补偿**：恢复时把 `Date.now()-suspendedAt` 累加进 `suspended.waitMs`，`maxDurationMs` 判定用 `now - startedAtMs - 累计 waitMs`（本文新增规则）。

### 6.3 每轮 saveState 时机与崩溃恢复点

唯一持久化点 = 轮末（工具全部回填、轨迹已写之后、iteration 自增之前）。崩溃恢复 = 重启后引擎 journal 重放使节点重新被调度（E1），handler `execute` 重新被调用 → 适配器 `loadState()` 非空 → Runtime 从 `state.iteration` 轮续跑。恢复语义细分见 ⑦。

### 6.4 收敛判定策略（按优先级）

1. **final 答案**：decision=final → 收敛。
2. **护栏耗尽**：iteration ≥ maxIterations / 累计 tokens ≥ maxTokens / toolCalls ≥ maxToolCalls / 净时长 ≥ maxDurationMs → `guardrail_stop`，输出已收集的最佳结果 + stopReason。
3. **无进展检测**（本文新增）：连续 `stagnantRounds ≥ 3` 轮且每轮 tool signature（`name + 规范化 args` 的 hash）与上一轮相同 → 视为模型打转，注入一条 system 提示"换策略或直接给出 final"，再给 2 轮机会；仍无变化则 `guardrail_stop(reason='stagnant')`。

### 6.5 错误分类法与重试策略

| 类别 | 判定 | 策略 |
|------|------|------|
| 模型错误 | provider 5xx / 429 / 网络断流 | 循环内重试 ≤3 次，指数退避（1s/4s/15s，本文新增）；仍失败 → stopped |
| 解析错误 | tool_call JSON 非法 / 参数不过 schema | **不烧重试**：把解析错误作为 tool 结果回填给模型自纠；连续 3 轮纯解析错误 → stopped |
| 工具错误 | 工具执行抛错/超时 | 单个工具失败不影响同轮其他工具；错误文本回填（模型可换工具）；同一工具连续失败 3 次 → 该工具本轮循环拉黑 |
| 超时 | 单次 LLM 调用 >120s（本文新增默认）/ 单次工具 >60s | 按模型错误/工具错误归类处理 |
| 护栏超限 | §6.4.2 | 不重试，干净终止 |

## ⑦ 失败模式与边界情况（逐条）

记号：一轮内动作序列 `A=LLM 请求 → B=收到 decision → C=工具执行 → D=轨迹写入 → E=saveState → F=iteration+1`。

1. **崩在 A 中（LLM 请求在飞）**：state 未变（iteration 未进）。恢复后从同轮重发 LLM 请求——幂等，无副作用。
2. **崩在 B→C 之间（decision 已到、工具未执行）**：state 未变，decision 丢。恢复后重发 LLM 请求，模型可能给出不同 decision——可接受（无外部副作用发生）。
3. **崩在 C 中（工具副作用已发生，结果未回填）**：**最坏情况**。恢复后重发 LLM，工具可能被重复调用。缓解：① M1 首批白名单只接幂等/只读工具（02-M1.4：http-request、web-search、code、data-table 内置模式）；② 天然非幂等工具（发邮件等）走总纲 §3.4 幂等键机制（M2+）；③ 轨迹若已写 `tool_call` 而无对应 `tool_result`（D 部分完成），恢复时在回填消息中标注"该调用可能已执行过"，让模型知情。
4. **崩在 D→E 之间（轨迹已写、state 未存）**：恢复后同轮重跑，轨迹出现重复 `tool_call`/`tool_result` 行。seq 唯一约束 `(run_id, node_id, seq)` 下重复行会冲突——`trajectory.append` 用 `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING`（双端各自的幂等写法，本文新增约定），重复写静默丢弃。
5. **崩在 E→F 之间**：saveState 已成功、内存自增与否无关紧要——恢复以库为准，正确续跑。**这是设计 saveState 时机的原因**。
6. **崩在挂起等待期**：状态全在库（state_json 挂起点 + node_run waiting_review + journal）。重启后 E1 重放重建挂起态，`reviewDecide` rehydrate 后走 E3 resume 回调，循环从挂起点继续。决策本身幂等（引擎 choose 模式无效 choice 拒绝语义不变，`:544-546`）。
7. **saveState 本身失败（DB 故障）**：host 契约要求抛错 → Runtime 按崩溃路径终止本轮并返回 failed；引擎节点重试语义（`retryCount`）不适用 agent-loop 节点——适配器 `validateConfig` 建议 `retryCount=0`（本文新增约定），避免引擎级整节点重跑与循环内恢复语义叠加。
8. **挂起后人工 reject**：resume 收到 `action:'reject'` → 不进入下一轮，直接 stopped(reason='human_rejected')，节点返回 failed（retryable=false）。
9. **多宿主并发**：同一 Runtime 服务实例被多个 run 并发调用——全部状态在参数/局部变量，无实例字段，天然可重入（继承 node-handler 契约第 2 条纪律）。

## ⑧ 流式输出：绕开节点输出机制直推前端

节点输出机制（`settle → handleNodeSuccess → patchNode output_json`，`:1045-1077`）只在终态写一次，无法承载增量。设计：

- 扩展 `WorkflowRunEvent` 联合（`workflow.types.ts:735-`）新增成员（本文新增）：
  `{ type: 'agent-stream'; runId; nodeId; iteration; channel: 'answer'|'thinking'|'tool'; delta?: string; toolName?: string; phase: 'start'|'delta'|'done' }`。
- Runtime 把 LLM 流式回调（`StreamCallback`，13-ai-tool-calling 将扩展 `tool_call` 增量事件）经 `host.emitStream` 转发；工作流适配器直接 `getEventEmitter().emit(WORKFLOW_RUN_EVENT_CHANNEL, …)`——复用 `notify` 的既有先例（`ai-nodes.ts:575-581`），PC 走 IPC 单通道、Web 端经 SSE 按 ALS userId 路由（`src/web/server/api/workflow-api-router.ts:167`），**前端通道零新增**。
- 纪律：流式内容**只用于展示**，不回填 messages（最终完整 answer 以 `CallAIStreamResult.content` 为准）；delta 不落轨迹表（轨迹只记轮级终态，防表膨胀）。

## ⑨ 护栏强制执行点清单

| 点 | 护栏 | 位置 |
|----|------|------|
| 每轮 LLM 调用前 | maxIterations / maxTokens（累计 usage）/ maxDurationMs（净时长，扣挂起） | `guardrails.check(state)`，主循环开头 |
| 工具分发前 | maxToolCalls（累计）；白名单含名检查 | `tool-gateway.ts` |
| 单次工具调用 | 60s 超时；结果截断 ≤8k（轨迹）/ ≤32k（回填 messages，本文新增） | `tool-gateway.ts` |
| 单次 LLM 调用 | 120s 超时；流式可取消（signal 透传） | 13-ai-tool-calling 层 |
| 回填前 | messages 总 token 估算超 maxTokens 的 80% → 压缩最旧 tool 结果（本文新增：保留首尾，中间替换为占位符） | 主循环 |
| 节点 config | `validateConfig` 钳制：maxIterations ≤ 200（本文新增硬上限）、timeoutMs 规范化 | agent-loop-node |
| 引擎层（既有，仅兜底） | maxNodeRuns 对节点内循环无效（S6，`:934-957`）；run 级看门狗在挂起恢复后重建（`:586-587`） | 不依赖其防循环失控 |

### 9.1 约束三级分层（借鉴腾讯 Harness Engineering 实践）

护栏清单按约束力分三级，三级各自独立的强制执行者，不互相替代（借鉴业界"硬性 Rules / 软性 Skills / 安全兜底 Safety"分层）：

| 级 | 内容 | 强制执行者 | 违反后果 |
|----|------|-----------|----------|
| **硬性红线（Rules）** | 引擎/运行时不变量：上表全部护栏上限（maxIterations/maxTokens/maxToolCalls/maxDurationMs）、LLM 永不见明文凭据、白名单含名检查 | **内核强制**——`guardrails.check` 与 `tool-gateway` 代码级拦截，模型无权协商 | 循环终止 / 调用被拒 |
| **软性约束（Skills）** | 业务包规则集与 L4 技能注入的系统提示（编码规范、文风、流程约定），模型可偏离 | **质量门兜底**——偏离不拦截，由 Verifier（17-quality-gate）评分兜住，失败走带反馈重试 | 质量分下降 → 重试/升级 |
| **安全兜底（Safety）** | 危险工具人工批准（dangerLevel ≥ external-post，14-tool-registry §6）、SSRF 闸门、CLI 沙箱/RCE 门禁 | **工具网关执行**——与模型输出内容无关，按工具类别静态判定 | 挂起等批准 / 直接 blocked |

分层意义：硬性红线必须少而绝对（内核维护，业务包不可改）；软性约束是业务包的主要表达面（包级规则/技能归属 18-business-pack.md 的 Pack Manifest）；安全兜底按工具危险级别触发，与业务无关。业务包的规则/技能注入契约见 [18-business-pack.md](./18-business-pack.md)。

## ⑩ 安全与权限

- 出网工具一律经 `validateOutboundUrl` SSRF 闸门（`src/core/utils/outbound-url.ts:64-82`，`http-fetch.ts:90` 已强制）——LLM 生成的 URL 视同不可信输入，无例外。
- LLM 永不见明文凭据：凭据占位符在执行层替换，维持 ToolService 现有机制（总纲 §9）；tool 描述/轨迹中禁止出现注入后的实参。
- CLI 类工具保留桌面端 RCE 门禁；M1 白名单不含 CLI 工具（02-M1.4）。
- 挂起 payload 由模型内容拼成——展示层按不可信文本渲染（前端组件复用 human-review 现有渲染，无 HTML 注入面）。
- Web 端多租户：`agent_trajectories.user_id` 走 BaseRepository 注入；`emitStream` 事件按 ALS userId 路由，跨用户不可见。
- `runtime.resume` 的 decision 来源已由引擎 reviewDecide 校验链进入（M4 补操作者校验，总纲 E6，与本文正交）。

## ⑪ 与其他模块的契约

- **11-run-journal（E1-E3）**：本文消费 `ctx.saveState/loadState`（E2）、handler `resume()`（E3）、boot 重放（E1）；`state_json` 列与 `workflow_run_events` 表归属该文档，本文不重复定义。
- **13-ai-tool-calling（总纲 §8）**：本文消费 `ToolCallingClient.decide`（ChatContext.tools / role:'tool' / `CallAIStreamResult.toolCalls` / StreamCallback `tool_call` 增量）；prompt-based 降级路径对 Runtime 透明——`AgentDecision` 归一化已覆盖两种来源。
- **AgentToolRegistry（总纲 §9，M2）**：M1 `tool-gateway` 内置硬编码白名单映射；M2 切换为 Registry 数据源，gateway 接口不变。
- **16/17（任务树/质量门，M3）**：`AgentTask` 可由 `agent_tasks` 行构造（executor='agent_loop'）；`Verifier` 接口见 §5.5；验收结果经 M3 文档回写知识飞轮，Runtime 不参与。
- **human-review 组件（前端复用）**：suspend payload 结构与 human-review 的 `review-requested` 事件对齐（`:1116-1124`），审核 UI 零新增。

## ⑫ 测试策略

- 单测（M1 必配）：
  - 主循环：mock LLM 按脚本产出 decision 序列（final/多 tool_call/human_request），断言轮数、messages 回填顺序、saveState 调用时机（每轮一次、在 iteration 自增前）。
  - 并行 tool_call：3 个并发调用 1 失败，断言全部 settle、错误回填、调用计数正确。
  - 护栏：构造永不 final 的模型，maxIterations=5 干净终止且 stopReason 正确；挂起时长不计入 maxDurationMs。
  - 恢复：第 3 轮 saveState 后"崩溃"（丢弃内存），从新 host 以 state_json 恢复，断言从第 3 轮续跑且轨迹无 seq 冲突（验证 ⑦.4 幂等写法）。
  - 挂起-恢复：run → human_request → suspend → resume(approve) 从挂起轮继续（02-M1 验收第 3 条）；resume(reject) → 节点 failed 且 retryable=false。
  - 无进展检测：模型重复同一 tool signature，断言 3+2 轮后 stagnant 终止。
- 双端：`agent_trajectories` 迁移 SQLite/PG 成对验证（占位符 `?`/`$1`）；seq 唯一约束双端各验一次。
- e2e（02-M1 验收第 1/2 条）：真实 OpenAI 兼容模型跑"查资料→写摘要"≥5 轮收敛；运行中杀进程重启，轨迹完整无空洞。
- catalog 一致性：agent-loop 四件套过注册表一致性断言（`src/core/modules/workflow/nodes/README.md:1-34` 既定测试）。

## ⑬ 里程碑拆解（落到 02 分期）

- **M1**：模块目录全部骨架 + §5.2/5.3/5.4 全部接口、主循环（§6）、错误分类法（§6.5）、`agent_trajectories` 双端迁移、agent-loop 节点四件套、硬编码白名单 gateway、§8 流式事件、§9 全部护栏、§12 单测与 e2e。Planner/Verifier/Memory 仅 §5.5 空接口。
- **M2**：tool-gateway 接 AgentToolRegistry（数据源切换，接口不变）；非幂等工具幂等键（⑦.3）；轨迹视图 UI 消费 `agent_trajectories`（02-M2.3）；Anthropic/Google 协议第二批对 Runtime 透明接入。
- **M3**：注入 Verifier（收敛后质量门 + 带反馈重试——失败反馈作为 user 消息回填再开一轮，复用主循环）；注入 MemoryAssembler（系统提示装配）；`AgentTask` 支持从 `agent_tasks` 构造（executor=agent_loop 直驱路径）。
- **M4**：ep/longwriting 野生编排迁移为本 Runtime 的宿主（各自实现 AgentHost）；E6 操作者校验生效后 suspend/resume 链自动继承，本文无改动。

## ⑭ 开放问题

1. messages 压缩策略（§9 回填前压缩）是否引入 LLM 摘要压缩？M1 用占位符截断，摘要压缩留 M3 与 Memory 装配统一设计。
2. 挂起恢复后 LLM 上下文是否包含"等待期间世界可能已变"的提示？倾向：恢复时注入一条 system 注记（低成本，M1 就做）。
3. 多并行 tool_call 的结果回填顺序：按完成序还是按调用序？本文定按**调用序**（确定性、可重放），实现上并发执行+按序收集；如某 provider 对顺序敏感需再评估。
4. `agent_trajectories` 保留策略：跟随 `workflow_run_events` 的归档策略决策（02 开放问题 1），不单独定。
5. stagnant 检测的 signature 规范化（args key 排序/数值容差）粗糙时可能误杀合法轮询型任务（如 kb-ingest 等待）；M1 先对"完全相同"判定，误杀案例出现后加白名单。

---

## 2026-09-06 修订（21 号决策落地：循环载体 = AI SDK v6 + @openharness/core）

> 依据 [21-oss-adoption.md](./21-oss-adoption.md)。本节只改实现载体与宿主融合，
> 本文的 AgentHost 契约（§5.2）、AgentLoopState（§4.2）、轨迹协议（§4.3）、
> 护栏三级分层（§9.1）、错误分类法（§6.5）**全部保留为有效契约**。

### R1 实现载体替换

§5.1 的 `decision.ts`（自研归一化）与主循环 `while` 手写实现，替换为
`ai@^6`（Agent/generateText/tools/stopWhen/prepareStep）+ `@openharness/core`
（Session/Agent + withCompaction + SessionStore + ApproveFn）承载：

- `llm.decide` → AI SDK 原生 tool-calling（协议细节由 AI SDK provider 层承担，见 13 号修订）；
- 主循环 `while(!converged)` → Session.send 循环（`stopWhen: stepCountIs(maxIterations)`）；
- `AgentLoopState.messages` → Session 消息历史（ModelMessage[]），每轮 `state_json` /
  SessionStore 持久化语义不变（§6.3 时机契约照旧）；
- `decision.type='human_request'` → 两条路：**快路径**（独立宿主/交互式场景）经
  open-harness `approve` 回调（异步 Promise，spike 已验证拒绝语义=本文 §6.1 的
  tool.error 回填）；**引擎路径**（agent-loop 节点）仍走 host.suspend → waiting_review
  → E3 resume（本文 §6.2 时序不变）；
- §6.4 无进展检测（stagnant）与 §9 护栏：以 `prepareStep` 每步钩子 + 自研 Guardrails
  类实现，检查点与超限行为照本文；
- §9 回填前压缩：open-harness `DefaultCompactionStrategy` 两阶段（先剪枝旧工具结果、
  不足再 LLM 摘要）直接获得——本文开放问题 1 就此关闭（M1 即有摘要压缩，策略可换）。

### R2 宿主融合（新增"独立宿主"）

| 宿主 | state 落点 | approve/suspend |
|---|---|---|
| 工作流 agent-loop 节点（本文 §5.3，不变） | `workflow_node_runs.state_json`（E2） | 引擎 waiting_review（E3） |
| **独立宿主（聊天 / 故事研讨室 / EP 对话，新增）** | `agent_sessions` 表（SessionStore 的 DB 实现，ALS 隔离；conversationId=`${definitionId}:${scopeId}`） | open-harness approve 回调快路径（挂起审批落库 pendingApproval，重启按"忽略"哨兵处理） |

两宿主共用：tool-registry（14 号）、上下文装配（快照经 onBeforeSend 注入）、
事件桥（agent-producer 双路径：IEventEmitter 直推 + 平台事件总线 `agent:*`）。

### R3 对外 API（独立宿主的门面）

```ts
// platform/agent-runtime（模块入口，异步工厂隔离 ESM）
initAgentRuntime(): Promise<AgentRuntime>
interface AgentRuntime {
  registerDefinition(def: AgentDefinition): void      // 业务包 activate 时注册
  sendMessage(defId, scopeId, message, opts?): Promise<AgentSendResult>   // per-scope 互斥
  cancel(defId, scopeId): boolean                     // AbortController 池
  getHistory(defId, scopeId, limit?): Promise<AgentHistoryMessage[]>
  decideApproval(approvalId, decision): boolean       // 提案卡（approve/approve_with_edit/reject）
  listPendingApprovals(defId, scopeId): PendingApproval[]
  subscribe(defId, scopeId, cb): () => void
  health(): { activeSessions; busyScopes; pendingApprovals }
}
```

`AgentDefinition`：`{ id, version, systemPrompt, tools: Record<string, AgentToolDef>,
buildStateSnapshot(scopeId), loopMode: 'react'|'single-pass', maxSteps?, contextWindowTokens?,
modelPreference?, eventChannel(scopeId), approvalTimeoutMs?, onTurnEnd? }`。
事件协议 = 旧长文 AgentEvent 全兼容子集 + approval:*/compaction:* 新增（未知 type 前端忽略）。

### R4 迁移与骨架现状

- 骨架已建：`src/core/agent/`（13 文件，commit be56607f）——M0 第一步 `git mv` 至
  `src/core/platform/agent-runtime/`（三期重构后的依赖铁律）；
- 旧两套野生 agent 的行为等价映射与 G1-G5 迁移门禁（单测→冒烟→golden 对照→影子模式→
  切换）见我方设计稿 §7（docs/design/2026-09-05-agent-harness-design.md），并入 M4 执行纪律；
- spike 全部契约验证记录：21 号 §1.2。

### R5 测试基线补充

本文 §12 单测矩阵保留，另加：approve 快路径（通过/拒绝/编辑/超时/取消清理）、
SessionStore 往返与跨租户隔离、compaction 触发与事件链、abortSignal 贯穿、
ESM 动态 import 工厂（Electron CJS 产物冒烟）。目标语句覆盖 ≥85%、分支 ≥75%。
