# Dense X Retrieval：命题（proposition）作为原子检索单元

- 链接：
  - 论文：https://arxiv.org/abs/2312.06648（2023-12-11，Tong Chen, Hongwei Wang, Sihao Chen, Kaixin Ma, Xinran Zhao, Hongming Zhang, Wenhao Yu, Dong Yu —腾讯 AI Lab / UW / MIT；EMNLP 2024 Main）
  - 项目：https://chentong0.github.io/factoid-wiki/ + https://github.com/chentong0/factoid-wiki
- 时间：2023-12（v3 为 EMNLP 2024 版）
- 来源：arXiv API 原文抓取

## 原文摘录

**论文摘要：**

> When we use a learned dense retriever on a retrieval corpus at inference time, an often-overlooked design choice is the retrieval unit in which the corpus is indexed, e.g. document, passage, or sentence. We discover that the retrieval unit choice significantly impacts the performance of both retrieval and downstream tasks. Distinct from the typical approach of using passages or sentences, we introduce a novel retrieval unit, proposition, for dense retrieval. Propositions are defined as atomic expressions within text, each encapsulating a distinct factoid and presented in a concise, self-contained natural language format. We conduct an empirical comparison of different retrieval granularity. Our experiments reveal that indexing a corpus by fine-grained units such as propositions significantly outperforms passage-level units in retrieval tasks. Moreover, constructing prompts with fine-grained retrieved units for retrieval-augmented language models improves the performance of downstream QA tasks given a specific computation budget.

**（论文正文对 proposition 的经典定义，被后续所有工作引用）：**

> Propositions are defined as atomic expressions within text, each encapsulating a distinct factoid and presented in a concise, self-contained natural language format.

## 核心机制拆解（中文）

**三要件定义原子事实：** (1) atomic——不可再拆（一个表达式只封装一个 factoid）；(2) self-contained——脱离上下文可独立理解（无代词、含完整主语）；(3) concise natural language——自然语言短句而非三元组。

**方法管线：** 用 In-Context Learning（few-shot GPT text-davinci-003）把 Wikipedia 段落逐句"命题化"→ 每个 proposition 独立建 SimCSE/Contriever 向量索引 → 检索时以命题为粒度召回，再按需要聚合成 prompt（"自包含"保证了命题可以直接拼进上下文）。

**核心发现：** 同预算下命题粒度索引在检索精度（尤其长尾实体查询）与下游 QA 均优于 passage/sentence 粒度；Factoid-Wiki 是全 Wikipedia 命题化语料库，供复现。

## 证据与局限

- 证据：EMNLP 2024 主会；给出了粒度对比的系统实验（passage/sentence/proposition 三档）；Factoid-Wiki 开源。
- 局限：(1) 命题化成本高——全库重写一遍（本文动机是静态 Wikipedia，非增量）；(2) 当时模型幻觉会引入原文没有的命题（论文用人工校验缓解）；(3) 只改善"检索单元"，不提供实体/关系的结构化（无图、无时间）。

## 对我们的适用性

1. **"原子事实 = atomic + self-contained + concise NL"三要件是我们"原子知识/事实提炼"的最佳定义基座**——比三元组更适合直接喂回 LLM 做创作辅助，比 chunk 又可交叉验证。
2. 直接适用场景：dl_card 讲义与领域包的"证据句"可命题化后建第二索引，解决"证据埋在长句里检索不到"的问题（与现向量+BM25 并存，不必替换）。
3. 它证明了"细粒度不伤检索、反而提升"——这为我们在 chunk 之上加"原子事实层"提供了实证背书。
4. 成本上要吸取教训：只对**高价值文档**（领域学习包、用户标记资料）做全量命题化，普通文档保持 chunk 检索——分层提炼。
