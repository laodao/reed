# Agent Loop Harness —— AI 原生通用业务平台设计

> 日期：2026-08-28 ｜ 状态：设计中（未实施）｜ 分支：feat/workflow-engine

## 愿景

将本项目从"AI 工具箱 + 工作流引擎"升级为 **AI 原生的通用业务平台**：AI、工具、外部接口、数据完全融合，以流程驱动业务，核心是一个全新的 **harness**（AgentRuntime）——支持 LLM tool-call 循环、可持久化可重放、带知识飞轮（自我进化记忆）、任务树分解与质量门。

## 文档索引

- [01-design-spec.md](./01-design-spec.md) —— 设计方案：可行性评估、总体架构、四大支柱（事件溯源 / 知识飞轮 / 任务树 / 质量门）、AgentRuntime 详设、AI 协议层、工具注册表、数据模型、非目标
- [02-implementation-plan.md](./02-implementation-plan.md) —— 实施方案：分期路线 M1–M4、每期验收标准、风险与开放问题

模块级详细设计（总纲定架构与共享契约，施工细节以各文档为准）：

- [10-event-system.md](./10-event-system.md) —— 通用事件平台：统一事件信封、持久化订阅（游标/at-least-once）、双端投递通道，引擎降级为其 producer
- [11-run-journal.md](./11-run-journal.md) —— 运行事件溯源与恢复：`workflow_run_events` journal、boot 重放、handler `resume()` 回调、节点 state API（落地总纲 E1-E3）
- [12-agent-runtime.md](./12-agent-runtime.md) —— AgentRuntime 主运行时：LLM tool-call 循环、AgentHost 契约、轨迹表与护栏
- [13-ai-tool-calling.md](./13-ai-tool-calling.md) —— AI 层 tool-calling 协议：类型扩展、10 家 provider 适配、prompt-based 降级
- [14-tool-registry.md](./14-tool-registry.md) —— AgentToolRegistry 节点即工具：统一注册表、机器可读 schema、调用审计
- [15-memory-flywheel.md](./15-memory-flywheel.md) —— 知识飞轮：蒸馏 / 闸门 / 装配 / 代谢四环与记忆数据模型
- [16-task-tree.md](./16-task-tree.md) —— 任务树与规划调度：`agent_tasks` 状态机、递归规划、就绪驱动
- [17-quality-gate.md](./17-quality-gate.md) —— 质量门与验证器：四层验证、带反馈重试、质量分沿树聚合
- [18-business-pack.md](./18-business-pack.md) —— 业务包架构：平台业务无关内核之上，各类业务以包接入（Pack Manifest、内核与包边界、ai-coding/approval/content-production 示例包、包级度量回流）
- [19-refactoring-assessment.md](./19-refactoring-assessment.md) —— 现有系统重构评估：全量模块盘点、A/B/C/D 四类修改清单、可行性结论、工作量估算（180-250 人日）与迁移策略
- [20-cordis-evaluation.md](./20-cordis-evaluation.md) —— cordis 插件框架调研：时空可组合性机制与 business-pack 的范式错位分析、复用三选项、收缩后吸收的 3 条原则与终局参考定位

## 核心结论（TL;DR）

1. **可行**。现有工作流引擎的挂起/恢复、checkpoint、触发器、人机交互、双端持久化是现成地基；前端编辑器元数据驱动，新增节点零改动。
2. **正确定位**：不是"用工作流引擎模拟 agent 循环"，而是 **harness 是独立运行时（AgentRuntime），工作流引擎是它的宿主之一**。引擎只需三个扩展点：节点状态持久化、可恢复挂起（resume 回调）、节点内循环护栏。
3. **四大支柱共享一套架构**：运行事件日志（journal）既是恢复/重放手段，又是知识飞轮的情景记忆来源；任务树镜像运行森林；质量门的验证结果回写飞轮。事件机制已独立为通用平台能力（10 号文档），journal 则是引擎私有的强一致日志（11 号文档）。
4. **最大风险**不在引擎，而在 AI 层 tool-calling 的 10 家 provider 适配，以及知识飞轮的记忆污染控制。
5. **平台内核业务无关**；AI 编码、审批、内容生产等均为业务包（18 号文档），harness 能力对所有业务复用。
