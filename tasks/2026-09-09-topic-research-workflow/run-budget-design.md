# 「运行级总预算」设计（工作流总工具调用预算）

日期：2026-09-09
分支：feat/domain-learning
文档目录：tasks/2026-09-09-topic-research-workflow/run-budget-design.md
背景：用户立项（"应该设置工作流的总预算，而不是工具的预算，每轮迭代抓取到的数据量大小不一样，为每轮设置一样的预算不合理"）。面向「主题深度研究」的 until 研究轮循环：每轮等额 16 次工具调用每轮都用尽、各轮数据量不均——需要**运行级总预算 + 跨轮共享、按需分配**。

---

## 1. 现状与证据（已核实）

- 运行级设置：`src/core/platform/workflow/engine/execution-settings.ts` 的 `resolveExecutionSettings(definitionSettings)` 把 **definition.settings 覆盖默认值并封顶到 WORKFLOW_LIMITS**。现有字段：maxDurationMs / maxLoopIterations / maxOutputChars / maxRetryCount / maxParallelNodes / maxNodeRuns / multiTurn（:23-32,44-61）。**没有工具调用类预算**。
- 工具调用预算目前是 **agent-loop 节点级**：`agent-loop-node.ts` 的 `assembleTools(registry, toolWhitelist, maxToolCalls, initialUsed)`（:154-184）给每次**节点执行**（=每轮）包装 `{used,max}`，`used >= max` 时返回 `LIMIT_EXCEEDED` 提示模型"直接给出最终答案"（:170-180）。**每轮重置**（until 循环每轮重新执行 r1 节点 → 每轮都是满额 16 次）。
- 节点上下文 `WorkflowNodeContext`（`engine/node-handler.ts`）：有 runId/runKey/nodeId/iterationIndex/config/startInputs/signal/logger/emitProgress/resolveTemplate/getVariable 等，**没有运行级设置，也没有"运行级共享计数器"**。
- `buildContext`（`workflow-engine.service.ts:2473-2532`）由引擎统一构造——是注入预算句柄的天然位置。
- 快照/回放：`RunExecution` 序列化（engine :496-511 附近：variables/llmHistory/runCounts/scopes/loopDrivers/reexecNodeIds）在 `journal-replay.ts` 快照恢复路径重建。运行级预算要跨挂起/崩溃，必须纳入这里。

## 2. 设计

### 2.1 配置面
- 新增运行级设置字段：**`maxTotalToolCalls?: number`**（可选；**0/缺省 = 不启用总预算**，完全向后兼容）。
  - 解析：`clamp(s.maxTotalToolCalls, 0, WORKFLOW_LIMITS.maxTotalToolCalls)`，新增 `WORKFLOW_LIMITS.maxTotalToolCalls = 10000`（硬上限兜底）。
  - 注入面：创建/编辑一次**内置模板 JSON 的 `settings` 字段**（如 `"settings": {"maxTotalToolCalls": 120}`）；教程与编辑器运行设置面板若存在则同步有该输入（实现时确认 Editor 的运行设置 UI，无则先支持模板 settings 与 run API setting）。
- 语义：**只统计 agent-loop 的工具调用**（研究工作负载核心）；llm-chat 等节点不消耗。每次工具调用尝试（含失败/重试/审批后放行）记 1。

### 2.2 运行级共享计数器（引擎）
- `RunExecution` 新增只读字段：`readonly toolBudget: { max: number; used: number }`，启动时由 `exec.settings.maxTotalToolCalls` 初始化（`used=0`）。
- `WorkflowNodeContext` 增加可选句柄 `toolBudget?: { max: number; used: number; remaining: number; tryConsume(): boolean }`，由 `buildContext` 注入（无总预算时为 undefined，节点零感知）。
- 计数规则：
  1. agent-loop 每轮节点执行时，若 `ctx.toolBudget` 存在且 `tryConsume()` 为 false → 工具调用包装层返回 `LIMIT_EXCEEDED`（复用节点级同款文案，注明"**运行级**总工具调用预算已用尽，请直接给出最终答案"）。
  2. 节点级 `maxToolCalls` 语义保留为**单轮/单节点护栏**（两者取先到者：先扣运行级剩余，若节点级也设了则再按节点级扣——简化为"调用前先过了运行级 tryConsume，再走节点级包装"）。
  3. 累计跨轮：预算对象活在 `exec` 上，until 循环每轮 r1 重执行仍共享同一 `used`——第 N 轮可用量 = min(节点级, 运行级剩余)。
  4. 挂起/恢复（同进程）：`exec.toolBudget` 不变，续驱继续从同一计数器扣（对齐现有 `initialUsed` 语义，二者叠加正确）。

