# 「领域共学空间」知识点规划与学习路线 深度审查报告

> 审查人：知识学习领域提示词专家 subagent（只读审查，未修改任何文件）
> 审查日期：2026-09-23 · 审查范围：/home/ubuntu/workdir/the-bot
> 总评：**7 / 10**

---

## 一、功能链路梳理

### 1.1 「从零规划」链路（空空间起步，固定三阶段状态机）

```
用户建空间 → 前端发起 research 轮
  → DlAgentHarnessService.doSend (dl-agent-harness.service.ts:133)
     ├ computeDlSpaceSnapshot (dl-agent-deps.ts:372) 生成快照：诉求原话/前置要求/地图完整度/体系清单
     ├ snapshot.isEmptySpace=true → isPlanningSaveRound=true (dl-agent-bindings.ts:84)
     ├ 无已确认方案 → saveBudget=规划额度（默认 concepts=30/relations=40，硬顶 60）
     └ 注入 dlEmptySpaceMission（dl-agent-deps.ts:350）＝第 1 步指令
  → 模型（research 系统提示词 dl-agent-deps.ts:504 + 第 1 步指令）调 dl_propose_understanding
     → proposeDlUnderstanding (dl-plan.service.ts:47) → normalizePlanUnderstanding（goalSummary/coverage 硬校验，learning-plan.rules.ts:51）
     → 落 dl_plan(draft)；用户在弹窗确认 → confirmDlPlan(step='understanding')
  → 前端发【已确认诉求理解】标记 → planningRound（仍空空间）→ 注入第 2 步指令 planSyllabusPhaseInstruction (deps:142)
  → 模型调 dl_propose_syllabus → proposeDlSyllabus（dl-plan.service.ts:79，先验：understanding 必须已 confirmed）
     → normalizePlanSyllabus（分支非空/概念非空/去重，learning-plan.rules.ts:93）
     → 用户在弹窗勾选/调序（domain-learning-plan-draft.ts）→ confirmDlPlan(step='syllabus') → 门禁放行依据产生
  → 前端发【已确认知识体系】→ planningRound → 注入 planSavePhaseInstruction（deps:162）+ bootstrap 技能全文（harness:298-302）
  → 模型按方案落库：dl_save_concept（分支 group → 知识点，prerequisites 必填）→ dl_save_relation（前置边，verified=false 草稿）
     → dl_save_card 出首份讲义（过 evidence/区集/视觉/难度/渐进五道门禁，dl-agent-actions.ts:434-639）
```

学习路线的事后计算与 AI 声明解耦：
- **顺序**：`pickNextToLearn`（learning-sequence.rules.ts:66）＝按 createdAt 顺序扫描第一个「未掌握 ∧ prerequisite 前置全 mastered」的概念；全不可学时回退第一个未掌握概念（插队）。
- **层级**：`levelsOf`（learning-map-coverage.rules.ts:104）按前置边算最长链深度；`reachableFrom`（:136）做可达性诊断；`assessMapCoverage`（:181）输出 0-100 分与九类缺口清单，随快照回注给模型（mapCoverageBriefing）。
- **进阶**：`ackMastered`（learning-graph.service.ts:57）硬门控「前置全 mastered 才许标懂」；`ackConfused` 计数达 2 次建议拆解（CONFUSED_SPLIT_THRESHOLD）。
- **难度/渐进**：`dl_save_card` 落库时跑 `checkLessonDifficulty`（仅入门目标）与 `checkLessonProgression`（全目标：meta 首区 + 前置声明 + 8 类前置能力须「图上有概念且有讲义/是祖先」或「空间前置已声明」或「meta 记号热身」）。

职责边界：**提示词负责**「产出什么」（骨架形状、循序渐进原则、资料 vs 先验区分、自检清单）；**代码负责**「能不能入库」（normalize 校验、已确认方案门禁、evidence 硬校验、区集契约、难度/渐进门禁、幂等去重）与「顺序如何生效」（关系边驱动门控，attrs.prerequisites 只是声明/欠账提示）。规划内容本身不做确定性校验的（如方案内前置闭合性），全靠提示词自检——这是边界上最薄的一环（见 P1-4）。

### 1.2 「已有空间补全」链路（learning-map-completion，S1~S4）

