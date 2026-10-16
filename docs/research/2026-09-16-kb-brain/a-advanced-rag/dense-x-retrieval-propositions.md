# Dense X Retrieval: What Retrieval Granularity Should We Use?（命题级原子检索单元）

- 链接: https://arxiv.org/abs/2312.06648 （代码/FactoidWiki: https://github.com/chentong0/factoid-wiki）
- 作者: Tong Chen, Hongwei Wang, Sihao Chen, Wenhao Yu, Kaixin Ma, Xinran Zhao, Hongming Zhang, Dong Yu（Tencent AI Lab / UIUC / CMU）
- 发表时间: 2023-12-11（EMNLP 2024 Main）
- 来源: arXiv / EMNLP 2024

## 原文摘录

### Abstract（arXiv:2312.06648，原文）

> Dense retrieval has become a prominent method to obtain relevant context or world knowledge in open-domain NLP tasks. When we use a learned dense retriever on a retrieval corpus at inference time, an often-overlooked design choice is the retrieval unit in which the corpus is indexed, e.g. document, passage, or sentence. We discover that the retrieval unit choice significantly impacts the performance of both retrieval and downstream tasks. Distinct from the typical approach of using passages or sentences, we introduce a novel retrieval unit, proposition, for dense retrieval. Propositions are defined as atomic expressions within text, each encapsulating a distinct factoid and presented in a concise, self-contained natural language format. We conduct an empirical comparison of different retrieval granularity. Our experiments reveal that indexing a corpus by fine-grained units such as propositions significantly outperforms passage-level units in retrieval tasks. Moreover, constructing prompts with fine-grained retrieved units for retrieval-augmented language models improves the performance of downstream QA tasks given a specific computation budget.

## 核心机制拆解

**Proposition（命题）定义**：文本中的原子表达，每条封装一个独立 factoid，以简洁、自包含的自然语言呈现。例如句子"毛泽东 1893 年生于湖南韶山"可拆为两条命题："毛泽东 1893 年出生""毛泽东出生于湖南韶山"。

**为什么细粒度赢**：
1. **嵌入聚焦**：一个 passage 嵌入是多个主题的平均，被无关内容稀释；命题嵌入单一事实，语义密度高，相似度判别更准（尤其对"只命中一个事实"的精确查询）。
2. **预算效率**：给定上下文 token 预算，塞 20 条命题比塞 3 个段落覆盖更多独立事实（"given a specific computation budget" 实验证明）。
3. 自包含性保证命题单独被检出时仍可理解、可用作引用。

**管线**：原文 → LLM 命题化（propositionizer，逐句分解）→ 每条命题独立嵌入入索引 → 检索命中命题 → 可回链到原句/段落做展示与引用。论文发布了 FactoidWiki（全维基命题级索引）作为可复用资产。

## 证据与成本

- 命题级 vs 段落级检索：检索指标显著提升（Precision/Recall@k 均优）；下游 QA 在固定 token 预算下提升。
- **索引成本高**：语料命题化使索引条目数量膨胀 5-10 倍，且命题化本身是 LLM 密集操作（逐句分解）；每条命题还要单独嵌入。
- 边际递减：句子级已优于段落级，命题级再优于句子级，但差距缩小；对模糊/主题型查询（非事实型）细粒度优势消失甚至反转（主题查询需要上下文）。
- 与 rerank 兼容性好：命题作为粗召回单元，rerank 后再扩展回原文段落。

## 对我们的适用性

1. **精准命中我们"QA 对直出"与事实引用需求（中-高）**：我们的混合切片是结构/语义切片（段落级），对"某个具体事实/定义/数据"的精确查询命中率受限；对**学习包与长文的关键章节**叠加一层命题索引（不必全库），可显著提升事实型查询与引用锚点精度。
2. **作为"原子知识卡"的落地形态（高）**：命题 = 最小知识单元，与"自动提炼知识"目标同构——命题化产物可直接聚合成"事实卡/概念卡"，与领域学习包的概念图/讲义卡衔接（SiReRAG 也用 proposition 做关联分组，见 sirerag.md）。
3. **成本纪律（中）**：只在用户显式"深加工"的文档（学习包、长文项目）上做命题化，普通笔记保持段落级；命题索引必须保留到原句的回链，否则引用断裂。
4. **与混合检索融合零阻力（中-高）**：命题条目照常进向量库 + BM25（jieba 对短查询/短命题分词更稳），RRR 融合不用改；查询路由把"事实核查/精确引用"类意图指向命题池。
