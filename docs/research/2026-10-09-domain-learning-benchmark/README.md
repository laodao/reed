# 领域学习功能竞品与机制调研报告（主报告）

> 日期：2026-10-09 ｜ 背景：领域共学空间被评价为"稍微有点死板"，本次做广泛的产品调研，寻找更"活"的机制。
> 方法：6 路并行调研——1 路代码现状摸底（01）、NotebookLM 深挖（02）、大厂学习模式与 AI 导师（03）、内容成课与学习工具（04）、知识地图/自适应/动力（05）、前沿形态与中国市场（06）。全部经多轮 Web 检索一手来源交叉验证；关键事实独立复核（如 NotebookLM 2026-07-16 更名 Gemini Notebook 已核验属实）。
> 与既有研究的关系：本报告聚焦"领域学习"产品形态；2026-09-16 的 kb-brain 研究库（d-learning-science 学习科学 15 篇、e-pkm PKM 18 条）是它的上游理论底座，两者不重复。

---

## 一、核心结论（TL;DR）

**"死板"不是感觉，是四个结构性特征，且每个特征在行业里都已有成熟解法：**

| 我们的死板（代码证据见 01） | 行业的"活法"（证据见 02-06） |
|---|---|
| **规划是仪式**：三阶段确认弹窗不可跳，阶段靠消息魔法字符串驱动 | 规划是**过程或测量**：NotebookLM 零仪式即时生成图；Co-STORM 圆桌持续生长；ALEKS/Math Academy/讯飞用 10~30 题诊断测替代规划对话；秘塔"今天学点啥"一键成课 |
| **内容单形态**：一概念一讲义，区集+md+16 版式的文档范式，图仅 5 类声明式 SVG | 内容是**同一知识的多文体/多模态派生**：NotebookLM Reports 5 模板+自定义格式、四种音频格式、视频总览、脑图；行业"四件套+音频"已是默认组合 |
| **测量不开环**：自测不判分不影响掌握度，"没懂两次"只出一句 toast，复习无间隔扩充、无遗忘建模 | 测量**驱动一切**：Math Academy 错题沿图回溯自动插补救；讯飞测→图谱变色→只学薄弱点；Khan Mastery Challenge 复习即测量；掌握度用 Elo/BKT+可降级+外部锚 |
| **巩固藏在设置里**：复习队列在设置弹窗、默认关、固定间隔、"完成"靠手点 | 复习**嵌在学习流里+有进度感**：Quantum Country 卡嵌正文读=复习；RemNote 复习带笔记上下文；Recall 五阶段状态机可展示；FSRS-6 开源；Duolingo streak/freeze 宽恕设计 |

**一句话诊断**：我们造了一台高质量的"内容生产机"（五道卡级门禁+verify 流水线确实是资产），但把它装在了一条**单行道上**——先规划、后消费、测量不回流。行业的头部产品恰好相反：**结构是副产品，测量是主循环**。

**对 NotebookLM 的专门结论**（详见 02）：它最值得抄的是"多文体一键综合、引用锚点、Mind Map 即导航器、Discover sources 补料即修图、Learning Guide 模式预设、精选模板库"；它最不能学的是"图不可编辑"（被用户骂两年）和"测完即弃"（无掌握度/SRS）——**后者正是我们的差异化护城河，别被它的一键出题带偏成工具化**。

---

## 二、现状基线摘要（详见 [01-current-state.md](01-current-state.md)）

- 用户旅程：建空间 → 三阶段规划（诉求对齐→体系确认→落库，两次弹窗确认不可跳）→ 沿图学讲义卡 → 概念级"懂了/没懂"+静态自测 → 手动"AI 补全"修图 → 设置面板里的固定间隔复习。
- Agent 侧：research/tutor/task/verify 四模式；阶段靠消息标记判定；预算三层配置；调度器仅两类候选且默认关闭。
- 内容：lesson-template v9（锚点区+规范区+开放区+16 版式）；五道卡级门禁；verify 内部核验。
- 掌握度：4 态枚举无分数无衰减；复习=固定单间隔逾期队列，无 SM-2/FSRS；`self_test|expire` 触发声明未接线。
- **09-25 架构优化的 Move 1-5 全部未实施**（fix-plan 过渡补丁已落：防环、删边、方案规模上限等）。
- 死板点清单 22 条，归为：固定仪式（A）、单一内容形态（B）、手动触发缺口（C）、评测粗糙（D）、社交产出缺失（E）、工程僵化（F）。

