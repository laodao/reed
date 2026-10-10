# 领域学习模块现状基线（代码证据）

> 调研日期：2026-10-09 ｜ 范围：仓库 `the-bot` 内 domain-learning 全部代码（core 约 36k 行 + 前端 22 文件 11799 行 + store 1311 行 + shared 契约/lesson-* 约 4000 行）
> 用途：为竞品借鉴调研提供"我们到底长什么样"的客观基线。所有结论带 file:line 证据。

## 一、用户旅程

### 入口与建空间
- 列表页 `src/renderer/src/views/domain-learning/DomainLearningHome.vue`：主题卡片网格；「新建学习主题」弹窗收集：主题名、学习目标（仅三档 `入门|工作应用|前沿`，:153）、一句话说明（同时写入 description，:227-232）、领域画像（5 预设，`src/shared/types/domain-learning.types.ts:970-976`）、侧重 chips、绑定知识库。
- 后端 `dl:create-space` → `LearningProjectService.createSpace`（`src/core/packs/domain-learning/services/learning-project.service.ts`），IPC 注册 `src/core/packs/domain-learning/handlers/domain-learning.handler.ts:141-145`。

### 空间页三栏（`DomainLearningSpace.vue`，4388 行）
- 顶部：空间名、学习前置/推荐书籍 tooltip（点击跳知识库上传）、掌握度进度条、「继续学习 →」。
- **左栏"知识地图"**：体系完整度徽标（coverage 悬停看缺口清单）、追加知识点（+）、AI 补全（MagicStick）、掌握度图例、搜索/过滤、大纲树、当前概念研究状态。
- **中栏"讲义"**：概念名/掌握度 tag；「懂了」「没懂」「拆细」「演示（幻灯）」四按钮；核验状态 chip、「确认发布」、导出（Markdown/PDF/长图）、版本历史；前置 chip 行（已建边=可点跳转，未建边=虚线 chip 支持"跨空间跳转/手动创建"）；无卡时显示"研究此概念"+活动行。
- **右栏"追问·答疑 / 笔记"**：流式回答、回答可收藏为笔记、task 会话动作流水、输入框（自动按 `routeDlIntent` 判定 tutor/task 模式）。
- 浮层：讲义选区「提问/做笔记」、幻灯弹窗、空间设置、版本历史。

### 完整旅程（点击序列）
1. 建空间 → 点「生成首批知识」（bootResearch，:2492-2547）→ 固定消息"请先复述你对我的诉求的理解" → agent 调 `dl_propose_understanding` → 自动弹 PlanConfirmDialog（:1942-1950）。
2. 确认诉求 → 前端发标记消息 `【已确认诉求理解】`（PlanConfirmDialog.vue:228-242）→ agent 调 `dl_propose_syllabus` → 弹窗展示知识体系。
3. 勾选/调序知识点 → 「确认并生成这 N 个知识点」→ **确认瞬间系统确定性落骨架**（`backfillConfirmedSyllabus`，`src/core/packs/domain-learning/services/dl-plan.service.ts:527-635`），再发 `【已确认知识体系】` 驱动第 3 轮（agent 只做富化：前置边、首份讲义、书籍建议；`planSavePhaseInstruction`，`dl-agent-deps.ts:177-203`）。
4. 日常：左栏选概念或「继续学习 →」（`dl:pick-next` 按前置拓扑推荐）→ 读讲义（SectionLesson：逐区编号标题、takeaway 条、版式化正文、折叠深水区、自测先做后看答案）；区级「这块没懂」（带 sectionKey）/「重写此区」；选中正文可"提问/做笔记"。
5. 测：概念级「懂了/没懂」+ 讲义内静态自测题（不产生掌握度数据）。
6. 修图：AI 补全（把 coverage 缺口清单拼进 task 指令）、手工追加/删除/拆细、人审关系边、agent 拆分提案确认。
7. 巩固：空间设置里开启"间隔复习"（**默认关**），到期列表在设置面板里点「开始复习」（发一轮 tutor 会话）——**复习队列藏在设置弹窗里**（`SpaceSettingsPanel.vue:96-122, 251-271`）。
8. 产出：单篇导出 md/PDF/长图、合集 digest、幻灯演示。

