# 32 · Harness 总收口报告（M1–M7 全量对抗评审）

> 2026-09-08。四路并行对抗评审（A 内核状态机 / B 宿主一致性 / C 工具与安全 /
> D 任务树与生命周期），基线 721cf3a0，修复提交 4c6d89f9。
> 修复统计：P0×3（rootId ReferenceError / escalate CAS 静默 no-op / handler
> 缺逗号整文件 parse 失败）、P1×8、P2×10 全修；P3 与低风险项登记于各路由清单。

## P0（全部已修）
1. runAgentLoop 解构漏 rootId → 任务树执行面 ReferenceError 整体失效 + 重规划级联。
   tsc TS18004 实证。教训入记忆：tsc 全量必须无条件跑，窄 grep = 没有门禁。
2. escalateDecide 三分支 CAS fromStatus 漏 escalated → 人工放行/失败/重试全部静默
   no-op，树永久 escalated。补 CAS + 未命中抛错。
3. wf:draft-from-nl 装配对象缺逗号 → workflow.handler 整文件 parse 失败（esbuild 验证）。

## P1（8 项，全部已修）
- 跨租户：ac:stop 任务分支零校验可中止他人树 → cancelTree 前置 scoped 属主断言
- 任务宿主历史不清洗悬空 tool-call（provider 400 永续）→ sanitizeSessionHistory
  上移 agent-runtime/runtime/session-sanitize，task 宿主 loadState 统一清洗
- 重试反馈从未送达模型（loadState 历史覆盖 input）→ task 宿主追加本轮 goal 为
  user 消息，Reflexion 闭环恢复
- planner toolWhitelist 未与服务器端求交 → TASK_TOOL_ALLOWLIST 求交+越界剔除留痕
- run_workflow usePublishedGraph 静默回退草稿图击穿发布闸门 → 缺发布图显式报错
- agent-loop 节点 delta 合批 timer 丢 ALS（Web 静默丢流）→ 缓冲捕获 uid + 冲刷
  runWithUser 包裹
- wf:draft-from-nl 装配对象缺逗号同类（双装配漂移）→ draftService 挂 subsystem
- run_workflow/create_workflow_draft 免审批写工具零频控 → 聊天宿主 maxCalls
  （run_workflow×2 / draft×1 / skill×3）

## P2（10 项，全部已修）
聚合节点入态/结算盲 patch→CAS；run-registry try/finally 配对；handleFailure
零子任务 throw escalated；飞轮失败回写 + memoryHits 终态清理；registry 错误通道
2KB 截断；create_task_plan goal/title 上限；lw delete_entity（登记后置，见下）；
agent-loop 节点 delta 合批 ALS；chat error-带-输出路径补 error 事件；早退路径
stopReason=error；控制台降级清 store；ac:trajectory 广播 args 截断（DB 全量保留，
广播副本 2KB）；thought 字节预算二次收紧；stopStream 不再提前删 Map（对齐 lw
结算语义）。

## 登记（未修，含理由）
- 门面栈（AgentRuntimeImpl/EventBridge/ApprovalCoordinator/ContextManager）生产
  零消费——M8 决策：宿主迁回门面 或 删除/降级测试夹具。ContextManager 哨兵修复+
  压缩能力建议经 LoopRunnerDeps.context 直装 chat/task 宿主（成本低）。
- 删除级联：dialog/lw 项目删除不清 agent_sessions/agent_trajectories（工作台幽灵
  会话）；任务树无删除入口（deleteByRoot 已备）。
- 终态封套四宿主四套（aborted 表达不一）；delta 合批策略三套。
- EP 迁移（M6.5）：choice:request 确认流 / nav / 数据源注入需先设计候选确认机制。
- sub_workflow 执行器整组潜伏缺陷（planner 未开放 sub_workflow:，当前不可达）。
- archiveStale 零调用（需按租户逐个 runWithUser）；轨迹回放无分页；stagnant×
  get_workflow_run 轮询豁免；NOT_WHITELISTED hint 越权枚举；lw delete_entity
  projectId 绑定；draft 围栏 </user_description> 逃逸转义；create/saveDraft 非原子。

## 验证
- 定向套件：agent-runtime + chat + longwriting + draft + system-tools =
  250/250 全绿；loop 19、m3-core 16（新修复后）。
- 真模型：p7（lw 迁移三场景）、p8（draft 5 节点一次过）全绿。
- 环境：session-store 等 sqlite 用例依赖 better-sqlite3 node ABI（开发机与
  electron ABI 反复重建，属环境性；全量失败集与基线零差异）。
