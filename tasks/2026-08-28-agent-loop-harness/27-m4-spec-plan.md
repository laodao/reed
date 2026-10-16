# 27 · M4 规格与实施计划（业务化收口）

> 状态：执行中（2026-09-07）
> 上游：01 号 §1.2 S7/S8、02 号 §M4、lan-collab/04 号 E1-E4、26 号（任务树/飞轮待办源）

## 0. 本期范围与裁剪决策（诚实边界）

| 项 | 决策 | 说明 |
|----|------|------|
| 待办中心 | **实现** | 单页 `/agent-todos` 聚合三类待办：工作流审批（human-review/form-collect 挂起）、任务树 verifying/escalated、知识飞轮 pending_review——各自带裁决/跳转入口 |
| S7 指派校验 | **实现（最小版）** | human-review 节点 config 可选 `assigneeId`（支持 {{模板}}——引擎深解析自动生效）；reviewDecide 决策前校验操作者 |
| S8 单实例互斥放开 | **已满足（注记）** | 互斥唯一索引已是 (user_id, definition_id) 维度（create-workflow-tables §评审#31/#40）——按发起人天然隔离，无全局互斥 |
| 组织模型 | **裁剪** | 现多租户 user 模型已承载"指派给人"（assigneeId=userId）；部门/上下级按需后置，不预建表 |
| 野生 agent 迁移 | **裁剪（门禁清单）** | ep/longwriting 迁移到 AgentRuntime 需独立立项（行为回归面大）；迁移门禁：单测→冒烟→golden→影子→切换（02 号 G1-G5），本期不启动 |
| 业务包机制 | **裁剪** | 18 号 Pack Manifest 本期不落地；M1-M3 的 at:*/am:* 通道已按 pack 前缀纪律注册（workflow 包），为后续收编留好接缝 |
| 驳回重提语义/超时升级/MCP | **裁剪** | 独立立项评估 |

## 1. 待办中心（`/agent-todos`）

- 三段式聚合页：
  1. **工作流审批**：`wf:get-pending-reviews`（跨定义 waiting_review 行）→ 行内批准/修改后批准/驳回（复用 run detail 的 reviewDecide 语义）+ 跳转运行详情
  2. **任务裁决**：`at:list-roots` → 逐树取 verifying/escalated 节点 → 跳转任务树页裁决（裁决语义已在 AgentTasksView，中心页做入口聚合）
  3. **记忆审批**：`am:list-pending` → 行内批准/归档
- 侧边栏菜单入口 + 页内分标签。

## 2. S7 指派校验（reviewDecide 操作者）

- human-review 表单/配置新增 `assigneeId`（可选字符串，支持 {{模板}}——config 深解析链自动生效）。
- `WorkflowRunService.reviewDecide` 决策前：读 node_run.input_json（引擎挂起时已存解析后 config）取 assigneeId；非空且 ≠ 操作者 → 拒绝（"该审批已指派给其他成员"）。rehydrate 重路由同样受校验（校验在 resumeReview 之前）。
- 不修改 node_run 表结构（assignee 信息随解析 config 落 input_json——01 号"node_run 加 assignee_id"的最小等价实现，注记差异）。

## 3. 验收

- 多用户（Web 语义）：A 发起带 assigneeId=B 的审批流，B 可批、A 被拒；无 assigneeId 时行为不变。
- 待办中心三段聚合可达、裁决直跳可用（PC 端截图验证）。
- 互斥：同 definitionId 不同 user 并发互不阻塞（既有测试钉住，注记）。

## 4. 测试

- reviewDecide 指派校验单测（有/无 assigneeId × 匹配/不匹配）。
- 待办中心为聚合页（数据源均有 IPC 测试覆盖），不做组件快照；PC 启动截图验证。

---

## 5. 实施结果（2026-09-07）

- **待办中心** `/agent-todos`：三段聚合（工作流审批/任务裁决/记忆审批）+ 菜单入口；三源并行加载 + 单调序号防交错；送审内容摘要列 + 修改后批准（ElMessageBox，与运行详情同构）——review M7 盲批修复。
- **S7 指派校验**：human-review config.assigneeId（{{模板}} 经引擎深解析自动生效）+ reviewDecide 前置校验（专用 findWaitingReviewByNode 查询——review M1/M4 修复了无序 findOne 的授权掷骰子）+ nodeType 门与非字符串 warn（M6）；**第二决策入口封堵**：app-session.reviewDecide 委托 runService（M3 直通引擎曾绕过校验）。
- **诚实边界（review M2）**：assignee≠属主时引擎跨租户守卫仍拒绝代执行——指派机制当前生效域为属主匹配场景（PC 单用户/同属主会话）；跨用户代执行需共享 token 立项。已用单测钉住（S7 拒绝 + 跨用户拒绝）。
- **S8**：互斥唯一索引已是 (user_id, definition_id) 维度——按发起人天然隔离，无需改动（注记）。
- 验证：S7 单测 2 例 + app-session 委托用例更新（23 例全绿）；全量失败集少于基线；tsc 933 < 938 基线（顺手收净 data-table 表单/PortraitPromptTemplate 声明等既有债务）；PC 真机启动 + 待办中心页截图验证。
