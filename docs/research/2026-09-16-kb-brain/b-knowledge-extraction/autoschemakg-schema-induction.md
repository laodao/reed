# AutoSchemaKG：无预定义 Schema 的自主知识图谱构建（schema 归纳 + 概念化，900M 节点实证）

- 链接：
  - 论文：https://arxiv.org/abs/2505.23628（2025-05-29 v3，Jiaxin Bai, Wei Fan, Qi Hu, Qing Zong, Chunyang Li, Hong Ting Tsang, Hongyu Luo, Yauwai Yim — HKUST KnowComp；ACL 2026 接收）
  - 仓库：https://github.com/hkust-knowcomp/AutoSchemaKG
- 时间：2025-05（v3 至 2025 后期）
- 来源：arXiv API 原文抓取

## 原文摘录

**论文摘要：**

> We present AutoSchemaKG, a framework for fully autonomous knowledge graph construction that eliminates the need for predefined schemas. Our system leverages large language models to simultaneously extract knowledge triples and induce comprehensive schemas directly from text, modeling both entities and events while employing conceptualization to organize instances into semantic categories. Processing over 50 million documents, we construct ATLAS (Automated Triple Linking And Schema induction), a family of knowledge graphs with 900+ million nodes and 5.9 billion edges. This approach outperforms state-of-the-art baselines on multi-hop QA tasks and enhances LLM factuality. Notably, our schema induction achieves 92% semantic alignment with human-crafted schemas with zero manual intervention, demonstrating that billion-scale knowledge graphs with dynamically induced schemas can effectively complement parametric knowledge in large language models.

## 核心机制拆解（中文）

**双产物同步生成：** 每次 LLM 抽取调用同时输出 (1) 知识三元组（实体与**事件**并建——不只实体图）；(2) 该三元组涉及的关系类型与实体类别的 schema 定义（即 schema 是从语料里"归纳"出来的，随抽取增量演化，而非先验给定）。

**概念化层（conceptualization）：** 实例节点被归入归纳出的语义类别（如"iPhone 15"→"智能手机"），形成实例-概念两层结构——相当于自动长出本体层，控制类型自由膨胀。

**规模与质检：** 50M 文档 → ATLAS 图（900M+ 节点 / 5.9B 边）；schema 与人工 schema 的语义对齐率达 92%（零人工）——证明 LLM 归纳的 schema 不是噪声。

**使用效果：** 归纳 schema 的图在 multi-hop QA 上超基线，并提升 LLM 事实性（图作为外挂知识补参数知识）。

## 证据与局限

- 证据：亿级规模真实构建（非 toy 实验）；92% schema 对齐有量化；代码/数据开源。
- 局限：(1) 全库批处理，无增量/时序/矛盾处理（构建完是静态快照）；(2) schema 归纳在超大规模上依赖强大的抽取模型（成本高）；(3) 无溯源设计披露（三元组到原文的引用不是其重点）；(4) 面向 Web 语料（Common Crawl 类），与个人文档库场景不同。

## 对我们的适用性

1. **"抽取时同步归纳 schema"解决了我们领域学习包的核心痛点**：dl_concept/dl_relation 的人工 schema（前置/特例/包含/对比/因果）难以覆盖用户新领域文档——可让入库时 LLM 同时产出候选关系类型，再映射到我们六类标准关系（映射不上的进"待归纳区"），schema-light 而非全开放。
2. **概念化双层（实例→类别）**与我们"实体+概念图"分层完全同构，其"概念类别自动归纳"可辅助领域学习包的 dl_concept 生成（从文档概念共现中归纳概念层级）。
3. 92% 对齐率给了信心：LLM 归纳的 schema 足够干净，可以半自动采用（人审阈值过滤）。
4. 诚实说：其规模与批处理方式不适用本地优先产品；借鉴的是"schema 同步归纳 + 概念化"两个机制，不是其管线。
