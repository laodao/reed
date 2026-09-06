# 02 · 实施方案（Implementation Plan）

> Agent Loop Harness ｜ 2026-08-28 ｜ 配套文档：[01-design-spec.md](./01-design-spec.md)
>
> **2026-09-06 修订（21 号决策落地）**：M1 第 3 项"tool-calling 协议层第一批"改为
> "AI SDK v6 接入"（调研+运行级 spike 已完成，见 21 号；自研十家适配取消）；
> M1 新增前置：骨架迁移（`src/core/agent/` → `platform/agent-runtime/`）与依赖钉版本。
> M4 野生 agent 迁移执行 G1-G5 门禁（单测→冒烟→golden→影子→切换）。
> 已完成前置：① 10-event-system（平台事件总线已实现，引擎已接入）；
> ② 18-business-pack（插件架构三期落地：core/packs + core/platform）；
> ③ 开源调研与 spike（21 号 + docs/design/2026-09-05 两份过程文档）；
> ④ agent-runtime 骨架 13 文件（commit be56607f，M0 第一步迁移）。
>
> **进度（2026-09-06 深度 review 时点）**：M1-P1 已完成并提交（46a66c05）——契约类型
> （shared/agent.types + runtime/types）、ProviderAdapter（fallback 链/LRU/类型化错误）、
> LoopRunner 手动循环（步级 saveState/护栏/工具六层包装含审批短路），21 单测全绿，
> 实测澄清：ai@6 对 zod 入参的校验先于 execute（包装层 safeParse 为纵深防御）。
> 待办：P2 journal E1-E3 → P3 agent-loop 节点 → 门面/审批协调器/持久化/事件桥 → P4 冒烟。
> 另：Electron 已升 44（chore/upgrade-electron 分支 de7c47da，零测试回归），
> 21 号 §1.3 红线依据已相应更新。
>
> **进度（2026-09-06 实施推进，feat/agent-harness 分支）**：
> - 循环/审批/事件桥批（ApprovalCoordinator 含 Amendment 缓存与 ALS 捕获、
>   EventBridge 复用平台 event-producer 公共底座、限流器 fail-fast 清晰报错）已提交并经
>   独立 subagent 复审（双路径事件架构定稿，23 号 §7）。
> - **批 3 SessionStore 已完成**：agent_sessions 表（create-agent-tables 迁移双方言幂等，
>   agent_memories 一并建表）、AgentSessionRepository（scoped 读 + 事务全量替换、
>   userId 同步捕获注入）、AgentSessionStore 双实现（InMemory structuredClone 深隔离 /
>   DB）、fail-fast 错误纪律（512KB 按 UTF-8 字节拒存、损坏行/seq 断档拒读）；
>   18 单测全绿（含 5000 条分块插入回归、跨租户 ALS 隔离、精确边界值）。
>   独立 review 放行；P2（SQLite 绑定变量上限→事务内 500 行分块）已修复。
>   已知边界（23 号 §11 增补）：uq_agent_sessions_conv_seq 对 user_id NULL 行不生效
>   （NULL≠NULL 方言语义），桌面端由 sqlite 串行门 + 启动注入默认用户兜底。
> - 下一批：AgentRuntime 门面（互斥/LRU 会话/abort 池/decideApproval/subscribe/health）。
>
> **进度（2026-09-06 批 4 门面已完成，feat/agent-harness bc4805f7 + review 修复）**：
> AgentRuntimeImpl 全量落地（23 号 §1 对外 API + init/get/dispose 单例），独立宿主
> IndependentHost（历史重放/流事件翻译/actionSummaries 轨迹拉链）。独立 review
> 发现 P1（interrupt 恢复后不复查互斥→同 scope 双轮并发，已实证）+ P2×3（错误分发
> ALS 上下文、注销后终态改道默认通道、跨租户同 scope 共享提权面）——全部修复：
> 可重入互斥循环（每轮重取条目复查 busy/resetting）、error 分发 runWithUser 包裹、
> 桥缓存注销保留（仅新定义注册时重建）、条目属主认主 fail-fast
> （AgentScopeOwnerMismatchError，23 号 §11-7）；P3 一组（queue 上限 8/suggestions
> 单次计算防双终态/deltaBuf 空缓冲删除/孤儿审批只清构造前行/reset 排队者类型化
> 拒绝/queue 逐条整轮语义入契约 §1+§11-8/Amendment 寿命 §11-9）。
> 26 门面单测 + 210 全套全绿。已知接线注意：旧前端正文流走独立通道
> （longwriting:generate:*），桥 reply:content 走 agent 主通道——接线批需适配。
> 下一批：ToolRegistry.buildToolDefs / ContextManager / P2 journal E1-E3。