### 2.3 剩余预算对模型可见（可选，建议默认开）
- agent-loop 驱动循环在拼 task/systemPrompt 时追加一行：「⚠️ 运行级总工具调用预算剩余 N 次（本轮还受节点级上限约束），请按剩余量分配检索/抓取策略。」——让模型"前紧后松"地按需分配，而不是每轮无差别用满。

### 2.4 崩溃回放/快照
- 序列化：engine 快照对象增加 `toolBudget: { max, used }`（若 max>0）；`journal-replay.ts` 快照恢复路径重建 exec.toolBudget。
- 说明：崩溃-重启以最近快照为准（used 可能与真实消费有几秒误差，可接受，预算为粗粒度护栏）。

### 2.5 校验
- `resolveExecutionSettings` 层负责 clamp；负数/NaN/超上限 → 回落 0（不启用）或上限。不校验图（运行级字段与图节点无关）。

## 3. 改动面清单

| 位置 | 改动 |
|---|---|
| `src/shared/types/workflow.types.ts` | `WorkflowExecutionSettings` + `maxTotalToolCalls?`；`WORKFLOW_LIMITS` + `maxTotalToolCalls: 10000`；`ResolvedExecutionSettings`（若在本文件）或 execution-settings 内联类型 |
| `src/core/platform/workflow/engine/execution-settings.ts` | `ResolvedExecutionSettings.maxTotalToolCalls`；resolve 里 clamp |
| `src/core/platform/workflow/engine/workflow-engine.service.ts` | `RunExecution.toolBudget` 初始化；快照序列化 +toolBudget；`buildContext` 注入 `ctx.toolBudget`（含 tryConsume） |
| `src/core/platform/workflow/engine/node-handler.ts` | `WorkflowNodeContext.toolBudget?` 类型 |
| `src/core/platform/workflow/nodes/agent-loop-node.ts` | `assembleTools` 支持运行级预算包装（tryConsume 优先，LIMIT_EXCEEDED 文案区分运行级/节点级）；driveLoop 组装 task 时追加剩余预算提示 |
| `src/core/platform/workflow/engine/journal-replay.ts` | 快照恢复重建 exec.toolBudget |
| `src/core/database/migrations/builtin-apps/topic-research.json` | `settings: { maxTotalToolCalls: 120 }`（运行 8 轮、每轮可用 ≤min(节点级,剩余)） |
| 编辑器 | 工作流运行设置 UI 若已存在则补该字段（实现时确认；后端 settings 已透传即够跑） |
| spec | agent-loop 运行级预算单测；until+运行级累计；挂起恢复；快照回放恢复；非法/超上限回落；模板 graph spec 断言 settings |

## 4. 测试与验收

### 自动化（TDD）
1. `agent-loop` 级：单次节点执行，`settings.maxTotalToolCalls=2` → 第 3 次工具调用返回 LIMIT_EXCEEDED（运行级文案）；节点级与运行级取先到者。
2. 跨轮累计：until 循环跑 2 轮，总预算 3 → 两轮合计最多 3 次工具调用（第 2 轮可用量缩水），循环照常收尾（模型直接作答）。
3. 挂起恢复：body 内 waiting_review → 恢复后续跑，used 继续累计。
4. 快照回放：挂起强快照 → 重建 exec.toolBudget 后恢复，计数保持。
5. 解析：缺省/0/负数/NaN → 不启用；>10000 封顶 10000。
6. 既有回归：loop/agent-loop/engine 快照 spec 全绿；`builtin-app-templates` 过 validateGraph（settings 不是图字段，无影响）；node-registry-consistency 无变化。

### 真机
- 「主题深度研究」settings=120：跑到第 8 轮（或提前 pass），**每轮不再整齐触 16 次天花板**，总工具调用 ≤120；研究员 notes 出现"剩余预算"提示且越到后轮越紧。

## 5. 风险与边界
- 预算只覆盖 agent-loop 工具调用：若未来有别的消耗型来源（image-gen 等已有独立 approval/费用语义），不纳入（文档注明）。
- 崩溃恢复计数以快照为准（秒级误差，可接受）。
- 节点级 maxToolCalls 语义不变 → 存量模板零影响（未设总预算时行为完全一致）。

## 6. 状态
- **设计待用户评审**。通过后按 TDD 实现（顺序：types→settings→engine 计数器+注入→agent-loop 装配→回放→模板 settings→spec 全绿→真机）。