```
用户点「AI 补全」/说"补全知识体系"
  → task 模式轮（或 research 空间轮）；shouldInjectMapCompletionSkill 用标记+双正则意图识别（deps:300-317）
  → harness:273-278 注入技能正文（四阶段：S1 采集 KB→联网 3-6 次 → S2 规划四类缺口+证据分级 → S3 dl_save_concept/relation/space_prereqs 落库 → S4 可达性/顺序/证据自检）
  → 同时 isPlanningSaveRound(task)=true → planningRound=true
  → 落库受 assertPlanConfirmedForSave 门禁（dl-agent-actions.ts:207）：无已确认体系方案 → 拒绝
  → harness:316-318 因消息不含确认标记 → 再注入 planUnderstandingPhaseInstruction（第 1 步指令）
```

这条链路的设计意图是「先采集后规划、只补结构不产讲义、证据分级（attrs.evidenceLevel / prior）」，且快照中的【地图完整度】缺口清单 + 【各知识点前置】⚠️ 欠账清单（collectPrereqShortfalls/collectRelationGaps）构成持续驱动的补全闭环；`DlPaceSchedulerService`（dl-pace-scheduler.service.ts）再以周期任务对「无卡概念 / open 问题」自动开研究轮。但注入阶段存在指令冲突（见 P1-2）。

---

## 二、提示词专业评审（学习科学 × 提示词工程）

### 2.1 learning-domain-map（builtin-skills.ts:613-671）——从零规划核心提示词

**做得好的（值得保留）**：
1. **可执行的排序公理**：`:642`「第一原则：顺序必须循序渐进」+ `:658` 给出可计算的 layer 定义（0=零基础可直接学，1=前置全在 layer 0，以此类推）——与代码侧 `levelsOf` 的最长链语义**严格一致**，提示词与规则共享同一数学口径，是少见的严谨做法。
2. **防幻觉三层**：`:644-648` 取材顺序（先 material、再 KB、再联网、再先验）+ 来源二分标注（「有原文出处」vs「先验待查证」）+ `:647`「不编造文献标题与链接」+ `:648` 无资料时的显式降级声明。工具描述层再加一道（dl-agent-tools.ts:291）。
3. **粒度锚定**：`:661`「学完能做一件具体小事（如能算 (4,1)+(1,3) 广播后的形状）」给了 few-shot 式正反例，与 coverage 的粗粒度检测同一精神。
4. **与学习科学对齐**：layer 化拆步符合 ZPD/认知负荷的「小步子+图式累积」；「不跳级」规则（:659）本质是知识图谱的闭合性约束；补基础层清单（:660 ∫/∂/期望方差…）与代码 `PREREQ_SKILLS`（learning-progression.rules.ts:47-96）词汇表完全同名——提示词与门禁「说同一种话」。

**问题与改进文案**：

(1) **输出契约与提交工具 schema 不对齐（最重要）**。`:669-670` 要求输出 `{branches[{name,desc}], spacePrerequisites, concepts[{name,kind,why_important,level,parent_branch,layer,prerequisites}], openQuestions}`，但下游唯一结构化入口是 `dl_propose_syllabus`（dl-agent-tools.ts:200-225：`branches[].concepts[{name,definitionShort,prerequisites,layer,nodeType}] + rootConcepts + notes`）。经 grep 全库证实：`why_important / kind / level / parent_branch / openQuestions / spacePrerequisites` **没有任何代码消费方**。后果：`level`（必学/可选/前沿）静默蒸发；`openQuestions` 无落库路径（其实 `dl_answer_question{unresolved:true}` 可以建 open 问题，但三份提示词都没告诉模型）；`kind` 提示词写「concept/theory/method/…等」——一个"等"字放跑了 DlNodeType 十四种枚举之外的任意值。建议改写输出段：

```
输出严格为 JSON（不要 markdown 代码块，不要多余解释）：
{"branches":[{"name":"分支名","desc":"学什么","concepts":[
  {"name":"概念名","nodeType":"concept|theory|method|paper|regulation|case|person|controversy",
   "definitionShort":"一句话定义+为什么值得学","layer":0,
   "prerequisites":["前置概念名"],"evidence":"material:<出处标题/URL> 或 prior:待查证"}]}],
 "spacePrerequisites":[{"name":"Python 基础","why":"…","level":"…"}],
 "openQuestions":["问题1"]}
```
并补一句「openQuestions 提交方案后用 dl_answer_question（unresolved=true）逐条登记」。

