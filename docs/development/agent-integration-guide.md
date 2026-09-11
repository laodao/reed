# 业务模块接入 Agent 指南（HostKit 形态）

> 读者：要让自己的业务模块拥有「Agent 执行复杂任务」能力的开发者。
> 版本基准：2026-09-11（47 号恢复能力面之后）。本文回答「怎么用」；接口的变更评审现场在
> [23 号契约](../../tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md)
> 与 [36 号 HostKit 契约](../../tasks/2026-08-28-agent-loop-harness/36-host-kit-contract.md)。
>
> ⚠️ **先读本文，不要从 23 号 §1 读起**：契约文档开头的顶层门面 `AgentRuntime` 是
> 零业务消费者的存量 API（32 号登记 M8 待裁决）。业务接入的正确入口是
> **createHostKit**（本文 §2）。

---

## 1. 心智模型（30 秒）

一次接入 = **声明差异面 + 每轮一调**：

- 你告诉平台四件事：**谁是这次运行**（scopeKey）、**模型能用哪些工具**（白名单）、
  **它的人设与现状**（systemPrompt/snapshot）、**历史从哪来**（业务表 或 会话存储）；
- 平台负责其余一切：工具执行管线（超时/截断/审批）、上下文守恒压缩、记忆装配、
  轨迹留痕、流级故障重试、运行登记（工作台可见可停）。

任务中断不会丢状态——每步落库，人推一句「继续」就从断点接着跑（§5.4）。

## 2. 十分钟上手

最小可跑宿主（以 `packs/longwriting/story-room/room-session.ts` 的 `doSend` 为蓝本裁剪）：

```ts
import { z } from 'zod'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { createHostKit, formatStopNote } from '@core/platform/agent-runtime/host/host-kit'
import { getAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { DbAgentSessionStore } from '@core/platform/agent-runtime/memory/session-store'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

// ── ① 业务工具：定义一次，注册一次（幂等）───────────────────────────────
const queryOrders: AgentToolDef<{ limit?: number }> = {
  name: 'query_orders',                    // 裸名；注册时自动加命名空间
  description: '查询当前项目的订单列表',
  inputSchema: z.object({ limit: z.number().int().max(50).optional() }),
  dangerLevel: 'read',                     // read | write | exec | external-post
  async execute(input) {
    return db.orders.list(input.limit ?? 10)   // 成功返裸数据；失败 throw 或 {ok:false,...}
  },
}

export function registerMyBizTools(registry = getAgentLoopHarness().registry) {
  registry.register(queryOrders, { packId: 'mybiz' })   // → pack:mybiz:query_orders
}

// ── ② 每轮：业务 busy 互斥 + kit 跑轮 ───────────────────────────────────
export async function runAgentTurn(goal: string, projectId: string, signal: AbortSignal) {
  const harness = getAgentLoopHarness()
  const kit = createHostKit<{ input: string; projectId: string }>(
    {
      definitionId: 'mybiz-agent',
      scopeKey: (t) => `mybiz:${t.projectId}`,      // 轨迹/运行/恢复的租户内唯一键
      tools: () => harness.registry.buildToolDefs([{ tool: 'pack:mybiz:query_orders' }]),
      resolveModel: (o) => harness.resolveModel({ providerConfigId: o?.providerConfigId, modelId: o?.modelId }),
      systemPrompt: () => '你是订单助理……',
      snapshot: () => buildMyBizSnapshot(projectId), // 当轮现状（数据库确证事实），可省
      maxSteps: 12,
      memory: { scope: { bizModule: 'mybiz', projectId } },  // 记忆 scope，见 §5.3
      onStream: (_t, e) => {
        if (e.kind === 'delta') myChannel.emit(projectId, { type: 'delta', text: e.text })
        // tool-start / tool-end / step 同理——映射到你的 IPC 通道
      },
      runtimeContext: () => ({ projectId }),
    },
    {
      trajectoryPort: harness.trajectoryRepo ?? null,  // 轨迹落库（工作台时间线数据源）
      sessionStore: mySessionStore(),                  // 会话续聊；业务表权威则改用 seededHistory
      flywheel: safeFlywheel(),                        // 可选；不传/null=无飞轮召回（装配自动降级）
    },
  )
  return kit.runTurn({ input: goal, projectId }, { signal })
}

// 会话存储与飞轮的获取形态（照抄 room-session.ts:89-107）：
//   懒建 DbAgentSessionStore（失败返回 null = 观测面降级，不炸业务）；
//   飞轮 getMemoryFlywheel() try/catch 包裹（子系统未装配时 null）。
function mySessionStore() {
  try {
    const db = getCoreDatabaseManager()
    return db.dataSource ? new DbAgentSessionStore({ dataSource: db.dataSource }) : null
  } catch { return null }
}
```

完事。模型现在能多步调用 `query_orders` 自主完成任务，全程在工作台
（/agent-console）有时间线、可停止；崩溃后可按 §5.4 续跑。

