# 37 · 知识飞轮分层可视化 + L2/L3 记忆产生渠道（2026-09-09）

## 0. 背景

KE 批（34/35 号）的分层装配全部落在后端（scope 列/分层召回/向量混合检索/图谱），
界面只有最小改动；且 `create_task_plan` 从不传 scope → `scopeTag` 恒空 → 任务蒸馏
全部落用户级 L1，**业务级/项目级记忆没有产生渠道**。用户实测反馈「界面没有任何变化」
成立。本批补两件事：

1. **数据侧**：create_task_plan 打 scopeTag——L2/L3 记忆有产生渠道；
2. **界面**：AgentMemoryView 可视化分层——徽章/筛选/向量状态/来源/召回计数。

## 1. 数据侧：scope 经 runtimeContext 透传（唯一权威来源=宿主声明）

- 各宿主在 `runtimeContext.memoryScope` 声明业务归属（lw=longwriting/ep=episode-
  production，含 projectId；聊天宿主不声明=用户级，语义不变）；
- `create_task_plan` 工具读 `ctx.logContext.memoryScope` → `createPlan(goal, { scope })`
  （createPlan 本就支持——KE-1 已实现 spec.scopeTag 盖章，蒸馏时 task-service 消费）；
- 手工录入（am:add-manual）已有 scope 字段，不变。

## 2. 界面（AgentMemoryView）

| 项 | 形态 | 数据源（均已落库，零迁移） |
|---|---|---|
| 层级徽章 | el-tag：用户级=info / 业务=warning / 项目=success | bizModule/projectId |
| 层级筛选 | 工具栏 radio：全部/用户级/业务级/项目级（前端过滤两张表） | 同上 |
| 向量状态 | 已生效表新列：`✓ <embedModel>` / 未向量 | embeddingId/embedModel |
| 来源 | 层级列下方小字：`任务 <id前8>` / `运行 <id前8>` / 手工 | sourceTaskId/sourceRunId |
| 召回计数 | 已生效表已有「命中/成功」列（useCount/successCount），不变 | useCount/successCount |

## 3. 边界与评审处置

- 「召回预览」（本轮 Agent 实际召回了哪几条）已在工作台会话抽屉（36 号前实测反馈批）
  以 memory_assembly 分组呈现，本批不重复建设；
- L0 快照变更钩子/24h 重算仍为独立遗留项（KE 批登记），不入本批。

## 4. 对抗评审处置（2026-09-09）

- **P1-1（已修）**：LW 宿主 pack 绑定不含 builtin 规划工具，memoryScope 曾为死接线——
  LW bindings 显式追加 `create_task_plan`（对齐 EP 形态），系统提示词补规划判断纪律
  （简单请求直执行，跨章节/跨阶段大目标才建树）。至此 L2/L3 渠道 EP/LW 双侧接通。
- **P2-2（已修）**：局部重规划的子节点 scopeTag 从失败任务 spec 继承（planner 不产
  scopeTag，此前重规划链蒸馏会退化 L1；node 自身产出优先）。
- **P2-1（登记）**：`at:create-plan` 手工路径（任务树页直接建计划）恒用户级——通用页
  无宿主上下文，与手工录入对话框的可选 scope 不对称；后续需要时给表单加可选 scope。
- **P2-3（登记）**：loop 合并 runtimeContext→logContext 的「并侧」无独立断言（机制与
  turnModel/catalogPaks 同款预存）；host-kit.spec 的 runtimeContext 透传测试部分覆盖。
- **P2-4（登记，预存）**：LW 的 `lwTurn`（含 db/ai/emit 函数）随 logContext 进工具审计
  contextJson，`JSON.stringify` 疑似循环引用失败被 catch 吞——LW 工具审计行疑似未落库
  （早于本批）。待运行时验证 agent_tool_calls 中 LW 行；修复方向=审计落库换
  safe-stringify 或剥离非序列化键。