(2) **规模边界缺失**。超小领域（"如何绑鞋带"）被 `normalizePlanSyllabus` 强制 ≥1 分支且每分支 ≥1 知识点，提示词却没有任何小领域指引；超大领域无概念数上限（对比：prerequisites 有 ≤12 上限），`planSaveBudget` 会把超出 maxSaveBudget 的部分静默夹掉 → 落库轮后半程 LIMIT 拒绝、只产出半个体系。建议在 `:654` 后加：「规模参照：入门 12~25 条知识点、工作应用 20~40、前沿 30~60；整域不足 5 条时允许单分支，不做名词拆分灌水」。

(3) **来源标注位置会自我抵消**。`:647` 要求「资料里有的写进 why_important 的出处」——why_important 是一句话理由，塞出处会挤掉理由本身，且该字段没有消费方。应统一到 map-completion 的 attrs 约定（`evidenceLevel`），而不是文本内联。

(4) **两条反向格言并列**：`:642`「宁可多列一个基础概念」vs `:667`「宁可少列概念」。两条 maxim 的触发条件没有分开——建议合并为一句优先级明确的话：「宁可少列**无关**概念；前置链条上的基础概念**必须**多列，二者冲突时永远服从后者。」

(5) **S4 式自检缺位**。S4 自检只在 map-completion 有（`:1249-1253`），domain-map 的自检藏在方法第 4 条里（`:662`），且**没有任何代码兜底**（见 P1-4）。建议在输出前加显式自检块：「提交前逐条核对：① 每条 prerequisites 都能在 concepts ∪ spacePrerequisites 里找到同名条目；② layer 与前置一致（layer n 的前置最深为 n-1）；③ 相邻 layer 直连跨度 ≤1。」

### 2.2 learning-map-completion（builtin-skills.ts:1192-1254）

四阶段（先采集后规划）结构优秀：S1 给了检索词样例与 3-6 次预算、S2 的四类缺口（主干缺失/前置缺失/跨度太大/粒度太粗）与代码 coverage 的 gap kinds 几乎一一对应、S3 明确「已有概念只补边不重建（同名 skipped 属正常）」——与 saveConcept 的 skipped 分支（dl-agent-actions.ts:265-276）口径一致。**但**：

(1) **不知道自己的 S3 会被门禁拦**。技能正文（`:1244-1247`）直接指示「S3 落库 dl_save_concept 建缺口概念」，而从 2026-09-13 起 task 补全轮是 planningRound，`assertPlanConfirmedForSave` 会拒绝一切落库直到用户走完「诉求理解→体系」两轮确认。技能正文应加：

> 「开始 S3 前先确认：本空间是否已有【已确认知识体系】。若没有——本轮先按宿主注入的『第 1 步』用 dl_propose_understanding / dl_propose_syllabus 把补全清单提交成方案，等用户确认后由宿主驱动下一轮落库；不要在未确认轮强行 S3（会被门禁拒绝）。」

(2) **attrs 证据约定是私有方言**：`{"evidenceLevel":"有原文：<出处>"}` 把状态与出处混在一个字符串里，`{"prior":true,…}` 又是另一套；而 research 系统提示词第 4 条用的是 `needs_verification`，类型系统里还有第三个 `source: material|ai_verified|manual`（domain-learning.types.ts:59-60）。三种先验标注互不引用、无一被代码校验或查询。应统一为结构化字段（如 `attrs.evidence = {kind:'material'|'prior', ref:'…'}`）并写进 shared 类型。

### 2.3 固定流程三阶段指令 vs 技能正文的分工（重要冲突）

