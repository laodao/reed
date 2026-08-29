# 01 · 设计方案（Design Spec）

> Agent Loop Harness —— AI 原生通用业务平台 ｜ 2026-08-28 ｜ 状态：设计中

## 0. 背景与目标

项目现状：Electron+Vue3+TS 的 AI 工具箱（PC=SQLite / Web=PostgreSQL 双端），已有一套生产可用的工作流引擎（`src/core/modules/workflow/`，39 种节点）和两套"野生" agent 编排（episode-production 的 `ep-agent-workflow.service.ts`、长文写作的 `longwriting/agent/agent-workflow.service.ts`，两者独立实现、不复用主引擎）。

目标：升级为 **AI 原生通用业务平台**——

- AI 能力（LLM、多模态、知识库）与传统程序能力（工具、外部接口、数据库、定时任务）完全融合；
- 以流程驱动业务（确定性工作流为骨架）；
- 核心新增 **LLM Loop**：模型自主决策"调哪个工具、传什么参"，执行结果喂回模型，循环直至收敛——即 agentic harness；
- 支撑长程任务：可持久化、可恢复、可重放、可审计；
- 具备知识飞轮（自我进化记忆）、任务树分解、质量门三大能力；
- 兼容业务审批工作流（人工挂起/恢复、审批人指派、多实例并发）；
- 业务无关内核 + 业务包架构：平台内核不内置任何具体业务逻辑，AI 编码、业务审批、内容生产等以业务包接入（详设见 [18-business-pack.md](./18-business-pack.md)）。

---

## 1. 可行性评估

### 1.1 现状资产盘点（已验证，附代码证据)

**工作流引擎**（`src/core/modules/workflow/`）：

- 事件驱动图执行器：边激活序号驱动调度，支持条件分支、并行扇出/合并、静态 loop、子工作流、自由环（`engine/workflow-engine.service.ts`）。
- **挂起/恢复机器**（harness 最关键的地基）：节点可返回 `waiting_review` 挂起整条 run，`resumeReview` 应用决策后续跑（`:427`、`:1050`）；挂起不计入看门狗时长，可长时间等人。
- 人机交互节点现成：`human-review`（批准/驳回/修改后批准/超时策略，`nodes/task-nodes.ts:193`）、`form-collect`（声明式表单收集，`nodes/interaction-nodes.ts:40`）；前端批准/驳回按钮、动态表单弹窗、待审核徽标齐全。
- 节点级 checkpoint：`workflow_node_runs` 按 `(run_id, node_id, iteration_index)` 唯一，`output_json` + `route_taken` 留痕；`resumeRun` 断点续跑（`workflow-run.service.ts:298`）。
- 触发器四种：manual / cron（30s tick）/ event（进程内事件总线，限流 20 次/分）/ webhook（token 鉴权）。
- 节点插件式注册：`WorkflowNodeRegistry` + `createFullNodeRegistry()`（`nodes/index.ts:29`），新增节点只动 4 个文件（catalog、types、handler、forms），有一致性断言和单测（`nodes/README.md:1-34`）。
- 前端编辑器元数据驱动：`WorkflowEditor.vue` / `NodeConfigPanel.vue` 直接渲染 catalog 与 forms schema，**新增节点前端零改动**。

**AI 层**（`src/core/services/ai-call.ts` + `src/core/providers/`）：

- 双轨协议：OpenAI 兼容系走 `OpenAISdkProvider`（openai/deepseek/百联/moonshot/智谱等），Anthropic/Google/火山走官方 SDK；10 家 provider 模板（`provider-template.service.ts:18-414`）。
- 流式（`callAIStream`，真取消 + usage 回传）、VLM、截断续写齐全；token 用量可观测。
- **不支持 function calling / tool use**：`ChatContext`（`src/shared/types/message.types.ts:236`）、`ChatOptions`（`src/core/providers/base-provider.ts:33`）、`StreamCallback`（`:21-28`）三处类型均无 tools 概念。

**工具层**：

