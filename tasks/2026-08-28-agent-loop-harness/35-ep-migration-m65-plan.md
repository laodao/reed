# 35 · EP 剧集制作接线 harness 迁移计划 v2（M6.5，代码级现状与文件清单）

> v2 重写（用户反馈 v1 太简单）：本版基于对 EP agent 全部 7 个源文件（1818 行）的精读，
> 给出：现状架构 → 业务与 harness 的边界 → 接口满足度逐项分析 → **文件级改动清单** → 测试策略。
> 结论先行：**harness 现有接口可完全满足 EP 需要，无需改 harness**；choice 用
> `approve_with_edit`（审批携带所选值，`agent.types.ts:90`）承载，零引擎改动。

## 1. 现状精读（ep-agent 7 文件 1818 行）

### 1.1 运行架构：三段式单步决策，不是 LLM loop

`ep-agent-workflow.service.ts` `sendMessage()`（:196-321）一轮的完整流程：

```
存用户消息(lw_design_messages) → 生产状态快照(computeEpProductionState)
 → 规则型 choice 拦截（正则意图检测 detectChoiceForAssetImage / detectChoiceForDatabase）
 → AI 决策：ai.agentDecide() 一次 JSON 调用（非循环！返回 reply + actions[] + choice?）
 → AI choice 拦截（有 choice 则发事件后直接 return，等用户下一条消息）
 → 顺序执行动作 executeEpActions()（一轮最多 EP_AGENT_MAX_ACTIONS_PER_TURN 个）
 → AI 总结：ai.agentSummarize() 流式（正文走 ep-agent:generate:${summaryEventId} 独立通道）
 → 存 assistant 消息 + reply:done 事件
```

关键事实：
- **单步决策**：一次 LLM 调用决定全部动作，无多轮工具循环、无执行后自纠。动作失败只能等下一轮用户消息。
- **choice 是无状态的**：没有挂起状态机。choice 发出后本轮结束；用户回应后**整体重走** sendMessage（规则型靠正则重新匹配、AI 型靠重新决策）。选择状态藏在 assistant 消息的 metadata JSON 里，仅作文案回显。
- **AI 底层复用长文**：`LongWritingAIService.agentDecide / agentSummarize / cancelGeneration`（长文 AI 服务是双模块共用的）。
- **对话历史复用长文表**：`lw_design_messages`，conversationId=`ep-agent:${episodeId}`。
- **事件协议**（前端依赖面）：`ep-agent:${projectId}:${episodeId}` 通道，事件 `stage / action:start / action:done / reply:start / reply:content / reply:done / error / choice:request`；流式正文走 `ep-agent:generate:${summaryEventId}`。
- 前端三件：`useEpAgentChat.ts`（composable：订阅事件+发送）、`EpisodeAgentStudio.vue`、`EpAgentPanel.vue`（choice 卡片渲染与点击）。
- handler 入口：`packs/episode-production/handlers/agent.handler.ts`（ep:agent:send/history/state/cancel 四通道，:24/:34/:42/:50）。

### 1.2 动作清单与成本面（ep-agent-actions.ts，9 个 executeXxx）

| 动作 | 成本/危险面 | 现有防护 |
| --- | --- | --- |
| generate_script / split_scenes / generate_storyboards | 文本 LLM | 无审批；金额小 |
| generate_char/location/item_asset | **图像/语音/视频生成，真金白银** | 无审批、无次数上限（仅一轮动作数上限） |
| update_entity | 数据写 | 无 |
| delete_entity | 数据删除 | 无（登记项：projectId 绑定缺失同长文） |
| query_database | 外部数据源 | SQL guard 已有 + 数据源 choice |

## 2. 业务与 harness 的边界（迁移的切分线）

| 归属 | 内容 | 迁移后去向 |
| --- | --- | --- |
| **EP 业务域（保留在 EP，harness 不碰）** | 9 个动作的执行器（executeXxx：生产状态/落库/资产生成调用）、生产状态计算 computeEpProductionState、决策/总结上下文构造（ep-agent-context）、建议生成 buildEpSuggestions、事件通道定义、剧集数据模型 | 原样复用——工具闭包捕获的 ctx 正是现在 executeEpActions 的 ctx（`{projectId, episodeId, providerConfigId, modelId, db, ai, emit}`） |
| **平台能力（harness 接管）** | LLM 多轮循环、工具 schema 校验/截断/审计、轨迹落库、会话存储、审批挂起/恢复、运行注册表、maxSteps/停滞护栏、abort | LoopRunner + AgentToolRegistry + TrajectorySink + DbAgentSessionStore + ApprovalCoordinator + RunRegistry（全部现成，零引擎改动） |
| **桥接层（新写，EP 特有）** | emitStream → ep-agent 事件通道转换；生产状态快照进系统提示词；规则型 choice 保留为发送前拦截 | 新宿主服务 |