- **补全轮双重注入冲突**：同一轮快照里，先追加 map-completion 正文（harness:271-278，要求"四阶段、S3 落库"），再追加第 1 步指令（harness:316-318 → deps:129-137：「本轮**只**提交诉求理解草案……**本轮不要调用 dl_save_concept / dl_save_relation**」）。两段指令对「本轮干什么」给出相反答案。阶段指令"最后注入（最新鲜）"是有意设计，但把一份完整矛盾文本留在上下文里是给模型埋雷——弱模型会按技能正文硬闯 S3，吃一轮门禁报错。
- **落库轮 bootstrap 全文注入冲突（更严重）**：harness:298-302 在【已确认知识体系】轮注入 bootstrap 技能**全文**，本意只是借它的 S4 讲义规范；但其 S2（builtin-skills.ts:1288-1296）白纸黑字写着「规划并落库 **3-8 个最核心的知识点**……先定整个领域的前置要求 dl_save_space_prereqs」，与同一轮的 planSavePhaseInstruction（deps:167-178）「**不要重新规划**，方案就是用户已确认的版本」「方案里的知识点要**全部落库**」直接冲突。已确认方案可能是 20-40 条，模型若采信 bootstrap 的数字口径就会**少落库**且自认为合规。建议在注入时只截取 S4 段，或在 planSavePhaseInstruction 加一句对冲：「下面 bootstrap 正文的 S1-S3『3-8 个核心概念』口径本轮不适用，仅其 S4 讲义规范有效。」同理，bootstrap 的 S3（`:1298-1301`「自检顺序……回 S2 补概念」）会鼓励模型在落库轮"重新规划"，绕开已确认方案。
- **research 系统提示词过载**：dlResearchSystemPrompt（deps:504-553）17 条约 5000+ 字，叠加快照（含 ≤80 行体系清单、前置简报、覆盖简报）、可能的技能正文与阶段指令——单轮系统侧上下文已近万字。其中第 13/14/15 条与快照的 ⚠️ 欠账清单、缺口清单内容重复（同一信息三处表述）。建议把 13-15 条压缩为"口径引用"（"按快照【主题前置要求】【⚠️ 欠账】【地图完整度】逐条执行"），把常数细节留给快照动态块。这本身也是个认知负荷问题：给学习者讲了 element interactivity，却给模型塞了一堵提示词墙。

### 2.4 四模式 system prompt 分工与重复矛盾

- 分工本身清晰：research=研究+落草稿（17 条）、tutor=答疑 5 条、task=执行 5 条、verify=核验只读严格 JSON。verify 的「只输出严格 JSON + 失败保持未核验」（harness:589-593）是防幻觉/防误标的良好闭环。
- **矛盾点 1**：research 提示词第 1 条仍引导「invoke_skill 调 learning-domain-map（建骨架）」（deps:509），而空空间轮的阶段指令要求先只做诉求对齐；两套流程并存，模型在空空间可能先跑一遍 domain-map 生成整套 JSON 再被门禁拦住（浪费而非出错，但暴露流程收敛不彻底——domain-map 技能 `:650` 的交叉引用也只提了 map-completion，没提固定三阶段）。
- **矛盾点 2**：tutor 的系统提示词只字未提可以建概念/讲义，但其工具绑定含全部 dl_* 写动作（见 P1-1）。提示词与工具面不一致时，提示词约束形同虚设。
- **重复但同源（正面示范）**：讲义区集契约在三处出现（LESSON_SECTION_CONTRACT_RULES、research 提示词第 2 条、bootstrap S4），但都从 `lesson-template` 同源渲染（builtin-skills.ts:14-38 注释明说"避免提示词一份口径、门禁另一份口径"）。

### 2.5 「提示词自检 vs 代码校验」双重保险盘点

| 原则 | 提示词位置 | 代码校验 | 结论 |
|---|---|---|---|
| 空分支 | deps:152「不许出现空分支」 | normalizePlanSyllabus :139-146 硬拒 | ✅ 双保险 |
| 顺序不跳级 | builtin :659 / map-completion :1241 | **方案级无校验**；落库后仅 ⚠️ 提示（prerequisites.rules:228-237）；讲义级有 progression 门禁 | ⚠️ 半漏挡：方案确认前无静态检查 |
| 悬空前置有落点 | builtin :659 | 落库后 describePrereqFollowUp（actions:315）+ 快照 ⚠️；**方案级无** | ⚠️ 事后诸葛 |
| 前置不齐不许硬排 | builtin :642 | 讲义级 checkLessonProgression 拦卡（不拦建图） | ⚠️ 图级无 |
| 不编造文献 | builtin :647/:667 | evidence 非空硬校验（actions:445）+ verify 会话交叉核验 | ✅（但 evidence 真实性仍靠 verify LLM） |
| 粒度 | builtin :661 | coverage 粗粒度检测（评分/提示，不阻断） | ✅ 提示级 |
| layer 一致性 | builtin :658 | 无（非法 layer 静默归 0，plan.rules:112-117） | ❌ 纯提示词 |

