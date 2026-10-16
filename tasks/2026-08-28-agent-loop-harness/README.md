# Agent Loop Harness —— AI 原生通用业务平台设计

> 日期：2026-08-28（v1）· 2026-09-06 整合修订（v2）｜ 状态：**设计定稿，M1 待启动** ｜ 分支：feat/agent-harness
>
# Agent Loop Harness —— AI 原生通用业务平台设计

> 日期：2026-08-28（v1）· 2026-09-06 整合修订（v2）｜ 状态：**设计定稿，M1 待启动** ｜ 分支：feat/agent-harness
>
> **单一事实源声明（2026-09-06 起）**：harness 相关设计与实现一律以本目录文档为准。
> 各规格的"2026-09-06 修订"节是最新有效内容（循环载体=AI SDK v6 + @openharness/core、
> 工具/记忆/事件为通用平台模块、图谱融合），与原文冲突处以修订节为准。
> `docs/design/2026-09-05-agent-harness-*.md` 两份降级为调研过程记录。
>
> **路径映射（阅读原文用，2026-09-06 深度 review 增）**：原文写作于插件架构三期重构之前，
> 其中旧路径一律按此映射：`src/core/modules/workflow/*` → `src/core/platform/workflow/*`；
> `src/core/services/*` → `src/core/platform/services/*`；`src/core/services/agent-runtime/` →
> `src/core/platform/agent-runtime/`（23 号契约落点）；业务 handler/services → `src/core/packs/<业务>/`。
> 原文中的 `file:line` 证据行号随重构漂移，以符号名为准。

## 愿景

将本项目从"AI 工具箱 + 工作流引擎"升级为 **AI 原生的通用业务平台**：AI、工具、外部接口、数据完全融合，以流程驱动业务，核心是一个全新的 **harness**（AgentRuntime）——支持 LLM tool-call 循环、可持久化可重放、带知识飞轮（自我进化记忆）、任务树分解与质量门。

## 文档索引

> **业务模块开发者入口（2026-09-11 增）**：接入 Agent 请先读
> [docs/development/agent-integration-guide.md](../../docs/development/agent-integration-guide.md)
> （怎么用）；本目录是设计/契约/实施过程档案（怎么改）。近期增量见各号文档
> （40-42 上下文成本与评审修复、43 codex 对标、44 本地能力包、47 恢复能力面）。

- [01-design-spec.md](./01-design-spec.md) —— 设计方案：可行性评估、总体架构、四大支柱（事件溯源 / 知识飞轮 / 任务树 / 质量门）、AgentRuntime 详设、AI 协议层、工具注册表、数据模型、非目标
- [02-implementation-plan.md](./02-implementation-plan.md) —— 实施方案：分期路线 M1–M4、每期验收标准、风险与开放问题

模块级详细设计（总纲定架构与共享契约，施工细节以各文档为准）：