**stopReason 终态分流**（抄 room-session 即可）：

```ts
if (r.stopReason === 'max_steps' || r.stopReason === 'stagnant') content += formatStopNote(r.stopReason)
else if (r.stopReason === 'aborted')  content += formatStopNote('aborted')
else if (r.stopReason === 'error')    content = content || formatStopNote('error', r.error)
```

## 3. 接口速查表

| 你要做什么 | 调什么 | 出处 |
|---|---|---|
| 拿注册表/模型句柄 | `getAgentLoopHarness()` → `{registry, resolveModel, trajectoryRepo?}` | workflow/nodes/agent-loop-node.ts |
| 注册业务工具 | `registry.register(def, { packId: 'mybiz' })` | tools/registry.ts |
| 装配白名单 | `registry.buildToolDefs([{tool: 'pack:mybiz:x'}, …])`（全名/裸名均可；`{maxCalls}` 可频控） | 同上 |
| **跑一轮** | `createHostKit(config, deps).runTurn(turn, {signal})` | host/host-kit.ts |
| 崩溃续跑 | `kit.resumeTurn(baseTurn, {instruction?, signal?})` | 同上（47 号） |
| 查中断轮 | `getWorkflowSubsystem().agentTrajectories.listRecoverable({scopePrefix, limit})` | database/repositories/agent-trajectory.repository.ts |
| 结构化知识提供方 | `registerStructuredProvider(p)` | memory/structured-provider.ts |
| 工作台停止/在途 | `getAgentRunRegistry()`（kit 自动对接，一般不直调） | runtime/run-registry.ts |

**HostKitTurnResult**：`AgentResult`（`stopReason: final|max_steps|stagnant|aborted|human_rejected|error`、`output`、`usage`、`iterations`）+ `memoryLines`（本轮注入的记忆行）+ `systemPrompt`（最终提示词快照）。

## 4. 责任边界

**平台内置（你不写）**：工具执行管线（zod 校验/单工具超时/结果截断/审批短路）、
上下文守恒压缩（用户原话永不折叠）、记忆装配与留痕、轨迹落库+turn_start、
流级重试/空闲看门狗/超窗紧急压缩、RunRegistry 登记、get_tool_result 回查、
按配置注入 spawn_subagent、悬空工具调用哨兵修复。

**业务自责（平台不背）**：

1. **轮次生命周期**：入口 handler、busy 互斥（同会话并发会撞轨迹 seq——用
   `Map<key, AbortController>` 守住）、用户消息落业务表；
2. **差异面配置**：scopeKey 唯一性、工具白名单、systemPrompt/snapshot、maxSteps、
   历史形态（`seededHistory` 业务权威 **或** `sessionStore` 续聊，二选一）；
3. **流事件转译**：onStream → 你的 IPC 通道，通道命名与 UI 协议归你；
4. **UI 接线四件套**：handler / preload / channel-map / 前端；
5. **恢复语义**：什么时候问「继续吗」、恢复块拼什么（数据由 listRecoverable 给）；
6. **任务语义**：计划/进度/验收标准——工具或提示词承载，不进平台。

**红线**：不直接 import LoopRunner/SessionStore/ContextManager 自拼循环；不直查
agent_sessions 表结构（走 port）；写/执行类工具必须有 `requiresApproval` 且配审批桥
（§5.5），否则模型永远调不成。关闭 kit 内置能力（如 `memory: null`）须在 36 号文档
登记理由。

## 5. 专题

### 5.1 业务工具

```ts
{
  name: 'query_orders',              // /^[a-z][a-z0-9_]{2,48}$/；注册后变 pack:mybiz:query_orders
  description: '…',                  // 模型据此决定何时调用——写清「何时用/返回什么」
  inputSchema: z.object({...}),      // 校验失败自动回填模型自纠，不会炸轮
  dangerLevel: 'read',               // exec/external-post 默认取严需审批
  requiresApproval?: true,           // 显式审批位；approvalCard: {title, summary(i), editable?}
  executeTimeoutMs?: 300_000,        // 缺省 120s；长等待工具必须调大
  async execute(input, ctx) {…},     // ctx: {scopeId, signal?, logContext, toolCallId?, credentialId?}
}
```

**返回约定**：成功返裸数据（registry 统一包装 `{ok:true,data}`）；失败 **throw**
或返回 `{ok:false, error}`（两者都被识别为失败，错误文本是模型自纠错的依据，写清楚）。
结果 >16KB 自动截断并给模型 `totalBytes`+回查指引；大二进制结果建议走
`deps.artifacts` 归档 + `get_tool_result` 分页回查。线上名兼容自动处理
（`pack:` 冒号名折叠为 API 合法名，轨迹/审计仍见规范名）。

### 5.2 流事件映射

