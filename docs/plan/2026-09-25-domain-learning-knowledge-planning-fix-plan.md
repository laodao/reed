# 领域共学空间「知识点规划与学习路线」修复与优化方案

> 依据：2026-09-23 深度审查报告（`outputs/domain-learning-plan-review-20260923.md`，总评 7/10）+ 2026-09-25 复核与讨论。
> 本文所有文件:行号均已在当前工作区**逐条人工核实**（非转述 subagent）。
> 目标：把「前置依赖门控」这个核心卖点做实——图必须保持**有向无环且可修**，规划产物必须经得起确认，提示词不再自相矛盾。全部落地后预期 8.5 分。

---

## 0. 方案总览

| 批次 | 主题 | 覆盖问题 | 预估 | 风险 |
|---|---|---|---|---|
| **A** | 图完整性闭环（防环 + 删边 + 存量环诊断） | P0-1、P2-1(回退提示部分) | 1.5~2 天 | 低 |
| **B** | 数据完整性（attrs 合并 / tutor 工具面 / source 语义） | P1-6、P1-1、P2-9、P2-5 | 0.5 天 | 低 |
| **C** | 提示词冲突收敛（bootstrap 截取 / 补全轮互斥 / 契约对齐 / 瘦身） | P1-3、P1-2、P2-6、提示词过载 | 1 天 | 低（纯文案+注入逻辑） |
| **D** | 规划级校验与确认体验（闭合校验 / rootConcepts / 重试兜底 / layer / 规模上限） | P1-4、P1-5、P1-7、P2-4、P2-7、P2-11 | 2~2.5 天 | 中（D2 涉前端） |
| **E** | P2 backlog（排程排序 / 难度逐记号 / G3 短路 / 前置匹配统一 / 证据方言统一） | P2-1、P2-2、P2-3、P2-8、P2-10 | 另行排期 | — |

**建议实施顺序**：A1 → B1 → D3 → D6（第一天，全是小改动大收益）→ C1 → C2 → A2 → A3 → D1 → D2 → C3 → C4 → C5 → B2 → B3 → D4 → D5 → E 自行排期。

**明确不做（本轮范围外）**：
- 不做自动破环（自动删用户空间里的边）——只检测、只提示，删边永远人工；
- 不给 agent 增加删边工具——删数据是人审专用能力；
- 不回改存量数据的 `source` 字段与三套证据标注（`evidenceLevel`/`prior`/`needs_verification`）的统一——涉及类型+UI 迁移，放 E 批单独立项。

---

## 批次 A：图完整性闭环（P0-1）

### A1 建边防环（P0 核心，约 40 行 + 单测）

**问题（已核实）**：`dl-agent-actions.ts:408` 只拦自环（`sourceId === targetId`）；`learning-graph.service.ts:309-325`（confirmRelation）与 `:278-304`（手工连边 linkPrerequisites）完全没有环检测。模型分两次建 A→B、B→A 即成环，环上成员永远无法 `ackMastered`（`learning-graph.service.ts:62-64`），学习路径死锁；`pickNextToLearn`（`learning-sequence.rules.ts:73-74`）静默插队掩盖问题；且系统无删边入口。

**改法**：
1. 在 `rules/learning-prerequisites.rules.ts` 新增纯函数：

```ts
/** 若新增边 source→target（source 是 target 的前置）会成环则 true。
 *  语义：target 已经是 source 的前置祖先 ⟺ 加上这条边后 source⇝target⇝source。 */
export function wouldCreatePrereqCycle(
  relations: PrereqRelation[], sourceId: string, targetId: string,
): boolean {
  return isPrerequisiteAncestor(relations, sourceId, targetId)
}
```

   `isPrerequisiteAncestor` 已存在（`learning-progression.rules.ts:153`，从 conceptId 沿前置边反向 BFS）。注意它是 prerequisites→progression 的反向依赖，建议把 `isPrerequisiteAncestor` **迁到** `learning-prerequisites.rules.ts`（progression 从那里 import），避免 rules 内部反向引用。

2. 三个落边点全部收口：
   - `dl-agent-actions.ts` saveRelation：自环检查后追加 `wouldCreatePrereqCycle` 检查（建议态边也拦——确认后同样死锁）；
   - `learning-graph.service.ts` confirmRelation：`this.relations.listByProject` 后检查再 create；
   - `learning-graph.service.ts` linkPrerequisites：循环内维护一个本地已建边数组（含本次调用前面几轮建的），一并传入检查。