---

## 三、竞品全景一览（按类别，详细档案见对应文件）

| 类别 | 代表产品 | 一句话机制 | 档案 |
|---|---|---|---|
| 源锚定笔记本 | **NotebookLM/Gemini Notebook**（30M 用户） | 源接地+引用锚点+多文体一键综合+代理化研究 | [02](02-notebooklm.md) |
| 通用助手学习模式 | ChatGPT Study Mode、Gemini Guided Learning（LearnLM）、Claude Learning Mode | 全行业从"给答案"转向"给理解"；LearnLM 证明 prompt 层教学约束不可靠需训练/系统层 | [03](03-learning-modes-ai-tutors.md) |
| 专业 AI 导师 | Khanmigo、Math Academy、ALEKS、MATHia、Squirrel AI、Speak、Duolingo | 图驱动学习的完全体：双图+诊断定位+隐式复习 FIRe+自动补救 | [03](03-learning-modes-ai-tutors.md) |
| 内容成课 | Turbo、StudyFetch、Knowt、StudyRaid、Nolej、Mindgrasp | 四件套（笔记/闪卡/测验/聊天）+音频已是默认；纯生成器已死（Monic/Recast 关停） | [04](04-content-to-course.md) |
| 卡片与复习 | Anki(FSRS-6)、RemNote、Quantum Country、Recall、Jungle | 复习嵌回讲义上下文；五阶段状态机/FSRS 是调度两大流派 | [04](04-content-to-course.md) |
| 知识地图 | roadmap.sh(+AI)、Khan mastery、Exercism 双轨、Heptabase | 权威骨架+AI 填充+可编辑白板；图必须是学习过程的副产品 | [05](05-knowledge-map-adaptive.md) |
| 自适应测评 | CAT/IRT(GRE/DET)、BKT/DKT/Elo、chess.com Glicko | 掌握度评级化：题目与玩家同量尺、可降级、题库自动标定难度 | [05](05-knowledge-map-adaptive.md) |
| 动力系统 | Duolingo(streak/freeze/league)、Focusmate、Maven | 宽恕优先、分层激励、奖励绑掌握事件而非行为量 | [05](05-knowledge-map-adaptive.md) |
| 前沿形态 | Co-STORM、Deep Research、Mem0/Zep、teach-back(Blume) | 规划=圆桌生长过程；学习者画像三件套已商品化 | [06](06-frontier-china.md) |
| 中国市场 | 讯飞精准学、学而思九章、有道子曰、粉笔、秘塔、豆包爱学、松鼠AI | 测-学-练闭环+四色图谱+错题本；AI 批改/陪练是成人付费锚点 | [06](06-frontier-china.md) |

---

## 四、五条结构性洞察（跨行业收敛）

1. **规划从"仪式"变成"过程/测量"**。没有任何头部产品让用户先审批一份大纲再开始学习：NotebookLM 导入即出图（图是衍生品）；Co-STORM 一句话 warm-start 后图谱当场生长、用户随时接管；ALEKS 用 25-30 题定位知识状态后从 outer fringe 直接开学；讯飞 10 题找弱项后直接推内容；秘塔零输入一键成课。**确认体系不是不要了，而是从"门禁"降级为"可选停靠点"**。
2. **内容是派生物，不是作品**。"一个源/一个知识节点 → 多文体派生（讲义/闪卡/测验/脑图/音频/视频）"是 2025-2026 的默认架构；素材不可变、派生物可再生成、编辑落在派生物上。生成器死亡率极高（Monic、Recast、Wisdolia 更名）——**存活者都绑定了复习闭环或用户素材资产**。
3. **测量必须闭环，且是自动的**。成熟产品无一例外：Math Academy 错题沿前置图回溯自动插补救复习；讯飞测验→图谱变色→只学弱项；ALEKS 周期性 Knowledge Check 重估知识状态重排路径；Khanmigo 的北极星是 next-item correctness。**没有一家靠用户手动点"补全"来修图**。
4. **教学行为约束分三层，裸 prompt 必然破防**。Harvard RCT（裸 ChatGPT 对照）与 LearnLM（"most pedagogy is too nuanced to be explained with prompting"）双证：效益来自 prompt+平台结构（强制分步投放）+系统层（Khanmigo 校验 agent 职责限定使泄答率降 50%）。我们的五道门禁正是"平台层"的正确姿势——方向对，要用到教学行为上而不只在内容质检上。
5. **单人学习的动力有成熟配方**：低门槛启动（"今天学点啥"）+ 最小有效学习量定义每日目标 + streak/宽恕冻结 + 复习即每日挑战 + AI 陪学仪式（开场声明目标/结束汇报）+ teach-back（AI 当学生）补社交空洞。分层：新手要 Day-1 成就，中期要 streak+可赢竞争，长期要稀有徽章+社交责任链。

