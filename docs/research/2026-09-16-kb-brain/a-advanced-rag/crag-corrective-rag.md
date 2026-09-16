# CRAG: Corrective Retrieval Augmented Generation（检索评估器 + 纠错型检索，即插即用）

- 链接: https://arxiv.org/abs/2401.15884
- 作者: Shi-Qi Yan, Jia-Chen Gu, Yun Zhu, Zhen-Hua Ling（USTC）
- 发表时间: 2024-01-29
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2401.15884，原文）

> Large language models (LLMs) inevitably exhibit hallucinations since the accuracy of generated texts cannot be secured solely by the parametric knowledge they encapsulate. Although retrieval-augmented generation (RAG) is a practicable complement to LLMs, it relies heavily on the relevance of retrieved documents, raising concerns about how the model behaves if retrieval goes wrong. To address this, we propose the Corrective Retrieval Augmented Generation (CRAG) to improve the robustness of generation. Specifically, a lightweight retrieval evaluator is designed to assess the overall quality of retrieved documents for a query, returning a confidence degree based on which different knowledge retrieval actions can be triggered. Since retrieval from static and limited corpora can only return sub-optimal documents, large-scale web searches are utilized as an extension for augmenting the retrieval results. Besides, a decompose-then-recompose algorithm is designed for retrieved documents to selectively focus on key information and filter out irrelevant information in them. CRAG is plug-and-play and can be seamlessly coupled with various RAG-based approaches. Experiments on four datasets covering short- and long-form generation tasks show that CRAG can significantly improve the performance of RAG-based approaches.

## 核心机制拆解

出发点：RAG 的失败往往不是生成错，而是**检索错**——模型被迫基于无关文档硬答。CRAG 在检索与生成之间插一个纠错层（plug-and-play，不改生成模型）：

1. **轻量检索评估器（retrieval evaluator）**：用 T5-large 级小模型微调而成，对 (query, document) 打置信分，比用 LLM 自评便宜得多。
2. **三档纠错动作**（按置信度触发）：
   - **Correct**（检索可靠）：走 decompose-then-recompose——把文档拆成知识条（细粒度分解），只保留与 query 相关的条重组，过滤文档内噪声。
   - **Incorrect**（检索全错）：触发**web 搜索兜底**，用搜索结果重写 query 补充知识源。
   - **Ambiguous**（不确定）：两路都做，证据并集。
3. 生成时用过滤/补充后的知识，显著降低被坏检索带偏的概率。

## 证据与成本

- 4 个数据集（PopQA/ComplexQA/HotpotQA 等，短/长生成）上对多种 RAG 基线（Self-RAG 等）稳定增益。
- 成本：评估器是小模型（可本地 CPU 跑），decompose-recompose 需要每文档一次轻量 LLM 调用；Incorrect 档的 web 搜索是外部依赖。
- 局限：置信阈值需按语料调；评估器泛化到域外语料时会漂移；web 搜索不适用于私有语料场景。

## 对我们的适用性

1. **最即插即用的一条（高）**：CRAG 不需要训练、不依赖特定模型，纯 pipeline 逻辑——「检索质量评分 → 分档动作 → 细粒度重组」，与我们 rerank 之后的环节无缝衔接，是我们现有管线（混合检索+rerank）升级的第一优先级。
2. **web 兜底替换为"多源兜底"（高）**：本地优先场景没有 web 搜索，但兜底源可以换成：图谱路径（lw_graph_edges PPR 检索）、摘要树路径（RAPTOR 层）、领域学习包——Incorrect 档 = 触发跨源重检索 + query 改写，正好用我们的 agent harness 工具循环实现。
3. **decompose-then-recompose 与命题索引天然配对（中-高）**：如果做了命题化（dense-x），"文档分解为知识条再筛选"可以直接用命题代替 LLM 分解，省一次调用。
4. **评估器可本地化（中-高）**：小模型评估器（bge-reranker 或微调小模型）本地推理，符合本地优先性能模型；先做规则版（rerank 分数分布做阈值），再上小模型版。
