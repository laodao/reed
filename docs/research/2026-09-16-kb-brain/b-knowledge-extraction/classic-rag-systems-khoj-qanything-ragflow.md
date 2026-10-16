# 经典 RAG 开源系统的知识提取层对照：Khoj / QAnything / RAGFlow（含 RAGFlow 2026 "Knowledge Compilation" 转向）

- 链接：
  - Khoj：https://github.com/khoj-ai/khoj（self-hostable personal AI，"AI second brain"）
  - QAnything：https://github.com/netease-youdao/QAnything（网易有道，两阶段检索 RAG）
  - RAGFlow：https://github.com/infiniflow/ragflow（InfiniFlow，DeepDoc 解析 + 模板分块 + Agent）
- 时间：README 均为 2026-09 现行版本；RAGFlow release notes 抓取至 v0.27.2（2026-09-10）
- 来源：GitHub README / GitHub API（源码目录、releases）原文抓取

## 原文摘录

**Khoj README（知识层描述全貌）：**

> [Khoj](https://khoj.dev) is a personal AI app to extend your capabilities. It smoothly scales up from an on-device personal AI to a cloud-scale enterprise AI.
> - Get answers from the internet and your docs (including image, pdf, markdown, org-mode, word, notion files).
> - Find relevant docs quickly and easily using our advanced semantic search.

> Q: What kinds of documents can Khoj read? — Khoj supports a wide variety: PDFs, Markdown, Notion, Word docs, org-mode files, and more.

（源码结构佐证：`src/khoj/` 下为 `processor/ search_type/ search_filter/ routers/` 等——为解析与检索，无 KG/事实抽取模块。）

**QAnything README —— 两阶段检索：**

> In scenarios with a large volume of knowledge base data, the advantages of a two-stage approach are very clear. If only a first-stage embedding retrieval is used, there will be a problem of retrieval degradation as the data volume increases ... However, after the second-stage reranking, there can be a stable increase in accuracy, **the more data, the better the performance**.

> QAnything uses the retrieval component BCEmbedding, which is distinguished for its bilingual and crosslingual proficiency.（embedding: bce-embedding-base_v1；rerank: bce-reranker-base_v1）

**RAGFlow README —— DeepDoc 与模板分块：**

> [RAGFlow](https://ragflow.io/) is a leading open-source Retrieval-Augmented Generation (RAG) engine that fuses cutting-edge RAG with Agent capabilities to create a superior context layer for LLMs. ... Powered by a converged context engine and pre-built agent templates ...

> ### 🍱 **Template-based chunking** — Intelligent and explainable. Plenty of template options to choose from.
> ### 🌱 **Grounded citations with reduced hallucinations** — Visualization of text chunking to allow human intervention. Quick view of the key references and traceable citations to support grounded answers.

> - 2025-12-26 Supports 'Memory' for AI agent.
> - 2025-10-15 Supports orchestrable ingestion pipeline.

**RAGFlow v0.27.0 Release Notes（2026-08-19，关键趋势证据）：**

> - Brand new document level and dataset level knowledge compilation, supporting Wiki, Graph, Tree, Page Index, Mind Map, Timeline, and To Skills (#16777, #17546, #16797, #16749, #16899, #17996)
> - The previous GraphRAG and RAPTOR features have been deprecated and are no longer available in the UI. Their replacements, Graph and Tree, are now integrated into Knowledge Compilation.

## 核心机制拆解（中文）

**三系统知识提取层现状：**
- **Khoj**：知识层 = 文档解析（多格式）→ embedding → 语义检索（+ rerank）。无实体/事实抽取、无图谱。定位"个人第二大脑"但实现是经典 RAG。
- **QAnything**：知识层 = 解析 → embedding 一阶段召回 → bce-reranker 二阶段精排（其核心贡献就是证明 rerank 在大数据量下防退化）。有 FAQ/溯源预览等功能，无知识结构化。
- **RAGFlow**：知识层最厚——DeepDoc（版面分析/OCR/表格结构识别，视觉模型解析 PDF）+ 按文档类型选分块模板（论文/法律/简历等）+ 可视化人工干预分块 + 溯源引用；2025-10 起支持可编排 ingestion pipeline；**2026-08 起把 GraphRAG/RAPTOR 重构为"Knowledge Compilation"（文档级/库级编译出 Wiki/Graph/Tree/Mind Map/Timeline/Page Index/To Skills 七种知识产物）**。

**2026 趋势信号（对我们最重要）：** RAGFlow 弃用"GraphRAG 索引"独立开关，转向**按消费场景编译多种结构化知识资产**（图谱只是其中之一，还有时间线、技能化等）——与 Anthropic"结构化资产"叙事、我们"领域学习包"思路三向汇合：知识提取的产出物从单一索引变成**多维中间表示**。

## 证据与局限

- 证据：三个 README + RAGFlow release notes 均原文抓取；RAGFlow 的 Knowledge Compilation 有 PR 编号可查。
- 局限：Khoj/QAnything 近两年迭代重心移向 agent/工作流，知识层创新停滞（QAnything 2024 年后更新少）；RAGFlow Knowledge Compilation 太新（2026-08），成熟度待观察。

## 对我们的适用性

1. **反证我们的方向**：主流 RAG 开源系统的知识层普遍停在"解析+分块+检索"，谁先做出可靠的"文档→原子事实/观点/方法论提炼+溯源+矛盾发现"，谁就有代差——这个生态位 2026-09 仍空着（RAGFlow 刚开始转向）。
2. **RAGFlow 的"知识编译产物多样化"值得跟进**：其 Timeline/Tree(类RAPTOR)/Graph 并列的做法提示我们：同一批原子事实可同时渲染为（a）时序图谱（已有）（b）时间线视图（c）主题树——产出多、抽取一次，边际成本低。
3. **DeepDoc 的"解析质量优先"哲学**（先保证版面/表格解析对，再谈智能）对我们中文 PDF 讲义入库是前置依赖——工具选型（MinerU/Docling，LightRAG 同样支持）比抽取算法更影响最终质量。
4. QAnything 的"数据量越大 rerank 越重要"实证，支持我们保留 BM25+rerank 的检索底座。
