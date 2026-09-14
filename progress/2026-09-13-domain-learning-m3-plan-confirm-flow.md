# 领域共学里程碑 3：首批知识生成的固定门禁流程（对齐诉求 → 确认体系 → 才落库）

日期：2026-09-13
用户原话：「关于生成首批知识点，我建议能固化成一个工作流，或者给固定的步骤：1.先理解用户诉求，弹出对话框输出模型对用户诉求的理解，让用户确认，用户如果需要调整，可以输入指令调整…2.对齐诉求后，系统再结合模型自身的知识或从网络获取相关知识，整理知识体系，再次弹出，展示知识体系，向用户确认，用户确认后再生成知识点体系。」
用户拍板：① 覆盖入口 = **首次生成 + 补全知识地图都纳入**；② 弹窗交互 = **展示 + 勾选增删/调序 + 指令调整**。

## 一、固定流程（三轮，顺序不可跳）

| 轮次 | 触发 | 模型做什么 | 用户做什么 | 系统硬约束 |
| --- | --- | --- | --- | --- |
| 1 对齐诉求 | 「生成首批知识」/「AI 补全知识地图」 | 先少量采集，再 `dl_propose_understanding` 提交理解（目标/要覆盖的对象与场景/读者/不做什么/关键期望） | 弹窗看理解 → 「确认理解」或输入纠正指令 | 本轮 `dl_save_concept` **被门禁拒绝** |
| 2 规划体系 | 用户确认诉求后自动发 `【已确认诉求理解】` | `dl_propose_syllabus` 提交分支+知识点（定义/前置/layer） | 弹窗里勾选增删、↑↓ 调序、或输入调整指令 | 无已确认诉求理解 → 提案被拒；**空分支被拒** |
| 3 按方案落库 | 用户确认体系后自动发 `【已确认知识体系】` | 按**已确认清单**建分支/知识点/前置边 + 首份讲义 | 什么都不用做（看进度行） | 门禁放行，且额度按方案条目数放宽 |

## 二、改动清单

### 数据与仓储
- **迁移** `create-domain-learning-tables.ts`：新增 `dl_plan`（id/user_id/project_id/step/status/revision/payload/feedback/created_at/updated_at + 两个索引），幂等建表；**实库启动日志已确认创建成功**。
- **实体** `entities/domain-learning/dl-plan.entity.ts`（+ `entities/index.ts` 导出，data-source 自动收集）。
- **仓储** `repositories/dl-plan.repository.ts`：`create/getLatest/getConfirmed/listVersions/supersedeDrafts/supersedeConfirmed/patch` + `buildDlPlanView`（纯函数）；`ICoreDatabaseManager.dlPlans` 在 electron 与 web 两端都接上。

### 规则与服务（纯逻辑可直测）
- **规则** `rules/learning-plan.rules.ts`：`normalizePlanUnderstanding`（缺 goalSummary/coverage → 拒绝，且拒绝文案点明"上一版就是因为没有 coverage 才跑偏"）、`normalizePlanSyllabus`（**空分支拒绝**——「投资与配置」那次的教训；跨分支重名去重并记 changes）、`planNodeNames/planConceptNames/planHasConcept/countPlanNodes`、`planSaveBudget`（按方案条目数派生额度，夹到硬上限）、`summarizePlanSyllabus`。
- **服务** `services/dl-plan.service.ts`：`proposeDlUnderstanding` / `proposeDlSyllabus`（**必须先有已确认诉求理解**）/ `getDlPlanView` / `confirmDlPlan`（可带**用户编辑后的载荷**）/ `getConfirmedSyllabus`。每次新提案 revision+1，旧 draft/confirmed 置 superseded（不双生效）。

### 工具与门禁
- 新工具 `dl_propose_understanding` / `dl_propose_syllabus`（zod schema + 频控 3），动作类型与 `executeDlAction` 分支补齐。
- **落库门禁**：`saveConcept` 在 `ctx.planningRound` 为真时先查已确认方案，没有就拒绝并写清"下一步该做什么"。
- **规划轮判定**：`isPlanningSaveRound`（起步研究 / 补全地图 / **固定流程的第 2、3 步**）——第 2/3 轮文案不含"补全"动词，靠新增的 `isPlanPhaseMessage` 兜住，否则会掉出规划轮（自查发现的坑）。
- **额度**：规划轮有已确认方案时 = `planSaveBudget(方案)`（节点数+6，关系约 1.4 倍，夹到 60），否则用规划额度兜底。

