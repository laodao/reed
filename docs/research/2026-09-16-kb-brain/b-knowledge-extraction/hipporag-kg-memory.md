# HippoRAG / HippoRAG 2：海马体索引理论启发的 KG 长期记忆（个性化 PageRank 检索）

- 链接：
  - HippoRAG：https://arxiv.org/abs/2405.14831（2024-05-23，Bernal Jiménez Gutiérrez, Yiheng Shu, Yu Gu, Michihiro Yasunaga, Yu Su — OSU NLP；NeurIPS 2024）
  - HippoRAG 2（From RAG to Memory）：https://arxiv.org/abs/2502.14802（2025-02-20，同组）
  - 仓库：https://github.com/OSU-NLP-Group/HippoRAG
- 时间：2024-05 / 2025-02
- 来源：arXiv API 原文抓取

## 原文摘录

**HippoRAG 摘要：**

> In this work, we introduce HippoRAG, a novel retrieval framework inspired by the hippocampal indexing theory of human long-term memory to enable deeper and more efficient knowledge integration over new experiences. HippoRAG synergistically orchestrates LLMs, knowledge graphs, and the Personalized PageRank algorithm to mimic the different roles of neocortex and hippocampus in human memory. We compare HippoRAG with existing RAG methods on multi-hop question answering and show that our method outperforms the state-of-the-art methods remarkably, by up to 20%. Single-step retrieval with HippoRAG achieves comparable or better performance than iterative retrieval like IRCoT while being 10-30 times cheaper and 6-13 times faster ...

**HippoRAG 2 摘要：**

> However, its reliance on vector retrieval hinders its ability to mimic the dynamic and interconnected nature of human long-term memory. Recent RAG approaches augment vector embeddings with various structures like knowledge graphs to address some of these gaps, namely sense-making and associativity. However, their performance on more basic factual memory tasks drops considerably below standard RAG. We address this unintended deterioration and propose HippoRAG 2, a framework that outperforms standard RAG comprehensively on factual, sense-making, and associative memory tasks. HippoRAG 2 builds upon the Personalized PageRank algorithm used in HippoRAG and enhances it with deeper passage integration and more effective online use of an LLM.

## 核心机制拆解（中文）

**神经科学映射（海马索引理论）：** 新皮层（存放 passage 原文=皮层记忆）↔ 海马（存放 LLM 抽的实体-关系开放知识图谱=索引）↔ 内嗅皮层（PPR 扩散激活=模式补全）。检索 = 查询识别种子节点 → **个性化 PageRank 在 KG 上扩散激活** → 高分 passage 被召回——一次图扩散 ≈ 多跳推理，替代迭代检索。

**离线一次抽取（offline indexing）：** OpenIE 式抽三元组建图（每 passage 保持指向图的引用，天然溯源），不需要查询期多次 LLM 调用——这就是"10-30 倍便宜、6-13 倍快"的来源。

**HippoRAG 2 的关键修正：** 纯图检索伤事实记忆（精确查询被扩散稀释）→ 在 PPR 流程里**把 passage 节点深整合进图**（passage 与实体同图）+ 查询期轻量用 LLM（识别短语/判相关性），使事实、sense-making、联想三类记忆任务同时超过标准 RAG——"结构增强但不牺牲基础检索"。

## 证据与局限

- 证据：NeurIPS 2024 + 2025 后续；多跳 QA 标准 benchmark（MuSiQue/2WikiMultiHopQA/HotpotQA）系统对比；开源可复现。
- 局限：抽取仍是"一次性全库 OpenIE"，更新=局部重抽；无时间维度、无矛盾处理；PPR 需要图引擎（本机可行）；对单跳简单查询收益小。

## 对我们的适用性

1. **PPR 扩散检索是我们图谱的"免费升级"**：我们已有实体-边图，在检索时用 personalized PageRank 从命中实体扩散（替代/增强纯邻域扩展），可显著改善"跨文档关联"类创作查询——不动存储，只加检索算法。
2. HippoRAG 2 的教训要记住：**图谱增强不能牺牲精确事实检索**——我们的原子事实层（精确）与图扩散（联想）应并联而非串联，这与我们"向量+BM25+图"混合检索的既有方向一致。
3. "离线抽取、在线零 LLM"的成本架构值得坚持：查询期不调 LLM 是本地优先产品的延迟底线（与 Graphiti 同样结论，两个独立系统互相印证）。
