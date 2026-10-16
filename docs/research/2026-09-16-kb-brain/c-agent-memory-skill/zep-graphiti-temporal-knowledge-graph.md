# Zep / Graphiti: 双时间线时序知识图谱（生物启发记忆 + 边失效 + 与 Mem0 的基准论战）

- 链接: 论文 https://arxiv.org/abs/2501.13956 ；论战博客 https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ ；引擎开源 https://github.com/getzep/graphiti
- 作者: Preston Rasmussen 等（Zep/GetZep 团队）；论文引用其基于 Graphiti 的生产系统
- 时间: 2025-01-23 v1；论战博客 2025 年中（文内含 2025-12-09 更正注记）
- 来源: arXiv + Zep 官方博客。抓取方式: arXiv HTML 全文 + 博客原文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

三层层级子图：

> In Zep, memory is powered by a temporally-aware dynamic knowledge graph G = (N, E, φ)...This graph comprises three hierarchical tiers of subgraphs: an episode subgraph, a semantic entity subgraph, and a community subgraph...Episodes serve as a non-lossy data store from which semantic entities and relations are extracted...The community subgraph forms the highest level of Zep's knowledge graph. Community nodes...represent clusters of strongly connected entities. Communities contain high-level summarizations of these clusters.

生物/心理模型依据：

> The dual storage of both raw episodic data and derived semantic entity information mirrors psychological models of human memory. These models distinguish between episodic memory, which represents distinct events, and semantic memory, which captures associations between concepts and their meanings...Our use of community nodes to represent high-level structures and domain concepts builds upon work from GraphRAG.

双时间线（bi-temporal）：

> Zep implements a bi-temporal model, where timeline T represents the chronological ordering of events, and timeline T' represents the transactional order of Zep's data ingestion. While the T' timeline serves the traditional purpose of database auditing, the T timeline provides an additional dimension for modeling the dynamic nature of conversational data and memory. This bi-temporal approach represents a novel advancement in LLM-based knowledge graph construction...

边失效（edge invalidation，冲突处理核心）：

> A key differentiating feature of Graphiti compared to other knowledge graph engines is its capacity to manage dynamic information updates through temporal extraction and edge invalidation processes...the system tracks four timestamps: t'_created and t'_expired ∈ T' monitor when facts are created or invalidated in the system, while t_valid and t_invalid ∈ T track the temporal range during which facts held true...The introduction of new edges can invalidate existing edges in the database. The system employs an LLM to compare new edges against semantically related existing edges to identify potential contradictions. When the system identifies temporally overlapping contradictions, it invalidates the affected edges by setting their t_invalid to the t_valid of the invalidating edge. Following the transactional timeline T', Graphiti consistently prioritizes new information when determining edge invalidation.

实体消解与幻觉控制：

> Following initial entity extraction, we employ a reflection technique inspired by reflexion to minimize hallucinations and enhance extraction coverage...When the system identifies a duplicate entity, it generates an updated name and summary...The system then incorporates the data into the knowledge graph using predefined Cypher queries. We chose this approach over LLM-generated database queries to ensure consistent schema formats and reduce the potential for hallucinations.

【论战】Zep 博客对 Mem0 论文的反驳：

> Recently, Mem0 published a paper benchmarking their product against competitive agent memory technologies, claiming state-of-the-art (SOTA) performance based on the LoCoMo benchmark...Closer examination of Mem0's results reveal significant issues with the chosen benchmark, the experimental setup used to evaluate competitors like Zep, and ultimately, the conclusions drawn...Our evaluation shows Zep achieving an 75.14% +/- 0.17 J score, significantly outperforming Mem0's best configuration (Mem0 Graph) by approximately 10% relative improvement. This starkly contrasts with the 65.99% score reported for Zep in the Mem0 paper...

> ...Tellingly, Mem0's own results show their system being outperformed by a simple full-context baseline (feeding the entire conversation to the LLM), which achieved a J score of ~73%, compared to Mem0's best score of ~68%. If simply providing all the text yields better results than the specialized memory system, the benchmark isn't adequately stressing memory capabilities representative of real-world agent interactions.

