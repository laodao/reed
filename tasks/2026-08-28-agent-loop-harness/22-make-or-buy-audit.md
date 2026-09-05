# 22 · 自研/开源逐模块审计（Make-or-Buy Audit）

> Agent Loop Harness ｜ 2026-09-06 ｜ 状态：**已定稿（本文修订 21 号决策一的依赖面）**
> 方法：逐模块对照本系统需求清单 → 深读候选开源源码（非 README）→ 架构融合度评估。
> 本轮深读对象：open-harness@0.7.0 全量核心源（agent.ts 1147 行 / session.ts 567 行 /
> middleware 全部 / 审批包装与双组合 API）+ ai@6 手动循环运行验证。
> 前置：[21-oss-adoption.md](./21-oss-adoption.md)（本文是其决策一的 v2 修订依据）。

---

## 1. 本系统对 harness 的需求清单（评估基准）

| # | 需求 | 来源 |
|---|---|---|
| R1 | **通用**：一套 harness 支撑长文/EP/故事研讨室/聊天/工作流节点的 AI 调用与 agent 能力 | 愿景 |
| R2 | **双宿主**：工作流 agent-loop 节点（挂起=引擎 waiting_review）与独立宿主（聊天式，挂起=提案卡）同一运行时 | 12 号 §5.2/5.3 |
| R3 | **步级崩溃恢复**：每轮迭代末 saveState（12 号 §6.3 唯一持久化点）；工作流无人值守 run 依赖它 | 12 号 §6.3/⑦ |
| R4 | **分级审批**：requiresApproval/dangerLevel 决定哪些工具问人；支持"编辑后执行"（提案卡改新值） | 14 号 §6 + 故事研讨室交互 |
| R5 | 多租户 ALS、双端（SQLite/PG）、Electron CJS 产物 | 工程约束 |
| R6 | 事件走自有通道 + 平台事件总线（agent:* 领域事件） | 10 号（已实现） |
| R7 | **架构统一**：单一循环实现、单一工具模型、单一 LLM 调用事实源；不引入第二套组合范式 | 用户约束（本文核心） |

## 2. open-harness 深读发现（本轮新增的代码级事实）

前两轮（调研 v5 + 设计 v2）认可 open-harness 整包采用的结论，经本轮全量源码深读后**需要收缩**。四个决定性事实：

**F1 · Session 持久化是轮级，不是步级**（session.ts send 方法体）：
`sessionStore.save()` 只在**整个 turn（一条用户消息的全部循环）结束后**调用一次；
`step.done` 事件只携带 usage 不携带消息——**步边界处无法从公开 API 重建消息历史**。
→ 不满足 R3（12 号规格的步级 saveState 是工作流宿主无人值守恢复的核心）。

**F2 · approve 是全有或全无，且不能改输入**（agent.ts `wrapToolsWithApproval`）：
构造器传入 `approve` 则**所有工具**都被包装（`this.approve && tools.length > 0 ? wrap... : tools`）；
回调仅返回 `boolean`，拒绝 = `throw ToolDeniedError`。
→ 不满足 R4 的分级审批与"编辑后执行"（这两个必须在工具包装层自研——而且该层
本质上只是 ai@6 `tool()` 的 async execute 里挂一个 Promise，**与 open-harness 无关**）。

**F3 · 两套并行组合 API**：Session（内部直调 `agent.run`，装配 store/compaction/retry）
与 Conversation + runner middleware（`toRunner/apply/withXxx` 装配）。能力重叠（持久化在
两边各有一份：sessionStore vs withPersistence）、心智模型分裂。
→ 违反 R7（引入第二套组合范式，且我们只需要其中一条路径的能力）。

**F4 · Agent 循环本体极薄**（agent.ts run 方法）：核心就是
`streamText({ model, system, messages, tools, stopWhen: stepCountIs(maxSteps) })`
+ 约 150 行 fullStream→事件的 switch 翻译；`prepareStep` 未使用未暴露（护栏钩子要另加）。
→ open-harness 最大的实际价值只剩 **Session 的 compaction 编排 + retry + SessionStore 接口**
（其中压缩策略 `DefaultCompactionStrategy` 是独立类，仅依赖 `ai` 的类型与 `generateText`）。

**ai@6 手动单步循环验证**（本轮 spike，manual-loop.mjs）：
不传 `stopWhen` 时 streamText 恰好执行**一个决策步**；`await r.response.messages`
返回该步产生的完整消息（assistant tool-call 等），拼接进 messages 后自控循环。
3 步循环 + 工具执行 + 步级状态点 + 每步 usage 全部验证通过。
→ **自研手动循环的成本约 150-200 行**（12 号规格的手写 while 设计与 ai@6 单步语义
一一对应），并获得完全的步级状态控制权（R3/R7 双满足）。

