# 「领域共学空间」M1 后端化实施计划（v1.1——基于 agent-harness）

日期：2026-09-09
分支：**feat/domain-learning**（自 feat/workflow-engine @3e0b3464 新建；含 agent-harness 平台层大合并）
依据：design-v3.md（§9 数据模型 / §10 skill 家族 / §12 后端架构 / §14 测试策略 / §15 M1 验收）、content-template-design.md（v4 内容模型）
前置：P0 前端原型已完成并提交（704db3ac，在 workflow-engine 上）；原型文件留作测试夹具与参考实现。
状态：**v1.1 定稿——已获用户评审确认，开工 M1-A**

> v1.1 变更（2026-09-09 用户拍板）：**架构基座改为 agent-harness**。用户明确：
> ① 所有长程任务、需上下文管理/子任务规划/知识积累与使用的环节（研究、答疑、提炼等）一律基于 agent-harness 复用，**禁止另起炉灶自研 agent**；
> ② agent 产出（领域地图/概念卡片）由领域服务校验后落 dl_* 库；
> ③ M1 验收范围维持不变（见 §1），仅换基座。
> 本稿取代 design-v3 §12「服务内直调 callAI」的表述为「服务内调 agent（agent 再经工具/技能产出）+ 服务落库」。

---

## 0. 基线确认（拉取后）

- HEAD = 3e0b3464；领域学习前端代码完好；dev:debug 实例仍在运行（5173/9222）；CDP 冒烟：三栏空间页正常渲染、零页面错误。
- 拉取带入的大变化（需在实施中遵守，勿回退）：
  - agent 运行时自 `src/core/agent/` 迁移至 `src/core/platform/agent-runtime/`；
  - 主进程 Electron 入口（含 ipc/services）在 `src/electron/`（原 src/main 已删除）；
  - TypeORM 实体/仓储集中在 `src/core/database/{entities,repositories,migrations}/`，实体需在 `entities/index.ts` barrel 导出；
  - 业务包以 `PackDefinition{manifest,activate}` 形态注册于 `src/core/packs/`，IPC 前缀裁决 + 守卫按 `manifest.contributions.ipcChannelPrefixes`。
- **typecheck 基线**：全量 `vue-tsc --noEmit` 当前不绿，但错误全部在既有文件（`shared/types/index.ts` 重复导出、workflow-node-catalog/forms、web server 路由、channel-map、openapi-parser 等），**无一处位于 domain-learning 相关文件**——系 agent-harness 大合并的既有存量问题（另一工作线的合并善后，非本 M1 范围）。M1 纪律：新增/改动文件不新增类型错误；领域学习侧以 `vitest run` 相关 spec + vue-tsc 对该批文件无新错为质量门。

## 0.5 S0 基线善后（pull 合并遗留，仅一处红）

- `tests/unit/renderer/packs-registry.spec.ts` 一处失败：菜单顺序断言是合并前旧期望——缺 `/domain-learning`（我们包插在 episode-production 与 knowledge-base 之间），且把实际菜单 `/agent-console` 误写为 `/agent-tasks`。修复 = 断言同步为当前真实顺序。这是渲染端 registry 回归文件，S6 前必须全绿；属 M1 收尾批次（随 S6 前端包正式化一起改，避免两次动该文件）。
- 其余抽查正常（同文件 11 passed）。

## 1. 目标与验收（M1，摘自 design-v3 §15）

7 张 dl_* 表 + 领域学习包五服务 + IPC（dl:）+ 渲染公共化小重构 + 六个内置 skill + 前端 mock→真实数据 + 完整纵线半自动采集。验收：真实小领域建空间→地图人审→≥3 概念"研究→讲义→教学→追问→沉淀"；追问有据回答一次、答不上入队列一次、先验确认入图一次；重启状态完好；skill-call 回归全绿。

## 2. 阶段拆分（每阶段 TDD：先红后绿）

### S1 schema 与仓储层
- 新建 `src/core/database/entities/domain-learning/` 7 实体（**用户多租户列 user_id 必备**，JSON 存 text 列）：
  `dl-project.entity.ts` `dl-concept.entity.ts` `dl-relation.entity.ts` `dl-mastery-log.entity.ts` `dl-card.entity.ts` `dl-doc.entity.ts` `dl-question.entity.ts`