3. 拒绝文案给可执行修复路径（对齐模块既有风格）：

```
dl_save_relation：这条边会构成前置环（B → … → A → B）——学习路径上不允许循环依赖。
请改为反向（target 是 source 的前置才对），或先删除/不建其中一条既有边；若两条概念实际是同一件事，请勿互为前置。
```

**验收**：`tests/unit/core/packs/domain-learning/learning-prerequisites.rules.spec.ts` 增加用例：单边、双向互指被拒、三层链闭合被拒、同链非闭合放行；`learning-graph.service.spec.ts` 覆盖 confirmRelation/linkPrerequisites 两个入口。

### A2 删边入口（P0 配套，IPC 约 60 行 + 前端按钮）

**问题（已核实）**：`DlRelationRepository.deleteById` 存在但全链路无入口；handler 只有 `dl:confirm-relation`（`domain-learning.handler.ts:277`），无删除通道——错边只能改库。

**改法**：
1. `learning-graph.service.ts` 增 `removeRelation(projectId, relationId)`：先读边、校验 `projectId` 归属（与 `mustConcept` 同风格），再 deleteById，打日志；
2. `domain-learning.handler.ts` 在 `dl:confirm-relation` 旁注册 `dl:remove-relation`（scoped 参数 `{ id, relationId }`）；
3. `src/preload/index.ts` 通道透出——**记得同步** `tests/unit/packs/dl-channel-consistency.spec.ts`（该测试就是为防通道漏配设计的）；
4. 前端地图（Atlas 人审/关系列表）给两类操作：建议边（verified=false）「采纳 / 删除」两键；已确认边「删除」（点击时提示会影响学习路径，需二次确认）。渲染层测试目录 `tests/unit/renderer/domain-learning/`。

**验收**：手工建 A→B→A 环后，在地图 UI 删除其中一条，`dl:pick-next` 恢复正常门控语义；跨空间 relationId 删除被拒。

### A3 存量环检测 + 插队回退可见化（约 30 行）

**改法**：
1. `rules/learning-map-coverage.rules.ts`（`reachableFrom` 旁边）新增纯函数 `detectPrereqCycles(relations): { id: string }[][]`（DFS 三色标记，输出各环成员）；
2. `assessMapCoverage` 增加一类缺口 `cycle`（重扣分，与 unreachable 同级），快照简报输出：「⚠️ 前置关系成环：A → B → A——请在地图上人工删除其中一条边（学习无法推进）」；
3. `learning-graph.service.ts` `pickNextToLearn`：触发 rules 层回退分支时（`pickNextToLearn` 返回的概念实际不可学，可对比调用两次判断，或在 service 里先 `detectPrereqCycles` 命中再对比），`logger.warn` + 在返回值带上 `fallback: true` 供前端展示「存在环/断链，已临时插队」。rules 保持纯函数不加日志。

**验收**：单测覆盖二成员环、三成员环、自环外多个独立环；快照简报快照测试。

---

## 批次 B：数据完整性

### B1 saveConcept 幂等合并 attrs + researchState 白名单（P1-6、P2-9，约 15 行）

**问题（已核实）**：`dl-agent-actions.ts:252` `attrs: extraAttrs ?? existing.attrs` 整体覆盖——AI 重存同名概念时若未带 prerequisites，会把 `attrs.prerequisites`、`confusedCount`、`confusedSections`（`learning-graph.service.ts:88-97` 存于 attrs）一次清零，用户"没懂"历史丢失。`dl-agent-actions.ts:251` 的 `researchState` 接受模型任意值。

**改法**：
```ts
await db.dlConcepts!.patch(existing.id, {
  definitionShort: c.definitionShort ?? existing.definitionShort,
  researchState: isLegalResearchState(c.researchState) ? c.researchState : existing.researchState,
  attrs: { ...(existing.attrs ?? {}), ...(extraAttrs ?? {}) },
})
```
`isLegalResearchState` 用 `domain-learning.types.ts` 中的合法枚举做白名单。同文件 `saveCard`（:600）已是合并写法，风格对齐。