## 3. 逐模块决策表（21 个模块）

图例：**[依赖]** npm 依赖引入 ｜ **[vendor]** 摘取源码级模块（MIT，标注出处，随我们演进）
｜ **[自研]** 自行实现 ｜ **[已有]** 存量资产复用

### A. LLM 调用与协议层

| 模块 | 决策 | 依据 |
|---|---|---|
| A1 Provider 解析/密钥/模型 fallback | **[已有+自研]** ai-call.getProviderConfig 为单一事实源；新增 provider-adapter（~100 行：getProviderConfig→createOpenAICompatible→LanguageModel，LRU+更新失效） | 密钥管理/SSRF/fallback 链已有且多业务在用，重造即分叉 |
| A2 tool-calling 协议（序列化/流式增量/role:tool/usage） | **[依赖]** `ai@^6` + `@ai-sdk/openai-compatible`（M2 加 `@ai-sdk/anthropic`、`@ai-sdk/google`） | 13 号修订节；自研十家适配坍缩为包依赖，官方维护协议差异 |
| A3 prompt 降级协议（PromptToolCodec） | **[自研]** ai@6 middleware（wrapLanguageModel）形态 | 13 号 §5.5 设计原样；开源无此件（AI SDK 无 prompt 降级） |

### B. 循环与运行时

| 模块 | 决策 | 依据 |
|---|---|---|
| B1 LLM 循环（Executor） | **[自研]** ai@6 单步 streamText 手动循环（~200 行，12 号 §7.2 伪代码直译）；**不采用 open-harness Agent/Session/Conversation**（F1/F2/F3/F4） | R3 步级状态 + R7 单循环实现；spike 验证单步语义 |
| B2 护栏（maxSteps/tokens/duration/stagnant/三级分层） | **[自研]** 12 号 §9 原设计 | 业务约束强绑定（预算、白名单、危险级别），无通用开源件 |
| B3 瞬时错误重试 | **[自研]**（参考 open-harness retry.ts 87 行的 isRetryable+指数退避+事件形状） | 量小且要与我们的错误分类法（12 号 §6.5）对齐 |
| B4 上下文压缩 | **[vendor]** open-harness `DefaultCompactionStrategy` + pruneToolResults（~150 行，仅依赖 ai 类型）+ 自研触发编排 | 两阶段（先剪枝后摘要）设计正确且解耦；vendor 消化单人维护风险 |
| B5 中断与恢复哨兵 | **[自研]**（借 qm `INTERRUPTED_TOOL_RESULT` 模式 ~20 行） | ai@6 的 abortSignal 链原生可用；哨兵是业务语义 |

### C. 工具系统

| 模块 | 决策 | 依据 |
|---|---|---|
| C1 工具注册表/统一模型（node/tool/oas/pack 四来源） | **[自研]** 14 号规格 | 业务工具+审计+凭据+危险级别深度绑定本项目；deepagentsjs 耦合 LangChain 不可摘 |
| C2 分级审批包装（requiresApproval/dangerLevel/编辑后执行/超时/落库恢复） | **[自研]** registry 层实现（ai@6 tool execute 内挂起） | F2：open-harness approve 粒度不符；本质是 async execute，无需外部件 |
| C3 规划 todos 工具 | **[vendor]** open-harness todos.ts（零依赖，含校验）+ 借 deepagentsjs write_todos 提示词 | M3 用；两件都小而稳 |
| C4 子代理（task 工具/隔离上下文） | **[自研]** M3（参考 open-harness subagents 的 catalog/metadata-store 设计，不引入依赖） | 其实现耦合自家 Agent/Session；届时我们的循环已就位 |
| C5 MCP 接入 | **[依赖]** `@ai-sdk/mcp`（M5；不用 @openharness/mcp） | 与 A2 同生态，避免第二套 MCP 适配 |

### D. 上下文与记忆

| 模块 | 决策 | 依据 |
|---|---|---|
| D1 分层上下文装配（system/快照/摘要/近 N 轮） | **[自研]** 手动循环 send 前组装（等价 onBeforeSend） | "业务快照由库里重建"是本项目特有的一致性模型，无对口开源 |
| D2 会话/状态持久化（SessionStore 形状 + agent_sessions 表 + state_json 桥） | **[自研]**（SessionStore 3 方法接口形状保留，源于 open-harness 但自持） | ALS 多租户 + 双宿主落点（表/列）都是本项目结构 |
| D3 长期记忆/知识飞轮 | **[自研]** 15 号规格 | Mem0/Letta/Zep 已排除（独立服务/图数据库运维/与飞轮闸门模型冲突，见调研 C 节） |
| D4 结构化记忆（图谱融合） | **[自研]** 15 号修订 R2（StructuralMemoryStore，lw graph 为第一实现） | 业务 schema 泛化，无开源对口 |
| D5 轨迹表（agent_trajectories） | **[自研]** 12 号 §4 | 审计/恢复/蒸馏原料三重身份，字段深度绑定宿主模型 |