- 迁移：`src/core/database/migrations/create-domain-learning-tables.ts`（一文件建 7 表+索引；双方言幂等 ensureTable/ensureIndex/ensurePartialUniqueIndex，仿 create-agent-tasks.ts + migration-utils.ts）
- 仓储：`src/core/database/repositories/` 7 个 `dl-*.repository.ts`（extends BaseRepository，CRUD 走 this.scoped.*；Entity→Row toDto）
- 装配登记（8 处既有文件）：
  1. `src/core/packs/builtin-packs.ts`（import+append domainLearningPack）
  2. `src/core/database/entities/index.ts`（barrel export 7 实体）
  3. `src/core/database/database-manager.interface.ts`（ICoreDatabaseManager 加 7 字段 + type import）
  4. `src/electron/database/index.ts`（import + public 字段 + initRepositories 实例化 + runMultiTenantMigrations 末尾追加迁移调用）
  5. `src/web/server/index.ts`（initDatabase 同构追加迁移调用）
  6. `src/web/server/platform/web-database-manager.ts`（服务端多租户字段，编译期占位）
  7. （事件上铃铛时）`notification.service.ts` NOTICE_EVENT_TYPES + toNotice
  8. 前端 `src/renderer/src/packs/index.ts` 已登记（无需动）
- 单测：仓储 spec 仿 `tests/unit/core/database/agent-task-memory.repository.spec.ts`（手建 DataSource 只注册被测实体 + 显式跑迁移函数 + `runWithUserAsync('u1'/'u2')` 租户隔离断言）；迁移 spec 仿 `tests/unit/migrations/create-pack-tables.spec.ts`
- 需覆盖：CRUD + 唯一约束（concept 同级不重名、relation 三方唯一）+ user scope

### S2 共享类型（前后端）
- `src/shared/types/domain-learning.types.ts`：node_type/relation_type/mastery/research_state 枚举、essence_type、section/works 结构、DTO 形状；前端 mock 类型迁移为 import 共享类型（mock 保留为测试夹具）
- 迁移源：`views/domain-learning/mock-data.ts`（SpaceProject/ConceptNode/ConceptCard/CardSection/LessonDoc/ChatTurn/KnowledgeTreeNode/WorkRef/RelatedRef/Mastery/EssenceType/SectionStyle）+ `atlas-data.ts`（AtlasNodeType/ATLAS_NODE_TYPE_META/AtlasProfile/AtlasNode/AtlasEdge/AtlasGraph）
- 写法仿 agent.types.ts（文件头契约注释 + 分节 + 内联字段注释）；`shared/types/index.ts` 挂 export
- IPC channel 命名建议（kebab，两端共用契约；仿既有 preload 短前缀风格 dl:）：
  - 空间：`dl:list-spaces` / `dl:create-space` / `dl:get-space` / `dl:update-space` / `dl:archive-space`
  - 图谱：`dl:get-graph`（concepts+relations+tree 聚合）/ `dl:update-map-draft`（人审确认地图）/ `dl:confirm-map` / `dl:concept-detail`
  - 教学：`dl:get-card`（concept→card+sections）/ `dl:get-lesson` / `dl:ack-mastered`（懂了）/ `dl:ack-confused`（没懂，含 sectionKey）/ `dl:review-suggestion`（继续学习→下一概念）
  - 追问：`dl:ask`（tutor）/ `dl:list-questions` / `dl:resolve-question`
  - 研究：`dl:start-research`（对 concept/未解问题触发）/ `dl:research-status` / `dl:confirm-ai-verified`（先验确认入图）
  - Atlas：`dl:get-atlas`（图谱档案聚合）/ `dl:list-profiles`（画像预设）
  - 事件推送：`dl:lecture-ready` / `dl:research-done`
  （最终以 S4 handler 设计时定稿为准，此处先锁定命名风格）