**验收**：单测——existing.attrs `{prerequisites:['A'], confusedCount:2}`，重存带 `attrs:{evidenceLevel:'…'}` 不带 prerequisites → 合并后 prerequisites/confusedCount 保留；researchState 传 `'hacked'` 被忽略。

### B2 tutor 工具面收窄（P1-1，约 10 行）

**问题（已核实）**：`dl-agent-bindings.ts:127-128` `mode !== 'research' && mode !== 'task'` 分支把**全部 dl_* 写动作**绑给 tutor——答疑会话一次追问就能改知识图，且 tutor 轮 `planningRound=false`，绕过规划门禁（`dl-agent-actions.ts:230`）。

**改法**：显式分支 `if (o.mode === 'tutor') return [{ tool: 'dl_answer_question', maxCalls: … }, ...systemBindings]`（答疑引证走快照注入，M1 口径不变）。同步改文件头注释（:5「两种模式都带」是两模式时代的遗留）与相关 spec。

**验收**：bindings 单测——tutor 返回的工具清单不含 dl_save_concept/dl_save_relation/dl_save_card。

### B3 source 语义修正（P2-5，约 5 行）

**问题（已核实）**：`dl-agent-actions.ts:288` 硬编码 `source: 'ai_verified'`，与类型注释语义（`material`=资料提炼 | `ai_verified`=先验经确认，`domain-learning.types.ts:59-60`）冲突——资料提炼的概念被永久标成"先验经确认"。

**改法**：saveConcept 默认 `source: 'material'`；`ai_verified` 留给 verify 流水线核验通过后升级（verify 升级链路放 E 批，本轮只止损 + 在常量处注释说明）。存量不回改。

---

## 批次 C：提示词冲突收敛

### C1 落库轮只注入 bootstrap 的 S4 段 + 对冲句（P1-3，约 25 行）

**问题（已核实）**：`dl-agent-harness.service.ts:299-302` 在【已确认知识体系】落库轮注入 `dlBootstrapSkillBody()` **全文**，其 S2 白纸黑字「规划并落库 **3-8 个**最核心的知识点…回 S2 补概念」，与同轮 `planSavePhaseInstruction`（`dl-agent-deps.ts:171`「**不要重新规划**…方案里的知识点要**全部落库**」）直接冲突。已确认方案 20-40 条时，模型按 3-8 落库即"合规"少落。

**改法**：
1. `dl-agent-deps.ts` 在 `dlBootstrapSkillBody()`（:297）旁增 `dlBootstrapS4Body()`：按技能正文里的 `S4` 标题做段落截取（正则匹配 `## S4` 到下一个同级标题；截取失败兜底 = 返回全文，由调用方加对冲句）；
2. harness:299 改用 `dlBootstrapS4Body()`；
3. `planSavePhaseInstruction`（deps:167）执行顺序前插一句：

> 注意：本轮注入的 bootstrap 正文**仅其 S4（讲义区集规范）适用**；其中 S1-S3「3-8 个核心知识点」「先定领域前置」等口径**全部不适用**——本轮唯一依据是上方已确认方案，方案里的知识点要全部落库。

**验收**：deps 单测覆盖 S4 截取成功/兜底两分支；落库轮注入文本断言含对冲句、不含「3-8」字样。

### C2 补全轮注入互斥（P1-2，约 30 行 + 文案）

**问题（已核实）**：task 补全轮同轮先注入 map-completion 技能全文（harness:273-278，要求"S3 落库"），又因消息无确认标记走 else 分支注入第 1 步指令（harness:316-317 → deps:134「本轮不要调用 dl_save_concept（门禁会直接拒绝）」）。两段相反指令共存；且技能正文完全不知道落库门禁的存在，无已确认方案的空间首轮补全必然在 S3 撞墙。

**改法**（利用 harness:230 已查出的 `confirmedSyllabus`，把它提到补全注入之前即可）：
- task + 补全意图 + **无**已确认方案 → **不注入**技能正文，维持现状第 1 步指令；
- task + 补全意图 + **有**已确认方案 → 注入技能正文，并在其後附短指令：「知识体系方案已确认，直接执行技能正文的 S2（对照缺口规划）→ S3（落库）→ S4（自检）；跳过其 S1 的方案确认环节」，else 分支的第 1 步指令在此情形跳过；
- `builtin-skills.ts` map-completion 正文（:1225 执行顺序段）加一句门禁说明：