`onStream(turn, event)` 事件：`{kind:'delta',text}` / `{kind:'tool-start',toolName,toolCallId,args}`
/ `{kind:'tool-end',…,ok}` / `{kind:'step',stepNumber}`。中间步文本与最终回答同流，
用 step 事件区分步边界；UI 想要「工具徽章/过程时间线」就转译这些事件（聊天宿主
system-agent.service.ts 是完整参照）。

### 5.3 记忆配置

```ts
memory: {
  scope: { bizModule: 'mybiz', projectId } /* 或 (turn)=>… 每轮不同 */,
  recallText: (t) => `${t.input}…`,   // 召回语料，缺省 turn.input
  systemLine: '…',                    // L0 提示行，可省
}
```

留什么记忆给召回是知识飞轮的事（任务蒸馏自动沉淀）；`memory: null` 整体关闭
（须登记）。结构化知识（图谱等）走 `registerStructuredProvider`，scope 匹配自动进装配。

### 5.4 崩溃恢复对接（人工触发，平台不做自动续跑）

```ts
// 进页面/发消息时：
const broken = await subsystem.agentTrajectories.listRecoverable({ scopePrefix: 'mybiz:' })
if (broken.length) ui.showContinueButton(broken)     // ①可发现

// 用户点「继续」：
await kit.resumeTurn({ input: lastGoal, projectId }, {
  instruction: `任务恢复块：计划=…；已完成=…；草稿/现状=…`,   // ②业务拼恢复块
})
```

缺省指令已要求模型「先核实再续做、不重复不臆造」；恢复块把任务语义带回去。
resumeTurn 会开新 runId + 新 turn_start，工作台时间线呈现为新一轮。

### 5.5 审批桥

工具标了 `requiresApproval`（或 dangerLevel exec/external-post），执行时平台回调：

```ts
requestApproval: async (tool, input, call) => ({ action: 'approve', values: {} })  // | {action:'reject',…}
```

形态参考 EP 的 `ep_confirm_choice`（挂起→前端候选卡→决策→续跑）。不配桥=这类工具
一律被拒（安全缺省）。**聊天宿主当前白名单只含免审批工具**——写/执行类进聊天
等「聊天审批卡」立项（见 47 号文档 §边界与 28 号 §7）。

## 6. 复杂任务的三条形态（选型）

| 形态 | 用法 | 适用 |
|---|---|---|
| 轮式 loop | 本文 §2，maxSteps 放开 | 单会话内多步自主任务（研讨室长任务模式） |
| 任务树 | 白名单加 `create_task_plan`，模型自建树 | 长程规划型：平台执行器负责调度/验收/重规划/崩溃对账，业务零代码 |
| 工作流 | 白名单加 `run_workflow`/`get_workflow_run` | 确定性流程；agent 只发起+查结果 |
| 子代理 | config.subagent 配置 | 主任务内的可隔离委派（深度恒 1、并发 4、一次性） |

## 7. 常见坑（前人踩过的）

1. **busy 互斥漏做**：同 scopeKey 并发两轮会撞轨迹 seq（orIgnore 静默丢行）。每会话一个 AbortController，跑完 `finally` 清理。
2. **ALS 丢失**：异步回调/timer 里丢用户上下文 → 轨迹/存储租户错位。入口同步捕获 userId，回调体用 `runWithUserAsync` 包裹。
3. **长等待工具超时**：缺省 120s；轮询型工具（如 run_workflow 等终态）必须 `executeTimeoutMs` 调大。
4. **历史形态选错**：业务表是 UI 权威（LW/EP 形态）用 `seededHistory`（保存用户消息**之前**取好）；没有业务表的用 `sessionStore`（读时自动清洗悬空调用）。两者别混。
5. **白名单是快照**：`buildToolDefs` 在 run 启动时快照，运行中注册不影响在途轮。
6. **测试 ABI**：跑 vitest 前后要与 Electron 运行时互换 better-sqlite3 ABI（`npm rebuild better-sqlite3` ↔ `npm run rebuild:electron`），每期收尾必翻回。
7. **合并后**：`npm install` + `rebuild:electron`，别用旧二进制启动真机。

## 8. 文档地图

| 场景 | 查哪里 |
|---|---|
| 怎么接入（本文） | docs/development/agent-integration-guide.md |
| 接口契约条目/变更纪律（只加不改、双读期） | tasks/…/23-interface-contracts.md（§1 门面为存量，跳过） |
| HostKit 默认能力与关闭登记 | tasks/…/36-host-kit-contract.md |
| 崩溃恢复/恢复能力面 | tasks/…/47-crash-recovery.md |
| 聊天宿主完整范例（互斥/频控/steer） | packs/chat/services/system-agent/system-agent.service.ts |
| 最简宿主范例 | packs/longwriting/story-room/room-session.ts `doSend` |
| 工具范例（审批卡/超时） | workflow/tools/local-capability-tools.ts、episode-production/agent/ep-agent-tools.ts |