结论：讲义（card）侧是真正的"双重保险"，规划（map/syllabus）侧的"顺序"原则基本只有提示词单点，代码只在**事后**以欠账清单形式补位。

---

## 三、代码评审

### 3.1 规则算法正确性

- **learning-sequence.rules**：`prereqsReady/isLearnable` 逻辑正确（group 不可学、review 视为未掌握、需回访）。缺陷：`pickNextToLearn`（:71）`concepts.find` 依赖传入顺序＝createdAt ASC（dl-concept.repository.ts:110），同层多个可学概念时推荐谁完全由**建点先后**决定，与「按 layer 从小到大」的教学顺序无关；环存在时全体不可学 → :73-74 静默回退"第一个未掌握"，门控被无声绕过且无任何日志/事件。
- **learning-prerequisites.rules**：`matchPrereqName`（:135-138）双向 `includes` 子串匹配过宽——概念「概率论」会命中前置名「概率」判为已落点；而手工建点 `linkPrerequisites`（learning-graph.service.ts:287）用**严格等名**匹配，同一空间两套口径，可能出现"快照说已落点、手工连边却说缺失"的矛盾。
- **learning-progression.rules**：G1/G2（meta 首区、前置声明关键词）合理；G3 的 `usable = matched.filter(c => c.hasLesson || isPrerequisiteAncestor(...))`（:256）意味着**前置概念只要有讲义（哪怕没有任何 prerequisite 边、排在图末尾）即放行**——"并排在本概念之前"只有 `isPrerequisiteAncestor` 一条腿，被 `hasLesson` 短路后顺序性不成立，与提示词「领域图里已有对应前置概念并排在前面」承诺不符。另外 ：259-263 在「matched 但不可用」分支同时 push missing（阻断）和 warnings（措辞是"建议"），拒绝与建议混发，模型收到的信号含糊。
- **learning-difficulty.rules**：`hasNotationTeaching`（:29,49）全卡任一处出现「读法/读作/符号表」即对**全部**命中的进阶记号豁免——在正文里写一句"这些符号的读法见下表"就能整体绕过；且 ：81-83 仅入门目标生效（工作应用/前沿完全不看），跳步防护全押在 progression 门禁上（而它又有 :256 的短路）。
- **learning-map-coverage.rules**：`levelsOf` 记忆化+visiting 防环（:118 返回 0）不会崩，但环节点的缓存值依赖首次遍历路径（A→B→A 得 level[A]=2, level[B]=1），仅作启发式可接受；`reachableFrom`（:136）对悬空边按入边计、不当作入口（:149-152 注释明说），保守方向正确。`assessMapCoverage` 九类缺口扣分有明确注释表（:169-180），夹取 [0,100]。小问题：:325 粒度判定 `name.includes(spaceName) || spaceName.includes(name)` 对短空间名误报率高（空间「AI」会让「AI 绘画」中枪）。
- **learning-plan.rules**：`normalizePlanSyllabus` 的空分支拒绝（:139-146）带历史案例文案、对模型友好，是好的错误信息设计。缺陷：① `seen` 集合（:100）同时用于分支名与概念名去重——分支「概率」与概念「概率」重名时后者被静默丢弃且 changes 文案失真；② 非法 layer 静默归 0 不记 changes（:112-117）；③ **不校验 prerequisites 闭合性**（见 P1-4）；④ 方案无概念总数上限。
- **dl-plan.service**：understanding→syllabus 的顺序硬约束在 propose（:85-91）与 confirm（:211-216）两侧都查，revision+supersede 状态机（:236-244）无双生效，正确。`confirmDlPlan` 允许带 payload 确认（用户勾选后的版本重新 normalize），设计好。
- **dl-agent-actions.saveCard**：五道门禁顺序合理（先归一化再校验，注释 :462-463 讲明原因）；expectedConceptId 防跨界写（:455）；版本化 + 核验不继承（:577-583）；数值自检不阻断交 verify 复核（:572-573）。这一段整体是模块内质量最高的代码。

### 3.2 落库校验严密性