---

## 五、五环节借鉴地图

### 画图（规划知识体系）
| 行业机制 | 来源 | 对我们的落点 |
|---|---|---|
| 零仪式 warm-start：一句话起步图谱即开始生长，确认弹窗变"验收快照" | Co-STORM、NotebookLM、秘塔 | 三阶段改为可选路径；快速通道"一句话建空间直接拿骨架"（backfillConfirmedSyllabus 已具备确定性落骨架能力，天然支持） |
| 诊断性定位 mini-CAT（10-30 题定位起点，图从定位点展开） | Math Academy、ALEKS、讯飞、Duolingo "Jump here?" | 新增"入学定位测"轮次；产出=初始掌握度预填（部分节点 conditionally completed） |
| 图=导航器：点节点=该子图内接地提问 | NotebookLM Mind Map | 左栏树/Atlas 节点点击即发起限定上下文的 tutor 会话 |
| 权威骨架+AI 填充+可编辑白板 | roadmap.sh、Heptabase | 高频领域预置策展模板库（对标 OpenStax/Featured notebooks）做冷启动 |

### 学（讲义与辅导）
| 行业机制 | 来源 | 落点 |
|---|---|---|
| "讲解→即测→recap→下一步"节奏 | Gemini Guided Learning | 讲义卡的 selfcheck 区升级为可判分交互，答完给 recap+推荐下一节点 |
| 多文体一键综合（5 模板+动态推荐+自定义格式沉淀） | NotebookLM Reports | 同一概念的 sections 可渲染为：概念卡/对比表/FAQ/时间线/苏格拉底问答稿；用户自定义格式存为模板 |
| 双轨+两段式概念卡（introduction 学前简版/about 学后深版） | Exercism | 一概念两档深度，按掌握状态切展示 |
| 音频形态（Deep Dive/Brief/Critique/Debate × 时长 × 聚焦） | NotebookLM、GenFM、Jellypod | 复用仓库既有 podcast 能力：讲义一键转双主播对谈；复习到期生成 60 秒 Brief |
| 喂料优先摄入（文件/链接/录音/高亮四入口）+ citation 锚点 | StudyFetch、Recall、Readwise | dl_doc 实体已存在：用户丢 PDF/网页→对齐到概念节点→按素材生成/修订讲义；关键断言挂源锚点 |

### 测（掌握度与评估）
| 行业机制 | 来源 | 落点 |
|---|---|---|
| 掌握度=可降级 rating（Elo/BKT 内部，四级词+百分比对外，外部效标校准） | Khan、chess.com、DET | dl_mastery 4 态枚举升级为数值 rating+衰减；对外仍用四态词；题库难度由作答自动标定 |
| 题型引擎：一份数据多题型渲染+干扰项专门优化+判分+错题本 | Knowt、Recall、Jungle | 讲义结构自动映射题型（概念=填空、关系=配对/排序、应用=简答）；错题入 dl_question 并回链讲义原文 |
| teach-back AI 学生 | Blume、protégé effect | "给 AI 学生讲一遍"模式：AI 追问→抽取卡壳点→写回困惑记录 |
| 复习即测量（Mastery Challenge：每几日 6 题×3 概念混合小测） | Khan | 每日小测面板：复习与测量共用一次交互 |

