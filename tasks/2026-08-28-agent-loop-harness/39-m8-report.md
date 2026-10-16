# 39 · M8 收尾报告（2026-09-09）

> 范围：32 号「登记（未修）」+ 37 号评审遗留的清账。原则：先安全与正确性，
> 再数据卫生；大特性（记忆批/多模态/审批 DB）不属于收尾，登记为 M9 候选。

## 1. 已修复（本批落地）

| # | 项 | 修复 |
|---|---|---|
| 1 | LW delete_entity / update_entity projectId 越权洞 | id 直传路径补归属校验：`owned.projectId !== projectId` 即拒绝（跨项目 id 改/删不再可能） |
| 2 | NOT_WHITELISTED hint 越权枚举 | registry 不再枚举全量工具名——宿主真实工具集已随 tools 参数注入；catalogPacks 声明域内仍列同域工具（同域不越权），无声明只报注册总数 |
| 3 | draft 围栏 `</user_description>` 逃逸 | 用户描述中的围栏标签中性化（`［user_description］`） |
| 4 | wf-draft create/saveDraft 非原子 | saveDraft 失败补偿删除刚创建的定义（deps.remove 接线 definitionService.delete），不留无图空壳 |
| 5 | stagnant × get_workflow_run 轮询误杀 | 轮询豁免：纯轮询步（get_workflow_run）不计无进展；maxSteps 仍兜底 |
| 6 | 删除级联（幽灵会话） | 新增 `session-purge.ts`；dialog 删除清理 `system-chat-agent:dialog:<id>` 的会话+轨迹；LW 项目删除清理 `lw-agent:<id>` |
| 7 | lwTurn 审计序列化（37 号 P2-4 验证成立） | 审计 contextJson 换深度受限+循环引用安全序列化（lwTurn.db 的 DataSource 循环引用曾使 LW 工具审计行全部落库失败） |
| 8 | LW 规划渠道死接线（37 号评审 P1-1） | LW bindings 追加 create_task_plan + 提示词补规划纪律；重规划子节点 scopeTag 从失败任务继承 |

## 2. 决策

- **门面栈（AgentRuntimeImpl/EventBridge）**：保留为「已测试的预留面」，不删除、不接线。
  理由：23 号契约以门面为顶层 API（§1），其互斥/steer 队列/历史查询语义已被契约测试
  锁定，删除不可逆且未来多会话（§11-1）/steer 合流（§11-8）需要它；生产接线面已由
  HostKit（36 号）承接——两者职责不同（kit=同宿主内装配，facade=跨宿主运行时服务）。
  在 index.ts 头注标注「生产装配走 HostKit」。EventBridge 同理保留。
- **ApprovalStore DB 落库 / memory-service 记忆批 / 多模态输入 / 任务执行器 HostKit 迁移 /
  轨迹回放分页 / archiveStale 租户接线**：超出收尾范畴，登记为 M9 候选（附理由：
  前四者是特性/契约变更，后两者是体验项；archiveStale 需要租户枚举 API，避免坏接线）。

## 3. 验证

- system-agent-tools 19/19（含 37 号 scope 透传）；宿主回归 chat/LW/EP/host-kit 全绿；
- typecheck：改动文件零错误（基线集与 HEAD 对比无新增）；
- 长文章节工作台（38 号）见 38 号文档与实施记录。
