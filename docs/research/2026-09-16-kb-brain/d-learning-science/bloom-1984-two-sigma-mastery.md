# The 2 Sigma Problem（一对一辅导 + 掌握学习；AI 导师的参照锚）

- 链接: 原文 https://journals.sagepub.com/doi/10.3102/0013189X013006004 ；本档摘录取自 Wikipedia "Bloom's 2 sigma problem"（已抓取核实，其中直接引用 Bloom 原文页码）
- 作者: Benjamin S. Bloom
- 时间: 1984（Educational Researcher, 13(6), 4–16）
- 来源: Educational Researcher（原始 PDF 为扫描件，未能提取正文；引用经 Wikipedia 中转，含 Bloom 原句）
- 证据等级: 经典实验报告（基于 Anania 与 Burke 两篇博士论文的再分析；非现代标准 RCT）

## 原文摘录（保留原文不翻译；Wikipedia 条目文字，内嵌 Bloom 1984 原句）

> "Bloom's 2 sigma problem refers to the educational phenomenon that the average student tutored one-to-one using mastery learning techniques performed two standard deviations better than students educated in a classroom environment."

> "As quoted by Bloom: 'the average tutored student was above 98% of the students in the control class'. Additionally, the variation of the students' achievement changed: 'about 90% of the tutored students ... attained the level of summative achievement reached by only the highest 20%' of the control class."

> "The phenomenon's associated problem, as described by Bloom, was to 'find methods of group instruction as effective as one-to-one tutoring'."

> "Mastery learning is an educational philosophy first proposed by Bloom in 1968 based on the premise that students must achieve a level of mastery (e.g., 90% on a knowledge test) in prerequisite knowledge before moving forward to learn subsequent information on a topic. Mastery is determined with regular tests, and students who do not yet achieve mastery on the test are given additional educational support before another test."

> "Though Bloom concluded that one-to-one tutoring is 'too costly for most societies to bear on a large scale', Bloom conjectured that a combination of two or three altered variables may result in a similar performance improvement."

（后续证据校准）: 复现研究发现辅导效应量通常小于 2σ（现代估计 ~0.4–1.0σ 区间，取决于辅导训练与掌握学习实施）；2σ 是"两个成分（辅导 × 掌握学习）叠加 + 特定条件"下的上界。AI 导师场景见 ai-tutor-rct-kestin-2025 条目（0.73–1.3σ，对照为主动学习课堂）。

## 机制拆解（条件→机制→效果量）

- 条件：一对一即时反馈 + 掌握学习门控（不达标不前进，补足后再测）。
- 机制：纠错零延迟（错误不累积）、节奏个体化、先备知识完备化（ prerequisite 完备后，后续学习的 element interactivity 下降，与 CLT 互洽）。
- 效果量：原始报告 2σ（98th percentile）；现代复现 0.4–1.0σ；Kestin 2025 AI 导师 RCT 0.73–1.3σ——AI 是历史上第一次让"辅导"边际成本趋近于零。
- 掌握学习的关键设计：失败归因于"教学/练习不足"而非"能力"；以固定掌握标准 + 可变时间为结构（而非固定时间 + 可变成绩）。

## 边界与反例

- 2σ 未被现代研究完整复现；辅导者质量是主要调节变量。
- 掌握学习在大班实施时（无真一对一）效应缩水至 ~0.3–0.5σ。
- "辅导"对陈述性知识最有效；动机/情感成分的贡献无法与认知成分干净分离。

## 对我们的适用性

1. 我们的前置依赖门控（dl_concept prerequisites）= Bloom 掌握学习的直接产品化，方向正确；需要补齐的是"未达标时给替代性补足路径"（另一种解释/例子/类比），而不是让用户卡死。
2. 掌握判定建议显式采用 Bloom 参数：掌握 = 该概念相关卡片跨天检索正确率 ≥ 90%（固定标准、可变时间到达标），与 FSRS 的 desired retention 接轨。
3. AI 导师 + 知识库 + 门控 = "辅导 × 掌握学习"两成分叠加，这正是 2σ 的配方（对照 Kestin：结构化 AI 导师已给出 0.73–1.3σ）——我们的差异化在第三个成分：内容是用户自己的知识库。
4. 失败归因设计：复习失败时文案指向"这条知识需要换个呈现/更多上下文"（系统的责任），而非"你记忆力差"（用户的责任）。
5. 不要用"会话内即时掌握"做门控放行（见 Bjork/睡眠条目）：放行条件基于延迟检索证据。
