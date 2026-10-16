# HippoRAG: 海马体启发的 KG + Personalized PageRank 长期记忆检索

- 链接: https://arxiv.org/abs/2405.14831 （代码: https://github.com/OSU-NLP-Group/HippoRAG）
- 作者: Bernal Jiménez Gutiérrez, Yiheng Shu, Yu Gu, Michihiro Yasunaga, Yu Su（OSU）
- 发表时间: 2024-05-23（v3 2025-01-14；NeurIPS 2024）
- 来源: arXiv / NeurIPS 2024

## 原文摘录

### Abstract（arXiv:2405.14831，原文）

> In order to thrive in hostile and ever-changing natural environments, mammalian brains evolved to store large amounts of knowledge about the world and continually integrate new information while avoiding catastrophic forgetting. Despite the impressive accomplishments, large language models (LLMs), even with retrieval-augmented generation (RAG), still struggle to efficiently and effectively integrate a large amount of new experiences after pre-training. In this work, we introduce HippoRAG, a novel retrieval framework inspired by the hippocampal indexing theory of human long-term memory to enable deeper and more efficient knowledge integration over new experiences. HippoRAG synergistically orchestrates LLMs, knowledge graphs, and the Personalized PageRank algorithm to mimic the different roles of neocortex and hippocampus in human memory. We compare HippoRAG with existing RAG methods on multi-hop question answering and show that our method outperforms the state-of-the-art methods remarkably, by up to 20%. Single-step retrieval with HippoRAG achieves comparable or better performance than iterative retrieval like IRCoT while being 10-30 times cheaper and 6-13 times faster, and integrating HippoRAG into IRCoT brings further substantial gains. Finally, we show that our method can tackle new types of scenarios that are out of reach of existing methods. Code and data are available at this https URL.

## 核心机制拆解

类比海马索引理论（hippocampal indexing theory）：新皮层存感觉细节（= 原文 passage 的向量），海马存索引（= 知识图谱），回忆时海马模式补全（= Personalized PageRank 扩散）。

**离线索引（人工海马体形成）**：
1. 每个 passage 用 LLM 做 OpenIE 式抽取，产出**命名实体 + 三元组（主-谓-宾）**。
2. 构建异构图：实体节点 + passage 节点，边有两种——同 passage 内实体间的三元组边（带关系标签）、实体到所属 passage 的 membership 边。
3. 所有 passage/实体做向量嵌入，供查询时找种子。

**在线检索（回忆）**：
1. query 嵌入 → 召回 top-k 相关 passage（向量检索，作为 query 概念的"新皮层信号"）。
2. 命中 passage 作为**Personalized PageRank 的种子节点**（重训练化：以种子为源在整张图上扩散概率）。
3. PPR 沿三元组边 + membership 边扩散，最终按 PPR 分数对**passage 节点**排序——与种子同属一个知识"模式补全"环路的 passage 自然获得高分。
4. 返回 top-N passage 给 LLM 生成。

关键点：PPR 一步扩散就等价于"多跳图遍历"，因此**单次检索即可完成多跳知识整合**，不需要 IRCoT 式迭代检索循环——这是它 10-30 倍便宜、6-13 倍快的来源。

## 证据与成本

- 多跳 QA（MuSiQue / 2WikiMultiHopQA / HotpotQA）上比 SOTA RAG 最高提升 ~20% recall / QA 表现。
- 单步检索 ≈ 或 > 迭代检索（IRCoT with GPT-3.5），成本 1/10-1/30、速度 6-13 倍。
- 成本结构：索引侧每 passage 一次 OpenIE LLM 调用（比 GraphRAG 的社区报告便宜一个量级）；查询侧一次向量检索 + 一次 PPR（纯图算法，本地毫秒级，无需 LLM）。
- 局限：强依赖 OpenIE 三元组质量（域外/中文抽取质量下降）；PPR 需要全图常驻内存（大图上需要子图切分）；对"实体无关"的全文综合型问题没有特殊帮助。

## 对我们的适用性

1. **与 lw_graph_edges 天然同构（高）**：我们的长文时序知识图谱已经是"实体+关系+有效区间"结构，HippoRAG 证明的正是这种图 + PPR 能做单步多跳检索——**补一个 PPR 查询路径几乎零 LLM 成本**（纯图算法），是全部调研里"投入产出比"最高的一项。
2. **membership 边设计值得照抄（高）**：实体↔passage 的归属边让 PPR 分数最终能落回原文 chunk，保证可溯源——这与我们"QA 对直出 + 引用"的产品要求完全一致。我们的混合切片已有 chunk→章节→文档树，直接当 membership 边用。
3. **时序维度是我们的差异化（中-高）**：HippoRAG 图是静态的；我们 edges 带有效区间，PPR 扩散时可按"故事时间点"过滤边（区间过滤的 PPR 变体），能做"第 X 章时点角色关系"这类它做不了的查询。
4. **索引成本可承受（中-高）**：OpenIE 式三元组抽取我们本来就在做（lw_graph_edges 的构建），复用即可；注意中文 OpenIE prompt 要调，jieba 词典可辅助实体归一。
