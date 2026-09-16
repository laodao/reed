# HippoRAG 2: From RAG to Memory（非参数持续学习，事实/联想/常识三类记忆全面超越 RAG）

- 链接: https://arxiv.org/abs/2502.14802 （代码: https://github.com/OSU-NLP-Group/HippoRAG）
- 作者: Bernal Jiménez Gutiérrez, Yiheng Shu, Weijian Qi, Sizhe Zhou, Yu Su（OSU）
- 发表时间: 2025-02-20
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2502.14802，原文）

> Our ability to continuously acquire, organize, and leverage knowledge is a key feature of human intelligence that AI systems must approximate to unlock their full potential. Given the challenges in continual learning with large language models (LLMs), retrieval-augmented generation (RAG) has become the dominant way to introduce new information. However, its reliance on vector retrieval hinders its ability to mimic the dynamic and interconnected nature of human long-term memory. Recent RAG approaches augment vector embeddings with various structures like knowledge graphs to address some of these gaps, namely sense-making and associativity. However, their performance on more basic factual memory tasks drops considerably below standard RAG. We address this unintended deterioration and propose HippoRAG 2, a framework that outperforms standard RAG comprehensively on factual, sense-making, and associative memory tasks. HippoRAG 2 builds upon the Personalized PageRank algorithm used in HippoRAG and enhances it with deeper passage integration and more effective online use of an LLM. This combination pushes this RAG system closer to the effectiveness of human long-term memory, achieving a 7% improvement in associative memory tasks over the state-of-the-art embedding model while also exhibiting superior factual knowledge and sense-making memory capabilities. This work paves the way for non-parametric continual learning for LLMs. Code and data are available at this https URL.

## 核心机制拆解

HippoRAG 1 的教训：图结构检索提升了 sense-making/associative（多跳）能力，但**单跳事实型查询反而不如纯向量 RAG**（图扩散引入噪声）。HippoRAG 2 的目标是在三类记忆上同时不退化。

相对 v1 的三个增强：
1. **Deeper passage integration（passage 与图深度融合）**：索引时除了三元组边，还加入 passage-passage 相似边 / 实体-passage 归属边更细的权重，让"原文证据"本身成为图的一等公民，而不是只挂在实体旁边——事实型查询仍能靠向量/原文路径命中。
2. **查询时的智能（online LLM use）**：检索后不是直接拼接，而是用 LLM 做**查询条件化**——判断哪些检索到的三元组/事实与 query 真正相关（LLM 过滤 + 重打分），再二次 PPR 扩散；相当于把 PPR 从"盲扩散"升级为"LLM 引导的定向扩散"。
3. **事实校验路径**：对答案需要的事实做图上确认（识别支撑三元组），弱化图与向量两路结果冲突时的噪声。

论文同时提出**记忆评估视角**：把 RAG 评测组织成 factual memory（单跳事实）、sense-making memory（多跳理解）、associative memory（关联/比对）三类，这个分类本身就是对"知识库大脑化"很好的需求模型。

## 证据与成本

- 在 7 个数据集（含事实 QA、多跳 QA、关联记忆任务如 LoCoMo 长对话记忆）上：联想记忆比 SOTA embedding 模型（NV-Embedv2 等）+7%，同时事实与 sense-making 均超过标准 RAG（v1 在事实上是落后的）。
- 成本：比 v1 多了查询时 1-2 次 LLM 调用（条件化过滤），仍远低于迭代式 agentic 检索；索引成本与 v1 同量级（OpenIE + 图构建）。
- 局限：系统复杂度上升（图 + 向量 + 查询时 LLM 协同）；评测仍以英文为主。

## 对我们的适用性

1. **"三类记忆"分类直接可用作产品需求模型（高）**：我们的知识库用户问的也分三类——事实型（"某文档里 X 的定义"）、理解型（"为什么作者这么论证"）、关联型（"A 文档的方法和 B 文档的批判有什么关系"）。用这个分类检查现有管线的短板（我们目前强于事实型，弱于关联型），比笼统的"RAG 升级"更有抓手。
2. **"结构化检索必须在事实上不退化"是重要警训（高）**：我们引入图谱/层级摘要时，必须保留现有向量+BM25 混合检索作为事实型主路径，新结构作为增强路径（路由决定），而不是替换——HippoRAG 2 证明了"全面超越"要靠深度整合而非叠加结构。
3. **查询时 LLM 条件化过滤可低成本移植（中-高）**：在 PPR/图谱检索结果拼上下文前，加一步轻量 LLM 过滤重排（我们 rerank 管线已有位置），能显著降低图扩散噪声。