## 3. 接口满足度逐项分析（harness 现有接口 vs EP 需要）

| EP 需要 | harness 接口 | 满足度 | 说明 |
| --- | --- | --- | --- |
| 多轮决策与自纠 | LoopRunner 单步循环（ai@6 streamText） | ✅ 升级 | 语义变化点：单步决策→多轮循环。现"一轮批量动作"= loop 一步内并行 tool-calls（ai@6 单步内并行执行），行为兼容且多了执行后继续决策的能力 |
| 动作执行与校验 | AgentToolRegistry 管线（zod/截断/审计/maxCalls） | ✅ | executeXxx 原样复用为工具闭包；M6 长文同款已验证 |
| 生产状态进上下文 | loop 的 system + initState 播种 | ✅ | 快照序列化进系统提示词（长文 computeProductionState 同款） |
| 对话历史 | initState 播种 ModelMessage[] | ✅ | 从 lw_design_messages 取最近 N 条映射（长文 :155-162 同款） |
| 流式回复 | host.emitStream delta + 宿主 30ms 合批 | ✅ | 桥接到 `ep-agent:generate:${summaryEventId}` 通道，前端订阅不变 |
| action 进度事件 | emitStream tool-start/tool-end | ✅ | 桥接为 `action:start/action:done`（summary 文案由工具闭包内现有 emit 继续——双通道并存期不冲突） |
| **choice 多轮确认** | requestApproval + `ApprovalDecision` | ✅ **零引擎改动** | 合成工具 `ep_confirm_choice`（requiresApproval）；选项清单=工具入参；用户所选值经 **`approve_with_edit` 的 input 字段**回填（`agent.types.ts:90`，编辑后过 zod 重校验）；前端可用 `PendingApproval.availableDecisions` 渲染选项按钮（`agent.types.ts:99`）。语义升级：无状态重走 → 真挂起（loop 内 state.suspended + 恢复注记，`loop.ts:510` 自带"挂起恢复"提示注入） |
| 资产生成成本闸门 | registry maxCalls（快照内频控） | ✅ | 资产生成类 maxCalls=测试期 1；较 v1（无上限）是收紧 |
| 会话/轨迹落库 | TrajectorySink + DbAgentSessionStore | ✅ | sessionKey=`ep-agent:${projectId}:${episodeId}`；console 检查器可查（列表已过滤为 chat，不占位） |
| 中断 | RunRegistry + abortByScope | ✅ | ep:agent:cancel 桥到 runRegistry.abort（现走 LongWritingAIService.cancelGeneration 只能停流式） |
| 模型解析 | harness.resolveModel({providerConfigId, modelId}) | ✅ | 共享 harness 提供（lw-agent-harness.service.ts:255 同款） |
| 回退 | env 开关 | ✅ | EP_AGENT_HARNESS='0' 走现有三段式（旧代码原样保留） |

**结论：无接口缺口。** 唯一的语义变化（单步→多轮）是能力升级而非功能缺失；唯一的工程量在桥接层与工具化包装。

## 4. 文件级改动清单（全部）

### 新建（2 个文件）

| 文件 | 内容 |
| --- | --- |
| `src/core/platform/episode-production/agent/ep-agent-tools.ts`（新，约 300 行） | 9 动作 + ep_confirm_choice 共 10 个 `AgentToolDef`：zod schema 从现 action params 平移；execute 闭包捕获 `{projectId, episodeId, providerConfigId, modelId, db, ai, emit}` 复用 executeXxx；dangerLevel 全部 'write'（沿长文 M6 先例，lw-agent-tools.ts:72-170）+ maxCalls 频控（资产生成类 1、文本类 3）；ep_confirm_choice requiresApproval=true；`buildEpAgentToolDefs(ctx)` 导出 |
| `src/core/platform/episode-production/agent/ep-agent-harness.service.ts`（新，约 400 行） | 宿主服务（对照 lw-agent-harness.service.ts 形态）：`isEpAgentHarnessEnabled()` 开关读取；`sendMessage()` 直驱 LoopRunner——历史播种/生产状态进 system/registry 组装/host.emitStream→ep-agent 事件桥（delta 合批→generate 通道；tool-start/end→action:start/done）/轨迹 TrajectorySink/DbAgentSessionStore/RunRegistry 注册/busy 互斥/AbortController；choice 审批事件桥（pending 时发 choice:request） |