> 开始 S3 前先确认：本空间是否已有【已确认知识体系】。若没有——本轮按宿主注入的『第 1 步』先用 dl_propose_understanding / dl_propose_syllabus 把补全清单提交成方案，等用户确认后由宿主驱动下一轮落库；不要在未确认轮强行 S3（会被门禁拒绝）。

**验收**：harness 单测两分支注入内容断言；manual 冒烟：新建空间点「AI 补全」，首轮提交方案而非撞门禁。

### C3 learning-domain-map 输出契约对齐（P2-6，纯文案）

**问题（已核实）**：`builtin-skills.ts:669-670` 要求输出 `kind/why_important/level/parent_branch/openQuestions/spacePrerequisites` 等字段，经 grep 全库证实**没有任何代码消费方**（下游唯一结构化入口 `dl_propose_syllabus`，`dl-agent-tools.ts:200-225`，字段为 `branches[].concepts[name,definitionShort,prerequisites,layer,nodeType] + rootConcepts + notes`）；`kind` 描述带「…等」可越界 DlNodeType 枚举。

**改法**（替换 :669-670 输出段，并顺带修 2.1 节其余三处）：

```markdown
输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"branches":[{"name":"分支名","desc":"学什么","concepts":[
  {"name":"概念名","nodeType":"concept|theory|method|paper|regulation|case|person|controversy",
   "definitionShort":"一句话定义 + 为什么值得学","layer":0,
   "prerequisites":["前置概念名（必须能在本清单或 rootConcepts 里找到同名条目）"]}]}],
 "rootConcepts":[…同 concepts 结构，不属任何分支的根层知识点…],
 "notes":"规模参照与未尽事项。规模参照：入门 12~25 条知识点、工作应用 20~40、前沿 30~60；整域不足 5 条时允许单分支，不做名词拆分灌水。"}
另两件事不用 JSON：openQuestions（开放问题）提交方案后用 dl_answer_question（unresolved=true）逐条登记；领域外门槛（如 Python 基础）用 dl_save_space_prereqs 落库。
提交前逐条自检：① 每条 prerequisites 都能在 concepts ∪ rootConcepts 里找到同名条目；② layer 与前置一致（layer n 的前置最深为 n-1）；③ 相邻 layer 直连跨度 ≤1。
```

同段顺带修（同在 :642-667 内）：
- 双格言合并（:642 vs :667）→「宁可少列**无关**概念；前置链条上的基础概念**必须**多列，二者冲突时永远服从后者。」
- 删除「资料里有的写进 why_important 的出处」（:647）→ 来源标注统一走 evidenceLevel/attrs 约定，JSON 里不再有 why_important 字段自然消失。

**验收**：`dl-agent-deps.spec.ts` / pack 级测试不受影响；人工跑一次空空间三阶段，确认 `dl_propose_syllabus` 提交成功率不降。

### C4 research 系统提示词瘦身（纯文案）

**问题（已核实）**：`dl-agent-deps.ts:504-553` 共 17 条约 5000+ 字，其中第 13/14/15 条与快照的【主题前置要求】【⚠️ 欠账】【地图完整度】内容三处重复。

**改法**：13/14/15 压缩为口径引用：「主题门槛、各知识点前置、欠账与缺口以快照【主题前置要求】【各知识点前置】【⚠️】【地图完整度】为准，逐条执行；额度被拒的条目必须写进本轮总结，不许无声消失。」

### C5 research 第 1 条与固定流程收敛（纯文案）

**问题（已核实）**：research 提示词第 1 条（deps:509）仍引导「invoke_skill 调 learning-domain-map 建骨架」，与空空间第 1 步「只做诉求对齐」两套流程并存；domain-map 技能 :650 的交叉引用也只提 map-completion。

**改法**：第 1 条改为「空空间：严格按下方【固定流程·第 1 步】指令执行（先诉求理解，不要直接建骨架）；非空空间：按快照缺口与当前概念研究」。domain-map 技能 :650 处补：「本技能产出的是**规划草案 JSON**；在固定三阶段流程的空间里，请把这份草案作为 dl_propose_syllabus 的输入，不要绕过 dl_propose_* 直接落库。」

