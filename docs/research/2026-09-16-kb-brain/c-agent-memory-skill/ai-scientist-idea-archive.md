# The AI Scientist: idea 档案库（把隐性积累变成显性资产——"研究银行"式正反馈循环的参照）

- 链接: https://arxiv.org/abs/2408.06292 （后续版本 AI Scientist-v2: 2504.08066）
- 作者: Chris Lu, Cong Lu, Robert Tjarko Lange, Jakob Foerster, Jeff Clune, David Ha（Sakana AI/UFL/Oxford/UBC）
- 时间: 2024-08-12 v1; v3 为 IJCAI 2025 版
- 来源: arXiv。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: The AI Scientist seamlessly performs ideation, a literature search, experiment planning, experiment iterations, manuscript writing, and peer reviewing to produce insightful papers...This allows us to speed up the slow nature of scientific iteration at a surprisingly low financial cost (~$15/paper)...

idea 档案库（进化式积累，本条目核心）：

> 1. Idea Generation. Given a starting template, The AI Scientist first "brainstorms" a diverse set of novel research directions. We take inspiration from evolutionary computation and open-endedness research and iteratively grow an archive of ideas using LLMs as the mutation operator. Each idea comprises a description, experiment execution plan, and (self-assessed) numerical scores of interestingness, novelty, and feasibility. At each iteration, we prompt the language model to generate an interesting new research direction conditional on the existing archive, which can include the numerical review scores from completed previous ideas...After idea generation, we filter ideas by connecting the language model with the Semantic Scholar API and web access as a tool. This allows The AI Scientist to discard any idea that is too similar to existing literature.

实验日志式笔记（过程性资产）：

> After the completion of each experiment, Aider is then given the results and told to take notes in the style of an experimental journal...Conditional on the results, it then re-plans and implements the next experiment...The AI Scientist makes a note describing what each plot contains, enabling the saved figures and experimental notes to provide all the information required to write up the paper...At all steps, Aider sees its history of execution.

闭环（产出反哺档案）：

> We introduce and validate an LLM-generated review to assess the quality of the generated paper...review scores from completed previous ideas [feed back into the archive].

## 核心机制拆解（中文）

- **数据模型**: idea 档案 = 条目化资产，每条含【描述 + 实验计划 + 自评三维分数（interestingness/novelty/feasibility）】，完成的 idea 再挂上评审分数。另有实验日志（journal 式笔记）与图表注释作为过程性资产。
- **流程**: 迭代式"变异"——LLM 以现有档案为条件生成新 idea（档案是 prompt 的一部分）→ 用 Semantic Scholar/网络查重过滤（与已有文献过近则弃）→ 执行 → LLM 评审打分 → 分数回流档案，影响下一轮生成。
- **触发时机**: 每轮 ideation 前档案必读；评审分数在论文完成后回填。积累-消费形成正反馈循环（开放式探索的 novelty search 逻辑）。
- **成本: 极低（每篇 ~$15）**；价值不在单次生成而在档案复利。

## 证据与局限

- 端到端产出多篇完整论文并通过自动化评审；但论文质量整体仍低（人类评审读来平庸），代码改动偶发"unexpected outcomes"（论文自述）。
- 其真正可复用的不是"全自动科学家"，而是**资产结构与循环**：创意作为带分数的档案条目、以档案为条件生成新创意、外部查重防自嗨、完成后的评分回流。
- 局限：novelty 判断依赖 Semantic Scholar 查重，对"与自己的旧 idea 重复"治理较弱；自评分数与真实质量相关性未经严格验证。

## 对我们的适用性

1. **"创作 idea 档案"是我们最缺的一层资产**: 写作工具的知识库不能只有"事实与文档"，还应长出【点子库】——每个点子 = 描述 + 执行计划 + 三维自评（新颖度/可行度/贴合度），完成的作品章节再挂上用户反馈分。这与"方法论卡"互补：方法论是"怎么做"，点子档案是"做什么"——目标里"为创造新知识服务"的正解就是把两者都资产化并让其互相喂养。
2. **以档案为条件的生成（archive-conditional generation）**: 新创意永远在"看过全部旧点子"的前提下提出，天然避免重复、天然产生组合式创新（旧点子变异/杂交）。对连载创作防"梗重复"直接可用。
3. **外部查重环节**: 用向量检索查"库里已有的近似点子"再决定入库（AI Scientist 用 Semantic Scholar，我们用本地库即可）——这就是经验条目的 NOOP/ADD 裁决在点子库上的翻版。
4. **评审分数回流 = 飞轮闭环的最后一环**: 当年的知识飞轮很可能只做了"轨迹→条目"单向流，缺"条目消费效果→条目分数"的回流。任何重启设计必须包含：记录每条方法论/经验被检索、被采纳、被忽略的信号，并回写条目质量分（与 ExpeL 投票、Memento Q 值同构——三个来源独立收敛到同一设计，可信度极高）。