### S3 渲染公共化小重构（引擎面唯一改动）
- **调研结论：公共渲染件已存在**——`src/core/platform/workflow/skills/render.ts` 已提供 `renderSkillTemplate(tpl, params, onMissingParam?)` 与 `withSkillReferences(body, references?)`；skill-call 节点（skill-nodes.ts L44-96）即 resolveSkill → render → withSkillReferences → callAIStream。执行端样板完整。
- M1 实际工作 = 学习服务**直接复用** render.ts + `getSkillService().resolveSkill(id)`（无 IPC/节点依赖），**不再需要单独重构**；若复用中发现参数形态差异（如 references 结构不同）再做最小适配并带回归单测。原 design v2 §8.2 的"抽公共函数"已由 render.ts 覆盖，本阶段降级为"验证 + 补学习侧封装测试"。

### S4 领域学习后端包（**基于 agent-harness，2026-09-09 用户拍板**）
- 调研结论（agent-harness 集成手册，@3e0b3464 源码取证）：agent-runtime 公共件齐备——每轮宿主套件 `createHostKit(config, deps).runTurn()` + `getAgentLoopHarness()`（共享 AgentToolRegistry/ProviderAdapter/轨迹）、`ApprovalCoordinator`（提案卡人审）、`AgentTaskService`（规划→整树人批→泵执行）、`Verifier`（验收）、`MemoryFlywheel`（记忆）、`ContextManager`（窗口/压缩）、`StructuredKnowledgeProvider`（确定性事实进通道 A）。**AgentService/AgentDefinition 门面无 boot 装配**——业务走 HostKit 直驱。
- **主仿照：EP 宿主**（`src/core/platform/episode-production/agent/ep-agent-harness.service.ts` + `ep-agent-tools.ts`）——人审卡(choice/approval)、状态快照、领域工具注册、规划工具透出与「建地图人审→跑研究工具→产出」逐点同构；交互答疑仿 **chat system-agent**（`src/core/packs/chat/services/system-agent/system-agent.service.ts`，一问一答低延迟续聊）。
- 骨架（新建，均在 `src/core/packs/domain-learning/`）：
  - `index.ts`：manifest `{ id:'domain-learning', dependencies:['workflow','knowledge-base','skills'], contributions:{ ipcChannelPrefixes:['dl:'] } }`，activate 注册 dl IPC handlers；登记 `src/core/packs/builtin-packs.ts`
  - `services/dl-agent-harness.service.ts`（dl 宿主，仿 ep-agent-harness）：`sendMessage/cancel/decideApproval`；每轮 `getAgentLoopHarness()` → 懒注册 dl 工具 → `listSpecs({packId:'dl-agent'})` 组白名单（含 invoke_skill/discover_capabilities）→ `createHostKit`（definitionId 'dl-agent'、scopeKey `dl-agent:<spaceId>[:<conceptId>]`、snapshot=computeDlState、memory scope `{bizModule:'domain-learning',projectId}`、requestApproval→ApprovalCoordinator、onStream→`dl:generate:<id>`）；host 内研究模式与 tutor 模式两个薄壳
  - `services/dl-agent-tools.ts`（仿 ep-agent-tools）：`registerDlAgentTools(registry)` 懒注册幂等；工具 def 不捕获空间、从 ctx.logContext 还原；关键工具：`dl_research_concept`（研究+讲义，dangerLevel write）、`dl_rewrite_handout`、`dl_enqueue_question`（未解入队）、`dl_mark_prior`、`dl_propose_map_change`（requiresApproval+approvalCard → 地图人审）
  - `services/dl-agent-actions.ts`（动作实现层落 dl_* 表）、`dl-agent-deps.ts`（computeDlState/buildSuggestions）、`dl-agent-events.ts`（`dl:agent:<spaceId>` 通道）、`dl-agent.types.ts`
  - `services/dl-graph-knowledge-provider.ts`：实现 StructuredKnowledgeProvider（registerStructuredProvider），地图/讲义确定性事实进 agent 上下文通道 A（仿 longwriting/graph/graph-knowledge-provider）
  - `handlers/domain-learning.handler.ts`：`ipcBridge.handle('dl:*')` + wrap→IpcResponse；惰性 getter 取服务（activate 早于 workflow boot）
  - 领域服务重排：learning-project（建空间 CRUD，project 直管 dl_*）+ learning-graph（地图/知识全景：dl_* 仓储 + StructuredProvider；地图人审走 dl_propose_map_change approval）+ learning-loop（M1 用户触发顺序排程；M2 迁 AgentTaskService 树/trigger）+ learning-research（DlResearchHost 工具执行 + Verifier 质量门）+ learning-tutor（DlTutorHost system-agent 模式 + dl_question 队列）
