# Agent Harness 开源方案调研（故事研讨室 / 公共 Agent 模块）

日期：2026-09-05 · 分支：feat/plugin-arch · v2（第二轮扩查后修订）
背景：长文写作与 EP 已有两套同构 agent 实现（1450 + 1818 行），故事研讨室是第三个消费者。
原方案是自研 Agent Runtime（见同目录 2026-09-04-story-room-design.md），本文评估"优先集成开源"路线。

## v2 补充调研覆盖面（回应"调研不够"）

第一轮深查 4 个 + 扫读 1 个；第二轮补齐 TS 生态其余主要玩家与记忆专项层，现全量如下：

### A. TS 原生 harness（11 个，全部逐一评估）

| # | 项目 | 一句话画像 | 结论 |
|---|---|---|---|
| 1 | **Vercel AI SDK v6/v7** | 模型调用层+循环原语，周下载 14M | ✅ **推荐** |
| 2 | **Mastra 1.0** | 全家桶：agent/记忆/工作流/自带 server | 淘汰：与自研工作流引擎重叠、记忆策略冲突、重 |
| 3 | **OpenAI Agents SDK JS** | handoffs/guardrails 多 agent 编排 | 淘汰：卖点用不上、无内置记忆、非 OpenAI 模型绕 |
| 4 | **LangGraph.js** | 图编排+持久检查点 | 淘汰：图编排已有（Vue Flow 引擎）；学习曲线陡 |
| 5 | **Claude Agent SDK** | Claude Code 同源编码 harness | 淘汰：实测 299MB 安装、每轮 ~35k input tokens（约 25 倍）、仅 Claude、0.x |
| 6 | **Google ADK TS (adk-js)** | 2.0 GA，graph workflows | 淘汰：Gemini/GCP 生态最佳，非 Google 模型需 LiteLLM；安装曾直接卡死；部分 beta |
| 7 | **VoltAgent** | 可观测性优先 TS 平台 | 观察：2025-04 才发布，社区小；不如 AI SDK 成熟 |
| 8 | **LlamaIndex.TS** | RAG/上下文工程见长 | 淘汰：定位在检索增强而非业务工具 agent；本项目 RAG 场景已自有 lance-db 方案 |
| 9 | **Inngest AgentKit** | 持久执行/durable step | 淘汰：需要 Inngest server 运行时（serverless-first），桌面/自托管 Web 引入运维负担 |
| 10 | **Atomic Agents** | 极简模块化管线 | 观察：过于轻量（工具注册/审批/流式都要自己补），社区小 |
| 11 | **Microsoft 系（Semantic Kernel JS → MAF）** | SK 的继任者 MAF 2026-04 GA 但**仅 .NET/Python**，JS/TS 无继任路线 | 淘汰：TS 支持事实上被放弃 |

### B. Python 系（按"TS/Node 原生"硬约束整批排除，8 个）
LangChain、CrewAI、AutoGen/AG2、Pydantic AI、Agno、smolagents、Google ADK Py、Microsoft Agent Framework Py。
（实测数据仍可参考：CrewAI 拉了 143 包/856MB；AutoGen 原版进维护模式且三分裂。）

### C. 记忆专项层（3 个，单独评估——对应"记忆"需求是否外购）

| 项目 | 形态 | 结论 |
|---|---|---|
| **Letta (MemGPT)** | 自托管 agent OS + 官方 TS SDK | 淘汰：等于再引入一个有状态 agent 服务，与自研 harness 定位冲突 |
| **Mem0** | 抽取式事实记忆库（可嵌入） | 备选（后期）：若未来要跨会话语义记忆，优先评估它嵌入 PG |
| **Zep / Graphiti** | 时序知识图谱（Apache 2.0 可自托管） | 淘汰：需要图数据库运维；self-host 文档稀疏 |

我们的设计（设定集 DB 快照=长期记忆 + 滚动摘要）不需要外购记忆层；Mem0 留作远期可选项。

### D. 实证横评（AgentMail 2026-07：同一 agent × 9 框架 × 各 10 次）

