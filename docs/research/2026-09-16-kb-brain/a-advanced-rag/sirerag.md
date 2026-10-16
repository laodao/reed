# SiReRAG: Indexing Similar and Related Information for Multihop Reasoning（相似树 + 关联树双索引）

- 链接: https://arxiv.org/abs/2412.06206 （代码: https://github.com/SalesforceAIResearch/SiReRAG ；OpenReview: https://openreview.net/forum?id=yp95goUAT1）
- 作者: Nan Zhang, Prafulla Kumar Choubey, Alexander Fabbri, Gabriel Bernadett-Shapiro, Rui Zhang, Prasenjit Mitra, Caiming Xiong, Chien-Sheng Wu（Salesforce AI Research / Penn State）
- 发表时间: 2024-12-09（ICLR 2025 poster）
- 来源: arXiv / ICLR 2025（注：用户调研提纲中的 "SiReRi" 未检索到，经核实应为本文 SiReRAG，主题一致：递归层级摘要索引）

## 原文摘录

### Abstract（arXiv:2412.06206，原文）

> Indexing is an important step towards strong performance in retrieval-augmented generation (RAG) systems. However, existing methods organize data based on either semantic similarity (similarity) or related information (relatedness), but do not cover both perspectives comprehensively. Our analysis reveals that modeling only one perspective results in insufficient knowledge synthesis, leading to suboptimal performance on complex tasks requiring multihop reasoning. In this paper, we propose SiReRAG, a novel RAG indexing approach that explicitly considers both similar and related information. On the similarity side, we follow existing work and explore some variances to construct a similarity tree based on recursive summarization. On the relatedness side, SiReRAG extracts propositions and entities from texts, groups propositions via shared entities, and generates recursive summaries to construct a relatedness tree. We index and flatten both similarity and relatedness trees into a unified retrieval pool. Our experiments demonstrate that SiReRAG consistently outperforms state-of-the-art indexing methods on three multihop datasets (MuSiQue, 2WikiMultiHopQA, and HotpotQA), with an average 1.9% improvement in F1 scores. As a reasonably efficient solution, SiReRAG enhances existing reranking methods significantly, with up to 7.8% improvement in average F1 scores. Our code is available at this https URL.

## 核心机制拆解

核心论点：检索有两个正交维度——**similarity（语义相似：文本讲的东西像）** 与 **relatedness（关联：文本通过共享实体/事件相连，哪怕表面不相似）**。多跳问题往往第二跳靠 relatedness（问 A 的导演的妻子，第二跳文档与第一跳仅靠人名关联），只建相似索引必然漏。

**双树构建（离线）**：
1. **相似树（RAPTOR 式）**：chunk 递归聚类摘要，自底向上。
2. **关联树**：文本抽取 **proposition（原子命题）+ 实体** → 命题按**共享实体**分组（同一实体出现的所有命题聚在一起）→ 对每组生成递归摘要 → 摘要再聚类递归向上（把关联关系也层级化）。
3. **两棵树全部平铺进统一检索池**：叶子 chunk、命题、各层摘要都是可检索单元，检索时不再区分来源树，靠相似度 + rerank 自动选择。

本质：RAPTOR（相似维度）与知识图谱（关联维度）的**索引层融合**——不建显式图，而用"共享实体分组"隐式实现图的连通性，工程上比维护图数据库简单。

## 证据与成本

- MuSiQue / 2WikiMultiHopQA / HotpotQA 三个多跳数据集上，F1 平均 +1.9%（对 SOTA 索引方法），对 reranking 增强最多 +7.8% F1。
- 成本：命题抽取 + 实体抽取 + 双树递归摘要，索引 LLM 调用量约是 RAPTOR 的 2 倍以上；好处是无需图数据库、无 PPR 等图算法栈，纯"向量池 + rerank"即可运行。
- 局限：提升幅度绝对值小（1.9%），说明索引结构红利有限；关联树深度依赖实体抽取质量。

## 对我们的适用性

1. **对我们现有架构的最强验证（高）**：SiReRAG 证明"结构/语义切片（相似）+ 实体图谱（关联）+ 层级摘要"三件套合并成统一检索池是最优索引形态——这正是我们已有资产（混合切片 + lw_graph_edges + 章节摘要）的组合，说明方向不必推翻，缺的是**把图谱内容也向量化入池**这一步。
2. **统一检索池优于多路并行（高）**：与其维护"图谱检索/向量检索"多条独立链路再融合，不如把实体摘要、关系摘要直接作为可检索文档入池，与我们 RRF 混合检索天然兼容，改造量最小。
3. **命题抽取可顺带解决引用粒度（中-高）**：抽取 proposition 时同步落库，等于免费获得"精确到事实"的引用锚点（详见 dense-x-retrieval-propositions.md），对创作工具的可信度展示有直接价值。