### Atlas 知识全景
`DomainAtlas.vue`（1131 行）：左结构索引树、中主图（力导向 + 时间线/流程/矩阵/三层增强视图）、右节点档案（关系可确认/删除=人审入口，`learning-view.service.ts:423`）。

## 二、Agent 侧机制

### 轮次类型
`DlAgentMode = 'research' | 'tutor' | 'task' | 'verify'`（`dl-agent.types.ts:100`；宿主 `dl-agent-harness.service.ts:90-610`）：
- **research**：概念研究/起步研究/问题子研究；带读工具 + dl 动作工具；轮次完成自动触发卡片核验。
- **tutor**：追问答疑；问题先落 `dl_question(open)`；引证=快照注入的讲义+图（`computeDlSpaceSnapshot`，`dl-agent-deps.ts:396-519`）；历史=最近 20 条 answered 问答回灌。
- **task**：补全地图、区级重写、自由指令；额外 `dl_task_progress` + `run_workflow`。
- **verify**：内部卡片交叉核验，只读、串行排队，结果写 `dl_card.verification`。

**轮次调度无状态机**：阶段靠消息文本标记判定——`【已确认诉求理解】`/`【已确认知识体系】`/`【已确认讲义方案】`/`【直接产出讲义】`/`【补全知识地图】`（`dl-agent-deps.ts:31-49, 305, 136-139`）+ `isPlanningSaveRound`（`dl-agent-bindings.ts:79-90`）+ 正则意图。即优化文档"病根 1：从文本猜状态"的现状。

### 工具清单（`dl-agent-tools.ts:356-424`）
写动作（全走提案/草稿态）：`dl_save_concept` / `dl_save_relation` / `dl_save_space_prereqs` / `dl_save_book_suggestions` / `dl_save_card` / `dl_answer_question` / `dl_propose_understanding` / `dl_propose_syllabus` / `dl_propose_lesson_plan` / `dl_propose_concept_split`。内置技能 7+ 个（learning-domain-map / lesson-designer / concept-explainer / source-collector / question-generator / relation-miner / lesson-updater / practice-builder / space-bootstrap / map-completion）。

### 预算/额度
三层配置链：内置默认 → settings 覆盖 → 硬上限夹取（`agent-budget.types.ts:142-245`）。单轮步数 research 12 / task 16（规划落库轮放宽到 40/60）；每工具每轮频控（save_concept 12、save_card 4…）；落库额度按已确认方案条目数派生（`learning-plan.rules.ts:235-249`）。并发 maxConcurrentRuns 3；上下文 24k tokens。

### 调度器（`dl-pace-scheduler.service.ts`）
tick 60s；每空间按 `pace.intervalMin`（默认 30 分钟，**默认 enabled=false**）推进；候选仅 2 类：①无卡的非目录概念 ②open 问题；执行体=research 轮。**仅桌面端可跑**（Web 返回 web-disabled，:13-14）。

## 三、内容形态：讲义卡

- 实体：一概念至多一篇当前版（version 递增）；`essence_type` 六类（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open）；`sections` JSON（`{key,title?,role?,style?,layout?,takeaway?,md,folded?}`）；`evidence_sources`、`spec`、`verification`、版本管理字段。
- 区集契约（lesson-template v9，`src/shared/utils/lesson-template.ts`，1261 行）：**锚点区 4 个**（meta 首位 / selfcheck 收尾 / answers 紧随折叠 / notes 置底）+ **正文规范区**（definition/detail/examples/operation/confusions/controversy/statement，带字数下限）+ **v9 开放区**（agent 可自造英文 slug 章节，role 五选一，顺序自由；固定模板降级为参考骨架）。
- 渲染：SectionLesson.vue——规格条、逐区编号标题、16 种"版式设备"（prose/keypoints/compare/steps/figure/worked/formula/stats/quote/timeline/pitfall/checklist/code/qa/callout，`lesson-layout.ts:76-216`）、折叠区、related/works/evidence 区。
- 载体边界：图=**5 类声明式 JSON 规格 SVG**（matrix/plot/bar/shape/network，`figure-spec.ts`）；代码=仅 JS/TS Worker 沙箱（`code-runner.ts`）；公式=KaTeX。**没有视频/音频/动画/交互练习/外部嵌入**。

