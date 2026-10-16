# FSRS：Free Spaced Repetition Scheduler（Anki 23.10+ 默认可用的间隔重复调度器）

- 链接: https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html （官方 FAQ）；https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm （算法公式）；论文: Ye et al., KDD'22 "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling"（https://dl.acm.org/doi/10.1145/3534678.3539081）；Su, Ye et al., IEEE TKDE 2023 "Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory"
- 作者: Jarrett Ye（叶峻峣）等，open-spaced-repetition 社区 / MaiMemo 墨墨背单词
- 时间: 2022（KDD 论文）– 2026（FSRS-6 持续更新中）
- 来源: Anki 官方文档 + 官方 wiki（均已全文抓取核实）+ ACM/IEEE 论文
- 证据等级: 工业级实证系统（上亿条复习日志训练；KDD/TKDE 同行评审论文支撑；非 RCT 教育学证据，而是大规模行为数据 + 最优化框架）

## 原文摘录（保留原文不翻译）

（Anki 官方 FAQ）

> "FSRS is based on the 'Three Component Model of Memory'. The model asserts that three variables are sufficient to describe the status of a unitary memory in a human brain. These three variables include: Retrievability (R): The probability that the person can successfully recall a particular information at a given moment. It depends on the time elapsed since the last review and the memory stability (S). Stability (S): The time, in days, required for R to decrease from 100% to 90%. For example, S = 365 means that an entire year will pass before the probability of recalling a particular card drops to 90%. Difficulty (D): The inherent complexity of a particular information. It represents how difficult it is to increase memory stability after a review."

> "In FSRS, these three values are collectively called the 'memory state'. The value of R changes daily, while D and S change only after a card has been reviewed. Each card has its own DSR values, in other words, each card has its own memory state."

> "To accurately estimate the DSR values, FSRS analyzes the user's review history and uses machine learning to find parameters that provide the best fit to the review history."

> "With FSRS, users have to do fewer reviews than with Anki's default algorithm to achieve the same retention level. FSRS is also much better at scheduling cards that have been reviewed with a delay, for example, if the user took a break from Anki for a few weeks or months."

> "If you want to adjust the scheduling, all you need to do is choose an appropriate value of desired retention. With FSRS, users can target a specific value of retention, allowing them to balance how much they remember and how many reviews they have to do. Higher retention leads to more reviews per day."

（官方 wiki "The Algorithm"，FSRS-4.5 幂律遗忘曲线与间隔公式）

> "$R$ : Retrievability (probability of recall); $S$ : Stability (interval when $R=90%$); $D$ : Difficulty ($D \in [1, 10]$)"

> "The retrievability after $t$ days since the last review: $R(t,S) = (1 + FACTOR \cdot t/S)^{DECAY}$, where $R(t,S)=0.9$ when $t=S$. The next interval can be calculated by solving for $t$ in the above equation after putting the request retention in place of $R$."

> "In FSRS-6 ... The formula of stability after a same-day review is changed in this update: $S^\prime(S,G) = S \cdot e^{w_{17}(G-3+w_{18})} \cdot S^{-w_{19}}$. So the S increases faster when it's small and slower when it's large."

> "MaiMemo's papers at ACM KDD and IEEE TKDE: A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling ... & Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory"

（KDD'22 论文核心贡献，据 ACM DL 摘要）: 基于 DHP 记忆模型，用随机最短路径（SSP）算法设计调度器，以最小化复习成本为目标，报告较当时 SOTA 提升 12.6%，已在墨墨背单词上线服务大规模学习者。

## 机制拆解（条件→机制→效果量）

- 条件：每张卡片维护 (D, S, R) 三元记忆状态；用户每次评分 G∈{again, hard, good, easy} 更新 D、S。
- 机制：幂律遗忘曲线 R(t,S)（比指数曲线更符合真实记忆数据）+ 由用户本人复习历史回归出的个性化参数 w；调度目标从"固定 ease 递增"变为"达到目标保持率 r 的最小复习成本"（SSP 最优化）。
- 效果量：官方口径"同等保持率下更少复习次数"、延迟复习后调度更稳；KDD 论文对 SOTA 调度算法（含 HLr、DASH 等）的模拟指标提升约 12.6%。
- 可解释性红利：R 是"此刻能回忆起的概率"——产品可以直接用它做 UI（如"这条知识你现在的记忆强度 78%"）。

## 边界与反例

- FSRS 优化的是"陈述性、原子化条目的保持率"，不处理技能/程序性学习，也不处理意义理解——它假设卡片本身值得记。
- 冷启动：新用户/新卡片参数来自默认值，需要约几十次评分后才个性化。
- 评分 G 是主观自评，用户"善意高估"会系统性拉长间隔（自评偏差）。
- desired retention 设到 0.95+ 时复习量急剧上升，边际收益低；官方推荐 0.85–0.92 区间。

## 对我们的适用性

1. dl-pace-scheduler 若还没用 FSRS：直接嵌入开源实现（rslib，21 参数 FSRS-6），把"掌握日志"映射为复习评分——这是我们最省力且证据最硬的一块。
2. 把 R(t,S) 暴露给创作侧：AI 在创作时可以优先引用"R 已跌破阈值的旧知识"作为上下文，实现"创作即复习"（检索练习发生在真实使用场景，比孤立刷卡更接近 transfer）。
3. 每张讲义卡带独立 D/S：D 高（难）的卡片自动更适合拆分（认知负荷信号），可回流到提炼管线建议"再切一刀"。
4. 目标保持率应按知识分层设置：核心方法论卡 0.90+，背景事实卡 0.80，"灵感类"条目甚至不进调度（避免复习洪泛）。
5. 长期不用的项目：FSRS 对"延迟复习"的鲁棒性意味着我们不需要惩罚性归档，间隔自然变长即是软性淘汰。
