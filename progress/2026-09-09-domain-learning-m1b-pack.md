# 领域学习 M1-B：后端包 + agent-harness 宿主 + 工具（2026-09-09）

## 上下文
承接 2026-09-09-domain-learning-m1b-services.md（M1-B 前半已提交 17bc99e8）。分支 feat/domain-learning。

## 本轮完成（后端包全链，TDD 通过）
新建 `src/core/packs/domain-learning/`：
- index.ts：manifest（id domain-learning、ipcChannelPrefixes ['dl:']、dependencies [workflow, knowledge-base, skills]）+ activate 注册 handler；已登记 src/core/packs/builtin-packs.ts（builtin-packs.spec 自动校验通过）
- handlers/domain-learning.handler.ts：dl:* 17 通道薄壳（空间 CRUD / space-view / atlas-graph / node-profile / pick-next / ack-mastered / ack-confused / confirm-relation / list-questions / agent-send / agent-cancel / agent-busy），惰性 services() 构造
- services/：
  - dl-agent.types.ts：常量（packId/definitionId/maxSteps/频控/工具名）+ DlScopeRef/DlAgentSendResult/DlAgentActionSummary/DlAgentEvent
  - dl-agent-events.ts：dl:agent:<spaceId> 通道 + dl:generate:<eventId> 流式
  - dl-agent-deps.ts：computeDlSpaceSnapshot（research/tutor 快照重建）+ buildDlSuggestions + research/tutor 系统提示词
  - dl-agent-actions.ts：4 动作落库层——save_concept（同父同名幂等/source=ai_verified 草稿）、save_relation（默认前置依赖，verified=false 待人审；自环拒绝）、save_card（evidence 硬校验：无出处不落库；回写概念 card_id+research_state）、answer_question（有据 answered+source / unresolved 登记 open 未解队列）
  - dl-agent-tools.ts：AgentToolDef ×4 懒注册幂等（pack:dl-agent:*）+ 工具频控
  - dl-agent-harness.service.ts：宿主（EP 同构）——两种模式（research/tutor）共用 createHostKit；工具懒注册、文本模型兜底、tutor 先落 dl_question(open)、snapshot 每轮重建、seededHistory=answered 问答对、onStream 走 dl:generate、tapEvents 收集 action:done
  - learning-view.service.ts：buildSpaceView（三栏聚合：concept+card+tree+relations+turns+stats）/buildTree/stats/buildAtlasGraph/buildNodeProfile
- dl-card.repository DTO 改为复用 shared 类型（去双份漂移）

单测新增：dl-agent-actions.spec（4 项：evidence 硬校验/草稿/答疑三路）+ domain-learning-pack.spec（2 项：channel 前缀覆盖 + manifest）。全部 domain-learning 相关 30 passed（+builtin-packs/lw-agent 回归 113 passed）。

## 设计收敛（agent-harness 基座落地要点）
- 「地图人审」走 IPC confirm-relation + UI（agent 产出 verified=false 草稿，不自封定稿）；不复用 EP choice 审批卡（大 JSON 不适合卡 UI）；
- skill（explainer 等）由宿主白名单透出平台 invoke_skill/discover_capabilities 调用，agent 再经 dl_save_* 落库（产出校验在 action 层）；
- tutor 追问历史 = dl_question（answered 成对回灌 seededHistory）；未解队列 = open 问题；
- 已知缺口记录：StructuredKnowledgeProvider（通道 A 持久注册）与 agent_sessions 长会话续聊留 M2（M1 快照每轮重建即可）；M2 自动排程载体未定。

## 状态
M1-B/C 后端主体完成未提交。M1-C 剩余：六个内置 skill 资产（builtin-skills.ts 内联 SKILL.md）。未 push。