- **可靠性 9 家并列满分**（10/10 工具调用正确）——说明"循环"已商品化，选型看**重量/provider 适配/上下文控制权**，不看能力
- 安装体积：AI SDK 最轻（15 包/53MB）；Claude Agent SDK 299MB；CrewAI 856MB
- 代码量：AI SDK ~16 行（最干净之一）；Mastra 29 行
- 延迟：Mastra/Pydantic AI 最快（2.2s 中位）；Claude Agent SDK 最慢 8.5s
- token 开销：Claude Agent SDK ~35k input/轮（≈25 倍框架开销）；LangGraph 最省
- 生产背书：LangGraph 最强（Klarna/Uber/LinkedIn）但学习曲线陡；Mastra 文档滞后于代码；AI SDK 大版本会破坏性变更

### E. 前端对话层（非 harness，仅记录不评估）
CopilotKit、assistant-ui——React 生态 UI 组件，本项目 Vue 且走自研事件通道，不在范围。

### F. v3 补查：harness 专项项目（5 个，全部 clone 读码）

**方法论**：5 个仓库全部 shallow clone 到本地，逐个核实 package.json 依赖、核心源码、运行时入口；结论基于代码而非 README。

| # | 项目 | 架构/技术栈（代码证据） | 结论 |
|---|---|---|---|
| 1 | **open-harness**（MaxGfeller，MIT） | pnpm monorepo：`@openharness/core`（~9.8k 行含测试）+ provider-vfs/provider-chatgpt/react/**vue** 五包。core 依赖仅 3 个：`ai@^6.0.97` + `@ai-sdk/mcp` + `zod`。模块：Agent/Session/Conversation/runner + 中间件组（`withCompaction` 阈值触发、策略可换、带生命周期事件；`withPersistence` 走 `SessionStore{load,save,delete}` 可插拔接口；`withRetry`/`withTurnTracking`/hooks）+ subagents + skills + todo 工具 + fs/bash 工具 + MCP + UI stream。AbortSignal 全程贯穿 runner。**本质：AI SDK v6 之上的薄 harness 层，与原自研 Agent Runtime 方案 1:1 重合** | ⭐ **重点候选**。风险：单人维护（contributor=1，163 commits）、2026-02 创建、月下载 ~1.6k、无内置工具审批 |
| 2 | **deepagentsjs**（LangChain 官方，MIT） | "batteries-included agent harness"：`write_todos` 规划 + 文件系统工具当工作记忆（read/write/edit/ls/glob/grep）+ `task` 子 agent 隔离上下文 + 内置提示词/中间件。pnpm monorepo：libs/deepagents + acp + providers（node-vfs/deno/quickjs/modal/daytona 沙箱）+ standard-tests。**peer 依赖拖入整个 LangChain 运行时**（@langchain/core + @langchain/langgraph + langchain + langsmith）。月下载 113 万 | 淘汰：LangChain 全家桶依赖；编码/文件系统范式（记忆=虚拟 fs）与"设定集=DB 快照"不对口；多租户持久化另需 LangGraph checkpointer。**设计模式值得抄**：todo 规划、子 agent 上下文隔离 |
| 3 | **Archon**（coleam00，MIT） | 已转型为"AI 编码工作流引擎"（自称 n8n for coding）：YAML workflow（plan→implement loop→test→review→PR），确定性节点（bash/test/git）+ AI 节点混合，每 run 独立 git worktree。TS monorepo 11 包：@archon/core（Hono+pg+octokit）/cli/workflows/adapters/isolation/git/providers 等；docker-compose 部署 | 淘汰：面向**编码**场景（repo/PR/worktree），与"创作+业务 DB 工具"不符；workflow 编排已有自研引擎。可借鉴："确定性结构 + AI 填充智能"哲学 |
| 4 | **happyclaw**（riba2534，MIT） | 自托管多用户 Claude Code 工作台：`src/sdk-query.ts` 直接 `import { query } from '@anthropic-ai/claude-agent-sdk'`——**Claude Code 运行时包装产品**。全功能 SaaS 形态：Web+PWA+8 种 IM 渠道、RBAC/计费/兑换码、Docker 沙箱+宿主机双模式、Workspace Memory、cron 任务。Node≥20+Docker | 淘汰：完整产品而非库；运行时锁死 Claude（Anthropic SDK）；编码沙箱范式与业务 DB 工具不符 |
| 5 | **qm**（yc-software，MIT） | "多玩家 org agent harness"：headless core（Fastify，Node 直跑 TS）+ Postgres（session/memory/queue）+ 每 scope 独立持久沙箱。**harness 驱动可换**：`src/harness/` 抽象让 Pi/OpenCode/Codex/Claude Code 四种 CLI 驱动同一核心（`src/model/custom-providers.ts` 支持自定义 provider）；Web UI（Lit）/Slack/管理台均为 core HTTP API 的可选插件 | 淘汰：面向公司部署的产品（Slack 组织协作+沙箱运维），非可嵌入库。**两个设计值得借鉴**：① harness 驱动插拔（换 harness 不换核心）② scope 级记忆/文件/权限隔离 |

#### v3 结论修订

AI SDK 作为底座不变，但 harness 层出现一个高匹配度开源件。**推荐路径（更新）**——M0 spike 并排验证两条线（共用同一 provider-adapter，均基于 `ai@6`，切换成本≈0）：

- **路线 A：裸 AI SDK + 自研薄层**（原方案，~2-3k 行）
- **路线 B：open-harness**：直接获得 Session/compaction/persistence/retry/subagents/todo/Vue 包。spike 重点验证：① 提案卡审批能否经其 tool/中间件体系实现 ② `SessionStore` 接多租户 Repository（ALS user_id 隔离）③ 与 `ai` v6 版本对齐无类型坑 ④ `createOpenAICompatible` 动态 provider 注入
- **风险对冲**：其 core 仅 ~5k 行、依赖面极小，上游若弃更可 fork 自维护；路线 A 是天然退路

deepagentsjs 的 todo 规划与子 agent 隔离、qm 的 harness 插拔与 scope 隔离、Archon 的确定性工作流哲学——记录为故事研讨室迭代的设计参考。

### G. v4 补查：模块级摘取地图（不整库引入，按模块取用）

再读码后的耦合度结论：
- **open-harness** 天然模块化（npm 包内按需 import 即可）：`todos.ts` **零依赖**可整体搬；`withCompaction`+`DefaultCompactionStrategy` 只依赖 `ai` 类型；`SessionStore` 接口仅 3 个方法；中间件系统挂在 runner 的小类型上
- **deepagentsjs** 所有模块深度耦合 `@langchain/*`（summarization.ts 引 7 个 langchain 入口）——**搬设计/提示词，不搬代码**
- **happyclaw / qm** 的目标模块在产品代码内（未发布为包）——移植=按 MIT 拷贝改造，需剥离产品耦合

#### G1. 摘取清单（我们的需求 → 来源 → 成本）

| 我们需要的 | 来源与证据 | 集成方式 | 成本 |
|---|---|---|---|
| 上下文压缩 | open-harness `DefaultCompactionStrategy`：**两阶段**（先剪枝旧工具结果，protectedTokens=40k 保护近端；省不够 minPruneSavings 再 LLM 摘要），摘要模型/提示词/估算器均可注入 | 路线 B 直接用；路线 A vendor 进 `src/core/agent/vendor/` | 低（只依赖 `ai` 类型） |
| 会话持久化 | open-harness `SessionStore{load,save,delete}`（session.ts:55） | 自研实现该接口接 `lw_design_messages` 模式 | 极低 |
| 规划 todo | 两个可选：open-harness `todos.ts`（零依赖，含工具+校验）直接搬；deepagentsjs 的 `write_todos` 提示词设计（成熟、经大量评测）抄提示词 | vendor / 抄提示词 | 低 |
| 子 agent | open-harness `subagents.ts`（耦合 agent/session → 随路线 B 获得）；deepagentsjs 的 task 隔离上下文模式做参照 | 路线 B 白拿 | 低/中 |
| **项目长期记忆 schema** | **happyclaw** `memory-service.ts`（684 行）：kind=`fact/decision/lesson/open_loop`，status=`active/proposed/conflicted/superseded/deleted` **生命周期状态机** + 来源追溯（web_user/agent_runtime/...）+ 版本历史 + CAS 编辑 + 幂等键 + canonical key 去重 | **只取 schema 与状态机设计**，在我们自己的 BaseRepository/lw_* 上实现。`proposed→active`＝提案卡采纳；`superseded`＝「换一版」；`conflicted`＝与既有设定矛盾待裁决 | 中（纯设计移植） |
| 记忆提取策略 | **qm** `MemoryStrategy` 接口（strategy.ts）：`onTurnEnd`/`maintain`/`promptLines` 钩子 + 4 实现（per-turn/scratch-promote/consolidation/agent-only） | 模式移植：决定"何时从对话提取设定/记忆" | 低（接口 ~40 行） |
| **崩溃恢复** | **qm** `INTERRUPTED_TOOL_RESULT`（context-compaction.ts）：重启后历史中的中断工具调用填入显式哨兵「结果未记录，先核实再重做」；摘要带 `throughSeq` 序列水位（增量摘要断点） | 一行模式直接抄 | 极低 |
| 工具审批（提案卡） | AI SDK 6 `needsApproval`（路线 A 原生）；open-harness 无此件——照 `withCompaction` 的中间件写法自写 `withApproval` | 自写中间件 | 低 |
| 事件流 | 自研（已有 `agent:{scope}:{sessionId}` 通道） | 不引 | — |
| 沙箱/文件系统/bash | （open-harness provider-vfs、deepagents 沙箱 providers） | **不要**：我们写业务 DB，无代码执行需求 | — |

#### G2. 推荐组合（v4 定稿）

**底座** `ai@6` + `@ai-sdk/openai-compatible`（provider-adapter ~50 行，包现有 getProviderConfig）；
**harness** 优先按路线 B 引 `@openharness/core`（用其中 Session/compaction/middleware，不用 fs/bash 工具）；若 spike 发现类型/版本摩擦，退路线 A 并 vendor compaction+todos 两个模块；
**自研**四件（均为业务特有，无开源对口）：provider-adapter、设定集快照上下文装配、记忆 schema（借 happyclaw 状态机）、审批中间件 + 事件桥。
**必抄细节**：qm 的中断哨兵与摘要水位；deepagentsjs 的 todo 提示词。

### H. v5 可行性 spike 实测（运行级验证，非纸面结论）

在 /tmp/agent-spike 用 mock 模型把"将要集成的模块"真实跑通。依赖组合（实测解析）：

```
ai@6.0.277            engines: node>=18   ← Electron 28(内嵌 Node 18) 可跑 ✓
@ai-sdk/openai-compatible@2.0.74  node>=18 ✓（peer: zod ^3.25.76 || ^4.1.8）
@openharness/core@0.7.0           声明依赖 ai@^6.0.97 + zod ^4 → 与 ai@6 单副本解析 ✓
zod@4.5.4
```

**版本红线**：`ai@7`（当前 latest，engines node>=22）与 Electron 28 不兼容——**必须钉 ai@6.x**；
ai@6 与 ai@7 混装会产生双副本（模型/工具跨包传递不可靠），统一 6.x。

#### H1. 集成契约逐项验证（全部通过）

| 契约 | 实测结果 |
|---|---|
| 工具循环 | `Agent` + zod 工具 + mock 流式模型：模型发 tool-call → 工具执行 → 二轮生成回复，`maxSteps` 生效 ✓ |
| **审批（提案卡）** | `approve: async (toolCall) => boolean`：调用时收到 `{toolName, input}`；返回 false → 工具**不执行**、发 `tool.error`、对话正常继续 ✓（Promise 支持等用户点击） |
| 会话持久化 | `SessionStore{load,save,delete}` 注入 `SessionOptions.sessionStore`；每轮结束自动 save 全量历史；**恢复需显式 `await session.load()`**（返回 true） ✓ |
| 自动压缩 | `contextWindow` + `compactionStrategy`：上一轮 usage 达阈值 → 二轮自动触发 `compaction.start→compaction.summary→compaction.done` 事件，历史替换为 `[Previous conversation summary]` 前缀 ✓；摘要走**非流式 generateText**（provider 需支持 doGenerate——openai-compatible 两者都支持） |
| 事件流（IPC 桥接词汇表） | `turn.start / step.start / tool.start / tool.done / tool.error / step.done / text.delta / text.done / done / turn.done / error / compaction.*` ✓ |
| 中断 | `session.send(input, { signal })` → **abortSignal 传入 doStream 调用参数**，abort 后 85ms 干净终止（provider 侧需把 signal 接到 fetch——标准做法） ✓ |
| **上下文装配挂载点** | `hooks.onBeforeSend(messages) => messages`：每次 LLM 调用前改写消息 → 在此注入设定集快照 system 消息 ✓ |
| 动态 provider | `createOpenAICompatible({name, baseURL, apiKey})('model-id')` 按请求构造 ✓（包 ai-call 的 getProviderConfig 即可） |

#### H2. 集成方式（针对本项目工程现实）

- 仓库无 `"type": "module"`（CJS 默认）：
  - **Web 端**：`tsx` 跑 server，对 ESM-only 包透明 ✓
  - **Electron 主进程**：electron-vite CJS 产物 → 用**动态 `import()`** 引入 agent 模块（Node 18 支持）；或后续切 electron-vite ESM 产物
- 新增依赖（agent 模块范围内）：`ai@^6.0.277`、`@ai-sdk/openai-compatible@^2`、`@openharness/core@^0.7.0`、`zod@^4`——与现有依赖零冲突（仓库现无 ai/zod）
- TS 5.3.3 偏老：esbuild/tsx 转译不受影响；若 CI 有 `tsc --noEmit` 需验证 ai@6 类型，必要时小版本升级 TS

#### H3. 结论

**可行性确认**。路线 B（AI SDK 6 + @openharness/core）所有关键契约经运行级验证可用，
其中 `approve` 与 `onBeforeSend` 与故事研讨室的"提案卡""设定集快照上下文"一一对应。
下一步 M0：在仓库内建 `src/core/agent/`（provider-adapter + 事件桥 + SessionStore 实现），用真实 provider（GLM/DashScope）跑通一轮带审批的对话。

## 结论（TL;DR，v3 修订）

**底座不变：Vercel AI SDK（`ai` v6 + `@ai-sdk/openai-compatible`）作为模型调用与循环层。**

harness 层两条路线并排 spike（共用同一 provider-adapter，切换成本≈0）：
- **路线 A**：裸 AI SDK + 自研薄层（~2-3k 行，原方案）
- **路线 B**：[open-harness](https://github.com/MaxGfeller/open-harness)——AI SDK 之上的开源薄 harness（Session/上下文压缩/可插拔持久化/重试/子agent/todo/Vue 包），与自研方案 1:1 重合；风险是单人维护、5 个月龄，但核心仅 ~5k 行可 fork 兜底

不引入 Mastra / LangGraph.js / OpenAI Agents SDK / deepagentsjs(LangChain 栈) / happyclaw / qm / Archon（详见 D2 节代码级评估）。**可行性已经运行级 spike 验证（H 节）**。

## 硬性约束（筛选标准）

1. **TypeScript/Node 原生**——Electron 桌面 + Express/Web 双端共享 src/core，Python 系（LangChain/AutoGen/CrewAI/Agno）直接排除
2. **Provider 完全动态**——用户在设置页配置任意 OpenAI 兼容端点（GLM/DashScope/OpenAI/…），apiKey 运行时解密，每次调用按 providerConfigId+modelId 路由
3. **多租户可注入存储**——Web 端 ALS 按 user_id 隔离，框架的任何存储/记忆必须能换成自有 Repository
4. **桌面端可打包**——避免自带独立 server / 重依赖树
5. **人在回路**——核心交互是"提案卡 → 用户确认后落库"，需要 tool approval 机制
6. **流式 + 真取消**——已有 AbortController 池与事件通道协议

## 候选对比（2026-09 现状）

| | Vercel AI SDK v6 | Mastra 1.0 | OpenAI Agents SDK JS | LangGraph.js | Claude Agent SDK |
|---|---|---|---|---|---|
| 定位 | 模型调用层 + agent 循环原语 | 全家桶框架（agent/记忆/工作流/Studio/server） | 多 agent 编排（handoffs/guardrails） | 图编排 + 持久检查点 | Claude Code 同源编码 harness |
| 成熟度 | 14M 周下载，事实标准 | Apache 2.0，1.0 稳定，Replit/Sanity 在用 | OpenAI 官方 TS port | 成熟但重 | Anthropic 官方，偏编码场景 |
| 自定义 OpenAI 兼容端点 | ✅ `createOpenAICompatible` 一等支持 | ✅ 自带 router（但引入其 provider 层） | ⚠️ `setDefaultOpenAIClient`/ChatCompletions 包装，可做但绕 | ✅ LangChain model 适配 | ⚠️ 假定 Anthropic 兼容 API |
| 记忆/上下文 | **BYO（自带设计）**——不替你做决定 | 内置三件套：历史/语义召回/working memory（自带存储适配器，PG 一等） | ❌ 无内置记忆 | 检查点=状态持久化，非语义记忆 | 会话压缩，面向编码 |
| 循环控制 | `stopWhen`/`prepareStep`/`Agent` 类，粒度到每步 | 内置 | 内置 | 图节点 | 内置 |
| **工具审批（人在回路）** | ✅ v6 `needsApproval` 原生 | 有 suspend/resume | guardrails（前置校验，非审批） | interrupt 机制 | 权限模式 |
| 存储侵入性 | 零依赖，无存储 | 需要存储适配器（可换 PG） | 低 | 需 checkpoint 存储 | 高（自带工具体系） |
| 与本项目冲突点 | 无明显 | 自带 workflow 引擎与本项目工作流引擎重叠；记忆注入策略与"设定集快照=长期记忆"设计相抵触 | handoffs 用不上 | 图编排用不上（已有 Vue Flow 工作流引擎） | 业务 DB 工具场景不符 |

## 为什么是 AI SDK

1. **补的正是缺的那层**：本项目 ai-call.ts 已解决"单次调用"，缺"循环/工具/审批"。AI SDK 的
   `generateText` + tools(zod schema) + `stopWhen: stepCountIs(N)` + `prepareStep` 恰好是这层；
   v6 的 `Agent` 类是官方对"LLM+工具循环"的封装，与自研方案里 agent-runner.ts 的定位完全重合。
2. **`needsApproval` 与提案卡 UX 天然同构**：工具声明 `needsApproval: true` → SDK 暂停等待确认 →
   前端渲染"保存到设定集/修改确认"卡片 → `approve/reject` 继续。原自研方案里这部分要手写协议。
3. **Provider 适配成本最低**：`@ai-sdk/openai-compatible` 的 `createOpenAICompatible({ baseURL, apiKey })`
   可在 ai-call.ts 的 getProviderConfig 之上包一个 ~50 行的 adapter，保持现有配置/解密/模型 fallback 链不变。
4. **BYO 记忆正好匹配设计**：我们本来就要"设定集快照=长期记忆 + 滚动摘要"，不想要框架的向量召回
   自动注入（多租户 scope 和语义都不对口）。AI SDK 不强加记忆方案，`prepareStep` 允许每步控制上下文。
5. **不与既有资产冲突**：不带存储、不带 server、不带 workflow 引擎；纯 TS 可打进 Electron main 与 Express。

## 集成草图

```
src/core/agent/                     # 薄自研层（原 Agent Module 方案收窄）
  provider-adapter.ts               # getProviderConfig → createOpenAICompatible → LanguageModel
  context-manager.ts                # 四层装配：system / 设定集快照 / 滚动摘要 / 近 N 轮
  memory/repository.ts              # 会话消息 + 摘要持久化（沿用 lw_design_messages 模式，ALS 隔离）
  events.ts                         # 现有事件通道协议不变
  runner.ts                         # 封装 AI SDK Agent：互斥、AbortController 池、事件桥接
  definitions/                      # 长文 / EP / 故事研讨室 各一份声明（tools + systemPrompt）
```

- 工具即业务函数：`saveEntity`/`updateEntity`/`queryEntities` 内部直接调现有 service 落 lw_* 表
- 故事研讨室：`Agent` + `stopWhen: stepCountIs(6)`；保存类工具 `needsApproval` → 提案卡
- 旧两套 agent（长文/EP 的 JSON 决策协议）迁移为 definition，行为不变，净删 ~1000 行

## 风险与对策

1. **部分国产端点的 function calling 兼容性参差**（JSON 模式/工具调用支持不一）
   → AI SDK 有 tool-call repair 中间件兜底；保留现有 JSON 决策协议作为旧 agent 的降级路径，新 agent 首选工具协议
2. **ESM-only / Node 版本要求**（AI SDK v6 需较新 Node；Electron main 进程打包需验证）
   → M1 第一步先做 spike：在 web 端 Express 与 Electron main 各跑通一次 streamText + 工具调用
3. **React 生态假设**：useChat 等 UI hooks 是 React 的——本项目 Vue，不使用；我们只在服务端消费
   `streamText`/Agent 事件并走既有 IPC 事件通道，无影响
4. **版本节奏快**（v7 已在早期）→ 锁定 minor 版本；只用稳定面 API（generateText/streamText/Agent/tools/stopWhen/needsApproval）

## 迁移里程碑（绞杀者，行为不变）

- **M0 spike**：AI SDK 依赖引入 + provider-adapter 打通一个真实 provider（流式/工具/取消）
- **M1**：长文 agent 重写为 definition（基线：现有测试全绿）
- **M2**：EP agent 切换，净删重复 ~1000 行
- **M3**：context-manager 四层装配 + 滚动摘要
- **M4**：故事研讨室 agent（新 definition + story-persist 工具组），接 v3.1 原型交互

## 参考

- [AI SDK Tool Calling / stopWhen](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) · [AI SDK 5 发布文](https://vercel.com/blog/ai-sdk-5)
- [AI SDK OpenAI-Compatible Providers](https://ai-sdk.dev/providers/openai-compatible-providers) · [自定义 provider 指南](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers)
- [AI SDK 6 Human-in-the-Loop（needsApproval）](https://ai-sdk.dev/cookbook/next/human-in-the-loop)
- [TS Agent Stack 2026 四框架对比](https://www.developersdigest.tech/blog/typescript-ai-agent-stack-2026)
- **[实证：同一 agent × 9 框架 × 90 次运行（AgentMail 2026-07）](https://www.agentmail.to/blog/best-ai-agent-frameworks-2026)**
- [Mastra 记忆/存储](https://mastra.ai/docs/memory/overview) · [Mastra Electron 集成（server 模式）](https://mastra.ai/integrations/frameworks/electron) · [Mastra vs AI SDK](https://www.respan.ai/market-map/compare/mastra-vs-vercel-ai-sdk)
- [OpenAI Agents JS Models（自定义 client）](https://openai.github.io/openai-agents-js/guides/models/) · [openai-agents-js](https://github.com/openai/openai-agents-js)
- [Speakeasy 七框架横评](https://www.speakeasy.com/blog/ai-agent-framework-comparison/)
- [Google ADK TS 发布](https://developers.googleblog.com/introducing-agent-development-kit-for-typescript-build-ai-agents-with-the-power-of-a-code-first-approach/) · [adk-js](https://github.com/google/adk-js)
- [VoltAgent](https://github.com/voltagent/voltagent) · [LlamaIndex.TS](https://developers.llamaindex.ai/typescript/framework/) · [Inngest AgentKit](https://agentkit.inngest.com/) · [Atomic Agents](https://github.com/eigenwise/atomic-agents)
- [Semantic Kernel → MAF 迁移](https://devblogs.microsoft.com/agent-framework/semantic-kernel-and-microsoft-agent-framework/) · [MAF 1.0（仅 .NET/Python）](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)
- [记忆层对比：Mem0 vs Zep vs Letta](https://www.developersdigest.tech/blog/best-ai-agent-memory-providers-2026) · [Letta TS SDK](https://www.letta.com/blog/introducing-the-letta-agent-sdk/)
- [open-harness](https://github.com/MaxGfeller/open-harness) · [deepagentsjs](https://github.com/langchain-ai/deepagentsjs) · [Archon](https://github.com/coleam00/Archon) · [happyclaw](https://github.com/riba2534/happyclaw) · [qm](https://github.com/yc-software/qm)
