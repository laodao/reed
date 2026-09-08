# 领域学习 M1 启动：分支 + agent-harness 基座 + M1-A 数据层（2026-09-09）

## 会话决策
1. 用户要求 pull → 已拉到 3e0b3464（feat/workflow-engine，含 agent-harness 平台层大合并），领域学习 P0 前端代码完好。
2. 用户拍板（本会话）：
   - **新建独立分支 `feat/domain-learning`** 实现本功能（已建，自 workflow-engine @3e0b3464 切出）；
   - **底层 agent 能力必须基于 agent-harness（src/core/platform/agent-runtime/）**，禁止另起炉灶自研 agent；范围 = 所有长程任务/需上下文管理/子任务规划/知识积累与使用的环节（研究、答疑、提炼等）；
   - agent 产出（领域地图/概念卡片）由领域服务校验后落 dl_* 库；
   - M1 验收范围维持 design-v3 §15 不变（仅换基座）；
   - typecheck 存量错误（agent-harness 合并遗留，shared/types 重复导出等）本 M1 不管，只保证不新增。
3. 计划文档：tasks/2026-09-07-domain-learning-space/m1-implementation-plan.md（v1.1，S1~S7 + M1-A..E 里程碑）。

## 两份架构调研（后台子代理，均基于 @3e0b3464 只读取证）
- 后端接入手册：PackDefinition 装配、ipcBridge.handle 双端注册 + dl: 守卫自动生效、实体 barrel + 迁移双端登记（electron runMultiTenantMigrations / web initDatabase）、仓储 BaseRepository(scoped ALS)、skill=builtin-skills.ts 内联 SKILL.md、AI 统一 ai-call.ts、事件 publishDomainEvent。
- agent-harness 集成手册（关键）：agent-runtime 公共件齐备（createHostKit+getAgentLoopHarness / ApprovalCoordinator / AgentTaskService / Verifier / MemoryFlywheel / StructuredKnowledgeProvider / ContextManager）；**主仿照 = EP 宿主（ep-agent-harness.service.ts + ep-agent-tools.ts：人审卡/状态快照/领域工具注册/规划透出）**；交互答疑仿 chat system-agent；skill 走白名单 invoke_skill；dl 确定性事实经 StructuredKnowledgeProvider 通道 A 进 agent 上下文。
- 前端接入手册：preload 手写命名空间 + web channel-map 必须同步（否则 Web 404）+ Pinia store 封装 + 通知中心零新增订阅。

## M1-A 数据层完成（S1+S2，TDD 11 passed）
- 7 实体：src/core/database/entities/domain-learning/dl-{project,concept,relation,mastery-log,card,doc,question}.entity.ts
- 迁移：src/core/database/migrations/create-domain-learning-tables.ts（一文件 7 表双方言幂等；concept 同级唯一 project+parent+name、relation 三元唯一 project+source+target+type）
- 7 仓储：src/core/database/repositories/dl-*.repository.ts（extends BaseRepository，scoped ALS，JSON 列解析；relation create 幂等同边/verified 升级；concept existsSiblingName 根层兜底）
- 装配登记 6 处：entities/index.ts barrel、database-manager.interface.ts（7 字段）、electron/database/index.ts（字段+initRepositories+runMultiTenantMigrations）、web/server/index.ts（initDatabase 同构）、web/server/platform/web-database-manager.ts（字段+import+实例化）
- 共享类型：src/shared/types/domain-learning.types.ts + index.ts export（DlNodeType/DlRelationType/DlMastery/DlResearchState/DlEssenceType/DlCardSection/DlWorkRef/DlSpaceView/DlAtlasGraph/DlNodeProfile 等）
- 单测：tests/unit/core/database/dl-repositories.spec.ts —— CRUD/JSON 往返/唯一约束/租户隔离/迁移幂等，11 passed
- 环境：dev 实例已停（better-sqlite3 双 ABI 需切 node 跑测试）；后续跑应用前需 `npm run rebuild:electron` 恢复 + 重启 dev

## 待办（下一步 M1-B/C/D/E）
- M1-B：packs/domain-learning 后端包（manifest/activate + dl 宿主 dl-agent-harness.service + dl-agent-tools + approval + structured provider + learning-project/graph 服务）+ 单测
- M1-C：dl: IPC handlers + 六个内置 skill（builtin-skills 内联 SKILL.md）
- M1-D：前端接真实数据（preload/channel-map/dl store）+ S0 回归同步
- M1-E：真机纵线验收（需用户 provider key）

## 状态
M1-A 完成未提交（分支 feat/domain-learning）。未 push。
