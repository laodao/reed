# Zep / Graphiti：生物启发双时间线时序知识图谱记忆引擎

- 链接：
  - 论文：https://arxiv.org/abs/2501.13956（2025-01-20，Preston Rasmussen, Pavlo Paliychuk, Travis Beauvais, Jack Ryan, Daniel Chalef — Zep AI）
  - 仓库：https://github.com/getzep/graphiti（20k+ stars，Apache-2.0）
  - 源码证据：`graphiti_core/prompts/extract_nodes.py`、`extract_edges.py`、`dedupe_edges.py`（2026-09 main 分支实测抓取）
- 时间：2025-01（论文 v1）；README 与源码 2026-09 现行版本
- 来源：arXiv / GitHub 原文抓取

## 原文摘录

**论文摘要（arXiv 2501.13956）：**

> We introduce Zep, a novel memory layer service for AI agents that outperforms the current state-of-the-art system, MemGPT, in the Deep Memory Retrieval (DMR) benchmark. ... While existing retrieval-augmented generation (RAG) frameworks for large language model (LLM)-based agents are limited to static document retrieval, enterprise applications demand dynamic knowledge integration from diverse sources including ongoing conversations and business data. Zep addresses this fundamental limitation through its core component Graphiti -- a temporally-aware knowledge graph engine that dynamically synthesizes both unstructured conversational data and structured business data while maintaining historical relationships. In the DMR benchmark ... Zep demonstrates superior performance (94.8% vs 93.4%). Beyond DMR, Zep's capabilities are further validated through the more challenging LongMemEval benchmark ... Zep achieves substantial results with accuracy improvements of up to 18.5% while simultaneously reducing response latency by 90% compared to baseline implementations.

**README —— "What is a Context Graph?"：**

> A **context graph** is a temporal graph of entities, relationships, and facts — like *"Kendra loves Adidas shoes (as of March 2026)."* Unlike traditional knowledge graphs, each fact in a context graph has a validity window: when it became true, and when (if ever) it was superseded. Entities evolve over time with updated summaries. Everything traces back to **episodes** — the raw data that produced it.

> | Component | What it stores |
> |-----------|---------------|
> | **Entities** (nodes) | People, products, policies, concepts — with summaries that evolve over time |
> | **Facts / Relationships** (edges) | Triplets (Entity → Relationship → Entity) with temporal validity windows |
> | **Episodes** (provenance) | Raw data as ingested — the ground truth stream. Every derived fact traces back here |
> | **Custom Types** (ontology) | Developer-defined entity and edge types via Pydantic models |

> - **Temporal Fact Management:** Facts have validity windows. When information changes, old facts are invalidated — not deleted. Query what's true now, or what was true at any point in time.
> - **Prescribed & Learned Ontology:** Define entity and edge types upfront via Pydantic models (prescribed), or let structure emerge from your data (learned).
> - **Hybrid Retrieval:** Combines semantic embeddings, keyword (BM25), and graph traversal for low-latency, high-precision queries without reliance on LLM summarization.

> **Contradiction Handling**（Graphiti vs GraphRAG 对比表）: Automatic fact invalidation with temporal history preserved.

**源码 `prompts/extract_edges.py` —— Edge 数据模型（Pydantic）：**

> ```python
> class Edge(BaseModel):
>     source_entity_name: str = Field(..., description='The name of the source entity from the ENTITIES list')
>     target_entity_name: str = Field(..., description='The name of the target entity from the ENTITIES list')
>     relation_type: str = Field(..., description='The type of relationship between the entities, in SCREAMING_SNAKE_CASE (e.g., WORKS_AT, LIVES_IN, IS_FRIENDS_WITH)')
>     fact: str = Field(..., description='A natural language description of the relationship between the entities, paraphrased from the source text')
>     valid_at: str | None = Field(None, description='The date and time when the relationship described by the edge fact became true or was established. Use ISO 8601 format')
>     invalid_at: str | None = Field(None, description='The date and time when the relationship described by the edge fact stopped being true or ended. Use ISO 8601 format')
>     episode_indices: list[int] = Field(default_factory=lambda: [0], description='List of episode numbers (0-indexed) that this fact was derived from.')
> ```

**源码 `prompts/extract_edges.py` —— fact 保真规则（反泛化）：**

> 5. The `fact` MUST preserve all specific details from the source text: proper nouns, brand names, product names, model numbers, quantities, counts, colors, materials, physical descriptions, specific items, named locations, and named activities. Paraphrase the sentence structure but NEVER generalize:
>    - NEVER generalize "Gamecube" to "gaming console", "Ford Mustang" to "car", "wool coat" to "coat" ...

**源码 `prompts/dedupe_edges.py` —— 去重 vs 矛盾判定：**

> ```
> EXISTING FACT: idx=1, "Alice works at Acme Corp as a software engineer"
> NEW FACT: "Alice works at Acme Corp as a senior engineer"
> Result: duplicate_facts=[], contradicted_facts=[1] (same relationship but updated title — contradiction, NOT a duplicate)
>
> EXISTING FACT: idx=2, "Bob ran 5 miles on Tuesday"
> NEW FACT: "Bob ran 3 miles on Wednesday"
> Result: duplicate_facts=[], contradicted_facts=[] (different events on different days — neither duplicate nor contradiction)
> ```

