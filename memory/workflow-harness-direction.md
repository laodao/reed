---
name: workflow-harness-direction
description: 架构决策：Agent/助手能力由未来独立 harness 提供，工作流保持通用编排、消费系统能力
metadata:
  type: project
---

用户决策（2026-08-17，工作流引擎片8 后）：**不做助手节点（Agent 自主循环节点）**。用户后续会单独做一个 harness（对应本会话最初调研的 AI agent harness 方向，当时推荐 Vercel AI SDK 路线），Agent 能力在 harness 中提供。

**Why:** 工作流与 Agent 是两层：workflow=节点间确定性编排，harness=节点内自主循环。分离演进，各自专注。

**How to apply:**
- 工作流节点定位 = **系统已有能力的薄适配器**（LLM/KB/搜索/HTTP/语音/长文…），新增能力优先做成系统服务或 harness 服务，再由节点消费
- 未来 harness 成型后，接入方式 = 新增一个调用 harness 的工作流节点（走组件化三步：目录+handler+表单），引擎零改动
- 任何新组件必须保持通用性、可扩展（组件化机制：NODE_TYPE_CATALOG + NODE_CONFIG_FORMS + handler，见 src/core/modules/workflow/nodes/README.md）
- MySQL sql-agent 类深度代理不做；自定义工具生态（OAS）等 harness 一起设计
