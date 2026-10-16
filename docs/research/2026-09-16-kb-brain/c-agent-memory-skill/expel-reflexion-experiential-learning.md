# Reflexion → ExpeL: 从言语强化到跨任务经验提炼（insight 的 ADD/UPVOTE/DOWNVOTE/EDIT 民主投票）

- 链接: Reflexion https://arxiv.org/abs/2303.11366 （NeurIPS 2023）; ExpeL https://arxiv.org/abs/2308.10144 （AAAI 2024）
- 作者: Reflexion: Noah Shinn, Federico Cassano, Edward Berman, Ashwin Gopinath, Karthik Narasimhan, Shunyu Yao; ExpeL: Andrew Zhao, Daniel Huang, Quentin Xu, Matthieu Lin, Yong-Jin Liu, Gao Huang
- 时间: Reflexion 2023-03-20 v1; ExpeL 2023-08-19 v1, v3 为 AAAI 版
- 来源: arXiv。抓取方式: arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

Reflexion——言语强化学习（把环境反馈转成语言存入记忆）：

> In this paper, we propose an alternative approach called Reflexion that uses verbal reinforcement to help agents learn from prior failings. Reflexion converts binary or scalar feedback from the environment into verbal feedback in the form of a textual summary, which is then added as additional context for the LLM agent in the next episode. This self-reflective feedback acts as a 'semantic' gradient signal by providing the agent with a concrete direction to improve upon, helping it learn from prior mistakes to perform better on the task...amplified to natural language experience summaries which can be stored in long-term memory.

ExpeL——定位（经验池 + 洞见抽取，跨任务保留）：

> Our agent autonomously gathers experiences and extracts knowledge using natural language from a collection of training tasks. At inference, the agent recalls its extracted insights and past experiences to make informed decisions...Unlike self-improvement methods like Reflexion, our approach emphasizes the importance of retaining experiences across multiple tasks to enhance agent performance. Moreover, ExpeL learns without parameter updates, making it compatible with powerful closed-source models.

经验采集（用 Reflexion 造成功/失败对）：

> To gather diverse experiences...we leverage Reflexion to continuously retry the training task at most Z times...if the agent fails, it will look at its failed trajectory and self-reflect to produce ν_{n,z+1} = concat(ν_{n,z}, LLM_reflect(τ_{n,z}))...this trial and error way of gathering experiences not only improves the chances of getting more positive examples for experience recall during evaluation but also allows for collecting valuable success/failure pairs used for comparisons during insight extraction.

洞见提炼的两种对照（人类学习类比）：

> Human learning occurs mainly either by storing successful trajectories in memory, which can be later recalled as specific examples, or by extracting high-level insights from experiences, enabling generalization to novel situations. ExpeL considers both of these learning modes...First, we let the agent compare a failed trajectory with a successful trajectory for the same task. This comparison offers a concrete understanding of the agent's shortcomings, highlighting the correct and incorrect actions. Second, we let the agent identify patterns within a set of successful trajectories from different tasks. This approach sheds light on common "good practices"...

insight 集合的演化操作（核心创新）：

> We give the agent's instruction-following LLM insights several operators to apply on an existing set of insights ι̂. We initialize the set of insights to an empty set ι̂ = ∅ and iteratively provide the LLM with fail/success pairs or lists of L successes...The operations the LLM can perform are: ADD a new insight, EDIT the content of an existing insight, DOWNVOTE to disagree with an existing insight, or UPVOTE to agree with an existing insight. A newly added insight will have an initial importance count of two associated with it, and the count will increment if subsequent operators UPVOTE or EDIT are applied to it and will decrement when DOWNVOTE is applied to it. If an insight's importance count reaches zero, it will be removed. This particular design choice robustifies the process since even successful trajectories can be suboptimal and mislead the generated insights.

消费方式（推理时）：

> For each task, the task specifications will be augmented with the concatenation of the full list of extracted insights ι̂ = concat(ι_1, ι_2, ι_3, ...), and the top-k trajectories with the highest task similarity will be retrieved and used as fewshot in-context examples...We believe as the list of extracted insights grows, retrieval could be a feasible solution to manage the context window size.

## 核心机制拆解（中文）

- **数据模型**: 两类资产——① experience pool（成功轨迹的向量库，Faiss + 任务相似度检索）；② insight 列表（自然语言规则，每条带重要性计数，初始 2，UPVOTE/EDIT +1、DOWNVOTE -1，归零删除）。
- **流程**: 训练期——Reflexion 反复重试同一任务积累成功/失败对→ LLM 拿【失败/成功对】或【L 条成功轨迹列表】对现有 insight 集执行四操作。评估期——任务规格 + 全量 insight（或检索子集）+ top-k 相似成功轨迹作 fewshot。
- **触发时机**: 离线批量（训练任务集上跑完再提炼），推理期只读不写。
- **成本**: 采集期多次 rollout（贵）；提炼期每对轨迹一次 LLM 调用；推理期 insight 拼接进 prompt（他们自己指出 insight 列表增长后需转检索）。

## 证据与局限

- HotpotQA/ALFWorld/WebShop 等任务上，经验越多性能越单调提升；并展示 source→target 任务的正向迁移。
- 局限：① 依赖可自动判分的任务（环境反馈明确），创作场景无客观成败信号，需替代性判分（用户审批/采纳行为）；② 采集靠"同一任务多次重试"，对昂贵或不可重放的场景不适用；③ insight 全量拼接在规模化后会爆上下文（作者自知）。
- 2025 年 Memento 论文对其概括："ExpeL collects trajectories and converts them into reusable natural-language insights and rules"——它是"经验→规则"路线的奠基引用。

## 对我们的适用性

1. **重要性计数的投票机制是我们飞轮最该抄的单点**: 每条 agent_memory_entry 带计数，每次提炼批次对旧条目 UPVOTE/DOWNVOTE/EDIT，归零自动淘汰。这解决了"经验库越攒越臃肿、无法自洁"的问题，且完全不需要复杂的图或遗忘曲线——一个整数字段就够。当年飞轮若只是 ADD-only，这就是缺的那块。
2. **失败/成功对照对 > 单纯成功总结**: 提炼 prompt 应显式喂"同一目标的一坏一好两次尝试"（如两版场景改写、被用户拒绝 vs 采纳的方案），对照产生的洞见远比泛泛总结具体。我们的审批轨迹天然提供"被拒/被改/被采纳"标签，是现成的成败信号源。
3. **双资产模式**: "可检索的成功案例（fewshot）+ 精炼规则（insight）"分开存放。对应我们：完整佳作轨迹（episodic，供模仿）与方法论卡（semantic，供遵循）分层消费——这正是"检索升级为大脑"的具体形态。
4. **诚实提醒**: 创作无环境自动判分，ExpeL 式全自动闭环不可直接照搬；建议信号源 = 用户对产出的编辑距离/采纳率/显式点赞，且 insight 写入走审批（低频）而非每会话自动写。