> "A fact from EXISTING FACTS can be both a duplicate AND contradicted (e.g., semantically the same but the new fact updates/supersedes it)."

**源码 `prompts/extract_nodes.py` —— 实体抽取负面清单（节选）：**

> NEVER extract any of the following:
> - Pronouns (you, me, I, he, she, they, we, us, it, them, him, her, this, that, those)
> - Abstract concepts or feelings (joy, balance, growth, resilience, happiness, passion, motivation)
> - Bare relational or kinship terms (dad, mom, ...) ... Instead, qualify them with the possessor: extract "Nisha's dad" not "dad", "Jordan's dog" not "dog".

> Only extract entities that are specific enough to be uniquely identifiable. Ask: "Could this have its own Wikipedia article or database entry, OR is it specific enough to distinguish from other items of the same category within this conversation?"

## 核心机制拆解（中文）

**数据模型（三层 + 双时间线）：**
- Episode（原始数据层，可溯源的 ground truth）→ Entity 节点（带演化 summary + attributes）→ Fact/Edge（valid_at / invalid_at 有效区间 + episode_indices 溯源）。
- 双时间线：`valid_at/invalid_at` 是**事实世界时间**（事件时间），而 edge 上的 `created_at`（摄入时间，DB 层）独立存在——论文称 bi-temporal。 ingestion 时间回答"我们何时知道"，valid 时间回答"世界何时如此"。
- 本体（ontology）双轨：prescribed（Pydantic 预定义 entity/edge 类型）与 learned（自由抽取）混合；类型分类是独立一步 `classify_nodes`。

**Pipeline（增量式，无全图重算）：**
1. 逐 episode 抽实体（extract_message / extract_text / extract_json 三种模板）
2. 基于实体列表抽边（edge prompt 要求 source/target 必须来自实体清单，"Using names not in the list will cause the edge to be rejected"——结构化输出校验兜底）
3. 时间抽取独立成步（extract_timestamps / extract_timestamps_batch，可离线补齐 valid/invalid），系统提示就一句 "You extract temporal bounds from facts. NEVER hallucinate dates."，相对时间用 REFERENCE_TIME 解析
4. 去重/矛盾消解（dedupe_nodes / dedupe_edges）：新 fact 与"现存 facts + 失效候选 facts"连续编号列表对比，输出 duplicate_facts / contradicted_facts 两组索引；矛盾 → 给旧 edge 打 invalid_at（关旧开新），不删除
5. 节点 summary 增量合并（"When newer episode text conflicts with older summary content, prefer the newer explicit fact"）

**Prompt 策略（最值得抄的部分）：**
- 实体抽取用"负面清单 + 正反例对"控制噪声：禁止代词/抽象概念/裸名词，亲属词必须带限定词（"Nisha's dad"）；
- fact 保真规则：改写句式但禁止任何粒度泛化（Gamecube≠console），并显式定义"更详细的重复不是重复，是新 fact"；
- 属性抽取的 HARD RULES："值只能是 (a) 原文复制/规范化 (b) 既有值 (c) null"——把"禁止幻觉推理"写成可校验的规则；
- 结构化输出强依赖：README 明说 "Graphiti works best with LLM services that support Structured Output... Using other services may result in incorrect output schemas and ingestion failures"。

**成本控制：** 检索侧完全不用 LLM（semantic+BM25+graph traversal 混合，reranker 用 logprob 二分类）；LLM 只在摄入期用；SEMAPHORE_LIMIT=10 控制并发防 429。

## 证据与局限

- 证据：论文在 LongMemEval 上 +18.5% 准确率、-90% 延迟（对比基线为 MemGPT 与朴素 RAG）；源码 prompt 是生产级打磨版本，可直接复用。
- 局限：(1) 面向对话/企业记忆，非长文档语料——无社区汇总、无全局概览能力；(2) 依赖外部图数据库（Neo4j/FalkorDB）+ 多次 LLM 调用/episode，摄入成本高；(3) 矛盾检测是"新 fact 到达时"的局部判定，没有全库离线矛盾扫描；(4) LongMemEval 数字为自评，未第三方复现。

## 对我们的适用性

1. **直接可抄：dedupe_edges 的"duplicate vs contradicted vs 无关"三分类 prompt**——正是我们"矛盾扫描"模块需要的原子操作；其"连续编号 + 从两个列表中选 idx"的输出协议工程上很稳。
2. **直接可抄：fact 反泛化规则与实体负面清单**——适用于我们文档入库的原子事实抽取，避免"细化知识被抽成空泛描述"（这对 dl_card 证据保真尤其重要）。
3. **时间抽取独立成步 + REFERENCE_TIME 解析**：小说场景里"第三章时"这类相对时间可映射到我们的 valid_from/until_chapter，机制同构，可平移。
4. 我们已有自研时序图谱（关旧开新），无需引入 Graphiti 存储；但它"bi-temporal 中摄入时间线"是我们缺的——同一个事实第 2 章说 A 第 5 章改口 B 时，我们只记有效区间，不记"读者第几章才知道"，对叙事信息控制（dramatic irony）有借鉴价值。
5. 其检索侧"无 LLM 参与的混合检索 + rerank"证实了我们向量+BM25 路线不必推倒，升级点在抽取层而非检索层。