### 修改（6 个文件）

| 文件 | 改动 |
| --- | --- |
| `src/core/platform/episode-production/agent/ep-agent-workflow.service.ts` | `sendMessage` 头部加开关分叉：`if (isEpAgentHarnessEnabled()) return epAgentHarness.sendMessage(...)`；旧三段式代码**一行不动**（回退路径）。约 +5 行 |
| `src/core/platform/episode-production/agent/ep-agent-actions.ts` | executeXxx 函数体**全部不动**；仅 3 处加固：delete_entity 补 projectId 强绑定（删除前校验实体归属，同长文登记教训）；抽出 `EpActionCtx` 类型导出供 tools 引用；query_database 的 emit 调用改为可选注入（工具化后 action:start 由 registry 管线发，避免双发）。约 +30/-10 行 |
| `src/core/platform/episode-production/agent/ep-agent.types.ts` | +`EP_AGENT_HARNESS` 开关读取函数、maxSteps（12，与全局一致）、各类 maxCalls 常量、轨迹 scopeKey 约定。约 +20 行 |
| `src/core/platform/episode-production/agent/index.ts` | 导出新宿主与开关。+2 行 |
| `src/core/packs/episode-production/handlers/agent.handler.ts` | `ep:agent:send` 加开关分叉（长文 handler 同款，longwriting.handler.ts:3283 先例）；cancel 桥 runRegistry（保留旧 cancelGeneration 兜底）。约 +15 行 |
| `src/renderer/src/components/episode-production/agent/EpAgentPanel.vue` + `composables/useEpAgentChat.ts` | choice 卡点击行为：从"把选择当新消息发送"改为"调审批 decide（approve_with_edit 携带所选值）"；无 choice 时交互不变。约 +40/-20 行 |

### 不动（明确列出，防误伤）

- 前端事件订阅协议（通道名/事件名）——桥接层保持原协议，`EpisodeAgentStudio.vue` 与 `useEpAgentChat.ts` 的事件处理零改动
- `lw_design_messages` 历史读写（UI 聊天记录源不变）
- `LongWritingAIService`（仍被决策降级/旧路径使用；新宿主直接 resolveModel 不经它）
- `agent-console.handler.ts`——列表已过滤 chat，EP 会话不进列表；轨迹查询天然按 scopeKey 可查，无需改 parseConversation

## 5. 测试策略（一次性跑通，成本红线）

1. **单测（零 API 成本，先行）**：10 工具 schema 校验、projectId 越权拒绝、choice 审批映射（approve_with_edit 回填→execute 断言）、开关回退（'0' 走旧路径）、emitStream→事件桥快照断言。mock 模型（MockLanguageModelV3 需 doGenerate，33 号教训）。
2. **干跑（近零成本）**：真模型但只跑纯文本链（generate_script→split_scenes→storyboards），tokenplan 便宜文本模型；断言轨迹落库+事件序列。
3. **全链路一次跑通**：最小 EP 项目，动作链=剧本→分镜→1 角色图→1 段台词→1 视频镜头：
   - 文本：tokenplan 便宜文本模型；图像：tokenplan `wan2.7-image` 低分辨率；语音：tokenplan `qwen-audio-3.0-tts-plus`（≤50 字）；视频：「阿里百炼平台」`wan3.0-video` 最短时长最低分辨率，**仅 1 次**（测试前确认该提供商已配置此模型，未配先加）
   - 通过标准：状态机走完+产物落库+轨迹完整；**不评判质量不重跑**；失败只登记证据，修复后单点重跑失败段
   - 成本红线：视频 1 次、图像 ≤2、语音 ≤1；测试脚本与断言清单先写好后一次执行

## 6. 分期与风险

| 期 | 内容 | 退出条件 |
| --- | --- | --- |
| M6.5-a | 工具化 + 宿主 + 事件桥 + 开关 | 单测全绿；干跑通过 |
| M6.5-b | choice→审批映射 + 前端点击改造 | 单测全绿；带 choice 干跑通过 |
| M6.5-c | 资产生成全链路一次实测 | §5.3 通过并留证 |

风险：
- choice 审批卡与 EP 面板现有交互冲突 → 回退开关保通路，UI 适配单独处理
- wan3.0-video 参数档位以实际 API 为准，干跑前先查模板参数定义，避免试错调用
- 双通道并存期（action:start 来自 registry 管线 + 工具内 emit）→ §4 已列去重处理（emit 可选注入）
- 语义变化（单步→多轮）可能暴露既有 prompt 在多轮下的行为差异 → 干跑阶段对比新旧决策质量，仅记录不调优