- `ToolService`（`src/core/services/tools/tool.service.ts:196-280`）：预设工具表 + 自定义工具（api/cli/email），凭据解密注入、URL 占位替换。
- `oas-tool` 节点：OpenAPI JSON → 可执行操作（V1 不支持 `$ref`）。
- SSRF 统一闸门：`validateOutboundUrl`（`src/core/utils/outbound-url.ts:64-82`）被 `http-fetch.ts:90` 强制调用，覆盖 http-request/web-extract/crawl/oas-tool/tool-call。
- **MCP：全库零代码。**

**数据/记忆层**：kb + LanceDB 向量库、跨运行持久 `variable` 节点、data-table（内置表 + 外部 PG/MySQL/SQLServer/ClickHouse）、diary 服务。

### 1.2 关键短板（必须解决的硬障碍）

| # | 短板 | 证据 | 影响 |
|---|------|------|------|
| S1 | 调度器在途状态纯内存：边激活序号、挂起位置只在 `activeExecutions` Map；重启后 waiting_review 的 run 决策被拒（"请先续跑"） | `workflow-run.service.ts:281-285`、`recoverOnBoot:387-433` | 审批隔天处理不可用；长任务崩溃 = 调度状态丢失 |
| S2 | 挂起是一次性终态：`applyReviewDecision` 直接标节点 succeeded 出边，**handler 不会被重新调用** | `workflow-engine.service.ts:553-570` | 人工干预后无法继续 agent 循环 |
| S3 | 节点内无中间状态持久化：handler 契约要求"可重入、禁存跨调用状态"，context 无 state API | `node-handler.ts:10-11, 25-65` | 50 轮 agent 循环中途崩溃 = 对话历史全丢 |
| S4 | AI 层无 tool-calling 协议 | 见 1.1 | harness 的核心循环无从谈起 |
| S5 | 节点/工具参数 schema 太粗（输出仅 string/number/boolean/json 四型），UI 导向 | `workflow-node-catalog.ts:25-29` | 自动生成的 LLM tool 描述质量差，幻觉调用率高 |
| S6 | AI 调用零配额零并发限制；`maxNodeRuns` 只数节点启动次数，对节点内循环无效 | `workflow-engine.service.ts:934-957` | agent 循环失控无兜底 |
| S7 | 业务审批缺口：无审批人指派、无操作者校验（知道 runId+nodeId 即可替人审批）、同工作流单实例互斥、无驳回重提 | `workflow-engine.service.ts:427`、`workflow-run.service.ts:80-93` | 多用户业务平台不成立 |
| S8 | 无组织模型（users 只有 admin/user，无部门/上下级）、无待办中心 | `user.entity.ts` | "主管审批"无从解析 |

### 1.3 可行性结论

**可行。** 骨架（确定性流程 + 挂起恢复 + checkpoint + 人机交互 + 触发器 + 持久化）已经是最难的部分；缺口集中在三处可一次性做对的投资：运行事件日志（解决 S1/S2/S3）、AI tool-calling 协议层（S4）、节点内循环护栏（S6）。S7/S8 属业务化阶段，与 harness 正交但共享挂起恢复机制。

**定位原则（重要）**：不是"用图引擎模拟 agent 循环"——图模型要求控制流静态确定，agent 循环每一步由 LLM 动态决策，二者是两种物种。正确架构是 **harness 为独立运行时（AgentRuntime），工作流引擎是其宿主之一**；引擎不理解 agent 的每一轮迭代，只提供持久化、挂起、护栏三样基础设施。

---

## 2. 总体架构

