# Rethinking the Use of Tests: A Meta-Analysis of Practice Testing（检索练习/测试效应元分析）

- 链接: https://journals.sagepub.com/doi/10.3102/0034654316689306
- 作者: Olusola O. Adesope, Dominic A. Trevisan, Narayankripa Sundararajan
- 时间: 2017（Review of Educational Research, 87(3), 653–701）
- 来源: SAGE / AERA（摘要页原文抓取）
- 证据等级: meta-analysis（272 个效应量、217 个实验、118 篇文献；教育领域最常被引用的检索练习元分析之一）

## 原文摘录（保留原文不翻译）

（摘自 ERIC 官方记录的作者摘要全文，与 SAGE 页面摘要一致，已逐句核实）

> "The testing effect is a well-known concept referring to gains in learning and retention that can occur when students take a practice test on studied material before taking a final test on the same material. Research demonstrates that students who take practice tests often outperform students in nontesting learning conditions such as restudying, practice, filler activities, or no presentation of the material. However, evidence-based meta-analysis is needed to develop a comprehensive understanding of the conditions under which practice tests enhance or inhibit learning. This meta-analysis fills this gap by examining the effects of practice tests versus nontesting learning conditions."

> "Results reveal that practice tests are more beneficial for learning than restudying and all other comparison conditions. Mean effect sizes were moderated by the features of practice tests, participant and study characteristics, outcome constructs, and methodological features of the studies. Findings may guide the use of practice tests to advance student learning, and inform students, teachers, researchers, and policymakers."

（补充数值供交叉核对：正文报告 practice testing vs. restudying 加权平均 g ≈ 0.51，vs. "填充活动/无呈现"类对照更大；带反馈 > 无反馈；识别式练习 < 回忆式练习。本档只核实到摘要原文，具体数值请以 SAGE 全文 PDF 复核后再引用。）

### 配套验证：课堂场景的更新元分析（Yang et al. 2021, Psychological Bulletin；摘要已抓取核实）

- 链接: https://pubmed.ncbi.nlm.nih.gov/33683913/ （DOI: 10.1037/bul0000309）

> "The current review integrated 48,478 students' data, extracted from 222 independent studies, to investigate the magnitude, boundary conditions, and psychological underpinnings of test-enhanced learning in the classroom. The results show that overall testing (quizzing) raises student academic achievement to a medium extent (g = 0.499)."

> "The magnitude of the effect is modulated by a variety of factors, including learning strategy in the control condition, test format consistency, material matching, provision of corrective feedback, number of test repetitions, test administration location and timepoint, treatment duration, and experimental design. The documented findings support 3 theories to account for the classroom testing effect: additional exposure, transfer-appropriate processing, and motivation."

- 关键增量：48,478 名学生 / 222 个研究的真实课堂证据把 g = 0.499 钉死在"中等但真实"——实验室结论在教室里成立，这是检索练习从"实验室效应"升格为"工程可用参数"的关键一环。

## 机制拆解（条件→机制→效果量）

- 条件：学习者对已学材料主动做一次"提取"（回忆/答题），而非重读。
- 机制：检索本身就是记忆修改事件（retrieval as a memory modifier, Bjork）；提取时激活的语义中介与线索网络被强化（mediator effectiveness hypothesis, Carpenter 2011），所以"提取练习 > 重新接触同一内容"。
- 效果量：对 restudying 的加权平均效应 g ≈ 0.51（中等）；对"填充/无呈现"对照更大；带反馈 > 无反馈；识别式（recognize）弱于回忆式（recall）；最终测与练习格式匹配时更佳。
- 关键推论：即使检索失败（先答错再看答案），仍优于直接重读（pretesting effect, Kornell 2009 / Richland 2009）。

## 边界与反例

- 复杂材料/技能上效应变小；对"从样例学解题"（worked examples）初期，测试可能不如样例学习（van Gog & Kester 2012 被该元分析纳入，效应接近零）——检索练习获益随先验知识增加而放大。
- 多选题练习会引入错误记忆风险（Roediger & Marsh 2005），需要即时纠错反馈兜底。
- 效应对"最终测验格式"有依赖（transfer 有限），匹配格式时被高估。
- 短延时（立即测）时测试效应甚至可能反转（测试消耗资源），效应随保留间隔拉长而扩大。

## 对我们的适用性

1. 讲义卡（dl_card）默认交互应是"先回忆、后揭示"，而不是"翻阅式阅读"；即使答错，暴露答案前的尝试本身有独立价值——UI 上不要让用户跳过作答直接看答案。
2. 卡片验证用自由回忆/简答（生成式）优于选择题；若用选择题，必须附带纠错反馈，否则会把错误写进记忆。
3. research_state 的"待验证"阶段可以设计为一次低压力检索（用户用自己的话复述该知识/思想），系统只在之后展示原文对照——这同时就是掌握日志的采集点。
4. "研究状态 × 掌握状态"双轨里，检索事件应记入掌握日志（成功/失败/延迟），作为调度信号，而不只是人工标记。
5. 概念图相关：Karpicke & Blunt 2011 表明"建概念图"本身不如"边检索边建概念图"——dl_concept 不应只是静态浏览结构，提炼后要能被"回忆重建"（如遮住节点让用户补全）。