### E. 平台设施

| 模块 | 决策 | 依据 |
|---|---|---|
| E1 事件流 | **[已有+自研]** 平台事件总线（10 号已实现）+ event-bridge/agent-producer | 不用 AI SDK UI stream / @openharness/vue：前端走 IPC/WS/SSE 自有通道，保持零框架绑定（R6/R7） |
| E2 journal / state API / resume 回调 | **[自研]** 11 号规格 | 引擎侧扩展点，无开源对口 |
| E3 任务树（16 号） | **[自研]** | 编排深度绑定工作流引擎 |
| E4 质量门（17 号） | **[自研]**（一致性验证器融合 15 号修订 R3） | 业务验收语义 |
| E5 可观测性（结构化日志/usage/审计表） | **[已有+自研]** createLogger + agent_llm_calls/agent_tool_calls | 13/14 号既定 |

## 4. 最终外部依赖清单（收缩后）

```
运行时依赖（agent-runtime 范围）：
  ai@^6.0.277                 # 循环/工具协议/流式（钉版本，overrides 锁 6.x）
  @ai-sdk/openai-compatible@^2 # 动态 provider（挂 getProviderConfig）
  zod@^4                      # 工具 schema 单一事实源（core 现无 zod，无冲突）
M2 追加：@ai-sdk/anthropic、@ai-sdk/google
M5 追加：@ai-sdk/mcp

vendor（src 内源码摘取，文件头标注 MIT + upstream commit）：
  platform/agent-runtime/runtime/vendor/compaction.ts   ← open-harness DefaultCompactionStrategy
  platform/agent-runtime/runtime/vendor/retry-shape.ts  ← open-harness retry（重构融入错误分类法）
  platform/agent-runtime/tools/vendor/todos.ts          ← open-harness todos（M3）
```

**open-harness 从"整包依赖"降级为"模块摘取源"**：不再出现在 package.json；
vendor 的三个文件合计 <400 行、依赖面只有 ai 类型，fork 成本可控（对冲其单人维护风险）。

## 5. 架构统一性论证（用户核心关切）

1. **单循环实现**：手动循环一份代码服务双宿主——工作流宿主（state_json/E3 resume）与
   独立宿主（agent_sessions/提案卡）都消费同一 `runLoop(task, host)`。不引入
   open-harness 的 Session/Conversation 双组合范式（F3）。
2. **单一 LLM 调用事实源**：harness 内部走 provider-adapter → getProviderConfig；
   存量业务 generate*（longwriting-ai 等）仍走 ai-call 直调——**短期双轨是事实**，
   收敛路径：M4 迁移时业务生成能力工具化（definition tools），新代码一律走 harness；
   ai-call 保留为"非 agent 的单次调用层"，与 provider-adapter 共享 getProviderConfig，
   密钥/fallback/SSRF 不分叉。
3. **单一工具模型**：AgentToolDef↔AgentToolSpec 统一（14 号修订 R2），zod 为源。
4. **前端零框架绑定**：事件协议是自有 AgentEvent（IPC/WS/SSE），不用 AI SDK 的
   UIMessage/data-stream 协议渲染前端——若未来直连 AI SDK 流式协议需另评审。
5. **ESM 隔离**：ai 系依赖只在 agent-runtime 内动态 import（异步工厂），CJS 主进程产物安全。

## 6. 决策修订的落点

- **21 号决策一 v2**：循环载体从"ai@6 + @openharness/core 整包"修订为
  "ai@6 手动循环自研 + open-harness 三模块 vendor"；版本红线不变（钉 ai@6）。
- **12 号修订节 R1 的载体描述**按本文修正（Session→手动循环；approve 快路径→
  registry 层审批包装；压缩 vendor 保留）。
- 13/14/15 号修订节不受影响（协议载体/工具模型/图谱融合结论不变）。

## 7. 复核结论

- 自研面：循环/护栏/审批/工具/上下文/记忆/图谱/轨迹/事件桥/journal/任务树/质量门——
  **均为本项目架构强绑定件，开源生态无即插即用替代**（调研 v3-v5 已逐一排除）；
- 开源面：ai@6 系三包（协议与调用）+ 三个 vendor 模块（压缩/重试形状/todos）——
  **恰好是"商品化、无业务语义、官方/上游维护"的那一层**；
- 分界线一句话：**协议与调用用开源，循环与语义全自研**——与实证横评
  （AgentMail：可靠性 9 家满分，选型看重量/适配/控制权）的结论一致。