```
┌────────────────────────── 工作流引擎（确定性骨架，现有代码增量扩展）──────────────────────────┐
│  start → form-collect → [agent-loop] → human-review → data-table → end                     │
│  引擎只看见一个个节点：启动、等待终态或挂起、收集输出、路由                                    │
│  扩展点：① 运行事件日志 journal  ② handler.state API  ③ handler.resume() 回调               │
└──────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                       ▼
┌────────────────────────── AgentRuntime（harness，独立核心服务）──────────────────────────┐
│  Planner ──→ 任务树分解（静态规划 / 动态重规划，深度与预算有上限）                            │
│  Executor ──→ LLM tool-call 循环：模型决策 → 工具执行 → 结果回填 → 收敛判定                  │
│  Verifier ──→ 质量门：规则 → 工具 → LLM 评判 → 人工验收（复用 human-review）                │
│  Memory   ──→ 知识飞轮：L1 工作 / L2 情景 / L3 语义 / L4 程序（技能库）                      │
│  每轮迭代 saveState() 落库；需要人工 → 向宿主抛挂起请求                                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                       ▼
┌── 宿主们 ──────────────────────────────────────────────────────────────────────────────┐
│  工作流 agent-loop 节点（薄适配器） ｜ episode-production（迁移） ｜ 长文写作（迁移） ｜ 聊天    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**职责划分**：

- **引擎**：离散节点、静态路由、checkpoint、挂起恢复、触发器、并发槽、看门狗。不理解 agent 内部。
- **AgentRuntime**：LLM 循环、动态工具选择、任务分解、质量验证、记忆读写。不知道工作流的存在（通过接口拿 state 存取和挂起请求能力）。
- **agent-loop 节点**：薄适配器——把图上下文变量喂给 AgentRuntime，把最终输出吐回图里，把挂起请求翻译成引擎的 `waiting_review`。

**业务包层（业务无关内核之上的接入层）**：上述引擎与 AgentRuntime 共同构成**业务无关内核**——不内置任何具体业务逻辑。各类业务（AI 编码、业务审批、内容生产……）以**业务包**形式接入：一个包声明其工具集、技能（L4）、规则集、工作流模板、质量策略与记忆命名空间，经内核扩展点（AgentToolRegistry、记忆装配、质量门策略、节点注册）挂载运行。AI 编码只是业务包的一种，harness 的循环、持久化、飞轮、质量门能力对所有包复用。包的清单格式与边界契约详设见 [18-business-pack.md](./18-business-pack.md)。

---

## 3. 支柱一：运行事件日志（Journal）——持久化、恢复、重放、审计

> 事件机制的通用平台化设计见 [10-event-system.md](./10-event-system.md)；本节 journal 是引擎私有强一致日志，与其分工见该文档（journal 详设见 [11-run-journal.md](./11-run-journal.md)）。

### 3.1 问题

调度器在途状态纯内存（S1），挂起不可续（S2），节点内无状态（S3）。三者是同一问题的不同切面：**状态变迁没有完整的持久化记录**。

### 3.2 设计

新表 `workflow_run_events`：

```sql
CREATE TABLE workflow_run_events (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  seq         INTEGER NOT NULL,            -- run 内单调递增
  type        TEXT NOT NULL,               -- edge_activated / node_launched / node_suspended
                                           -- / node_completed / node_failed / review_decided / run_finished
  node_id     TEXT,
  payload_json TEXT,                       -- 边激活序号、挂起审核 payload、wait_expires_at、输出摘要等
  created_at  TEXT NOT NULL,
  UNIQUE(run_id, seq)
);
-- 索引：(run_id, seq)
```

- 引擎在每次状态变迁时追加事件（先写库再改内存，保证崩溃一致）。
- **恢复 = 投影重建**：boot 时扫描 `status IN (running, waiting_review)` 的 run，重放事件日志重建 RunExecution（邻接表已有，只需恢复激活序号、挂起点、计数器），继续 `pump()`。每 N（如 200）个事件落一次快照控制恢复时间。
- `reviewDecide` 对非活跃挂起 run 改为"先 rehydrate 再应用决策"（修复 S1 的审批死信）。
- 节点内中间状态：`workflow_node_runs` 加 `state_json` 列；`WorkflowNodeContext` 新增 `saveState(state)` / 启动时注入 `loadState()`。handler 契约修订："禁存跨调用状态"限定为"禁止仅存于内存的状态，跨调用状态必须经 state API 落库"。
- 节点内挂起恢复：handler 契约新增可选 `resume(decision, state)`——`applyReviewDecision` 改为：handler 声明了 resume 则回调之（携带人工决策和最近 state，handler 自行决定继续循环还是出边终结）；未声明则维持现有"一次性终态"语义，向后兼容。

### 3.3 对 harness 的意义

AgentRuntime 的每轮迭代轨迹（thought / tool_call / result / token 用量）写入独立的 `agent_trajectories` 表（不写 node_run 主表，避免撑爆），与 journal 同一套 seq 机制。于是：

- **恢复**：进程重启后从最后一轮迭代继续；
- **重放**：任意历史 run 可完整复盘每一步决策——调试与审计的基础设施；
- **记忆**：轨迹即知识飞轮 L2 情景记忆的原料（见支柱二）。

### 3.4 幂等与副作用

重放只重建调度状态，不重放副作用。在途节点（launched 未 completed）重启后重新执行，因此节点 handler 应尽量幂等；对天然非幂等的节点（发邮件、写外部系统），在节点输出中记录幂等键，恢复时先查后果。

---

## 4. 支柱二：知识飞轮（自我进化记忆系统）

### 4.1 分层记忆模型

| 层 | 内容 | 存储 | 生命周期 |
|----|------|------|----------|
| L1 工作记忆 | 本次运行的对话与上下文 | agent 循环内存 + state_json | run 级 |
| L2 情景记忆 | 任务 episode：目标、轨迹摘要、成败、质量分 | `agent_trajectories` + `memory_episodes` 表 | 长期，可衰减 |
| L3 语义记忆 | 蒸馏出的事实、SOP、用户/业务偏好 | LanceDB（向量）+ 结构化表 | 长期，可演化 |
| L4 程序记忆 | 可复用技能：被验证的工具调用序列、提示词模板、固化子工作流 | 技能库表 + workflow_definitions | 长期，版本化 |

### 4.2 飞轮四环

```
执行 → 轨迹(journal) → 蒸馏(distiller) → 候选记忆 → 闸门(查重/打分/人工) → 入库
  ↑                                                                      ↓
  └──────────── 上下文装配（按相关性检索 L2/L3/L4，token 预算内）←──── 代谢(合并/衰减/覆盖)