- [10-event-system.md](./10-event-system.md) —— 通用事件平台：统一事件信封、持久化订阅（游标/at-least-once）、双端投递通道，引擎降级为其 producer（**已实现**：platform/services/event-system/）
- [11-run-journal.md](./11-run-journal.md) —— 运行事件溯源与恢复：`workflow_run_events` journal、boot 重放、handler `resume()` 回调、节点 state API（落地总纲 E1-E3）
- [12-agent-runtime.md](./12-agent-runtime.md) —— AgentRuntime 主运行时：LLM tool-call 循环、AgentHost 契约、轨迹表与护栏
- [13-ai-tool-calling.md](./13-ai-tool-calling.md) —— AI 层 tool-calling 协议：类型扩展、10 家 provider 适配、prompt-based 降级
- [14-tool-registry.md](./14-tool-registry.md) —— AgentToolRegistry 节点即工具：统一注册表、机器可读 schema、调用审计
- [15-memory-flywheel.md](./15-memory-flywheel.md) —— 知识飞轮：蒸馏 / 闸门 / 装配 / 代谢四环与记忆数据模型
- [16-task-tree.md](./16-task-tree.md) —— 任务树与规划调度：`agent_tasks` 状态机、递归规划、就绪驱动
- [17-quality-gate.md](./17-quality-gate.md) —— 质量门与验证器：四层验证、带反馈重试、质量分沿树聚合
- [18-business-pack.md](./18-business-pack.md) —— 业务包架构（**已由插件架构三期落地**：core/packs/ + core/platform/；manifest/activate/IPC 守卫/kernel 与本文契约一致）
- [19-refactoring-assessment.md](./19-refactoring-assessment.md) —— 现有系统重构评估：全量模块盘点、A/B/C/D 四类修改清单、可行性结论、工作量估算（180-250 人日）与迁移策略
- [20-cordis-evaluation.md](./20-cordis-evaluation.md) —— cordis 插件框架调研：时空可组合性机制与 business-pack 的范式错位分析、复用三选项、收缩后吸收的 3 条原则与终局参考定位
- [21-oss-adoption.md](./21-oss-adoption.md) —— **开源采纳决策（2026-09-06 定稿）**：AI SDK v6 + @openharness/core 路线（调研+运行级 spike 证据）、12/13/14/15 号规格的修订依据、宿主融合、里程碑映射
- [22-make-or-buy-audit.md](./22-make-or-buy-audit.md) —— **自研/开源逐模块审计（2026-09-06 定稿，修订 21 号决策一）**
- [23-interface-contracts.md](./23-interface-contracts.md) —— **接口契约层（2026-09-06 定稿）**：全部模块对外接口的唯一权威定义（门面/AgentHost/工具/审批/循环/上下文/持久化/记忆/图谱/Provider/事件/M3 预留）+ 契约纪律（只加不改/最小面/可注入）与替换纪律——**接口先行，实现可重写替换**：open-harness 全量源码深读四项发现（轮级持久化/审批粒度/双组合 API/循环极薄）→ 依赖面收缩为 ai@6 三包 + 三模块 vendor；21 个模块逐一定型；架构统一性论证
- [24-codex-borrowings.md](./24-codex-borrowings.md) —— **codex 借鉴采纳决策（2026-09-06 定稿）**：经 soft-fac 项目 13 份 codex 深度调研（@008bbd58 实读）映射过滤——第一梯队 7 项（压缩守恒/WorldState diff/审批 Amendment 沉淀/无头审批三态/工具并行门/终态事件必达）落 12/15/23 号修订；不采纳 7 项（沙箱/JSONL 双层/MCP server 等，场景不符）

## 核心结论（TL;DR）

1. **可行**。现有工作流引擎的挂起/恢复、checkpoint、触发器、人机交互、双端持久化是现成地基；前端编辑器元数据驱动，新增节点零改动。
2. **正确定位**：不是"用工作流引擎模拟 agent 循环"，而是 **harness 是独立运行时（AgentRuntime），工作流引擎是它的宿主之一**。引擎只需三个扩展点：节点状态持久化、可恢复挂起（resume 回调）、节点内循环护栏。
3. **四大支柱共享一套架构**：运行事件日志（journal）既是恢复/重放手段，又是知识飞轮的情景记忆来源；任务树镜像运行森林；质量门的验证结果回写飞轮。事件机制已独立为通用平台能力（10 号文档），journal 则是引擎私有的强一致日志（11 号文档）。
4. **最大风险**不在引擎，而在 AI 层 tool-calling 的 10 家 provider 适配，以及知识飞轮的记忆污染控制。
5. **平台内核业务无关**；AI 编码、审批、内容生产等均为业务包（18 号文档），harness 能力对所有业务复用。
6. **（2026-09-06，经 22 号源码审计后定稿）协议与调用用开源，循环与语义全自研**：
   依赖仅 `ai@^6` + `@ai-sdk/openai-compatible` + `zod@4`（循环为 ai@6 单步手动循环自研，
   ~200 行，步级状态可控）；open-harness 降级为三模块 vendor（压缩/重试形状/todos，<400 行）。
   工具/记忆/事件均为通用平台模块（消费面覆盖 agent、工作流、业务包）；记忆融合长文图谱
   （StructuralMemoryStore + 一致性验证器通用化）。全部对外接口以 23 号契约层为准。
   版本红线：钉 ai@6（ai@7 需 Node≥22）。