## 分期总览

| 期 | 主题 | 目标 | 依赖 |
|----|------|------|------|
| M1 | 地基 | 事件日志 + 可恢复挂起 + tool-calling 协议层 + agent-loop 最小闭环 | 无 |
| M2 | 工具生态与观测 | AgentToolRegistry、provider 全量适配、轨迹视图 | M1 |
| M3 | 长程能力 | 任务树 + 质量门 + 知识飞轮最小闭环 | M1，部分依赖 M2 |
| M4 | 业务化收口 | 审批缺口补齐、野生 agent 迁移、待办中心 | M1/M3 |

原则：**M1 把三处一次性投资做对（journal、resume 回调、tool-calling），后续各期只加功能不返工地基。**

---

## M1 · 地基（最优先）

### 范围

1. **运行事件日志（spec §3）**
   - 迁移：`workflow_run_events` 表（PC/Web 双端迁移各一份）。
   - 引擎状态变迁点追加事件（edge_activated / node_launched / node_suspended / node_completed / node_failed / review_decided / run_finished）。
   - boot 恢复：重放日志重建 RunExecution；`recoverOnBoot` 重写——running/waiting_review 不再一律标 interrupted，能重建的继续跑。
   - `reviewDecide` 对非活跃挂起 run 改为"rehydrate → 应用决策"。
   - 快照机制可后置到 M1 尾（先全量重放，性能不够再加快照）。
2. **节点状态与可恢复挂起（spec §3.2）**
   - `workflow_node_runs.state_json` 列 + `WorkflowNodeContext.saveState/loadState`。
   - handler 契约加可选 `resume(decision, state)`；`applyReviewDecision` 优先回调，未声明维持旧语义。
   - 修订 handler 契约注释（禁存"仅内存"跨调用状态）。
3. **AI SDK v6 接入（2026-09-06 修订：替代原"tool-calling 协议层第一批"自研方案）**
   - 依赖钉版本：`ai@^6.0.277` + `@ai-sdk/openai-compatible@^2` + `zod@^4`（overrides 锁 ai@6，CI 单版本断言）；压缩/重试形状/todos 走 vendor（22 号 §4），**不依赖** @openharness/core。
   - provider-adapter：getProviderConfig → createOpenAICompatible → LanguageModel（LRU 缓存、SSRF 沿用、结构化日志）。
   - 契约保留项照 13 号修订：能力标记（model-detector）、prompt 降级（ai@6 middleware）、`agent_llm_calls` 审计表。
   - 骨架迁移：`git mv src/core/agent platform/agent-runtime`（13 文件已在 be56607f）。
4. **agent-loop 节点最小版（spec §7，2026-09-06 v2 修订：循环载体=ai@6 单步手动循环，见 22 号审计）**
   - 主循环自研（不传 stopWhen=恰好一步；response.messages 步末拼接；步级 host.saveState），AgentHost 契约照 12 号 R2/R4b。
   - 工具白名单：首批只接入 llm 无关的安全工具子集（http-request、web-search、code、data-table 内置模式）。
   - 护栏：maxIterations（默认 20）/ maxToolCalls / maxDurationMs。
   - catalog/types/handler/forms 四件套 + 一致性单测。
5. **轨迹落库**：`agent_trajectories` 表 + 每轮迭代写入。

### 验收标准

- 用 OpenAI 兼容模型跑"查资料→写摘要"agent：自主完成 ≥5 轮工具调用并收敛输出。
- 运行中杀掉进程重启：run 从中断轮恢复继续，轨迹完整无空洞。
- 循环中挂起等人工确认：批准后**从挂起轮继续**（不是整节点重跑，也不是直接终结）。
- 护栏生效：构造不收敛场景，maxIterations 到达后干净终止并输出失败原因。
- 双端迁移在 SQLite 与 PostgreSQL 均通过；新增引擎行为有单测覆盖。

### 风险

- 引擎恢复路径改动是本批唯一侵入性改动——必须有"旧格式 run（无事件日志）重启"的兼容测试（降级为现有 interrupted 语义）。
- （v2 更新）协议差异由 @ai-sdk/openai-compatible 承担，残余风险为个别国产端点兼容性：M1 用 GLM/DashScope 各跑一轮冒烟。

---

## M2 · 工具生态与观测

### 范围

1. **AgentToolRegistry（spec §9）**：节点即工具统一导出；`NODE_TYPE_CATALOG`/custom_tools 补 `jsonSchema`（高频 15 种节点优先）。
2. **provider 第二批**：Anthropic（tool_use 块）、Google（functionCall）原生适配。
3. **轨迹视图 UI**：运行详情页 agent-loop 节点逐轮 thought/tool_call/result 时间线 + token 汇总。
4. oas-tool V2：支持 `$ref` 与嵌套 schema（提升外部接口接入质量）。
5. token 成本观测：run/节点级 token 与估算成本汇总展示。