---

## 批次 D：规划级校验与确认体验

### D1 方案前置闭合性校验（P1-4，约 50 行纯函数）

**问题（已核实）**：`learning-plan.rules.ts:93-169` normalizePlanSyllabus 不校验 prerequisites 是否在方案/根层内有落点；确认弹窗（`domain-learning-plan-draft.ts`）也不展示前置字段。提示词 `builtin-skills.ts:659` 是唯一防线，悬空前置要等落库后 ⚠️ 欠账清单（`learning-prerequisites.rules.ts:228-237`）才浮现。

**改法**：normalizePlanSyllabus 末尾（:160 total 计算前后）增闭合检查：
- 名单 = 全部概念名 ∪ rootConcepts 名（两侧 trim 归一，**精确匹配**，不用于子串）；
- 逐条检查每条 prerequisites：不在名单 → `changes.push('知识点「X」的前置「Y」在方案里没有落点——请补该概念，或确认它属领域外能力（将列入主题前置要求）')`；
- **不阻断**（reject），只记 changes 并透传到确认弹窗展示（前端弹窗把 changes 从折叠文案提为显式提示区）。

**验收**：`learning-plan.rules` 单测——闭合/悬空/前置指向分支名（分支名不算落点，仍算悬空）三用例。

### D2 rootConcepts 与 notes 进草稿与载荷（P1-5，约 60 行 + 前端）

**问题（已核实）**：`domain-learning-plan-draft.ts:33-41` toSyllabusDraft 只映射 branches、`:50-68` toSyllabusPayload 返回 `{branches}`——`rootConcepts` 与 `notes` 在用户确认时**静默丢失**（对照 `learning-plan.rules.ts:150-158` normalize 明确接受、`dl-agent-deps.ts:194-196` formatSyllabusLines 会渲染根层）。后果：confirmedConceptCount 与 saveBudget 缩小，落库轮指令里不再出现根层条目。

**改法**：
1. 草稿结构升级：`toSyllabusDraft` 返回 `{ branches, rootConcepts, notes }`（rootConcepts 用 `SyllabusDraftConcept[]` 带 checked，默认全选）；`toSyllabusPayload(draft)` 相应保留三者（保持纯数据、复制嵌套数组——文件头注释的 IPC 克隆约束不破）；
2. 前端确认弹窗增加「根层知识点」分组（复用分支条目渲染）与 notes 展示；
3. 同步更新 `tests/unit/shared/domain-learning-plan-draft.spec.ts` 全部用例签名。

**验收**：spec 覆盖——取消勾选根层知识点后 payload 不含它、全勾选时与输入等价、notes 透传；渲染层冒烟弹窗可见根层分组。

### D3 research 落库轮重试兜底（P1-7，约 5 行）

**问题（已核实）**：`dl-agent-bindings.ts:84` research 分支只看 `isEmptySpace`。第 3 步落库轮中途失败、已落部分概念后重发【已确认知识体系】→ isEmptySpace=false → planningRound=false → 阶段指令与 saveBudget 全部不注入。task 模式已用 `isPlanPhaseMessage` 兜住同构坑（harness:224 注释记录过），research 漏配。

**改法**：`isPlanningSaveRound` 增参 `syllabusConfirmed?: boolean`，research 分支改为 `input.isEmptySpace || !!input.syllabusConfirmed`；harness:221-227 传入 `syllabusConfirmed: message.includes(PLAN_SYLLABUS_CONFIRMED_MARKER)`。

**验收**：bindings 单测——research + 非空空间 + syllabusConfirmed=true → true。

### D4 layer 持久化（P2-4，约 30 行）

**改法**：`dl-agent-tools.ts` dl_save_concept schema 增可选 `layer`（number ≥0）；saveConcept 落 `attrs.layer`（走 B1 的合并写法）；`learning-plan.rules.ts:112-117` 非法 layer 从静默归 0 改为归 0 + `changes.push('知识点「X」的 layer 非法，已按 0 处理')`。coverage 层级仍由边重算，attrs.layer 仅作展示参考（防声明漂移的说明写进工具描述）。

### D5 方案规模上限（P2-7，约 15 行）