- 已知缺口（如实标注，M1 按宿主直跑绕开）：任务树服务器白名单 `TASK_TOOL_ALLOWLIST` 无业务工具（不用任务树）；M2 自动排程载体未定；skill 无 pack 作用域（用白名单收窄/disable_model_invocation）
- 单测：graph 掌握度推进/依赖门控/拓扑取下一概念；tutor 三路（命中 kb/先验/未答）；research evidence 硬校验；atlas 档案聚合；dl 宿主工具 action 层（仿 ep-agent-tools.spec）；包 spec 前缀全覆盖

### S5 六个内置 skill 资产（SKILL.md 形态 + invoke_skill）
- **形态（调研结论）**：三套 skill 同名异物中，平台 SKILL.md 体系 = `src/core/platform/workflow/skills/builtin-skills.ts` 内联 markdown（frontmatter{name/description/when_to_use/inputs/system_prompt/output_desc/disable_model_invocation}）；用户目录 `<dataPath>/skills/<id>/SKILL.md`；注册 SkillService（workflow-boot 7.1）。
- **接入**：6 个 learning-* 追加进 BUILTIN_SKILLS（全局只读、discover/fork 就绪）；dl 宿主白名单 expose `invoke_skill` + `discover_capabilities`（system-agent-tools.ts 样板：resolveSkill→renderSkillTemplate→generateText）；需防污染聊天目录的加 `disable_model_invocation`。
- **例外**：domain-map 涉改图副作用+人审 → 单独 `dl_propose_map_change` requiresApproval 工具（EP 审批卡模式）而非纯 skill；tutor/assessor 若需掌握度写入/答题判定可工具化。
- 技能内容资产不入单测（惯例），S7 真机验收；契约以 design.md v2 §7 + content-template-design §5.2 为准。

### S6 前端 mock → 真实数据
- Home（列表）/Space（三栏+树+门控）/Atlas（档案）改接 dl: IPC；知识全景 profile 元数据前移共享类型；原型 mock 保留夹具
- 前端接入链路（桌面+Web 双端，调研已取证 @3e0b3464）：
  - 渲染端无泛化 invoke：preload（`src/preload/index.ts`，2968 行嵌套对象）手写每个 `ipcRenderer.invoke('dl:*',…)`；channel 字面量不登记 shared/ipc.types.ts；
  - 新增 `window.electronAPI.domainLearning` 命名空间（listSpaces/getSpace/… + onLectureReady 类订阅返回 unsubscribe）；
  - **Web 端必须同步 channel-map**（`src/web/client/channel-map.ts`：`'domainLearning.listSpaces'→{channel:'dl:list-spaces'}` 等），否则 Web fallback 拼 `domainLearning:get-space` 404；
  - 渲染端推荐 Pinia store（仿 `stores/knowledge-base.ts`：unsubscribers + setupEventListeners；仿 `stores/notification.ts` 局部 api() 判空降级），返回统一 `{success,data?,error?}`，禁用包错误码 `PACK_DISABLED`；
  - 通知闭环零新增订阅：讲义就绪写 platform_events/通知中心（NotificationCenter 15s 轮询自动可见）；推送型实时事件（如需）＝ preload onXxx + channel-map 事件条目 + store.subscribe，样板 `stores/workflow.ts L84-97`；
  - mock 数据保留策略待定：建议删除防真数据旁路，或保留为 IPC 失败离线降级（M1 先删，原型已 git 留档可随时找回）；
  - 前端共享类型：新建 `src/shared/types/domain-learning.types.ts`（SpaceProject/ConceptNode/ConceptCard/LessonDoc/ChatTurn/AtlasNode/AtlasGraph 等，合并 mock-data/atlas-data 里跨进程形状 + 枚举），`shared/types/index.ts` 增 export；
  - 视图替换点见调研清单（Home/Space/Atlas/SectionLesson/atlas-data import 点逐一核对）；注意 typecheck `noUnusedLocals`，删 mock import 勿留悬挂；
  - 前端 pack index 同步：description 去「原型」、与后端 id 一致、contributions 补 ipcChannelPrefixes（等后端 manifest 定稿）。