### 修图（图谱生长）
| 行业机制 | 来源 | 落点 |
|---|---|---|
| 测量自动触发修图（错题归因→节点变色→自动补救/拆解） | Math Academy、讯飞、Squirrel AI | **splitSuggested/coverage 缺口/前置欠账入统一工作队列（= Move 5）**；"没懂两次"自动出拆解提案走确认落库 |
| sticky concepts：困惑作为带错因标签的节点标记 | Khanmigo、Speak | confusedSections 已有数据：升级为节点级标签，驱动复习优先级+讲义修订 |
| 补料即修图（检测到稀疏/缺前置→自动找资料→增量重生成） | NotebookLM Discover/Deep Research | coverage 缺口→自动触发 source-collector 研究轮→带注释的候选源→入源→增量更新子图 |
| 图可修复三路并存：对话式局部修改+局部重生成+手动微调 | NotebookLM 反面教训、Napkin | 概念级对话修改（"拆成两个"已有 ConceptSplitDialog，补"加一条前置"等自然语言入口） |

### 巩固（复习与动力）
| 行业机制 | 来源 | 落点 |
|---|---|---|
| 调度算法：FSRS-6（开源可移植）或 Recall 五阶段状态机（冷启动可解释） | Anki、Recall | learning-review.rules 的固定间隔升级；`expire` 触发接线=遗忘自动降级 |
| 复习嵌入讲义（段落间自检，读=首复习；复习题回链源卡） | Quantum Country、RemNote | selfcheck 区即记忆媒介；复习会话每题带"回讲义"链接 |
| 复习面板一等公民+进度感（三桶/Memory Stats/日历） | Recall、Khan | 复习队列从设置弹窗提到主界面；完成=做对才算，非手点 |
| 分层动力：Day-1 成就/自定义目标/streak+freeze/quest/快照分享 | Duolingo、DataCamp、Maven、Focusmate | 每日目标=最小有效学习量（如"2 卡+1 小测"）；开场声明目标/结束汇报的陪学仪式；知识图快照导出分享 |

---

## 六、Top 12 借鉴机制（合并五路调研、按落地排期分档）

### T0：补闭环（不动架构，1~2 周量级，全是"接线"工作）
1. **测验驱动修图最小版**：splitSuggested 消费（自动出拆解提案→ConceptSplitDialog 确认落库）+ coverage 缺口/前置欠账入调度候选（Move 5 的缩水先行版）。
2. **复习闭环**：调度换 FSRS-6（开源）或 Recall 五阶段状态机；`expire`/`self_test` 触发接线；复习面板提至主界面；"复习完成=做对"。
3. **自测判分**：selfcheck 区升级为可作答可判分，结果写 mastery_log（self_test trigger 接线）。
4. **喂料入口**：dl_doc 已有——补"丢 PDF/链接→概念对齐→按素材生成讲义"的用户路径，研究轮降级为"主题直入"选项。

### T1：产品形态升级（3~4 周量级）
5. **零仪式规划**：warm-start 一句话起步（图边长边确认）；三阶段降为可选停靠点（依赖 Move 1 plan_phase 状态机）；"今天学点啥"式每日推荐入口。
6. **讲义多文体/多模态**：文体模板选择器（概念卡/对比表/FAQ/时间线/问答稿）+自定义格式沉淀；脑图第一屏（层级树，非自由布局，保证可编辑）；音频 Brief（复用 podcast 能力）。
7. **掌握度模型升级**：数值 rating+时间衰减+可降级；对外四态词+百分比；confusedSections 升级为 sticky concepts 节点标签。
8. **题型引擎**：一份数据多题型+干扰项优化+判分+错题本（dl_question 承载）。
9. **引用锚点**：讲义/测验解析/图节点关键断言挂源锚点（复用 info-collection 资产登记链路）。

### T2：差异化与基础设施（长期）
10. **teach-back AI 学生**（市场空位，protégé effect 实证）+ AI 陪学仪式（开场目标/结束汇报）。
11. **学习者画像三件套**：Mem0 式事实抽取+Zep 式时序有效性（掌握衰减）+Dreaming 式夜间整理（困惑→画像→重排复习）。
12. **FIRe 隐式复习/双图学分传导**（Math Academy）：学高级节点按权重给前置记复习学分——与 09-25 优化文档的"统一工作队列"汇合后是终极形态。