：harness 相关设计与实现一律以本目录文档为准。
> 各规格的"2026-09-06 修订"节是最新有效内容（循环载体=AI SDK v6 + @openharness/core、
> 工具/记忆/事件为通用平台模块、图谱融合），与原文冲突处以修订节为准。
> `docs/design/2026-09-05-agent-harness-*.md` 两份降级为调研过程记录。
>
> **路径映射（阅读原文用，2026-09-06 深度 review 增）**：原文写作于插件架构三期重构之前，
> 其中旧路径一律按此映射：`src/core/modules/workflow/*` → `src/core/platform/workflow/*`；
> `src/core/services/*` → `src/core/platform/services/*`；`src/core/services/agent-runtime/` →
> `src/core/platform/agent-runtime/`（23 号契约落点）；业务 handler/services → `src/core/packs/<业务>/`。
> 原文中的 `file:line` 证据行号随重构漂移，以符号名为准。

## 愿景

将本项目从"AI 工具箱 + 工作流引擎"升级为 **AI 原生的通用业务平台**：AI、工具、外部接口、数据完全融合，以流程驱动业务，核心是一个全新的 **harness**（AgentRuntime）——支持 LLM tool-call 循环、可持久化可重放、带知识飞轮（自我进化记忆）、任务树分解与质量门。

## 文档索引

- [01-design-spec.md](./01-design-spec.md) —— 设计方案：可行性评估、总体架构、四大支柱（事件溯源 / 知识飞轮 / 任务树 / 质量门）、AgentRuntime 详设、AI 协议层、工具注册表、数据模型、非目标
- [02-implementation-plan.md](./02-implementation-plan.md) —— 实施方案：分期路线 M1–M4、每期验收标准、风险与开放问题

模块级详细设计（总纲定架构与共享契约，施工细节以各文档为准）：