> Beyond the issues with LoCoMo itself, Mem0's paper includes a comparison with Zep that appears to be based on a flawed implementation...Incorrect User Model...Improper Timestamp Handling...Sequential vs. Parallel Searches...These implementation errors fundamentally misrepresent how Zep is designed to function.

> The Zep team prefers evaluations like LongMemEval, which addresses many of LoCoMo's shortcomings: Features significantly longer conversations (avg. 115k tokens), truly pushing context limits. Explicitly tests temporal understanding and the ability to handle changing information (knowledge updates). Human-curated and designed to be high quality.

## 核心机制拆解（中文）

- **数据模型**: 三层子图——episode（原始消息/文本/JSON，永不丢）→ semantic entity（实体 + 事实边，带四个时间戳）→ community（实体簇 + 高层摘要，label propagation 增量维护）。每条事实边有 valid/invalid 两个世界时间 + created/expired 两个系统时间。
- **流程**: 消息进入→实体抽取（带最近 4 条消息上下文 + reflexion 式自检）→ 实体消解（向量 + 全文检索候选，LLM 合并）→ 事实三元组抽取 → 新旧边 LLM 对比，矛盾且时间重叠则旧边失效（新信息优先）→ community 增量更新。检索走 cosine 相似（实体名嵌入 + community 名嵌入）+ 全文混合。
- **触发时机**: 摄取即建图（异步管线，多阶段 LLM 调用）；这导致 Mem0 观察到的"写入后数小时才检索得好"——生产上是取舍而非 bug。
- **成本**: 建图管线重（多轮 LLM 调用、异步、最终一致），检索轻（p95 约 0.63s，并发）。适合"写少读多+时长敏感"的场景。

## 证据与局限

- 论文在 DMR（MemGPT 基准）与 LongMemEval 上评估，宣称准确率显著优于全上下文基线并大幅降延迟；生产落地（Zep 云服务）是其实验室外证据。
- 论战双方各执一词：Mem0 指其写入延迟高、即时检索失效；Zep 指 Mem0 评测配置错误 + LoCoMo 基准本身有缺陷（全上下文基线就打平）。诚实结论：两家论文数字都不可尽信，机制层面的差异（重管线时序图 vs 轻管线事实条目）是真实且可复现的。
- Zep 博客文末也承认记忆系统的安全代价："One poisoned message, web page, or document can shape every later session that reads the same memory. Persistent memory makes prompt injection durable."（持久记忆让提示注入变得持久——这是记忆系统共有的新攻击面。）

## 对我们的适用性

1. **四时间戳 + 边失效是"设定冲突"的正解**: 长篇小说/短剧里设定随剧情演变（角色换工作、世界观修订）。我们若把设定做成 KnowledgeSegment，最有价值的设计就是每条带 valid_from/valid_to + superseded_by——旧设定不删、查询时按"叙事时间点"过滤。这直接把我们 structured-provider 从"静态事实供给"升级为"时序事实供给"。
2. **episode→semantic→community 三层 = 我们已有的分层天然对齐**: agent_trajectory 就是 episode 层（non-lossy 原则要坚持）；知识条目是 semantic 层；community 层对应"主题簇摘要"（如按角色/按剧情线聚簇的概念图）——我们的领域学习包（概念图+讲义卡）本就是 community 层的雏形，缺的是从 episode 自动长出 semantic/community 的管线。
3. **"新信息优先"要谨慎**: Graphiti 明确"prioritizes new information"，这在对话记忆里合理，但在创作里"后写的草稿未必想覆盖既有设定"——冲突裁决应升格为审批事件（我们的 harness 审批机制正好用上），而不是自动失效。
4. **论战的元教训**: 记忆系统的基准数字（尤其厂商自报）不可直接采信；我们重启飞轮时必须自带小而硬的评测集（如"给旧会话设定提问能否答对"），否则又会陷入"感觉有用但无法证明"的境地——这可能正是当年停用时说不清价值的原因之一。
5. **记忆投毒风险**: 持久记忆放大注入攻击。本地优先单用户环境风险较低，但"从抓取的网络资料提炼经验条目"时仍需来源可信标记。
