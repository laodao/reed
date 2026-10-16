# EP-1 · EP 工具化 + 宿主 + 事件桥 + 四大能力（M6.5-a，不含 choice）

> 前置：无。产出：`EP_AGENT_HARNESS='1'`（默认开）时 EP agent 走 harness 直驱；
> `'0'` 回退旧三段式。choice 相关全部推迟到 EP-2（本期不注册 ep_confirm_choice，
> 规则型 choice 照旧走文本重入——避免坏中间态，评审 P1-2）。

## 改动文件

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `src/core/platform/episode-production/agent/ep-agent-tools.ts` | 新建 | 9 动作工具（**不含 ep_confirm_choice**）：共享注册形态——def 不捕获项目，execute 从 `ctx.logContext` 读 projectId/episodeId（缺失 throw）；`registerEpAgentTools(registry)` 幂等懒注册（has 跳过，packId='ep-agent'）；EpAgentExecutionContext 复用（ep-agent.types.ts:132） |
| `src/core/platform/episode-production/agent/ep-agent-harness.service.ts` | 新建 | 宿主：sendMessage 直驱 LoopRunner（maxSteps=12）；历史播种（lw_design_messages→ModelMessage）；**四大能力**：ContextManager 接线（Deps 含 contextWindowTokens，compaction 事件桥 ep-agent 通道）、记忆装配 stub（KE-2 就位后接 L1/L2）、任务/工作流规划工具白名单+提示词纪律；emitStream 桥：delta 合批→`longwriting:generate:${eventId}`（评审 P1-1：通道名）；**tool-start/end 不映射 action 事件**（动作内 emit 唯一来源，评审 P1-6）；RunRegistry 注册；busy 互斥；AbortController；懒注册调用 |
| `src/core/platform/episode-production/agent/ep-agent-workflow.service.ts` | 修改 | sendMessage 头部开关分叉（+5 行）；旧路径不动 |
| `src/core/platform/episode-production/agent/ep-agent-actions.ts` | 修改 | update_entity/delete_entity 共用的 getBindingById 补 logContext.projectId 归属校验（评审 P2-4）；其余 executeXxx 不动 |
| `src/core/platform/episode-production/agent/ep-agent.types.ts` | 修改 | 开关读取、maxSteps=12 依据注、maxCalls 常量 |
| `src/core/platform/episode-production/agent/index.ts` | 修改 | 导出（不在 activate 注册工具——boot 时序坑） |
| `src/core/packs/episode-production/handlers/agent.handler.ts` | 修改 | ep:agent:send 开关分叉；cancel 桥 RunRegistry.abortByScope（保留旧 cancel 兜底） |

## 关键实现纪律（评审结论）

1. **每工具调用前重算** computeEpProductionState（P1-5：#49 同轮依赖检查不可回归——EP 旧协议每动作后重算，与 LW 轮首快照不同）。
2. **依赖检查归属**：checkEpActionDependency 逻辑移入工具 execute（或前置包装），数据源名单查询同理。
3. **双发去重**：桥不发 action 事件（工具内 emit 唯一来源）；executeEpActions 包装层的 action:start/done 在工具化路径**不经过**（工具直接调 executeXxx 单动作，不经批量包装层）。
4. runtimeContext：宿主构造 task 时带 `{ projectId, episodeId, providerConfigId, modelId, catalogPacks:['ep-agent'] }`——loop 原样透传进 logContext（loop.ts:394）。

## 测试（单测，零 API 成本）

- 9 工具 schema 校验/未带 projectId 抛错/update·delete 越权拒绝（mock db 断言不跨项目）
- 同轮链式依赖：generate_script 工具执行后 split_scenes 工具的依赖检查通过（重算断言）
- 开关回退：'0' 走旧三段式（spy 断言 LoopRunner 未被构造）
- 事件桥快照：delta 合批→longwriting:generate 通道；无 action:start/done 双发
- MockLanguageModelV3 必须实现 doGenerate（agent-service.spec.ts:635 教训）

## 验收与回滚

- 验收：单测全绿；干跑（真模型纯文本链 generate_script→split_scenes→storyboards）轨迹落库+事件序列正确
- 回滚：`EP_AGENT_HARNESS='0'` 一键回旧协议