- **环检测：不存在**。saveRelation 只拦自环（actions:408），confirmRelation（graph.service:308）与手工建点连边（:278）都不查环。环一旦建立：`ackMastered`（:62-64）对环上每个成员都抛「前置依赖未全部掌握」→ **死锁**；`pickNextToLearn` 静默插队掩盖。而**系统没有任何删边入口**：`DlRelationRepository.deleteById`（dl-relation.repository.ts:133）存在，但 handler/服务/agent 工具均未暴露——错边只能改库。这是本模块最大的完整性缺口。
- **悬空前置**：边两端归属校验严格（actions:411-414），不会落跨空间边；声明级悬空靠 describePrereqFollowUp + 快照 ⚠️ 事后提示，可接受但非阻断。
- **幂等**：关系边三元唯一 upsert（repository create 查重、verified 升级）设计正确，重复确认不会堆重边。
- **saveConcept 幂等更新会整体覆盖 attrs**（见 P1-6），对比同文件 saveCard 的合并写法（:600 `{...targetConcept.attrs, ...attrs}`）与手工建点的条件保留（graph.service:249），是明显疏漏。
- **inSpace 反推**（actions:376-379）「不信模型自报、由数据反推」是好原则，但同样用双向 includes，会把「Python」匹配到「Python 基础」造成假"空间内会教"。

### 3.3 错误处理与重试路径

- 工具层错误全部以中文可执行文案抛回模型（拒绝信息含"先建哪些概念/关系/讲义"的修复路径，progression.rules:284-290 是范例）；`friendlyError`（handler:42-48）翻译 DB 原话；额度拒绝要求写进总结（research 提示词第 15 条）+ 活动行 warn 必发（harness:389-392 注释）——"缺口不许无声消失"的机制链完整。
- 空空间零产出断言（harness:515-524）、verify 解析失败保持未核验（:589-593）、pace 调度冷却+并发帽+异常不炸 tick（scheduler:259-271）都做得稳。
- 重试路径漏洞：第 3 步落库轮若中途失败、空间已有概念后重发【已确认知识体系】→ `isEmptySpace=false` → `planningRound=false`（harness:221-227 research 分支只看 isEmptySpace）→ **阶段指令与 saveBudget 都不注入**，重试轮以默认小额度、无落库顺序指引运行。task 模式无此问题（isPlanPhaseMessage 兜住，:224 注释记录过这个坑），research 模式漏了同构兜底。

---

## 四、分级问题清单

### P0（会产出错误学习路线 / 数据损坏 / 崩溃）

**P0-1 前置环可建立、不可删除 → 学习路径永久死锁**
- 文件：`src/core/packs/domain-learning/services/dl-agent-actions.ts:408`（仅拦自环）；`learning-graph.service.ts:308-325`（confirmRelation 无环检测）、`:278-304`（手工连边无环检测）；`domain-learning.handler.ts:262-281`（无任何 delete-relation 通道）。
- 证据：saveRelation 全文唯一的图完整性校验是 `if (r.sourceId === r.targetId) throw`。模型分两次调用建 A→B、B→A 即成环（跨轮、跨模式均可）；成环后 `ackMastered`（graph.service:62-64）对环上每个成员都抛「前置依赖未全部掌握」——谁都无法标记掌握，`pickNextToLearn` 全体不可学后静默回退插队（sequence.rules:73-74），门控语义整体失效。`DlRelationRepository.deleteById` 存在但无任何运行时入口。
- 修复：saveRelation/confirmRelation 建边前做 `isPrerequisiteAncestor(relations, sourceId, targetId)` 拦环（现成实现）；同时暴露 `dl:remove-relation` IPC + 地图人审删除入口。

### P1（明显影响规划质量 / 数据完整性）

**P1-1 tutor 模式绑定全部 dl_* 写动作，且绕过规划门禁**
- `dl-agent-bindings.ts:127-129`（`mode !== 'research' && mode !== 'task'` 返回 `[...actionBindings, ...systemBindings]`，tutor 落在此分支）；`dl-agent-actions.ts:230`（planningRound=false 时 saveConcept 无需已确认方案）。
- harness 注释（:199-200）与 bindings 头注释是两模式时代的遗留；现在 tutor=答疑会话，却可调用 dl_save_concept/dl_save_card，一次用户追问就可能改图。
- 修复：tutor 只绑 dl_answer_question；或 saveConcept/saveRelation 增加 `mode==='tutor'` 拒绝。

