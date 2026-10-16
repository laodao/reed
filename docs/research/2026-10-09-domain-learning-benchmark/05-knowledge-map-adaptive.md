# 知识地图 / 自适应测评 / 动力系统调研

> 调研日期：2026-10-09 ｜ 方法：WebSearch+WebFetch 多轮检索一手来源，结论标来源与时间。
> 说明：需求中 "SFighter puzzle rating" 未检索到对应产品，按 chess.com 与 Lichess 两大谜题评级体系处理。

## A. 知识地图 / 学习路径

### A1. roadmap.sh——社区共建静态权威图 + 新生 AI 生成层

**图谱数据形态**（一手，GitHub）：路线图=可交互节点图；**每个节点的正文是独立 Markdown 文件**（`roadmaps/<slug>/content/<topic>@<node-id>.md`，node ID 将内容与图上节点绑定）；图的节点/连线结构另有 JSON 描述。**"图与内容分离"天然适配 AI 生成+人工 diff 修订**。来源：https://github.com/kamranahmedse/developer-roadmap

**生态运营**：369k stars；"created and reviewed by community and several subject matter experts"，修改走 GitHub PR + 审核；两类图（角色型/技能型）；社区自建路线图入口。来源：https://roadmap.sh/about

**重要新动向 Roadmap AI**（https://roadmap.sh/ai）：自然语言生成路线图（可"基于官方路线图让 AI 加分支"）、按主题+难度生成完整课程、按已学内容生成 Quiz 与模拟面试、learning plans；**进度与官方路线图节点绑定**；Pro $10/月。定价来源：https://ai-deck.app/blog/roadmap-ai

**借鉴**：①节点-ID 键控内容+结构化图文件的分离形态；②官方权威图与个人 AI 生成图并存的双层结构；③AI 生成内容应锚定权威图做覆盖校验。局限：无掌握度（仅二值勾选）、前置边无语义强度。

### A2. Khan Academy——可降级掌握度+混合复习的行业标杆