```

- **写入（蒸馏）**：任务终态后触发 distiller（LLM），从轨迹提取候选记忆条目，**必须带出处**（run_id、task_id、质量分、时间）。
- **闸门（防污染，核心设计）**：候选条目不直接入库——① 向量查重（相似度阈值内则合并而非新增）；② 置信度打分（来源任务的质量分加权）；③ 高风险/低置信条目走 human-review 人工批准。**初期默认全部人工批准，跑顺后按类目逐步自动化。** 记忆系统死于污染而非缺失。
- **读取（装配）**：agent-loop 启动时，以任务描述为 query 检索相关 episode/事实/技能，按 token 预算装配进系统提示；命中 L4 技能时优先注入其工具调用范式。
- **进化（代谢）**：复用现有 cron 触发器跑周期作业——合并相似条目、按"检索命中率 × 采用后成功率"衰减、新证据覆盖旧事实（保留版本链）、长期零命中条目归档。

### 4.3 数据模型（新增表）

```sql
CREATE TABLE memory_entries (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL,              -- episodic / semantic / procedural
  kind TEXT NOT NULL,               -- fact / sop / preference / skill / episode-ref
  content_json TEXT NOT NULL,       -- 内容 + 结构化字段
  embedding_id TEXT,                -- LanceDB 向量引用
  source_run_id TEXT, source_task_id TEXT,
  confidence REAL NOT NULL,         -- 0-1
  status TEXT NOT NULL,             -- pending_review / active / archived / superseded
  use_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,  -- 被采用且任务通过验收的次数
  supersedes_id TEXT,               -- 版本链
  created_at TEXT, updated_at TEXT
);
```

### 4.4 与现有设施的关系

LanceDB/kb 服务直接复用为向量层；`variable` 跨运行变量承载租户级显式偏好；diary 服务可归入 L3 的一种 writer。不新建向量基础设施。

---

## 5. 支柱三：任务管理（任务树 + 递归规划）

### 5.1 数据模型

```sql
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT,                   -- 树结构，NULL = 根任务
  root_id TEXT NOT NULL,
  depth INTEGER NOT NULL,           -- 防递归爆炸，上限可配（默认 4）
  title TEXT NOT NULL,
  spec_json TEXT NOT NULL,          -- 目标描述 + 验收标准 + 输入契约 + 输出契约
  status TEXT NOT NULL,             -- pending / planning / ready / running / verifying
                                    -- / succeeded / failed / cancelled / escalated
  executor TEXT NOT NULL,           -- agent_loop / sub_workflow:<definitionId> / human
  run_id TEXT,                      -- 关联的运行实例
  budget_json TEXT,                 -- 子树 token / 迭代 / 时长预算
  quality_score REAL,               -- 验收得分（0-1）
  result_json TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
);
-- workflow_runs 增加列：task_id TEXT, parent_run_id TEXT  —— 运行森林镜像任务树
```

### 5.2 分解模式

- **静态规划**：Planner（LLM）对根目标生成完整任务树 → **整树先走 human-review 人工批准计划** → 就绪任务按依赖调度执行。
- **动态重规划**：子任务失败达重试上限、或验收发现方向性偏差时，Planner 对该子树局部重新分解；根任务定期做全局健康检查（质量分聚合低于阈值触发重规划）。
- **递归**：任何子任务的 executor 都可以再是 Planner+agent-loop，深度受 `depth` 上限约束；每棵子树有独立预算，耗尽即升级（escalated）而非无限烧 token。

### 5.3 调度

不做新调度器：任务状态机落在 `agent_tasks` 表，引擎事件总线驱动——子任务 run 终态发领域事件 → TaskService 更新任务状态、解锁后继任务 → 调用引擎 startRun 执行下一个就绪任务（executor 为 sub_workflow 时）或直接驱动 AgentRuntime（executor 为 agent_loop 时）。现有 sub-workflow 节点的"轮询子运行至终态"模式扩展为动态派生。

---

## 6. 支柱四：质量管理（验证器分层 + 质量门）

### 6.1 核心原则

**子任务没有"完成"，只有"通过验收"。** 验收标准在任务 spec 中声明（Planner 生成任务树时一并生成），产出必须过验证器。

### 6.2 验证器分层（便宜优先，昂贵兜底）

1. **规则验证**（毫秒级，必跑）：输出 schema 校验、JSON 可解析、必填字段、长度/格式约束。
2. **工具验证**（能跑就跑）：代码类任务跑测试/编译（复用 code 节点 vm 沙箱）、SQL 类 dry-run、数据类抽样核对。
3. **LLM 评判**（按需）：rubric 打分（相关性、完整性、事实性），输出 0-1 质量分 + 具体缺陷列表。
4. **人工验收**（关键路径）：复用 human-review 节点——高风险类目、质量分在灰区（如 0.6-0.8）、或重试耗尽时升级给人。支柱一修好后跨重启可用。

### 6.3 失败处理链

```
验证失败 → 带反馈重试（缺陷列表喂回 agent 再来一轮，Reflexion 式）
        → 重试达上限 → 触发该子树重规划（支柱三）
        → 重规划仍失败 / 预算耗尽 → escalated 升级人工
