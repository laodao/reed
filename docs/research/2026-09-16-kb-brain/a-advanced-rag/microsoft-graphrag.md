# Microsoft GraphRAG: From Local to Global（社区摘要式图谱 RAG）

- 链接: https://arxiv.org/abs/2404.16130 （官方文档: https://microsoft.github.io/graphrag/ ）
- 作者: Darren Edge, Ha Trinh, Newman Cheng, Joshua Bradley, Alex Chao, Apurva Mody, Steven Truitt, Dasha Metropolitansky, Robert Osazuwa Ness, Jonathan Larson（Microsoft）
- 发表时间: 2024-04-24（v2 2025-02-19）
- 来源: arXiv / Microsoft Research

## 原文摘录

### Abstract（arXiv:2404.16130，原文）

> The use of retrieval-augmented generation (RAG) to retrieve relevant information from an external knowledge source enables large language models (LLMs) to answer questions over private and/or previously unseen document collections. However, RAG fails on global questions directed at an entire text corpus, such as "What are the main themes in the dataset?", since this is inherently a query-focused summarization (QFS) task, rather than an explicit retrieval task. Prior QFS methods, meanwhile, do not scale to the quantities of text indexed by typical RAG systems. To combine the strengths of these contrasting methods, we propose GraphRAG, a graph-based approach to question answering over private text corpora that scales with both the generality of user questions and the quantity of source text. Our approach uses an LLM to build a graph index in two stages: first, to derive an entity knowledge graph from the source documents, then to pregenerate community summaries for all groups of closely related entities. Given a question, each community summary is used to generate a partial response, before all partial responses are again summarized in a final response to the user. For a class of global sensemaking questions over datasets in the 1 million token range, we show that GraphRAG leads to substantial improvements over a conventional RAG baseline for both the comprehensiveness and diversity of generated answers.

### 查询机制（官方文档 Query Overview，原文）

> **Local Search**: Local search generates answers by combining relevant data from the AI-extracted knowledge-graph with text chunks of the raw documents. This method is suitable for questions that require an understanding of specific entities mentioned in the documents (e.g. What are the healing properties of chamomile?).
>
> **Global Search**: Global search generates answers by searching over all AI-generated community reports in a map-reduce fashion. This is a resource-intensive method, but often gives good responses for questions that require an understanding of the dataset as a whole (e.g. What are the most significant values of the herbs mentioned in this notebook?).
>
> **DRIFT Search**: DRIFT search introduces a new approach to local search queries by including community information in the search process. This greatly expands the breadth of the query's starting point and leads to retrieval and usage of a far higher variety of facts in the final answer... uses community insights to refine a query into detailed follow-up questions.

### 实验数字（论文正文 v2，原文）

> ...root-level GraphRAG offers a highly efficient method for the iterative question answering that characterizes sensemaking activity, while retaining advantages in comprehensiveness (72% win rate) and diversity (62% win rate) over vector RAG.

> All Graph RAG conditions outperformed naïve RAG on comprehensiveness and diversity.

## 核心机制拆解

**索引阶段（离线，一次性，LLM 密集）**：
1. 文档切 chunk → LLM 用实体抽取 prompt 从每个 chunk 抽取实体（人物/地点/组织等类型，可扩展）+ 实体间关系（带描述）+ 相关 claims（事实主张，含 status）+ text_unit 引用。
2. 用 Leiden 算法对实体图做社区检测（community detection），形成层级化社区（大社区内再分小社区，level 0 最粗）。
3. LLM 为每个社区（从叶子到根）生成「社区报告」（community report）——本质是对该社区内全部实体/关系的综合摘要，这是预生成的、与 query 无关的中间结论层。

**查询阶段（在线）**：
- **Global Search（map-reduce）**：query → 每个社区报告独立生成 partial answer（带置信分）→ 汇总排序 → reduce 成最终答案。回答"整个语料讲了什么/主题是什么"这类全局 sensemaking 问题。
- **Local Search**：从 query 中识别锚点实体 → 拉取该实体加入的 text_units、关系、claims、相邻社区报告摘要 → 拼装上下文直接生成。回答"某个具体实体"相关的问题。
- **DRIFT search**（后补）：先用社区报告做全局入口，再细化成 follow-up questions 逐层下钻到局部事实，兼顾广度与深度。

**关键洞察**：传统 RAG 的检索单元是"与 query 相似的原文片段"，天然回答不了"全局综合"型问题；GraphRAG 的本质贡献不是图谱本身，而是**预先用 LLM 把语料"消化"成层级化社区摘要**，把不可扩展的"对全库做 QFS"变成"对预生成摘要做 map-reduce"。

## 证据与成本

- 全局问题上相对 vector RAG 的 comprehensiveness 72% / diversity 62% win rate（root-level 社区，最省配置）；普通局部问题上无优势（论文自己也承认目标是 QFS）。
- **索引成本极高**：实体抽取对每个 chunk 都要调 LLM，社区报告每个社区再调一次。百万 token 级语料、用 GPT-4 级模型索引费用在数十美元量级；社区结构在文档更新后需要重算（官方后来加入 incremental update 但仍昂贵）。
- **Global query 成本也高**（见 LightRAG 论文实测摘录：单次全局查询 61 万 token、数百次 API 调用），root-level（C2）与 C3（局部社区）是成本与效果的折中。
- 社区摘要存在 LLM 幻觉传导风险：报告错了，全局答案就系统性跑偏，且用户难以溯源到原文。

## 对我们的适用性

1. **理念高度契合（高）**：「知识库变大脑、自动提炼主题/思想/方法论」正是 GraphRAG 的 QFS 场景——"这批文档里反复出现的方法论是什么"就是典型 global sensemaking query。我们现有章节树摘要已经做了一半（文档级），GraphRAG 补的是**跨文档聚合层**。
2. **成本是真实门槛（本地优先，用户自己的 API key/本地模型）**：全套 GraphRAG 索引对个人创作库（可能几十万～几百万 token）成本偏高。可行折中：只在"领域学习包/长文项目"层级做实体图+社区摘要，用廉价模型做抽取、增量触发（文档变化才更新），而不是全库常驻。
3. **我们已有 lw_graph_edges（实体+关系+有效区间+矛盾扫描）**，可直接复用为 GraphRAG 的实体图底座，省掉一半索引成本；缺的只是 Leiden 社区检测 + 社区报告两层，这两层纯离线 workflow，正好挂在我们的 workflow 引擎上。
4. **双模式查询可直接映射到我们的查询路由**：现有路由已区分精确/语义等意图，可新增"全局综合"意图 → 走社区报告 map-reduce；"实体聚焦" → 走 Local Search 式组装（实体邻接 chunk + 关系 + claims）。
5. **不建议照搬**：官方实现（DRIFT/社区报告全套）工程重、token 贵；更值得抄的是"社区检测 + 分层社区摘要 + map-reduce 全局问答"这个骨架，且要给社区报告挂 text_unit 引用以保住可溯源性（这对创作工具的信任链是刚需）。