- [10-event-system.md](./10-event-system.md) —— 通用事件平台：统一事件信封、持久化订阅（游标/at-least-once）、双端投递通道，引擎降级为其 producer（**已实现**：platform/services/event-system/）
- [11-run-journal.md](./11-run-journal.md) —— 运行事件溯源与恢复：`workflow_run_events` journal、boot 重放、handler `resume()` 回调、节点 state API（落地总纲 E1-E3）
- [12-agent-runtime.md](./12-agent-runtime.md) —— AgentRuntime 主运行时：LLM tool-call 循环、AgentHost 契约、轨迹表与护栏
- [13-ai-tool-calling.md](./13-ai-tool-calling.md) —— AI 层 tool-calling 协议：类型扩展、10 家 provider 适配、prompt-based 降级
- [14-tool-registry.md](./14-tool-registry.md) —— AgentToolRegistry 节点即工具：统一注册表、机器可读 schema、调用审计
- [15-memory-flywheel.md](./15-memory-flywheel.md) —— 知识飞轮：蒸馏 / 闸门 / 装配 / 代谢四环与记忆数据模型
- [16-task-tree.md](./16-task-tree.md) —— 任务树与规划调度：`agent_tasks` 状态机、递归规划、就绪驱动
- [17-quality-gate.md](./17-quality-gate.md) —— 质量门与验证器：四层验证、带反馈重试、质量分沿树聚合
- [18-business-pack.md](./18-business-pack.md) —— 业务包架构（**已由插件架构三期落地**：core/packs/ + core/platform/；manifest/activate/IPC 守卫/kernel 与本文契约一致）
- [19-refactoring-assessment.md](./19-refactoring-assessment.md) —— 现有系统重构评估：全量模块盘点、A/B/C/D 四类修改清单、可行性结论、工作量估算（180-250 人日）与迁移策略
- [20-cordis-evaluation.md](./20-cordis-evaluation.md) —— cordis 插件框架调研：时空可组合性机制与 business-pack 的范式错位分析、复用三选项、收缩后吸收的 3 条原则与终局参考定位
- [21-oss-adoption.md](./21-oss-adoption.md) —— **开源采纳决策（2026-09-06 定稿）**：AI SDK v6 + @openharness/core 路线（调研+运行级 spike 证据）、12/13/14/15 号规格的修订依据、宿主融合、里程碑映射
- [22-make-or-buy-audit.md](./22-make-or-buy-audit.md) —— **自研/开源逐模块审计（2026-09-06 定稿，修订 21 号决策一）**
- [23-interface-contracts.md](./23-interface-contracts.md) —— **接口契约层（2026-09-06 定稿）**：全部模块对外接口的唯一权威定义（门面/AgentHost/工具/审批/循环/上下文/持久化/记忆/图谱/Provider/事件/M3 预留）+ 契约纪律（只加不改/最小面/可注入）与替换纪律——**接口先行，实现可重写替换**：open-harness 全量源码深读四项发现（轮级持久化/审批粒度/双组合 API/循环极薄）→ 依赖面收缩为 ai@6 三包 + 三模块 vendor；21 个模块逐一定型；架构统一性论证
- [24-codex-borrowings.md](./24-codex-borrowings.md) —— **codex 借鉴采纳决策（2026-09-06 定稿）**：经 soft-fac 项目 13 份 codex 深度调研（@008bbd58 实读）映射过滤——第一梯队 7 项（压缩守恒/WorldState diff/审批 Amendment 沉淀/无头审批三态/工具并行门/终态事件必达）落 12/15/23 号修订；不采纳 7 项（沙箱/JSONL 双层/MCP server 等，场景不符）

## 核心结论（TL;DR）

1. **可行**。现有工作流引擎的挂起/恢复、checkpoint、触发器、人机交互、双端持久化是现成地基；前端编辑器元数据驱动，新增节点零改动。
2. **正确定位**：不是"用工作流引擎模拟 agent 循环"，而是 **harness 是独立运行时（AgentRuntime），工作流引擎是它的宿主之一**。引擎只需三个扩展点：节点状态持久化、可恢复挂起（resume 回调）、节点内循环护栏。
3. **四大支柱共享一套架构**：运行事件日志（journal）既是恢复/重放手段，又是知识飞轮的情景记忆来源；任务树镜像运行森林；质量门的验证结果回写飞轮。事件机制已独立为通用平台能力（10 号文档），journal 则是引擎私有的强一致日志（11 号文档）。
4. **最大风险**不在引擎，而在 AI 层 tool-calling 的 10 家 provider 适配，以及知识飞轮的记忆污染控制。
5. **平台内核业务无关**；AI 编码、审批、内容生产等均为业务包（18 号文档），harness 能力对所有业务复用。
6. **（2026-09-06，经 22 号源码审计后定稿）协议与调用用开源，循环与语义全自研**：
   依赖仅 `ai@^6` + `@ai-sdk/openai-compatible` + `zod@4`（循环为 ai@6 单步手动循环自研，
   ~200 行，步级状态可控）；open-harness 降级为三模块 vendor（压缩/重试形状/todos，<400 行）。
   工具/记忆/事件均为通用平台模块（消费面覆盖 agent、工作流、业务包）；记忆融合长文图谱
   （StructuralMemoryStore + 一致性验证器通用化）。全部对外接口以 23 号契约层为准。
   版本红线：钉 ai@6（ai@7 需 Node≥22）。