**P1-2 补全轮同轮注入两份相反指令（技能正文 vs 第 1 步指令）**
- `dl-agent-harness.service.ts:271-278` + `:316-318`；`dl-agent-deps.ts:129-137` vs `builtin-skills.ts:1225-1253`。
- 前者要求「S3 落库 dl_save_concept」，后者要求「本轮不要调用 dl_save_concept（门禁会直接拒绝）」。
- 修复：见 2.2(1) 文案建议；或 task 补全轮检测到无 confirmed syllabus 时不注入技能正文、只注入第 1 步指令。

**P1-3 落库轮注入 bootstrap 全文，其 S2/S3 与「不要重新规划、全部落库」冲突**
- `dl-agent-harness.service.ts:298-302`；`builtin-skills.ts:1288-1296`（"规划并落库 3-8 个最核心的知识点"）vs `dl-agent-deps.ts:167-178`（"不要重新规划……全部落库"）。
- 数字口径（3-8）与已确认方案规模（可 20-40 条）矛盾，模型按 bootstrap 少落库即"合规"。
- 修复：只注入 bootstrap 的 S4 段，或加对冲句。

**P1-4 方案级「前置闭合性/悬空」零校验，确认弹窗既不展示也不可改前置**
- `learning-plan.rules.ts:93-169`（normalizePlanSyllabus 不查 prerequisites 是否有落点）；`domain-learning-plan-draft.ts:33-68`（draft/payload 只处理 branches，只支持勾选/调序）。
- 提示词 `builtin-skills.ts:659` 是唯一防线；用户确认含悬空前置的方案后，问题要等落库后的 ⚠️ 欠账清单才浮现。
- 修复：normalizePlanSyllabus 增加 closure 检查，悬空前置记入 changes——纯函数、零成本。

**P1-5 rootConcepts 在用户确认时被静默丢弃**
- `domain-learning-plan-draft.ts:33-41`（toSyllabusDraft 只映射 branches）、`:50-68`（toSyllabusPayload 返回 `{branches}`，rootConcepts/notes 丢失）；对照 `learning-plan.rules.ts:150-158`（normalize 明确接受 rootConcepts）与 `dl-agent-deps.ts:194-196`（formatSyllabusLines 会渲染根层知识点）。
- 模型提交的根层知识点计划在弹窗里不可见，确认后从 payload 消失——confirmedConceptCount/saveBudget 随之变小。
- 修复：draft 增加「根层知识点」分组渲染，payload 保留 rootConcepts。

**P1-6 saveConcept 幂等更新整体覆盖 attrs，抹掉前置声明与学习信号**
- `dl-agent-actions.ts:249-253`（`attrs: extraAttrs ?? existing.attrs`）。
- 模型重存同名同父概念时若带 `attrs:{evidenceLevel:…}` 而未带 prerequisites，则旧 `attrs.prerequisites`、`evidenceLevel`、`confusedCount`、`confusedSections`（ackConfused 存在 attrs 里，graph.service:88-97）全部丢失——用户"没懂"历史被 AI 一次重存清零。同文件 saveCard（:600）和手工路径（graph.service:245-250）都是合并/条件保留。
- 修复：改为 `attrs: { ...(existing.attrs ?? {}), ...(extraAttrs ?? {}) }`，prerequisites 用规范化结果显式覆盖。

**P1-7 research 模式第 3 步重试轮失去阶段指令与额度（isEmptySpace 翻转）**
- `dl-agent-harness.service.ts:220-227`；`dl-agent-bindings.ts:84`（`if (mode==='research') return input.isEmptySpace`）。
- 第 3 步轮次失败、已落了部分概念后用户重发【已确认知识体系】→ isEmptySpace=false → planningRound=false → planSavePhaseInstruction 与 saveBudget 均不注入。task 模式已用 `isPlanPhaseMessage` 兜住同类坑（:224 注释），research 漏配。
- 修复：research 分支加 `|| message.includes(PLAN_SYLLABUS_CONFIRMED_MARKER)`。

### P2（改进建议）