### S7 M1 验收纵线（真机）
- 真实小领域跑通验收清单（design-v3 §15），重启状态完好性验证

## 3. 数据模型要点（dl_* 7 表，design-v3 §9）

| 表 | 要点 |
|---|---|
| dl_project | name/goal/profile_id/profile_json/status/kb_id/default_model |
| dl_concept | project_id+node_type(group=目录)+name/en/parent_id/definition_short/research_state/mastery/source/attrs/card_id/note；唯一(project_id,parent_id,name) |
| dl_relation | source/target/relation_type/evidence/verified；唯一(project_id,source_id,target_id,relation_type)；前置依赖边驱动门控 |
| dl_mastery_log | from/to/trigger/at 审计 |
| dl_card | concept_id+essence_type+sections(json)/works(json)/content_md(派生)/evidence_sources/version/status |
| dl_doc | doc_type(intro/review/manual)/title/concept_ids/content_md |
| dl_question | concept_id/question/answer_md/answer_source/status(open=未解队列) |

## 4. skill 家族与契约
研究侧 M1：map / explainer（+轻量 relation 建议）；教学侧 M1：planner / writer / tutor / assessor。契约以 design.md v2 §7 为准、块化以 content-template-design §5.2 为准（explainer 输出 essence_type+sections+works+evidence）。执行：服务直调 `ai-call.ts`（callAI / extractJsonFromResponse），提示词经 `getSkillService().resolveSkill(id)` + `skills/render.ts` 渲染（S3）。

## 5. AI/事件/装配统一入口速查（调研定稿）
- LLM：`src/core/platform/services/ai-call.ts`——`callAI(prompt, systemPrompt, maxTokens, providerConfigId?, modelId?)`、`callAIStream(opts)`、`extractJsonFromResponse(resp)`/`parseJsonString`/`isJsonTruncated`；provider 层无 json_mode，"json 模式"= prompt 约束 + 本地兜底解析（样板 nodes/task-nodes.ts extractJson 三段 + 重试≤3）。
- 事件：业务源统一 `publishDomainEvent(name, payload)`（`src/core/platform/workflow/trigger/domain-event-bus.ts`；KB 的 `kb:document-completed` 即样板，常量在 shared/types/workflow.types.ts）；上铃铛另需 notification.service.ts 两处登记。
- 服务访问：`getCoreDatabaseManager().dlXxx`（electron 单例已注册）；skill 服务 `getSkillService()`（workflow-boot 装配后可用——handler 惰性 getter 内取）。

## 6. 测试与验收口径
见 design-v3 §14/§15；仓储/服务层单元测试（内存 sqlite + 迁移函数 + runWithUserAsync）+ 渲染件复用回归（若有适配）+ 前端真机 CDP 走查。

## 7. 风险
- typecheck 存量错误（agent-harness 合并遗留，非本 M1）→ 领域学习侧不新增错误，用 vitest 相关 spec 做质量门；如需全绿另立合并善后任务；
- skill 资产（builtin-skills 内联）与既有 30+ 内置技能并存，注意 id 唯一；
- 渲染件 render.ts 复用若有参数差异需最小适配 + 回归；
- 真实 AI 调用依赖模型配置，纵线验收需用户在设置中提供可用 provider key；
- M1 验收含"重启状态完好"——dl 状态全部落 SQLite，研究推进由用户触发（无后台常驻）。

## 8. 里程碑与提交规划（供用户评审节奏）
- M1-A（S1+S2 数据层+共享类型）：dl_* 7 表实体/迁移/仓储 + 装配 + 共享类型 + 单测 —— ✅ 已完成实体/迁移/仓储/装配/单测 11 passed；剩余 S2 共享类型
- M1-B（S4 包骨架：dl 宿主 + 工具 + approval + structured provider + graph/project 服务 + 单测）
- M1-C（S4 handlers + S5 六 skill 资产 + dl: IPC 双端接线 + 事件通道）
- M1-D（S6 前端接真实数据 + S0 回归同步 + preload/channel-map/dl store）
- M1-E（S7 真机纵线验收 + 进度记录 + 提交 push，按用户指令）
