# RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval（递归抽象树检索）

- 链接: https://arxiv.org/abs/2401.18059 （代码: https://github.com/parthsarthi03/raptor）
- 作者: Parth Sarthi, Salman Abdullah, Aditi Tuli, Shubh Khanna, Anna Goldie, Christopher D. Manning（Stanford）
- 发表时间: 2024-01-31
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2401.18059，原文）

> Retrieval-augmented language models can better adapt to changes in world state and incorporate long-tail knowledge. However, most existing methods retrieve only short contiguous chunks from a retrieval corpus, limiting holistic understanding of the overall document context. We introduce the novel approach of recursively embedding, clustering, and summarizing chunks of text, constructing a tree with differing levels of summarization from the bottom up. At inference time, our RAPTOR model retrieves from this tree, integrating information across lengthy documents at different levels of abstraction. Controlled experiments show that retrieval with recursive summaries offers significant improvements over traditional retrieval-augmented LMs on several tasks. On question-answering tasks that involve complex, multi-step reasoning, we show state-of-the-art results; for example, by coupling RAPTOR retrieval with the use of GPT-4, we can improve the best performance on the QuALITY benchmark by 20% in absolute accuracy.

## 核心机制拆解

解决的问题：chunk 检索只能拿到局部细节，主题/跨章节问题（"全文的论证结构是什么"）无解——因为答案不在任何单个 chunk 里，而在对多个 chunk 的**抽象**里。

**建树（离线）**：
1. 叶子层：文档切片（~100-200 token 的小 chunk）。
2. 递归循环：对当前层的全部节点做向量嵌入 → **GMM 软聚类 + UMAP 降维**（软聚类允许一个 chunk 属于多个主题簇，比 K-means 更适合文本多主题）→ 对每个簇用 LLM 摘要 → 摘要成为上一层节点。
3. 重复直到簇收敛为一个根（层数 log 级），得到"细节→段落主题→章节主题→全文"的抽象树。**每个中间节点都是可检索单元**（全部节点入向量库）。

**查询（在线）两种树遍历策略**：
- **Collapsed tree（坍缩树）**：忽略层级，把所有层的所有节点平铺成一个检索池——经验上效果最好，因为路由由相似度自动决定该用细节还是摘要。
- **Tree traversal**：从根往下逐层检索子节点，适合需要严格控制上下文预算的场景。

关键洞察：**摘要不是给人看的副产品，而是一等检索单元**；不同抽象层回答不同粒度的问题，坍缩检索让相似度自动选层。

## 证据与成本

- QuALITY（长文多步阅读理解）：GPT-4 + RAPTOR 比此前最佳绝对提升 20%（摘要原文数字）；NarrativeQA/QASPER/QuALITY 全面优于 chunk RAG 与长上下文直接读。
- 成本：建树 = O(节点数) 次 LLM 摘要调用 + 聚类计算；一篇 10 万字长文约需数百次摘要调用（叶子 chunk 数量级），比 GraphRAG 索引便宜（无实体图、无社区报告），但比纯向量化贵一个量级。
- 局限：聚类质量依赖嵌入（中文主题聚类可用 bge 系）；摘要会丢细节（所以要保留叶子层一起检索）；树更新需局部重建（章节变了要重摘该子树）。

## 对我们的适用性

1. **与现有章节树互补而非重复（高）**：我们的章节树是**结构驱动的**（按文档目录层级），RAPTOR 是**语义驱动的**（按聚类主题跨章节聚合）。二者结合正是"结构树 + 语义树"双索引——跨文档场景下 RAPTOR 式聚类还能把不同文档的同类主题聚到一起，这是"跨文档综合"的最直接地基。
2. **直接服务"自动提炼方法论"（高）**：RAPTOR 的中间层节点就是"主题级摘要"，其上游再挂一层跨文档聚类摘要，产物本质上就是"知识/思想/方法论"卡片——与领域学习包（讲义卡）的生成流程同构，可作为讲义卡自动生成的候选管线。
3. **成本可控且可渐进（中-高）**：可以先只对"长文模块 + 学习包"启用递归摘要（复用已有 LLM 章节摘要调用），普通笔记延迟构建（用户休眠时后台 workflow 跑），符合本地优先的资源模型。
4. **坍缩树策略适配我们的混合检索（中-高）**：把摘要节点与原 chunk 放进同一个混合检索池（向量+BM25 RRF），检索层零改造；摘要节点记得带"子节点引用"以便答案回溯到原文。
