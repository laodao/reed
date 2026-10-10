# 通用 AI 助手学习模式 + 专业 AI 导师调研

> 调研日期：2026-10-09 ｜ 方法：WebSearch + WebFetch 多轮检索一手来源（官方博客/产品页/帮助文档/论文），每个结论标来源与时间。

## A. 通用 AI 助手的学习模式

### A1. ChatGPT Study Mode（"Study and learn"）

- 2025-07-29 上线，Free/Plus/Pro/Team 可用；定位"分步解决问题、从零学概念、备考"而非直接给答案。来源：[OpenAI 官方博客](https://openai.com/index/chatgpt-study-mode)（2025-07-29）、[帮助文档](https://help.openai.com/en/articles/11780217-using-study-mode-in-chatgpt)。
- **核心发现：它是 system prompt 产物，不是单独训练的模型**。官方原话："powered by custom system instructions we've written in collaboration with teachers, scientists, and pedagogy experts."
- 流传出的系统指令规则（Forbes 解读 + Reddit/HN 泄露文本）：①tutoring persona；②先评估学生水平/先问已知；③"guide, don't give"——分块解释+提示引导；④"expect a back-and-forth"——每次回复以 1-2 个问题结尾；⑤定期插入 knowledge check（1 题小测）验证理解再继续；⑥反馈"既鼓励又诚实"。来源：[Forbes, 2025-08-03](https://www.forbes.com/sites/lanceeliot/2025/08/03/deciphering-the-custom-instructions-underlying-openais-new-chatgpt-study-mode-reveals-vital-insights-including-for-prompt-engineering/)。
- 2025 年末学生工具扩展：**Flashcards**（存入 Library，可用 ChatGPT 任务定时练习）、**Quizzes**（上传笔记转交互测验）、College Planner。来源：[OpenAI: Helping teens learn, plan](https://openai.com/index/teens-learn-and-plan)。
- **局限**：prompt 级约束可被一句话绕过（"just give me the answer"）；无掌握度状态，测验结果不回写学习路径。

### A2. Gemini Guided Learning / LearnLM（机制最完整的通用方案）

**产品形态**（2025-08-06 上线）：把问题抛回用户；**每讲完一个概念立即测理解（check），然后 recap + 建议下一步主题**；可为话题生成学习计划逐步走、"沿途不断确认是否跟上"；每话题后出 quiz；生成学习指南/flashcard；**从教育者审核过的图库/视频库拉多模态素材**讲概念；人设 "patient, friendly study buddy"。来源：[官方博客](https://blog.google/products-and-platforms/products/education/guided-learning)（2025-08-06）、[功能详解](https://blog.google/products-and-platforms/products/gemini/guided-learning-google-gemini/)（2025-09-23）。

**LearnLM：训练层面做教学对齐**（与 ChatGPT 最大的差异）：
- 论文 [arXiv:2407.12687](https://arxiv.org/html/2407.12687v4) 定义教学 rubric 五原则：鼓励主动学习；管理认知负荷；深化元认知；激发好奇心与动机；适应学习者目标与水平。
- 自动评估指标（LME）含产品级行为约束："stay on topic / **don't reveal the answer** / guide towards the answer / promote active engagement / **identify & address misconceptions** / respond to affect cues / positive tone / adapt to learner's level"。
- **关键结论：教学行为靠 prompt 写不出来**——原文："most pedagogy is too nuanced to be explained with prompting"，prompted 行为 "unreliable and inconsistent"，故转向教师共创 "golden conversations" 做 SFT 微调。教育者在 4/5 维度显著偏好 LearnLM-Tutor，且 MMLU/MATH 无回退。
- 2025-11 DeepMind 报告：LearnLM 起草的辅导消息获真人督导教师 76.4% 采纳。来源：[DeepMind PDF](https://storage.googleapis.com/deepmind-media/LearnLM/learnLM_nov25.pdf)。

### A3. Claude Learning Mode / Claude for Education

- 2025-04-02 发布。"guides students' reasoning process rather than providing answers"；先问 "How would you approach this problem?"（thinking-first：回复开头是思考占位/提问而非答案）；Socratic 追问 "What evidence supports your conclusion?"；study guide/outline 模板。高校合作：Northeastern（5 万人全校部署）、LSE、Champlain。来源：[Anthropic 公告](https://www.anthropic.com/news/introducing-claude-for-education)。
- **机制本质**：无单独模型、无掌握度状态，纯 prompt + 前端格式约束；创新在"把苏格拉底式提问做成默认输出形态"。

### A4. Grok / DeepSeek / 豆包 / Kimi 查证

- Grok：无 Study Mode（Think/DeepSearch 是通用能力）。DeepSeek：无学习模式（thinking/non-thinking 切换最接近）。**豆包：学习功能做成独立 App"豆包爱学"**（拍题分步讲解、作业批改、错题整理；"豆包课堂"多模态讲题）。Kimi：无学习模式（重点在 K2/Agent Swarm/深度研究）。

## B. 专业 AI 导师产品

### B5. Khanmigo（Khan Academy）——工程化"不泄答案"的样板

- 2023 年基于 GPT-4 上线（现据报道 GPT-4.1）；2025 与 Google.org 合作加交互图表与定向练习。**辅导挂在具体练习/视频上下文中**（AI 知道你正在做哪题）。来源：[khanmigo.ai](https://www.khanmigo.ai/)、[2025-26 学年更新](https://blog.khanacademy.org/whats-new-for-the-2025-26-school-year-big-updates-from-khan-academy-districts)。
- **Hint 体系**：核心原则 "never gives you the answer"，用 hints、提问、step-by-step prompts 引导。
- **工程博客披露**（实验期 2025-10~2026-04，1500 万+辅导线程，[原文](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings)）：
  - **数学校验 agent**：后台实时验算；把它的职责限定为"检查已完成的步骤"而非"算出剩余步骤"后，**泄答案率降 50%**，还省 400ms——"防泄答案靠系统设计而非 prompt"的直接证据。
  - **学习者历史注入**：注入"最近练习摘要"→下一题正确率 +3.4%（60.8 万线程）；注入"未掌握前置技能+简短复习"→ **+2.7%**（136 万线程）；24h 内相关对话日志**转成纯文本**注入 → 认知参与度 +5.09%（原始 JSON 无效）。
  - **北极星指标**：latency、**next-item correctness**、认知参与度分级（passive/active/constructive）；上线门槛 p>0.95 且护栏不回退。
- 学生端 "sticky concepts" 薄弱点通知。**局限**：绑定可汗自有课程体系；mastery 是练习/技能粒度非细粒度图。

### B6. Duolingo Max / Birdbrain

- **Birdbrain v1（2020）**：IRT 风格 logistic 回归——联合估计"学习者能力+题目难度"，预测答对概率，喂给 Session Generator 让课程难度贴住"能力边缘"。来源：[官方博客](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/)。
- **Birdbrain v2（2022 全量）**：**LSTM，把学习者全部做题史压缩成 40 维向量**（能表达"过去时强、将来时弱"的细粒度画像）；**分钟级近实时更新**；把中途弃课的 ~20% 课程数据也捕捉进来。目标："engaged but learning at the edge of their abilities"。来源：[IEEE Spectrum](https://spectrum.ieee.org/duolingo)。
- 词级 SRS 用 Half-Life Regression（[Settles et al., ACL 2016](https://research.duolingo.com/)）；Birdbrain 管课时难度编排，与 SRS 互补。
- **Duolingo Max**（GPT-4）：**Explain My Answer**（对答案追问）/ **Roleplay**（场景对话，结束后生成表现报告）/ **Video Call**（2024-09 起，角色主动来电，AI 自动适配水平）。来源：[官方](https://blog.duolingo.com/duolingo-max)、[Video Call](https://blog.duolingo.com/video-call)。
- LLM 内容生产：数秒生成 10 道符合难度/语法/主题的练习（[官方博客 2023-12](https://blog.duolingo.com/large-language-model-duolingo-lessons)）。

### B7. Speak——对话优先的课程架构

- 课程四段式（[lingtuitive 评测](https://lingtuitive.com/blog/speak-review)）：Video lesson（2-4 分钟+跟读检测）→ Speaking drill（实时点亮对/错词，AI 音与录音并排回放自纠）→ Vocab Builder（句型槽位操练）→ AI Q&A（脚本化引导转自由对话）；进阶后 Free Talk + Roleplay。
- **掌握度模型**："Smart Review / Concept Mastery"——以"概念/句型"为单元，**所有活动（drill、Q&A、Free Talk、复习）统一回写该概念 mastery 分**，复习优先排最弱概念，能预测将遗忘的词。
- **个性化闭环**：Premium Plus 可**从你的错误自动生成 1-2 分钟定制小课**（每天最多 3 节）。
- 基建：OpenAI Realtime API 首发合作伙伴；案例研究 [openai.com/index/speak-connor-zwick](https://openai.com/index/speak-connor-zwick/)。

### B8. Synthesis Tutor

- 脱胎于 DARPA 数字导师研究（16 周数字导师组 > 99.9% 的 10 年经验海军技师）与 Ad Astra 私校。机制：语音交互、游戏化 missions、**一组 AI 角色"团队"授课**（不同角色承担讲解/提问/鼓励）；强调情感联结。来源：[官方博客](https://www.synthesis.com/blog/does-the-synthesis-tutor-get-results)。局限：效果证据多为厂商自述。

### B9. Math Academy（重点：图驱动学习最成熟产品）

> 核心思想：把"学习"完全建模为**知识图上的状态更新**。来源：[How Our AI Works](https://www.mathacademy.com/how-our-ai-works)、[Justin Skycak HSRS 长文](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures)、[The Math Academy Way 全书](https://www.justinmath.com/files/the-math-academy-way.pdf)。

**① 双图数据模型**：数千细粒度主题节点，有向边=先修关系；"课程"只是图的一个切片。**prerequisite 图（前向，决定"接下来能学什么"）与 encompassing 图（后向，决定"学高级节点给低级节点记多少隐式复习学分"）不是一回事**；encompassing 权重由领域专家手工标注（权重≈"高级题随机覆盖低级技能的概率"）。

**② 诊断性 Placement（对"固定规划仪式"的直接替代）**：把图压缩成**最小覆盖集**；每题选**信息增益最大**的题目——答对→给其先修节点供证据，答错→给其后继节点供证据；答题用时过长打折；边界主题标 "conditionally completed"，后续卡壳则**沿学习路径回退**；补基础与推主线并行。

**③ 隐式间隔复习 HSRS**：每学生-主题对维护 `repNum`（累计有效重复）与 `memory`（记忆强度，每过 interval 减半）；`speed`=该生该主题学习速度（2x 复习记 2 次）；`decay` 在长期中断时放大。
- **FIRe（Fractional Implicit Repetition）**：高级主题答题成功，按 encompassing 权重**分数化回灌**被包含的低级主题；低级主题失败则向前惩罚依赖主题（"信用像闪电一样向下传导，像树一样向上生长"）。学习速度 <1x 的学生强制显式复习。
- **重复压缩**：到期复习压缩进尽量少的任务，用隐式复习互相抵消；副产品是自然**混合练习**。理论极限：完全被包含的技能链可完全不用显式复习。

**④ 任务/测验**：一节课 = worked example → 具体例子 → ≤5 道练习，**连续答对 2 题进下一主题**；错得多加题量，再不行**中止课程**（"继续挣扎是低效的时间使用"）→ 先转做无关主题 → 第二次卡住→沿图回溯定位卡壳前置→**自动插入补救复习**。每 150 XP 一次测验随机抽查已学主题，**每错一题立即触发补救**；测验难度自适应到平均 ~80% 分。

**⑤ XP 系统**：1 XP ≈ 1 分钟专注学习；按 XP 速度分联赛每周升降级，XP 永不清零。

**证据与局限**：效果证据非同行评审；无对话式辅导（纯选题刷题）；限定在数学。查证："apiary" 功能名在官方全部公开文字中不存在，应为讹传。

### B10. Squirrel AI 松鼠AI

- **MCM 拆分**：思想/能力/方法三轴 + 知识图谱构成**双图结构**；宣称拆到"3 万纳米级知识点"（外部有[质疑](https://zhuanlan.zhihu.com/p/2032702223185097653)）。**错因分析**：官方口径为"五重错因分析法"（错题逐层下钻到知识漏洞/思维卡点）；学术侧 arXiv 报告其错误分析准确率 78.3%（[arXiv:2409.09403](https://arxiv.org/html/2409.09403v2)）。**注：传闻的"MIBA"公开渠道查无独立定义**。现状：2024 发布 LAM 智适应大模型；TIME Best Inventions 2025；学习机出货 20 万台、AI 自习室 1 万+家（[搜狐 2025](https://m.sohu.com/a/1083043345_362042)）。

### B11. ALEKS（Knowledge Space Theory）

- 理论：Doignon & Falmagne KST——把一门课建模为 ~350 个基本概念及满足先修闭包性质的知识状态集合。来源：[官方 KST 页](https://www.aleks.com/about_aleks/knowledge_space_theory)、[Falmagne 1990](https://escholarship.org/uc/item/94b9x5sw)。
- **初始评估**：**马尔可夫随机过程选题**——每题依据此前答案的似然最大化选下一题，**25-30 道开放式自由作答题**即可唯一确定知识状态；官方指导"宁可点 I don't know 也不要猜"。来源：[Tour](https://www.aleks.com/independent/students/tour_print)。
- **内缘/外缘（数据模型核心）**：每个知识状态由 **inner fringe**（状态内最牢的）与 **outer fringe**（状态外、先修全满足、"一跳就能学会"的 ready-to-learn 概念）摘要；**学习序列=从 outer fringe 选主题**，做对若干练习题才给主题学分；**周期性 Knowledge Check（20-30 题）重估知识状态并重排学习路径**。可视化 "ALEKS Pie"。来源：[Falmagne](https://arxiv.org/pdf/0803.4030)。
- 局限：无对话式讲解；粒度粗；体验枯燥。

### B12. Carnegie Learning MATHia

- CMU Cognitive Tutor（ACT-R）血统；CTAT 编制**认知模型**（专家解题过程规则化）。**技能模型 + BKT**：题目分解为知识成分（KC），每个 KC 用贝叶斯知识追踪维护掌握概率（P(L0)/P(T)/P(G)/P(S)），达阈值即掌握，驱动选题与 JIT 提示。多级 hint + bottom-out。有效性有 WWC 背书。来源：[EDM 2016](https://educationaldatamining.org/EDM2016/proceedings/paper_187.pdf)、[PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7334700)。局限：KC 标注成本极高。

### B13. 产品化研究前沿（RCT 证据）

- **Tutor CoPilot（Stanford，[arXiv:2410.03017](https://arxiv.org/abs/2410.03017)）**：GPT-4 实时给**人类辅导员**推送"专家辅导员思维"建议；900 辅导员/1800 学生；学生掌握率整体 +4pp，**低评分辅导员的学生 +9pp**；$20/辅导员/年。启示：AI 导学建议最大价值在"拉平辅导员水平"。
- **Harvard 物理 AI 导师 RCT（Kestin et al., [Scientific Reports 15:17458, 2025-06-03](https://www.nature.com/articles/s41598-025-97652-6)）**：定制 AI 导师 vs 课堂主动学习，增益 **>2 倍**（0.73-1.3 SD），用时更短。**设计三件套（关键可抄）**：①system prompt 约束教学法；②**平台级脚手架**——多步问题按部分顺序强制呈现（原文承认：仅靠 system prompt 无法可靠提供多步结构，必须平台强制）；③把专家写的分步解注入 prompt 保准确性。对照组即裸 ChatGPT。
- **Nigeria / World Bank**：~800 名中学生 6 周 GPT-4 课后班，学习增益≈1.5-2 个学年 typical learning，外溢到未直接覆盖主题（[World Bank 博客](https://blogs.worldbank.org/en/education/From-chalkboards-to-chatbots-Transforming-learning-in-Nigeria)）。

## C. 跨产品共性机制总结

| # | 机制 | 谁在用 & 怎么实现 |
|---|------|------------------|
| 1 | **"不直接给答案"的产品化** | 三层实现：prompt 层（ChatGPT/Claude/Gemini）；**训练层**（LearnLM SFT，把 "don't reveal answer" 做成可测指标）；**系统层**（Khanmigo 校验 agent 职责限定泄答率砍 50%；Harvard 强制分步；MATHia hint 到底才给答案）。教训：**单靠 prompt 层会破**。 |
| 2 | **Socratic 默认 + 脚手架渐撤（fading）** | Claude LM（每次回复先提问）；Khanmigo；DARPA Tutor（"恰当时机的恰当引导"）；LearnLM rubric 内化。 |
| 3 | **Hint 阶梯** | MATHia 3 级提示+bottom-out；Khanmigo step-by-step；Math Academy 计划在 SRS 2.0 中**惩罚求助**防"重复次数虚高"（[Skycak](https://www.justinmath.com/the-vision-for-version-2-of-math-academys-spaced-repetition-system)）。 |
| 4 | **诊断性定位取代固定大纲** | ALEKS（25-30 题定位知识状态）；Math Academy（最小覆盖集+信息增益+conditionally completed+回退）；Duolingo placement；Speak onboarding。共性：**先用测量画图，再谈教学**。 |
| 5 | **Ready-to-learn 边界驱动排序** | ALEKS outer fringe；Math Academy layering；Khan mastery；MATHia BKT 阈值。 |
| 6 | **隐式复习/图上信用传导** | Math Academy FIRe（独有）；Khanmigo 前置技能注入（+2.7%）；Speak 全活动统一回写 concept mastery；Duolingo Birdbrain×HLR 双系统。 |
| 7 | **错误归因** | Squirrel AI 五重错因+MCM；LearnLM 把 "identify & address misconceptions" 做成指标；Math Academy 图回溯自动插补救；Khanmigo sticky concepts。 |
| 8 | **掌握度阈值与"暂停规则"** | Math Academy：连续 2 题对→进下一节点；错太多→**中止学习**→转无关主题→二次卡住→图回溯补救。"知道何时停下"与"知道何时前进"同等重要。 |
| 9 | **讲义/内容多模态化** | Gemini GL 审核图库/视频+即测；Khanmigo 交互图表；Duolingo Video Call；ChatGPT 笔记→flashcards/quizzes。 |
| 10 | **动机层** | Math Academy（XP≈分钟、联赛）；Duolingo（streak/energy）；Synthesis（情感联结）；Harvard/LearnLM（成长型思维写进 prompt）。**激励计量单位是"专注时长"而非"做题数"**。 |
| 11 | **素材摄入→内容生成闭环** | ChatGPT（笔记→quiz/flashcards）；Gemini GL（材料→study guide）；Speak（错误→定制小课）；豆包爱学（拍照→分步讲解）。 |
| 12 | **测量驱动的产品迭代** | Khanmigo：next-item correctness 为北极星、p>0.95 才上线；Math Academy：每 150 XP 抽测、目标均分 ~80%；Duolingo：影子模式→A/B→全量。 |

**统一洞察**：业界把"教学行为约束"分三层——prompt 层（弱）、训练层（LearnLM，强但贵）、平台/系统层（最强）。成熟产品无一例外走向第二/三层。"修图"成熟产品全部是**测量结果自动触发**，没有一家靠用户手动改图。

## D. 对"领域学习"模块 Top 8 可借鉴

1. **诊断性定位替代"三阶段规划仪式"（画图）**：学 Math Academy（信息增益选题）+ ALEKS（知识状态/fringe）：规划不走"AI 提问→生成大纲"仪式，改为**一次 15-30 题自适应定位测**，把测量结果换算成个性化知识图+每节点掌握状态。规划时长从"对话仪式"变 5 分钟测量。
2. **双图数据模型（修图）**：前向图管"能学什么"，后向图管"学分传导"。答错低级节点→沿图**自动下挂补救节点**；学透高级节点→按权重记隐式学分。手动修图降为兜底。
3. **隐式间隔复习 FIRe（巩固）**：HSRS 公式组（repNum/memory/speed/decay）+ 到期复习压缩进新任务"顺带完成"。让间隔复习成为主学习流的副产品。
4. **讲义卡改为"讲解→即测→recap→下一步"交互单元（学）**：抄 Gemini Guided Learning 节奏+多模态注入（讲解引用检索到的图/视频并标注来源）。检查结果直接回写节点掌握度——讲义与测量不再是两个模块。
5. **三层教学行为约束**：①prompt 层 tutor 人设（先评估、guide-don't-give、每轮 1-2 个问题结尾、定期 knowledge check）；②**平台层**：多步讲义由平台分步投放；③**校验层**：后台校验 agent（仿 Khanmigo 职责限定为"核对已完成步骤"）。
6. **困惑记录结构化为节点标签 "sticky concepts"（测/修图）**：困惑/错题不落会话里，而是**带错因标签的持久标记挂到图节点上**；同时驱动修图候选队列、复习优先级、"错误→自动生成补救讲义卡"（Speak custom lesson 模式）。
7. **外部素材摄入闭环（画图/学）**：允许丢进 PDF/网页/截图，先做"素材→概念节点"对齐（抽取概念映射到图上），再批量生成讲义卡与测验。
8. **动机与度量层**：XP≈专注分钟+日目标；模块北极星定为"下一题独立正确率提升"而非生成内容量；每 N 节点随机抽测（目标均分 ~80%）审计图上"意外薄弱点"，触发自动修图。

**警示性结论**：Harvard RCT 与 LearnLM 从两个独立方向证明——**裸 LLM 上加 prompt 不足够**；效益来自"prompt + 平台结构 + 测量数据回写"的组合。差异化机会恰在第二、三层。

### 主要来源

ChatGPT: openai.com/index/chatgpt-study-mode (2025-07-29) ｜ Gemini/LearnLM: blog.google/products-and-platforms/products/education/guided-learning (2025-08-06)、arxiv.org/html/2407.12687v4、storage.googleapis.com/deepmind-media/LearnLM/learnLM_nov25.pdf ｜ Claude: anthropic.com/news/introducing-claude-for-education (2025-04-02) ｜ Khanmigo: blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings ｜ Duolingo: blog.duolingo.com/duolingo-max、spectrum.ieee.org/duolingo (2022)、blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain (2020) ｜ Speak: openai.com/index/speak-connor-zwick、lingtuitive.com/blog/speak-review ｜ Synthesis: synthesis.com/blog/does-the-synthesis-tutor-get-results ｜ Math Academy: mathacademy.com/how-our-ai-works、justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures、justinmath.com/files/the-math-academy-way.pdf ｜ Squirrel AI: arxiv.org/html/2409.09403v2 ｜ ALEKS: aleks.com/about_aleks/knowledge_space_theory、arxiv.org/pdf/0803.4030 ｜ MATHia: educationaldatamining.org/EDM2016/proceedings/paper_187.pdf ｜ RCT: arxiv.org/abs/2410.03017、nature.com/articles/s41598-025-97652-6、blogs.worldbank.org（Nigeria）