```

### 6.4 防偏差累积

- 质量分沿任务树向上聚合，父任务/根任务可见子树健康度；
- 验收结果回写知识飞轮（`memory_entries.success_count` 等）——"哪类做法能通过验收"是最有价值的记忆，支柱二与支柱四在此闭环；
- 全局策略可配：各类目任务的验证器组合、灰区阈值、重试上限。

---

## 7. AgentRuntime 详设

### 7.1 模块组成（`src/core/services/agent-runtime/`）

| 模块 | 职责 |
|------|------|
| `agent-runtime.service.ts` | 主循环编排：while (!converged) { LLM 决策 → 工具执行 → 回填 → saveState } |
| `planner.ts` | 任务分解 / 重规划（支柱三） |
| `verifier.ts` | 质量门（支柱四） |
| `memory/` | 飞轮读写、上下文装配（支柱二） |
| `tool-gateway.ts` | 工具白名单装配、调用分发、结果截断、调用计数 |
| `trajectory.ts` | 迭代轨迹落库（`agent_trajectories`） |
| `guardrails.ts` | maxIterations / maxTokens / maxToolCalls / 时长预算 |

### 7.2 主循环伪代码

```ts
async run(task: AgentTask, host: AgentHost): Promise<AgentResult> {
  const state = (await host.loadState()) ?? initState(task);
  const memoryCtx = await memory.assemble(task.spec, state.budget);
  while (!state.converged) {
    guardrails.check(state);                       // 超限 → 终止并输出原因
    const decision = await llm.decide({            // tool-calling 协议层（§8）
      system: buildSystemPrompt(task, memoryCtx),
      messages: state.messages,
      tools: toolGateway.exposedTools(task.toolWhitelist),
    });
    if (decision.type === 'final') { state.converged = true; break; }
    if (decision.type === 'human_request') {       // 需要人工
      const resume = await host.suspend({ payload: decision.payload });
      state.messages.push(asToolResult(resume));   // resume 回调带着人工决策回到这里
      continue;
    }
    const results = await toolGateway.executeAll(decision.toolCalls);
    state.messages.push(...asToolMessages(results));
    trajectory.append(state.iteration, decision, results);
    await host.saveState(state);                   // 每轮落库，崩溃可续
    state.iteration++;
  }
  const verification = await verifier.verify(task, state.output);
  return { output: state.output, verification };
}
```

`AgentHost` 接口由宿主实现——工作流 agent-loop 节点的实现 = `saveState/loadState` 走 node_run.state_json、`suspend` 翻译成引擎 waiting_review；未来聊天/其他宿主提供各自实现。

### 7.3 护栏

agent-loop 节点 config：`maxIterations`（默认 20）、`maxTokens`、`maxToolCalls`、`maxDurationMs`、工具白名单。节点级护栏必须存在，因为引擎的 maxNodeRuns/maxDurationMs 对节点内循环无效（S6）。AI 调用并发配额后续在 provider 层统一补（与 harness 正交）。

---

## 8. AI 层：tool-calling 协议层

### 8.1 类型扩展

- `ChatContext` 增加 `tools?: AgentToolSpec[]`、`toolChoice?: 'auto' | 'none' | { name }`；消息类型增加 `role: 'tool'` 与 `toolCalls` 字段。
- `StreamCallback` 增加 `tool_call` 增量事件（流式工具调用参数拼装）。
- `CallAIStreamResult` 增加 `toolCalls?: ParsedToolCall[]`。

### 8.2 provider 适配（分两批）

- **第一批**：OpenAI 兼容系（openai/deepseek/moonshot/百联/智谱/volcengine 兼容模式/custom-model）——同一协议，改 `OpenAISdkProvider` 一处覆盖大半。
- **第二批**：Anthropic（tool_use 块）、Google（functionCall）原生 SDK。
- **降级路径**：`model-detector.service.ts` 启发式扩展 capability 标记；不支持原生 tool-calling 的模型退化为 prompt-based JSON 协议（系统提示约定格式 + 解析器兜底 + 严格校验），保证 10 家 provider 全部可用，重要场景在 UI 提示选用原生支持模型。

---

## 9. 工具层：节点即工具（AgentToolRegistry）

- 统一注册表：工作流节点、ToolService 预设/自定义工具、oas-tool 操作，均可导出为 LLM tool（name / description / JSON Schema / 执行器）。
- 补机器可读参数 schema：`NODE_TYPE_CATALOG` 与 custom_tools 增加 `jsonSchema` 字段，从高频节点开始逐步补齐（不再从 UI 表单 schema 硬凑）。
- 安全：所有经 AgentToolRegistry 的出网调用继续走 `http-fetch` 的 SSRF 闸门；CLI 类工具保留桌面端 RCE 门禁；凭据注入维持 ToolService 现有机制，**LLM 永远看不到明文凭据**（占位符在执行层替换）。
- MCP：后期单独立项（全新子系统），不阻塞主线。

---

## 10. 工作流引擎扩展点汇总（引擎本体改动清单）

| # | 改动 | 位置 | 性质 |
|---|------|------|------|
| E1 | `workflow_run_events` 表 + 引擎状态变迁追加事件 + boot 重放恢复 | engine + workflow-run.service | 新增，不动调度逻辑 |
| E2 | `workflow_node_runs.state_json` 列 + context.saveState/loadState | node-handler.ts、迁移 | 新增 API |
| E3 | handler 可选 `resume()` 回调；applyReviewDecision 优先回调 | workflow-engine.service.ts:553-570 | 行为扩展，向后兼容 |
| E4 | agent-loop 节点（catalog/types/handler/forms 四件套） | nodes/agent-loop-node.ts 等 | 纯新增 |
| E5 | workflow_runs 加 task_id / parent_run_id 列 | 迁移 | 新增列 |
| E6 | （业务化阶段）放开单实例互斥、reviewDecide 操作者校验、human-review 加 assignee | workflow-run.service、engine | 见 lan-collab 文档 E1-E4 |

## 11. 前端

- agent-loop 节点：面板/配置表单元数据驱动，零改动。
- **新增 agent 轨迹视图**：运行详情页对 agent-loop 节点展示逐轮 thought → tool_call → result 时间线（读 `agent_trajectories`），token 用量汇总。这是调试 agent 的必需品。
- 任务树视图：根任务页展示树形结构、各节点状态与质量分。
- 记忆管理页：候选记忆审批列表（闸门）、记忆条目检索/归档。
- 复用：human-review 批准/驳回/改后批准组件、RunInputForm 动态表单。

## 12. 非目标（本期不做）

- 多智能体协作（agent 之间互相委派/辩论）。
- MCP 工具生态接入（单独立项）。
- 模型微调/RL 式自我训练（飞轮只做记忆层进化，不动模型权重）。
- 完整 BPMN 级审批套件（会签/或签/转交/催办作为 approval 业务包在 M4 后按需扩展，见 18 号文档）。

---

## 13. 详细设计文档索引

本总纲定架构与共享契约（表名、扩展点 E1-E6、分期边界）；施工细节以各模块文档为准，冲突时以本总纲为准。

- [10-event-system.md](./10-event-system.md) —— 通用事件平台：统一事件信封、持久化订阅、双端投递通道
- [11-run-journal.md](./11-run-journal.md) —— 运行事件溯源与恢复（journal / state_json / resume 回调，落地 E1-E3）
- [12-agent-runtime.md](./12-agent-runtime.md) —— AgentRuntime 主运行时（本文 §7 的施工详设）
- [13-ai-tool-calling.md](./13-ai-tool-calling.md) —— AI 层 tool-calling 协议（本文 §8）
- [14-tool-registry.md](./14-tool-registry.md) —— AgentToolRegistry 节点即工具（本文 §9）
- [15-memory-flywheel.md](./15-memory-flywheel.md) —— 知识飞轮（本文 §4）
- [16-task-tree.md](./16-task-tree.md) —— 任务树与规划调度（本文 §5）
- [17-quality-gate.md](./17-quality-gate.md) —— 质量门与验证器（本文 §6）
- [18-business-pack.md](./18-business-pack.md) —— 业务包架构（业务无关内核之上，各类业务以包接入；本文 §2 业务包层）
- [19-refactoring-assessment.md](./19-refactoring-assessment.md) —— 现有系统重构评估（模块盘点、修改清单、可行性与工作量）

---

*证据与现状细节见 §1；分期路线与验收标准见 [02-implementation-plan.md](./02-implementation-plan.md)。*
