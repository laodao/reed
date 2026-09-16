# Cognitive Architecture and Instructional Design: 20 Years Later（认知负荷理论 20 年综述）

- 链接: https://link.springer.com/article/10.1007/s10648-019-09465-5
- 作者: John Sweller, Jeroen J. G. van Merriënboer, Fred Paas
- 时间: 2019（Educational Psychology Review 31, 261–292）
- 来源: Semantic Scholar API 抓取的完整作者摘要（已核实）
- 证据等级: 综述（CLT 领域权威综述；被引 2000+；底层有大量实验与元分析支撑，如 element interactivity 研究）

## 原文摘录（保留原文不翻译）

> "Cognitive load theory was introduced in the 1980s as an instructional design theory based on several uncontroversial aspects of human cognitive architecture. ... In contrast, cognitive load theory emphasised that all novel information first is processed by a capacity and duration limited working memory and then stored in an unlimited long-term memory for later use. Once information is stored in long-term memory, the capacity and duration limits of working memory disappear transforming our ability to function."

> "Curiously, this knowledge had had a limited impact on the field of instructional design with most instructional design recommendations proceeding as though working memory and long-term memory did not exist."

（CLT 的核心构件，2019 版框架）：工作记忆容量限制（约 4 elements / chunk）、长时记忆无限且以图式（schemas）为单元、图式经自动化后绕过工作记忆；教学设计的目标 = 管理 intrinsic load（元素交互性 element interactivity）、削减 extraneous load、优化 germane load。

## 机制拆解（条件→机制→效果量）

- 条件：学习材料的"元素交互性"（intrinsic load）高 + 呈现方式引入无关加工（extraneous load）。
- 机制：工作记忆只能同时处理 ~4 个组块；未组块化的新信息超载即学习失败；长时记忆中的图式起"组块压缩"作用，专家因图式丰富而表现为"工作记忆更大"（chunking，Chi et al. 1981 的专家-新手差异）。
- 效果量：CLT 各效应（worked example effect、split-attention effect、expertise reversal effect 等）在数百实验中验证，多数 d 在 0.4–1.0 区间；关键调节变量是学习者专长：同一样例对新手有利、对专家反转（expertise reversal）。
- 对"知识卡片粒度"的翻译：卡片原子性 = 控制单卡元素交互性；一张卡塞进 3 个互相依赖的新概念 = intrinsic 超载。

## 边界与反例

- expertise reversal：任何固定的"优化呈现"都会对高先验用户变成噪音——粒度、样例、提示都要随 mastery 状态自适应，而非全局最优。
- 无元素交互性的材料（死记事实，如外语词）几乎没有 intrinsic load，CLT 干预空间小（此时检索/间隔更重要）。
- germane load 概念在 2010 后被理论内部弱化（有争议）；效果结论不受影响，但别把"germane load"当机制引用。
- 对创造性开放任务，CLT 的直接证据少（主要来自结构化学习任务）。

## 对我们的适用性

1. 知识卡片粒度的可操作判据：单张讲义卡引入的"新交互概念"≤ 2–3 个；超过则拆卡。dl_concept 的前置依赖门控本质是 element interactivity 排序——先建低交互性组件，再组合（这有 CLT 直接背书）。
2. 新领域（research_state=未研究）默认给 worked-example 式内容（完整的"思想如何被使用的范例"），而不是空 prompt 让用户生成——生成式学习在低先验时反而有害（与 desirable difficulties 的先验知识边界一致）。
3. mastery=已理解 后，同一知识应切换为问题/生成式呈现（expertise reversal 的产品化：呈现方式跟随掌握状态动态反转）。
4. AI 讲解要控制 extraneous load：一次只讲一个概念、减少无关上下文注入（我们给 AI 塞 RAG 上下文时，"多而全"可能恰恰破坏学习——检索精度对学习负荷是变量）。
5. 图式优先：提炼产物的组织应服务于"用户能把它挂进已有图式"——原子知识必须带"它属于哪个更大的思想/方法论"的上位链接（这正是概念图的价值），孤立原子 = 无处安放的负荷。