---

## 七、与 2026-09-25 架构优化方案的关系

**互补，不是替代**：Move 1-5 解决的是内部工程质量（状态来源、注入契约、不变量归属、口径权威、工作队列）；本报告解决的是产品形态（仪式感、内容形态、测量闭环、动力系统）。关键耦合点：

- **Move 1（plan_phase 状态机）是"零仪式规划"的工程前提**——阶段显式化后，"快速通道/圆桌模式/经典三阶段"才能成为同一状态机上的不同路径而非正则分支。
- **Move 5（统一工作队列）就是行业共识"测量驱动修图"的地基**——本报告调研到的所有自动修图机制（讯飞/Math Academy/ALEKS）在我们架构里的落点都是这个队列，建议提高其优先级并把候选源扩到本报告 T0-1 所列。
- **五道门禁的"平台层约束"哲学可复用**：把"教学行为"（分步投放、即测、不泄答案）也做成门禁/结构，而不只约束内容质量——这是 Harvard RCT/LearnLM/Khanmigo 三方共同验证的方向。
- 建议路线：**Phase 0-3 照旧推进，同时把本报告 T0 四项作为 Phase 3（Move 5）的并行小步**，T1 在 Phase 3 后排期。

## 八、风险与反例清单（调研中的负面证据）

1. **生成器死亡率**：Monic.ai、Recast（2024-10 关停）已死，Wisdolia 更名 Jungle，learn-anything 退化——纯"生成"没有护城河，**闭环与素材资产才是**。我们扩形态之前先把闭环焊死。
2. **学而思错题不可追溯事件（2025 维权）**：测量数据不可追溯、不可回流会直接摧毁信任——困惑/错题数据必须是可复查的一等资产。
3. **gamification 劫持**：Duolingo streak 滥用（arXiv 2203.16175）、boot.dev 刷 XP——奖励必须绑定"掌握事件"而非"行为量"。
4. **"AI 代读"学术批评**（ACM SIGDOC '25、密歇根 LSA、Rettberg 2026"合成亲密感/文化误译"）：NotebookLM 形态的产品被系统性质疑替代而非促进学习——我们的主动回忆+掌握度闭环是对这个批评的结构性回应，宣传与设计上都应坚持"增强而非替代"。
5. **prompt 层教学约束不可靠**（一句"give me the answer"即破防）：学习模式要靠平台层（强制节奏）+系统层（校验 agent）。
6. **45% 用户只用最低级功能**（学习机行业数据）：新能力必须做进默认路径——"复习默认关、藏在设置里"就是反例。
7. **厂商数字打折**：松鼠AI"3 万知识点"、猿辅导"99.99% 批改准确率"均为厂商口径；K12 机制向成人自驱场景迁移需再验证。

## 九、档案索引

| 文件 | 内容 |
|---|---|
| [01-current-state.md](01-current-state.md) | 现状基线：用户旅程/机制/Move 1-5 实施状态/22 条死板点（全带 file:line） |
| [02-notebooklm.md](02-notebooklm.md) | NotebookLM→Gemini Notebook 深度调研：时间线/全部功能/源体系/学术批评/对位分析/Top 8 |
| [03-learning-modes-ai-tutors.md](03-learning-modes-ai-tutors.md) | Study Mode/Guided Learning/Learning Mode + Khanmigo/Math Academy/ALEKS/Squirrel AI/Speak/Duolingo + RCT 证据 + 共性 12 机制 |
| [04-content-to-course.md](04-content-to-course.md) | Turbo/StudyFetch/Knowt/StudyRaid/Nolej/Anki-FSRS/RemNote/Quantum Country/Recall/音频与脑图 + 共性 5 条 |
| [05-knowledge-map-adaptive.md](05-knowledge-map-adaptive.md) | roadmap.sh/Khan/Exercism/Heptabase + CAT/BKT/Elo/chess.com + Duolingo 动力系统 + 共性总结 |
| [06-frontier-china.md](06-frontier-china.md) | Co-STORM/Deep Research/记忆框架/Matuschak/teach-back + 讯飞/学而思/有道/粉笔/秘塔/豆包爱学/松鼠AI + Top 8 |