### 五道卡级门禁（`dl-agent-actions.ts:583-803`）
1. evidence 门（证据源与 needsVerification 二选一）；
2. 区集/形状门（normalize + 锚点/收尾组/自造区校验）；
3. 方案一致门（有方案时区集/区序/essenceType 不符即阻断）；
4. 视觉门（空区/版式形状不符阻断；文字墙与无图 strict 模式阻断）；
5. 难度门（仅"入门"目标，8 类进阶记号拦截）+ 循序渐进门（全目标；G1-G3 前置能力三选一满足）；
另：数值自检（非阻断）、重点深度检查（非阻断）。
落库：version+1 留档、异步 verify 内部核验。

## 四、掌握度与复习

- **掌握度 4 态枚举**：`untouched | learning | mastered | review`（types:57），无分数/无衰减/无置信度；仅用户行为推进。
- 「懂了」=硬门控（前置边全 mastered，`learning-sequence.rules.ts:42-48`）+ 清零困惑计数。
- 「没懂」=confusedCount+1（可选区级定位 confusedSections）；`splitSuggested = count>=2`（:81-85）——**目前只变成一句 toast 文案**（"已将其拆成更小概念，稍后会重新讲"，DomainLearningSpace.vue:2444-2447），无队列无动作（病根 5 未修）。
- `pickNextToLearn`：按序扫描第一个"未掌握∧前置就绪"；全不可学时回退插队（warn 日志=图有环/断链显影）。
- 掌握度统计仅二元计数（mastered/total）。
- **复习=固定单间隔逾期队列**（`learning-review.rules.ts`，默认 1440 分钟隔日）：无 SM-2/FSRS、无间隔扩充、无遗忘降级；`trigger: self_test | expire` 声明但**无任何代码会产生**（自测与过期遗忘均未接线）。复习动作=发一轮 tutor 会话+手动点完成，无"做对才算完成"。

## 五、规划流

- `dl_plan`：全版本留档（draft→confirmed→superseded）；`step ∈ {understanding, syllabus, lesson, concept-split}`。
- 三阶段顺序不可跳：无 confirmed understanding 拒绝提交 syllabus（`dl-plan.service.ts:91-97`）；无 confirmed syllabus 不能在规划轮建点（`dl-agent-actions.ts:248-259`）。
- 确认即落骨架（backfillConfirmedSyllabus 幂等写入分支+知识点+definitionShort+attrs.prerequisites+layer）。
- 确认弹窗用户能改什么：体系=勾选增删/调序（**不能改名/定义/前置**，只能写"调整意见"让模型重做一版）；讲义方案=仅每区版式可下拉改（16 种设备），其余只读；拆分方案=子知识点只读+确认即执行。

## 六、Move 1-5 实施状态：全部未实施

对 `docs/plan/2026-09-25-domain-learning-architecture-optimization.md` 的核验（grep + git log）：
- **Move 1（plan_phase 状态机）：未实施**——`plan_phase` 零命中；阶段判定仍靠消息标记+isEmptySpace+正则。
- **Move 2（流程收编）：未实施**——技能正文仍整篇注入；`learning-domain-map` 独立 JSON 契约未退役；research 提示词仍 18 条大杂烩（`dl-agent-deps.ts:529-591`）。
- **Move 3（map-linter）：未实施**（统一模块不存在）；但防环补丁 `wouldCreatePrereqCycle` 已接入三个建边入口+存量环诊断+删边入口（fix-plan 批次 A）；前置匹配仍是三套口径。
- **Move 4（数据口径单一权威）：部分达成**（fromGraph/declaredOnly 区分、layer 仅展示、source 语义修正已做）；证据标注仍四套方言并存。
- **Move 5（统一工作队列）：未实施**——调度器候选仍只有 2 类；coverage 缺口/前置欠账/拆解建议均不入队；splitSuggested 止步 toast。
- **已实施的是 fix-plan 过渡补丁批次**：A1/A2/A3（防环/删边/插队回退显影）、B1/B3、D1（悬空前置透传）、D4、D5（方案规模上限）、D6、C2 部分、D3 部分。