1. `pickNextToLearn` 按 createdAt 而非 layer/树序（`learning-sequence.rules.ts:71`）；环时回退无日志。建议按 `(layer, createdAt)` 排序后再 find，回退时提示"存在环或断链"。
2. 难度门禁"记号教学"按全文关键词一票豁免（`learning-difficulty.rules.ts:29,87-89`），且仅入门生效。建议改 per-notation 校验。
3. progression G3 `hasLesson || isPrerequisiteAncestor` 短路（`learning-progression.rules.ts:256`）使"排在前"不成立；:259-263 同一问题同时进 missing（阻断）与 warnings（"建议"）。建议统一信号。
4. layer 仅存在于方案，落库不持久化；非法 layer 静默归 0（`learning-plan.rules.ts:112-117`）。建议 schema 加 layer、saveConcept 写 `attrs.layer`。
5. source 枚举语义误用：saveConcept 硬编码 `source:'ai_verified'`（`dl-agent-actions.ts:288`），资料提炼的概念被永久标成"先验经确认"；且三套先验标注（needs_verification / prior+evidenceLevel / source）并存互不校验。
6. learning-domain-map 输出字段（kind/why_important/level/parent_branch/openQuestions/spacePrerequisites）无代码消费方；openQuestions 无落库指引；kind 提示"…等"可越界 DlNodeType 枚举。
7. 方案无规模上限；`planSaveBudget` 夹到 maxSaveBudget 时静默缩水（`learning-plan.rules.ts:215-229`）。建议 propose 时超额直接拒绝并让模型拆分方案。
8. 前置匹配两套口径：双向子串（prerequisites.rules:135-138,245-253）vs 手工连边严格等名（graph.service:287）vs saveSpacePrereqs 反推 includes（actions:377）。建议统一为"精确名优先，子串仅作提示"。
9. `researchState` 可被模型在幂等路径任意改写（`dl-agent-actions.ts:251`），应白名单化合法流转。
10. coverage 粒度判定对短空间名误报（`learning-map-coverage.rules.ts:325`）；`buildMapInventoryLines` 截断后缩进错位（dl-agent-deps.ts:248-254）。均为展示层小疵。
11. 空分支去重的 `seen` 集合分支名/概念名共用（`learning-plan.rules.ts:100,107,129`），跨类重名会误删概念且文案失真。

---

## 五、总评与评分

**评分：7 / 10。**

这个模块在"领域学习 AI 应用"品类里属于高完成度作品：layer 的数学定义在提示词与规则两端严格同构；evidence 硬校验、区集契约同源化、"规划轮门禁 + 阶段指令 + 动作层复核"三处共用的 `planningRound` 标记、revision/supersede 状态机、幂等 upsert、人审草稿语义，都体现出罕见的工程纪律；提示词里"资料 vs 先验二分 + 不编造文献 + 无资料显式降级"的防幻觉设计，以及拒绝信息里附带修复路径的写法，可以直接当范本。学习科学层面，掌握门控（固定标准、可变时间，Bloom 2σ 口径）、检索练习（自测先做再对、答案折叠）、间隔复习队列、按前置图排程（ZPD 脚手架）都有落地，与团队 d-learning-science 文献库的结论方向一致。

**扣分点（-3）**：
1. **图完整性没有闭环（-1，最大单项）**：无环检测 + 无删边入口，一次模型失误或误确认就能把学习路径打成永久死锁，而 `pickNextToLearn` 的静默插队回退会把问题藏起来。对一个以"前置依赖门控"为核心卖点的模块，这是不可辩护的缺口。
2. **流程收敛不彻底、提示词自相矛盾（-1）**：三套规划流程（固定三阶段 / bootstrap S1-S5 / learning-domain-map+map-completion）并存，靠注入标记拼装，产生"补全轮双重指令""落库轮 3-8 vs 全量落库"这类同轮冲突；research 系统提示词 17 条过载；旗舰技能 learning-domain-map 的输出契约与提交工具脱节，6 个字段无消费方。这类问题不会崩，但会让不同模型表现方差急剧拉大——弱模型按哪段文本走全凭运气。
3. **规划级校验单点依赖提示词（-0.5）**：方案的前置闭合性、layer 一致性、悬空落点在用户确认前零校验，确认弹窗又只给勾选/调序且会丢 rootConcepts——"用户拍板"拍到的是一份未经完整性检查的草案。
4. **局部数据与绑定疏漏（-0.5）**：saveConcept 的 attrs 整体覆盖会清掉用户学习信号；tutor 模式写工具过绑；source 枚举语义失真；research 第 3 步重试轮失去阶段指令与额度。

**优先修复顺序**：P0-1（环检测+删边）→ P1-6（attrs 合并）→ P1-2/P1-3（提示词冲突收敛）→ P1-4/P1-5（方案级校验与 rootConcepts）→ P2 逐项。前四项工作量都不大（各约 20-60 行），修复后该模块可达 8.5 分以上。
