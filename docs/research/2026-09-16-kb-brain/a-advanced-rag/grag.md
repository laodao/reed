# GRAG: Graph Retrieval-Augmented Generation（文本子图检索 + 图感知生成）

- 链接: https://arxiv.org/abs/2405.16506 （代码: https://github.com/Bdi421/GRAG）
- 作者: Yuntong Hu, Zhihan Lei, Zheng Zhang, Bo Pan, Chen Ling, Liang Zhao（UIC / Emory）
- 发表时间: 2024-05-26
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2405.16506，原文）

> Naive Retrieval-Augmented Generation (RAG) focuses on individual documents during retrieval and, as a result, falls short in handling networked documents which are very popular in many applications such as citation graphs, social media, and knowledge graphs. To overcome this limitation, we introduce Graph Retrieval-Augmented Generation (GRAG), which tackles the fundamental challenges in retrieving textual subgraphs and integrating the joint textual and topological information into Large Language Models (LLMs) to enhance its generation. To enable efficient textual subgraph retrieval, we propose a novel divide-and-conquer strategy that retrieves the optimal subgraph structure in linear time. To achieve graph context-aware generation, incorporate textual graphs into LLMs through two complementary views-the text view and the graph view-enabling LLMs to more effectively comprehend and utilize the graph context. Extensive experiments on graph reasoning benchmarks demonstrate that in scenarios requiring multi-hop reasoning on textual graphs, our GRAG approach significantly outperforms current state-of-the-art RAG methods. Our datasets as well as codes of GRAG are available at this https URL.

## 核心机制拆解

与 GraphRAG/LightRAG 的定位差异：GRAG 处理的是**语料本身就是图**（引用网络、社交图）的场景，挑战不是"从纯文本建图"，而是"检索多大的子图、怎么把子图喂给 LLM"。

**检索：分治式子图检索（divide-and-conquer，线性时间）**
1. 把大图按社区/分割算法切成小块（partition），每个块内做向量检索打分。
2. 逐层合并高分块、丢弃低分块（类似 beam search 的剪枝版），避免对全图做指数级子图枚举——子图检索本质是组合优化问题，直接搜最优子图是 NP 难，分治把它压到线性。
3. 产出：与 query 最相关的 k-hop 文本子图（节点带文本描述、边带关系文本）。

**生成：双视角注入（text view + graph view）**
- Text view：把子图线性化成自然语言描述（实体描述 + 关系句子）。
- Graph view：保留拓扑的表示（如图结构序列/层级缩进），让 LLM 能感知"谁连着谁"的形态。
- 两种视角互补：文本视角利于语义，图视角利于结构推理；论文还用 GNN 编码子图作为 soft prompt 对齐。

## 证据与成本

- 在图推理基准（GraphQA/ExplaGraphs 等文本图数据集）上多跳推理显著优于朴素 RAG（把节点文本当独立文档检索）。
- 成本：分治检索每层要 embedding 打分（比一次向量检索贵）；双视角注入让上下文 token 比纯文本拼接更长。
- 局限：假设语料原生是图；对"私有文档集合"场景（我们的主场景）不能直接套用。

## 对我们的适用性

1. **主场景错位（低-中）**：我们语料是私有文档而非网络化图数据，GRAG 的子图检索与 GNN 对齐都不必引入；这是本档案中适用性最低的一条，收录它是为了划清 GraphRAG 家族内的谱系：GraphRAG（从文本建图做摘要）/ HippoRAG（从文本建图做扩散）/ GRAG（原生图语料的检索）。
2. **可借鉴：线性化子图的 prompt 设计（中）**：当我们把 lw_graph_edges 的邻接子图喂给 LLM 做时序/矛盾分析时，"文本视角 + 图视角（缩进层级表拓扑）"的双表示是个立刻能用的 prompt 技巧，比裸 JSON 边列表更适合 LLM 理解。
3. **分治剪枝思想可复用（低-中）**：如果未来 PPR 扩散图变大变慢，分治打分 + 逐层剪枝可作图检索的性能兜底。
