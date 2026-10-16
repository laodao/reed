# Generative Agents: 反思流的奠基（观察→重要性打分→递归反思生成反思树）

- 链接: https://arxiv.org/abs/2304.03442 （UIST 2023）
- 作者: Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang, Michael S. Bernstein（Stanford/Google）
- 时间: 2023-04-07 v1; v2 为 UIST 版
- 来源: arXiv。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

架构总述：

> Our architecture comprises three main components. The first is the memory stream, a long-term memory module that records, in natural language, a comprehensive list of the agent's experiences. A memory retrieval model combines relevance, recency, and importance to surface the records needed to inform the agent's moment-to-moment behavior. The second is reflection, which synthesizes memories into higher-level inferences over time, enabling the agent to draw conclusions about itself and others to better guide its behavior. The third is planning, which translates those conclusions and the current environment into high-level action plans...These reflections and plans are fed back into the memory stream to influence the agent's future behavior.

记忆流与检索三要素：

> The memory stream maintains a comprehensive record of the agent's experience. It is a list of memory objects, where each object contains a natural language description, a creation timestamp, and a most recent access timestamp.

> Importance distinguishes mundane from core memories by assigning a higher score to memory objects that the agent believes to be important...we find that directly asking the language model to output an integer score is effective...This prompt returns an integer value of 2 for "cleaning up the room" and 8 for "asking your crush out on a date." The importance score is generated at the time the memory object is created.

> To calculate the final retrieval score, we normalize the recency, relevance, and importance scores to the range of [0,1] using min-max scaling. The retrieval function scores all memories as a weighted combination of the three elements: score = α_recency · recency + α_importance · importance + α_relevance · relevance. In our implementation, all αs are set to 1.

反思触发阈值与两步生成（最关键机制）：

> Reflections are generated periodically; in our implementation, we generate reflections when the sum of the importance scores for the latest events perceived by the agents exceeds a threshold (150 in our implementation). In practice, our agents reflected roughly two or three times a day.

> The first step in reflection is for the agent to determine what to reflect on, by identifying questions that can be asked given the agent's recent experiences. We query the large language model with the 100 most recent records in the agent's memory stream...and prompt the language model, "Given only the information above, what are 3 most salient high-level questions we can answer about the subjects in the statements?"...We use these generated questions as queries for retrieval, and gather relevant memories (including other reflections) for each question. Then we prompt the language model to extract insights and cite the particular records that served as evidence for the insights...This process generates statements such as Klaus Mueller is dedicated to his research on gentrification (because of 1, 2, 8, 15). We parse and store the statement as a reflection in the memory stream, including pointers to the memory objects that were cited.

反思树：

> Reflection explicitly allows the agents to reflect not only on their observations but also on other reflections...As a result, agents generate trees of reflections: the leaf nodes of the tree represent the base observations, and the non-leaf nodes represent thoughts that become more abstract and higher-level the higher up the tree they are.

## 核心机制拆解（中文）

- **数据模型**: 统一的 memory stream——观察、反思、计划都是同一等公民的记忆对象（描述 + 创建时间 + 最近访问时间）。没有独立的"知识库"表；层级靠"反思指向观察"的引用边形成树。
- **流程**: ① 观察入流时即打重要性分（1-10 整数，一次廉价 LLM 调用）；② 检索 = recency（指数衰减）+ relevance（嵌入相似）+ importance 加权（默认等权）；③ 反思两步走：先"提 3 个高阶问题"，再以问题为查询检索证据并"生成带引用编号的 insight"。
- **触发时机**: 累计重要性分数超阈值（150）才反思——"重要性账户"机制，天然把反思频度与事件密度挂钩（他们约每天 2-3 次）。
- **成本**: 重要性打分逐条发生（便宜）；反思每轮 2 次 LLM 调用 + 若干次检索。insight 带证据指针是其可审计性的关键设计。

## 证据与局限

- 消融实验证明 observation/planning/reflection 各自对"可信行为"缺一不可（移除 reflection 后跨会话推理显著退化，如选错共度一小时的人）。
- 论文自述主要错误模式："failed to retrieve relevant memories, fabricated embellishments to the agent's memory"——检索失败与记忆编造在源头工作上就已出现。
- 场景是模拟小镇（25 agents、两天游戏时间），非生产负载；重要性打分与阈值 150 是手调超参。

## 对我们的适用性

1. **"重要性账户"是'何时提炼'的最优雅答案**: 不是定时器也不是逐条触发，而是"足够重要的事攒够了才反思一次"。映射到我们：对 agent_trajectory 里每次工具循环结果打 1-10 分（可与审批/看门狗事件复用信号），累计越阈值就对该项目做一次经验提炼——频度自动随创作强度伸缩，空闲时不烧钱，完美匹配本地优先约束。
2. **insight 必须带证据指针（because of 1, 2, 8, 15）**: 我们的 agent_memory_entry 若重启，条目 schema 应强制携带"源自哪条 trajectory 事件"的引用——既是防幻觉编造的锚，也支持用户点开溯源（创作工具里可信度就是产品力）。
3. **反思=两段式（先提问再总结）**: 直接拿来做我们的"方法论提炼 prompt 模板"：先让模型对最近轨迹提 3 个高阶问题（如"这个短剧节奏为什么拖"），再检索相关轨迹段落生成带引用的方法论卡。比一步到位的"总结经验"显著更聚焦。
4. **反思树 = 方法论的层级演化**: 反思可以反思反思，长出从具体到抽象的树。对应我们：具体经验条目（某次卡文怎么解）→ 中层方法（节奏控制技巧）→ 顶层方法论（叙事观）。学习包的"概念图+掌握度"可以挂到这棵树上做复习调度。