**改法**：`dl-plan.service.ts` proposeDlSyllabus 在 normalize 通过后：`countPlanNodes > maxSaveBudget - 6` → reject，reason：「方案共 N 个节点，超出单轮落库上限（M）——请拆成两批提交（先主干后分支），或精简到 M 以内」。maxSaveBudget 取 `DL_SAVE_BUDGET_MAX` 常量，与 planSaveBudget 的夹取口径一致，消除"静默缩水→落库轮逐条 LIMIT 拒绝"的错位。

### D6 seen 集合分离（P2-11，约 5 行）

**改法**：`learning-plan.rules.ts:100` 的 `seen` 拆成 `branchNames` 与 `conceptNames` 两个集合——分支「概率」与概念「概率」重名不再互相吞掉，文案也各自准确。

---

## 批次 E：P2 backlog（另行排期，列出决策待定项）

1. **P2-1 排程排序**：`pickNextToLearn` 改按 `(levelsOf 深度, createdAt)` 排序后再取第一个可学（现按 createdAt，同层推荐顺序不可控）；
2. **P2-2 难度门禁逐记号**：`hasNotationTeaching` 全文一票豁免（`learning-difficulty.rules.ts:29,49`）改为逐记号校验（每个命中记号在 meta 有对应"读法+例子"行）；是否扩展到工作应用/前沿目标需用户拍板；
3. **P2-3 progression G3 短路**：`learning-progression.rules.ts:256` `hasLesson || isPrerequisiteAncestor` 使"排在前"不成立——建议改为「有讲义且（是祖先 OR 显式声明主题前置）」，且 :259-263 同一问题不再同时进 missing（阻断）与 warnings（"建议"）；放宽会提高拒卡率，需实测权衡；
4. **P2-8 前置匹配统一**：`matchPrereqName`/`coveredBySpacePrereqs` 双向子串（prerequisites.rules:135-138,245-253）vs 手工连边严格等名（graph.service:287）——统一为「精确名=落点，子串仅提示」；会改变快照 ⚠️ 数量，需连同 UI 走查；
5. **证据方言统一**：`attrs.evidenceLevel`（字符串混装状态+出处）、`attrs.prior`、`needs_verification`、`source` 四套标注收敛为结构化 `attrs.evidence = {kind, ref}`——涉及 shared 类型 + 迁移 + UI，单独立项；
6. **P2-10 展示小疵**：coverage 粒度判定短空间名误报（map-coverage.rules:325）、`buildMapInventoryLines` 截断缩进（deps:248-254）。

---

## 回归冒烟清单（全部批次完成后过一遍）

1. **从零三阶段**：新建空间 → 诉求理解 → 确认 → 体系方案（含根层知识点 + notes）→ 确认 → 落库轮：全部条目落库、出首份讲义、无门禁误拒；
2. **补全两分支**：无方案空间点「AI 补全」→ 首轮提交方案（不撞门禁）；有方案空间点「AI 补全」→ 直接按 S2-S4 补缺口；
3. **环**：手工建 A→B→A（用 confirm-relation + 手工连边两条路都试）→ 被拒；用 SQL 直插存量环 → 快照 ⚠️ + 地图角标 → UI 删边 → 门控恢复；
4. **数据保留**：概念累计 confusedCount=2 后让 AI 重存同名概念 → 学习信号不丢；
5. **tutor**：答疑轮工具清单无写动作；open 问题登记正常；
6. `npm run test`（vitest）全绿，重点目录 `tests/unit/core/packs/domain-learning/`、`tests/unit/shared/domain-learning-*.spec.ts`、`tests/unit/packs/dl-channel-consistency.spec.ts`。

## 工作量与预期收益

| 批次 | 预估 | 修复后单项收益 |
|---|---|---|
| A | 1.5~2 天 | 消灭唯一 P0：图不可死锁、可修复 |
| B | 0.5 天 | 用户学习信号不再被 AI 清零；答疑会话改不了图 |
| C | 1 天 | 弱模型方差显著收敛：落库轮不再"3-8 个合规少落"，补全轮不再撞门禁 |
| D | 2~2.5 天 | 用户确认的是一份经过完整性检查、信息完整的草案 |

合计约 **5~6 天**（其中 D2/A2 的前端工作量占三分之一）。全部落地后，审查报告中 -3 分的四大扣分点全部关闭，预期评分 8.5+。
