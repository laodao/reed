# 30 · M6 规格与实施计划（长文写作野生 Agent 迁移到 harness）

> 状态：执行中（2026-09-08）
> 上游：02 号 G1-G5 迁移门禁、27 号 §遗留（野生 agent 迁移立项）、12/23 号（宿主/契约）、18 号（业务包）
> 范围裁决：**M6 只迁长文写作**（路线图既定"长文先行"）。EP 迁移登记为 M6.5——其
> `choice:request` 多轮确认 / `nav` 跳转 / 数据源注入与 harness 事件面差异大，需先做
> "候选确认"设计（与聊天审批卡同主题），本期不动 EP 野生 agent（它仍走旧路径工作）。

## 0. 现状与迁移面（侦察结论）

旧协议：`agent-workflow.service.ts` 六步（存用户消息→computeProductionState→agentDecide
（JSON 决策，最多 3 动作）→executeActions→agentSummarize（流式）→存 assistant 消息）。
8 个动作全部 write，执行器 `agent-actions.ts` 的 `executeActions(ctx, actions, state)`
自带：依赖检查（不满足→skipped）、`action:start/done` 富事件（summary{status,message,
changed,data}）、逐动作容错——**工具化后整体复用，零逻辑复制**。

事件面：harness 共享事件契约（stage/action/reply 系列，`shared/types/agent.types.ts`）
当初即按兼容此前端设计；差异点与处置见 §3。

## 1. 架构

**宿主直驱 LoopRunner（聊天宿主模式）**，不走 AgentRuntimeImpl 门面（生产装配点未接线，
且需要逐事件定制以保旧前端零改动）：

```
longwriting:agent:send ──► LwAgentHarnessService.sendMessage(projectId, message, opts)
                             ├─ busyProjects 互斥（沿用旧语义）
                             ├─ 存用户消息（lw_design_messages，UI 历史源不变）
                             ├─ 工具 defs = buildLwAgentToolDefs(deps)（8 动作包装
                             │   executeActions 单动作调用；共享 3 次/轮计数器）
                             ├─ host.loadState = initState + lw_design_messages
                             │   最近 20 条映射注入（多轮记忆仍以 lw 表为权威源）
                             ├─ host.saveState = DbAgentSessionStore 持久化
                             │   （scopeKey=lw-agent:<projectId>，工作台可见；不回读）
                             ├─ host.emitTrajectory = TrajectorySink（同 scopeKey，
                             │   turn_start 轮次标记——工作台时间线切轮次）
                             ├─ host.emitStream = 旧事件映射（§3）
                             └─ LoopRunner.run → 终态后存 assistant 消息
                                 （metadata{actions,suggestions}）+ reply:done
```

工具不经全局 AgentToolRegistry 注册（boot 顺序：pack activate 早于 workflow-boot，
拿不到 registry 实例）——本地 defs，loop 自带 zod 校验/超时；审计与全局目录接入
登记为后续统一项。

## 2. 动作→工具映射（8 个，全部 write）

| 工具 | zod 参数 | executeTimeoutMs |
|------|----------|------------------|
| generate_overview | input:string 必填 | 300s |
| generate_characters | requirements?:string | 300s |
| generate_world | —（四子步内部容错） | 600s |
| generate_plots | — | 300s |
| generate_outline | structureLevel?:1\|2\|3 | 600s |
| write_chapter | outlineId?/targetWords?/style?/extraPrompt? | 900s（图谱流水线长耗时） |
| update_entity | type:enum(8)/id?/name?/patch:record | 120s |
| delete_entity | type:enum(8)/id?/name? | 120s |

每工具 execute = `executeActions(ctx, [{type, params}], state)` → summaries[0] →
`{ok: status==='ok', summary}`（skipped/error 语义原样保留）。共享计数器 3 次/轮
（对齐旧 `AGENT_MAX_ACTIONS_PER_TURN`），超限返回 skipped 摘要。

## 3. 事件面等价（旧前端零改动的关键）

| harness 时机 | 发出的旧事件 |
|--------------|--------------|
| onTrajectory decision（每步起点） | `stage:deciding` + `reply:start{summaryEventId}`（新 id，流式气泡重置） |
| executeActions 内部（原样保留） | `action:start{actionType,label}` / `action:done{summary}`（富 summary：message/changed/data） |
| emitStream delta | `longwriting:generate:${summaryEventId}` 的 `{type:'content',content}`（前端既有订阅点）+ 主通道 `reply:content` |
| 工具 phase（tool-start/end） | 不映射（executeActions 已发 action 事件，避免重复） |
| 终态 final/max_steps/stagnant | 存 assistant 消息 + `reply:done{suggestions}`（buildSuggestions(newState)） |
| error/aborted | `error{error}`（前端错误态，对齐旧取消行为） |

`state` 快照：`task.snapshot = stateToSummary(computeProductionState(...))`（agent-context/
agent-deps 既有函数）。取消：AbortController per project + `ai.cancelAllForProject`
（eventId 含 `-${projectId}-` 约定不变，工具内 makeEventId 原样）。

## 4. 切换开关（G5）

`longwriting:agent:send` 按 `isLwHarnessEnabled()`（env `LW_AGENT_HARNESS`，缺省开，
`'0'` 回退旧服务）分流；旧 `AgentWorkflowService` 保留一个版本周期作回滚通道。
history/state 通道不分流（读写 lw_design_messages，两态共用）。

## 5. 门禁映射（G1-G5）

- G1 单测：MockLanguageModelV3 驱动真实 LoopRunner + 假 ai/假仓库——概要生成落库、
  依赖 skipped、每轮 3 次上限、历史多轮注入、事件序列（stage→action:start→done→
  reply:start→done）、取消。
- G2 冒烟：scripts/p7-lw-agent-smoke.ts——真模型决策循环 + 假生成器（快速成功），
  断言动作与事件。
- G3 golden：T1/T2 直接断言 `AgentActionSummary` 形状（status/message/changed）与旧
  协议契约一致（即等价性回归）。
- G4 影子：显式裁剪（单进程双跑成本高；以 G1+G3+G2 组合替代，登记）。
- G5 切换：见 §4。

## 6. 显式裁剪（登记）

- EP 迁移 → M6.5（choice:request 确认流 / nav / 数据源注入需先设计"候选确认"机制，
  与聊天审批卡同主题；EP 野生 agent 本期继续工作）。
- lw 工具不进全局 AgentToolRegistry（boot 顺序限制）→ 审计/系统 agent 目录接入后置。
- `longwriting:generate:${eventId}` 游离流（工具内部生成事件，前端不订阅）：无害保留。
- 影子模式（G4）：裁剪见 §5。