- 图谱：课程→单元→技能（最小可测节点）；技能间有前置；掌握度=熟练+精通技能百分比。来源：[帮助中心](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery)
- **掌握度四级模型**：Attempted→Familiar→Proficient→Mastered；**会降级**（Mastery Challenge 答错可降回）——"掌握度必须可降级，否则是打卡不是掌握"。来源：[帮助](https://support.khanacademy.org/hc/en-us/articles/5548760867853--How-do-Khan-Academy-s-Mastery-levels-work)
- **Mastery Challenge**：每轮 6 题、覆盖 3 个技能、按个人情况挑选——"跨技能混合的间隔复习+掌握度再测量"双功能。来源：[帮助](https://support.khanacademy.org/hc/en-us/articles/360037127892-What-are-Mastery-Challenges-in-course-mastery)
- **掌握度的外部锚（最关键）**：Khan 把 "skills to proficient" 作为北极星，用 **MAP Growth 标准化测试（全国常模）验证聚合效度**；官方主张"少技能达到熟练，好过多技能停留在熟悉"。来源：[官方博客](https://blog.khanacademy.org/why-khan-academy-will-be-using-skills-to-proficient-to-measure-learning-outcomes)

### A3. Exercism——概念轨/练习轨双轨架构（重点）

- 两类练习：**Concept Exercises**（教单概念、极度聚焦、通常单一预期解法）与 **Practice Exercises**（开放探索）；官方金句："A good Concept Exercise is usually a bad Practice Exercise, and vice versa"。来源：https://exercism.org/docs/building/tracks/syllabus
- 概念树：练习组织为概念树，练习所教概念"依赖先前概念已被理解"；遇循环依赖时对一方 hand-wave（先欠着，阶段性深化）。概念在 `config.json` 声明（uuid/slug/name）。
- **同一概念的双阶段讲义**：`introduction.md`（给未完成练习者：只覆盖理解基础所需）+ `about.md`（给已完成者：全面深入、易错点、对比）+ `links.json`（补充阅读）。**"学前简版/学后深版"是讲义卡可抄的两段式结构**。
- 导师评审分层管线：本地做题→提交→**自动化反馈先行**（Representer 归一化学生解法使相同结构复用同一份反馈 + Analyzer 规则检查）→可选志愿导师人工评审；有自动反馈时 UI 追问"确定不需要导师再看一眼吗？"。来源：https://exercism.org/blog/introducing-representers
- 借鉴：①双轨分离；②config.json 声明式概念与 prereq；③introduction/about 两段式概念卡；④"确定性规则先行、LLM/人兜底"的分层反馈管线。

### A4. boot.dev / Brilliant / Codecademy / DataCamp

- boot.dev：XP、等级、日 streak、quest、成就；计划让 **GitHub commits 计入 streak**（外部行为信号接入）。批评：游戏化诱发"刷 XP 优化"。
- Brilliant："Learn by doing"：每课都是可视化交互问题，先引导式解题再独立练习；**Daily Challenge+streak**。借鉴：讲义不应是"读完"而应是"做完一两个交互问题才算过"。
- Codecademy：每个模块标配 **Cheatsheet（速查表）+ Practice Pack**；Cheatsheet=每节自动生成的"节点摘要卡"，成本低价值高。practice 横切层独立于课程进度。
- DataCamp：独立 practice（每次 ≤250 XP）+ **每日 streak（当日 ≥250 XP 才算数）**——**streak 门槛=每日最小有效学习量**，防"打开就算打卡"。

### A5. Learn Anything——教训

- 现状：退化为极简搜索框，从"主题知识图"转向"私密互链笔记+AI"。**教训：纯"图导航"不绑定内容闭环与学习行为，用户留不住——图必须是学习过程的副产品，而非产品本身**。来源：https://github.com/ieatcode/learn-anything

### A6. 白板即地图：Heptabase / Obsidian Canvas

- Heptabase 创始人自述学习法：为每个学习主题建白板；概念拆成卡片摊开；**用颜色编码掌握状态**（绿=有把握、蓝=思考中、红=没想法）；"白板结构是持续演化的过程"；两年 4000 卡片/180 白板。来源：https://wiki.heptabase.com/how-Heptabases-founder-use-Heptabase-for-learning
- 借鉴：①AI 生成的图应是**可编辑白板**（画布+卡片），而非只读渲染；②节点颜色/状态=最直观的掌握度编码；③"图是演化的"哲学直接回击"一次性规划+手动修"。

## B. 自适应与测评引擎

### B7. CAT 与 IRT（GRE / Duolingo English Test）

- IRT：题目难度与人的能力放**同一量尺**；自适应测试每步选"对该能力水平信息量最大"的题，少量题达到固定卷精度。GRE 用分段自适应；DET 计分用 IRT 模型按每题难度/区分度加权，分数对标 CEFR。来源：https://blog.englishtest.duolingo.com/how-is-the-duolingo-english-test-scored 、[白皮书 2024](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_test_scoring_2024_v1.pdf)、[Settles TACL 2020](https://research.duolingo.com/papers/settles.tacl20.pdf)、[BERT-IRT BEA 2024](https://aclanthology.org/2024.bea-1.35.pdf)、[AutoIRT arXiv 2024](https://arxiv.org/abs/2409.08823)
- 借鉴：**入学定位做 mini-CAT**：AI 生成题→用 10-20 题在前置图上定位用户起点→图从定位点展开；分数对外锚定行业标准。

### B8. 知识追踪模型：BKT / DKT / Elo

| 模型 | 机制 | 优 | 劣 |
|---|---|---|---|
| BKT | HMM，知识状态=隐二值，逐题更新掌握概率（P(L0)/P(T)/P(G)/P(S)，可加遗忘 P(F)） | 可解释、数据需求低 | 二值假设强、知识点独立假设 |
| DKT（Piech 2015） | RNN 吃作答序列输出各知识点掌握向量 | 精度高、可自动发现关联 | 黑箱、需大数据 |
| **Elo 类（PFAE）** | 学生能力/题目难度为标量，每答一题双向增减；**可加时间效应函数 f(t) 建模遗忘** | **极轻量、天然融入遗忘、适合大规模在线** | 单标量表达力弱 |

来源：[知识追踪综述](https://arxiv.org/html/2105.15106v4)、[ACM 2023 对比实证](https://dl.acm.org/doi/full/10.1145/3614436)。综述结论："没有单一模型总是最优，按数据规模、可解释性需求、场景选。"
**对齐我们痛点**：掌握度没有行业锚的标准解法=**Elo/BKT 做内部状态 + 行业惯例做对外展示 + 定期外部效标校准**。Elo 的时间衰减项天然生成"哪些节点该复习了"——修图与复习共用一个模型。

### B9. chess.com / Lichess：评级化的掌握度

- chess.com：新 puzzle rating 用与对局相同的 **Glicko**，**玩家与谜题各有 rating**（"解出=谜题输了"）；重放约 170 亿条历史解题记录重标全库；移除通胀机制后 puzzle rating 与对局 rating 可比。**Puzzle Difficulty 三档**：官方称研究显示**高成功率最利于学习**，默认档"多数题能解出"。来源：[官方公告](https://www.chess.com/news/view/announcing-new-puzzles-rating-system)、[帮助](https://support.chess.com/en/articles/8602396-how-do-puzzle-ratings-work)
- Lichess：谜题各有 Glicko-2 rating，每次作答=一场"对局"；另有 puzzle themes 针对弱项训练。来源：https://lichess.org/page/rating-systems
- **激励洞察**：掌握度做成 **rating 数字**让"变强"像棋力一样可感知、可跨内容比较；"题目也有 rating"意味着**题库可由社区作答自动标定难度（AI 生成题不需人工标定）**。

### B10. Duolingo：placement 与结构演进

- placement：课程开头可做初始定位测试；每单元顶部 **"Jump here?"** 入口，短测验通过即解锁该单元并完成此前全部等级，可一次跳过多单元。来源：https://lumetest.com/blog/duolingo-english-test/the-duolingo-placement-test-what-to-know-about-it
- 结构演进：技能树→crown 体系（2018，每技能 5 级）→**2022 单一线性 path**（认知负荷下降），用 "Jump here?" 测验保住跳级能力。来源：https://duoplanet.com/duolingo-new-learning-path-review

## C. 动力系统与社交

### C11. Duolingo streak / league / quest

- Streak 是"产品中最有效的单一留存杠杆"；3200 万 DAU 携 7 天以上 streak。来源：https://duolingo.deconstructoroffun.com/mechanics/streaks
- 数据：7+ 天 streak 用户长期留存为无 streak 用户的 **2.4 倍**（[trypropel.ai](https://www.trypropel.ai/resources/blogs/duolingo-customer-retention-strategy)）。
- **Streak Freeze**：漏卡一天不清零；用冻结的用户第 21 天平均 streak 长度为未用组的 **4.5 倍**——**宽恕设计反而强化留存**。来源：https://trophy.so/blog/duolingo-gamification-case-study
- 每日目标可自定义（5-20 分钟）：目标过低致持续失败，自选目标才能长期维持。
- **League**：~30 人一组按周 XP 排名、10 段位、晋级区逐段收紧、末位降级；引入 league 后课程完成量 +25%。设计要点：小分组让"赢"对多数人可能；**降级威胁（损失厌恶）比晋级激励覆盖更多用户**。
- Quest/成就：限时 quest 制造"截止周四"的回访理由；成就重设计为 **Personal Records（Day-1 即可解锁，解锁率 43.1%）** 与 **Awards（长程徽章，18.2%）**；成就难度与 14 天留存单调正相关（32%→74%）。
- **好友 streak**：两人同日都学才累加——"不想让具体的人失望"比匿名竞争更持久。
- 反面证据：arXiv 记录"为保 streak 牺牲学习质量"的滥用。来源：https://arxiv.org/pdf/2203.16175
- **分层动力结论**：新手要即时可达的成就；中期要 streak+可赢的竞争；长期要稀有徽章+社交责任链。

### C12. 学习陪伴/问责

- **Focusmate**：预约 25/50 分钟视频与陌生人共坐；**开场各自声明目标→静默共工→结束互相汇报**。机制本质："把孤独任务变成与陌生人的预约"，社会在场感提升任务启动率。来源：https://www.focusmate.com/how-it-works
- **100DaysOfCode / learning in public**：公开每日打卡+标签构成问责闭环；理论基石 Maggie Appleton 数字花园论——"花园以不完美为设计：想法在未完成时就公开，成长过程可见"。来源：https://maggieappleton.com/garden-history
- 借鉴：单人桌面应用可内建"开场声明目标→学完汇报"的 AI 陪学仪式；"知识图/进度快照导出分享"作为公开化出口。

### C13. Maven：cohort 学习的问责结构

- Wes Kao（Maven 联创）："Post-content age"——**内容已不稀缺，稀缺的是社区与问责**。数据：MOOC 完课率 3-6%；cohort 课 altMBA 完课率 **96%**。
- CBC 五机制：①固定起止日期制造紧迫；②live 双向互动问责；③~100 人同伴社区（社会助长效应）；④主动动手实践；⑤交错式学习。来源：https://www.weskao.com/blog/a16z-cohorts-are-king
- 借鉴：把 cohort 的"固定周期+公开承诺+结业展示"抽象成产品机制：每周一个"领域冲刺"、开跑时 AI 见证承诺、结束生成进度快照供分享/对比。

### C14. "教是最好的学"产品化

- Protégé effect（Chase et al. 2009，Betty's Brain）：准备教别人本身产生更深学习。
- 产品形态：teach-back 做成核心功能——用户向 AI"学生"讲解概念，AI 追问暴露漏洞；Feynman 技巧作为测评工具（"讲不清=没懂"）。
- 认知机制：教学=gap 检测+检索练习的组合。

## D. 跨产品共性总结

### D1. 掌握度的行业表达惯例

| 表达 | 代表产品 | 适用 |
|---|---|---|
| 百分比（熟练以上技能占比） | Khan | 课程/领域级总览 |
| 四级词+图形等级（**可降级**） | Khan、Duolingo Legendary | 单节点状态 |
| Elo/Glicko rating 数字 | chess.com、Lichess | 有题库生态、跨内容可比时 |
| XP/等级/徽章 | boot.dev、DataCamp | 行为量计量，**永不当能力指标** |
| 熟练技能数（北极星） | Khan "skills to proficient" | 内部指标，需外部效标 |

**惯例**：对外展示用等级词+百分比（直觉友好）；内部状态用概率/Elo（可计算可衰减）；能力类指标必须找外部锚；XP 只作行为货币。

### D2. 知识图：静态权威 vs 动态生成

- 静态权威派（roadmap.sh GitHub PR+专家审核、Khan 专家团队、Exercism 核心小团队）：可信可引用，但慢、覆盖窄、不个性化。
- 动态生成派（roadmap.sh AI、learn-anything）：任意领域即时，但幻觉、深浅不一。
- **行业收敛的混合模式**：权威图当骨架/校验器，AI 做个性化分支与内容填充，用户可编辑白板（Heptabase 哲学：图是演化的）。同时解决"一次性规划"与"手动修图成本高"。

### D3. 地图进度可视化形态谱系

单线 path+检查点（Duolingo 2022 后，认知负荷最低）→ 树+解锁（Exercism/Khan）→ 交互式节点画布（roadmap.sh）→ 用户自由白板（Heptabase/Obsidian Canvas）。共识：节点状态色（未学/学习中/熟练）+聚合百分比；chess.com 证明 rating 数字也可"图层化"叠加。

### D4. streak / 复习提醒的情感化设计

宽恕优先于惩罚（streak freeze）；每日目标=最小有效学习量；社交成本>匿名竞争；分层（Day-1 成就→streak→联赛→稀有徽章）；**风险**：gamification 滥用会劫持学习目标，需让"学习质量"而非"行为量"驱动奖励。

## E. Top 8 可借鉴机制 + 落地提示

1. **AI 初稿+权威骨架+用户白板的三层图（→画图/修图）**：数据形态抄 roadmap.sh（节点-ID 键控内容+结构化边）+ Exercism（config 声明）；AI 生成时先检索权威路线图做骨架锚定与覆盖校验，生成后图即"可编辑画布"；修图=AI 提 diff 建议+用户确认，全程版本化。
2. **入学 placement mini-CAT（→画图）**：10-20 题自适应测验定位每前置簇起点，图从定位点展开；节点级 "Jump here?" 测验支持跳级。
3. **双轨内容架构+两段式概念卡（→学）**：概念轨（一卡一概念、交互题优先——"做完才算学"）与应用轨分离；每概念两张卡：introduction（学前简版）+about（学后深版）。
4. **可降级的掌握度模型+行业锚（→测/修图）**：内部用 Elo/BKT（可解释、带时间衰减），题库难度由作答数据自动标定（chess.com 双向 Glicko）；对外展示 Khan 式四级+百分比；定期用外部效标校准。
5. **AI 学生 teach-back（→测）**：关键节点提供"给 AI 学生讲一遍"：AI 装不会、提追问；讲解转写→LLM 抽取卡壳点与错误概念→作为质性证据更新掌握度并触发修图。单人可用。
6. **Mastery Challenge：复习即测量（→巩固/修图）**：每几日一轮"6 题×3 技能"跨节点混合小测，用时间衰减挑最该测的节点；答错降级、答对维持——复习数据直接驱动修图，一个机制吃两个闭环。
7. **分层动力系统（→全局）**：①Day-1 可解锁的个人记录成就；②可自定义每日目标（"2 张卡+1 次小测"=最小有效学习量）+streak+streak freeze；③周期性 quest；④可选好友 streak/进度快照分享。奖励绑定"掌握事件"而非"行为量"。
8. **陪学仪式与汇报结构（→动力）**：每次 session 抄 Focusmate 仪式：开场声明本次目标（具体节点）→学中保持 sweet-spot 难度→结束 1 分钟汇报（讲出今天学到什么）→生成下次入口。周期层面：可选"领域冲刺"（固定 1-2 周、开跑承诺、结业展示）。

**一句话总纲**：权威图做骨架、AI 做填充与修图、掌握度用可解释模型+外部锚、复习即测量、动力分层且宽恕优先——组合点在"图-学-测-修-固共用同一套节点状态数据"。

### 主要来源

github.com/kamranahmedse/developer-roadmap ｜ roadmap.sh/about、/ai ｜ support.khanacademy.org（mastery 三篇） ｜ blog.khanacademy.org（skills to proficient） ｜ exercism.org/docs（syllabus/concepts/mentoring）、exercism.org/blog/introducing-representers ｜ classcentral.com（boot.dev） ｜ brilliant.org ｜ apps.apple.com（Codecademy Go） ｜ support.datacamp.com ｜ github.com/ieatcode/learn-anything ｜ wiki.heptabase.com ｜ obsidian.md/canvas ｜ riotiq.com（CAT） ｜ blog.englishtest.duolingo.com ｜ arxiv.org/html/2105.15106v4 ｜ dl.acm.org/doi/full/10.1145/3614436 ｜ chess.com/news、support.chess.com ｜ lichess.org/page/rating-systems ｜ lumetest.com、duoplanet.com ｜ duolingo.deconstructoroffun.com ｜ trypropel.ai ｜ trophy.so ｜ arxiv.org/pdf/2203.16175 ｜ focusmate.com ｜ maggieappleton.com/garden-history ｜ weskao.com/blog/a16z-cohorts-are-king