### 宿主阶段注入
- `dlEmptySpaceMission` 改为**第 1 步语义**（提交诉求理解、本轮不许落库、说明后续两步由用户确认后驱动）；bootstrap 技能正文改到**落库轮**注入（避免第 1 轮被推着直接建点）。
- 新增 `planUnderstandingPhaseInstruction` / `planSyllabusPhaseInstruction`（带已确认诉求）/ `planSavePhaseInstruction`（带已确认方案清单 + 落库顺序 + "方案内全部落库"）+ `formatSyllabusLines` / `formatUnderstandingSummary`；宿主在规划轮按消息标记注入（**最后注入，最新鲜**），并给 runtimeContext 打 `planningRound`。

### IPC 与前端
- 通道 `dl:get-plan` / `dl:confirm-plan`（handler + preload + web channel-map 三端齐全，`dl-channel-consistency` 护栏通过）。
- store：`plan` 状态 + `fetchPlan` / `confirmPlan`。
- **确认弹窗** `PlanConfirmDialog.vue`：步骤条（①对齐诉求 ②确认知识体系 ③生成）；第①步展示模型的理解（目标/覆盖 chips/读者/不做/期望）+「确认理解」；第②步树形展示分支与知识点，**可取消勾选、可 ↑↓ 调序**，底部「让模型按这个改一版」输入调整指令。
- 弹窗纯逻辑抽到 `shared/utils/domain-learning-plan-draft.ts`（`toSyllabusDraft` / `toSyllabusPayload` / `moveItem` / `countCheckedConcepts`）并单测：勾掉的真的没了、顺序按用户调整、知识点被全取消的分支不留空壳。
- 接入：空间页顶部「方案提示条」（待确认时高亮）+ 弹窗；起步研究与「AI 补全知识地图」跑完自动拉方案并弹窗；知识全景页起步后显示「去确认方案」按钮（跳到空间页，自动弹窗）。

## 三、验证

| 项 | 结果 |
| --- | --- |
| 新增 `learning-plan.rules.spec`（10 例） | ✅ 含空分支拒绝、缺 coverage 拒绝、额度派生与夹取 |
| 新增 `dl-plan.service.spec`（6 例，真实 sqlite + 迁移） | ✅ 版本递增/旧版退位、顺序不可跳、确认后门禁放行、带编辑载荷确认、重复规划只留一份生效 |
| `dl-agent-actions.spec` +2 例（22 例） | ✅ 规划轮无确认方案 → 拒绝；非规划轮不受影响；全流程诉求→体系→放行 |
| `dl-agent-deps.spec`（21 例）/ `dl-agent-empty-start.spec`（12 例，按新口径重写） | ✅ 阶段指令、标记常量、起步指令第 1 步语义 |
| `domain-learning-plan-draft.spec`（7 例）/ `plan-confirm-dialog.spec`（5 例） | ✅ 勾选/调序载荷语义 + 弹窗确认驱动下一轮的消息标记 |
| `dl-channel-consistency` + `web-bridge` | ✅ 三端键集合相等 |
| 上线核验 | 主进程 958 模块；实库日志 `表 dl_plan 创建完成`；产物含两个提案工具/三阶段指令/两个标记/`dl:get-plan`；窗口已起 |
| `npm run typecheck` | 改动文件无报错 |

**与本次无关的既有失败**（其他分支在途代码，未触碰）：`app.repository.spec`（`AppUserPrefsEntity` 无 metadata）、`asset-category.repository.spec`、`pack.service.spec（postgres）`、`workflow-pack.spec`（`ac:` 前缀未进 manifest）、`tests/unit/web/webhook-trigger.spec`（`afterEach is not defined`）。

## 四、还没做 / 需要你验的

- **真人点一遍三步**：建一个新主题 → 「生成首批知识」→ 应弹「我理解的你的诉求」→ 确认 → 弹知识体系（勾选/调序）→ 确认 → 才开始生成。这条闭环代码与单测都通了，但"点一遍"只有你能做（我无法操作界面）。
- 「金融理财」空间仍是旧结构（4 分支 + 8 知识点，"投资与配置"空）：现在起用「AI 补全知识地图」会先走对齐→确认流程，你也可以直接新建同名主题重来一遍。
- 门禁只拦 `dl_save_concept`（不拦 `dl_save_relation` 与讲义）——关系边与讲义本身不会凭空造出新知识点，故未一并拦。