## 七、"死板/僵化"点清单（全部有代码证据）

### A. 固定仪式 / 不可跳的流程
1. 建图三阶段是硬性仪式；老手想"一句话建空间直接拿知识点"必须走完两次弹窗确认（仅单概念快速模式可跳）。
2. 阶段靠消息魔法字符串驱动，文案改动即断链。
3. 讲义默认两段确认（先方案后精写）；快速模式要求前端显式发【直接产出讲义】标记，普通追问框无法自然表达。

### B. 单一内容形态
4. 一概念一讲义强绑定（`dl_concept.cardId` 单指针）；无多讲义/分层讲义/差异化讲义。
5. 讲义仍是"区集+md+16 版式"的单一文档范式；无视频/音频/动画/交互练习/外部嵌入；图仅 5 类声明式 SVG、代码仅 JS/TS——AI/数学以外领域缺载体。
6. 自测=静态文字题+折叠答案：无判分、无作答记录、无错题本、不影响掌握度（self_test 触发未接线）。
7. 粒度口径单一（名字>14 字即粗等正则），对"概念天然就大"的领域持续误报。

### C. 手动触发 / 自动化缺口
8. 自动推进与复习默认全关，且仅桌面端可跑。
9. 修图入口全靠手点：AI 补全是唯一批量入口；coverage 九类缺口、前置欠账、splitSuggested 都不变成任务；"没懂两次"的拆解承诺是空头支票。
10. 复习队列藏在设置弹窗里，不在主界面；复习无"做对才算完成"。
11. 书籍建议是纯清单，无电子书检索/导入/章节引用链路。

### D. 评测/掌握度粗糙
12. 掌握度 4 态枚举无分数无衰减；"懂了"是自评按钮，与自测/问答表现脱钩。
13. 复习无间隔扩充、无遗忘建模；expire 触发不存在。
14. 测量结果不回流：自测对错、追问频次、区级"没懂"分布（confusedSections 有数据但无消费方）都不影响讲义迭代或地图生长。

### E. 社交/产出/多空间缺失
15. 无任何协作/分享；"共学"实为"AI 陪学"。
16. 产出仅导出（Web 端 PDF/长图降级 html）；无发布、无社区、无学习报告。
17. 跨空间复用极浅（同名概念跨空间是重复资产）。
18. 学习目标/画像只是提示词佐料，不影响讲义实际写法与选题。

### F. 工程性僵化
19. 概念树单父；图与树正交但 UI 上树是主导航。
20. 区级"重写此区"要求全量重发 sections（无区级 patch），长讲义重写慢且烧 token。
21. verify 核验结果 UI 只展示状态 chip+角标，issues 明细不可见，用户无法逐条复核/驳回。
22. 快照每轮全量重建（80 行截断全树+coverage+概念头 6 区），空间大了上下文成本线性上涨（窗口仅 24k）。

## 八、值得标注的高质量资产（非死板，可对标）

- 五道卡级门禁+数值回算+verify 流水线构成的内容质量闭环；
- 确认即确定性落骨架（backfillConfirmedSyllabus）解决"agent 半途掐断"；
- 预算三层配置链+参数面板+crossFieldGuard；
- 纯函数规则层（rules/ 11 文件零 DB 依赖可 TDD）与"区集契约单一事实源"；
- 声明式图形规格（零依赖离线 SVG）与 Worker 沙箱代码运行；
- 全链路审计（mastery_log/concept_log/卡片版本管理）。