### 验收标准

- 白名单内任意节点可被 LLM 正确调用（参数 schema 由 jsonSchema 生成，不再从 UI schema 硬凑）。
- Anthropic/Google 模型跑同一 agent 任务成功率与 OpenAI 系相当。
- 轨迹视图可完整复盘一轮真实运行。

---

## M3 · 长程能力（任务树 + 质量门 + 知识飞轮）

### 范围

1. **任务树（spec §5）**：`agent_tasks` 表、Planner（静态规划 + 局部重规划）、`workflow_runs` 加 task_id/parent_run_id、事件总线驱动调度、深度/预算上限。
2. **质量门（spec §6）**：Verifier 四层（规则→工具→LLM 评判→人工）、带反馈重试、escalated 升级链、质量分沿树聚合。
3. **知识飞轮最小闭环（spec §4）**：`memory_entries` 表、distiller 蒸馏、闸门（查重 + 置信度 + **默认人工批准**）、读取装配进 agent-loop 上下文、LanceDB 复用。代谢作业（cron）可先只做"归档零命中条目"。
4. **任务树视图 UI** + 记忆审批列表 UI。

### 验收标准

- 一个需要 3 层分解的长程任务（如"调研某主题并产出带数据来源的报告"）端到端完成：计划人工批准后执行，子任务逐一过质量门，最终产出通过根任务验收。
- 构造一个必败子任务：观察 带反馈重试 → 重规划 → 升级人工 的完整链路。
- 飞轮：第一次运行产生的经验条目经人工批准后入库；第二次运行相似任务时上下文装配命中该条目（轨迹中可见引用）。

### 风险

- 记忆污染：闸门初期一律人工，宁可慢不可脏。
- Planner 生成任务树的质量不稳定——静态规划必须人工批准后才执行，这是硬性约束。

---

## M4 · 业务化收口

### 范围

1. **审批缺口**（spec §1.2 S7/S8，参照 `tasks/2026-08-27-lan-collab/04-workflow-assignment.md` E1-E4）：human-review/form-collect 加 assignee 配置、node_run 加 assignee_id、reviewDecide 操作者校验、放开单实例互斥（按业务键/发起人维度）、待办中心。
2. **野生 agent 迁移**：episode-production 与长文写作的 agent 编排迁到 AgentRuntime，删除重复实现。
3. 组织模型最小版（团队成员目录，支撑"指派给人"），部门/上下级按需。
4. 按需：驳回重提语义、超时升级、MCP 立项评估。
5. **业务包机制落地**（[18-business-pack.md](./18-business-pack.md)）：Pack Manifest、ai-coding 与 content-production 两个首批包（content-production 即野生 agent 迁移的承载形式）。

### 验收标准

- 多用户场景：A 发起审批流实例、B（被指派审批人）隔天在待办中心批准，全程跨重启、权限校验通过；同流程多实例并发互不阻塞。
- ep/longwriting 全链路回归通过，且运行轨迹可在轨迹视图复盘。

---

## 横切工作（贯穿各期）

- **测试**：引擎恢复路径、resume 回调、协议层各家 provider、护栏触发——每步配单测；M1/M3 各配一个端到端场景测试。遵循项目 TDD 约定。
- **双端**：所有迁移 PC（SQLite）/Web（PostgreSQL）成对编写；PG 端注意占位符（`$1,$2`）与 SQLite（`?`）差异（历史教训）。
- **安全**：新增出网能力一律过 `validateOutboundUrl`；LLM 不可见明文凭据；Web 端新增 IPC/REST 全部注册并鉴权（历史教训：Web 端 IPC 漏注册）。
- **文档**：各期完成时更新本目录文档状态与 `AGENTS.md` 相关约定。

## 开放问题（实施前需决策）

1. `workflow_run_events` 的保留策略：全量保留（审计友好）vs 终态后归档压缩（存储友好）？建议：waiting/人工类全量，普通自动化 run 终态 30 天后归档。
2. prompt-based 降级路径是否允许用于生产关键任务？建议：仅标记为"实验"，关键任务限定原生 tool-calling 模型。
3. 任务树的人工批准粒度：整树一次批准 vs 每层展开时批准？建议：M3 先整树一次，后续按体验加"展开式批准"。
4. 记忆闸门自动化的放开节奏：按类目灰度（先 SOP 类、再事实类），需要运营指标（污染率）支撑，M3 只建人工闸门。
