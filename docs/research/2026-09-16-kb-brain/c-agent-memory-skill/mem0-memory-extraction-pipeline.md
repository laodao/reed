# Mem0: 记忆抽取-合并管线（两阶段 extraction/update + ADD/UPDATE/DELETE/NOOP 操作集）

- 链接: https://arxiv.org/abs/2504.19413
- 作者: Prateek Chhikara, Dev Khant, Saket Aryan, Taranjeet Singh, Deshraj Yadav（Mem0 团队）
- 时间: 2025-04-28 v1
- 来源: arXiv。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: We introduce Mem0, a scalable memory-centric architecture that addresses this issue by dynamically extracting, consolidating, and retrieving salient information from ongoing conversations. Building on this foundation, we further propose an enhanced variant that leverages graph-based memory representations to capture complex relational structures among conversational elements...Mem0 achieves 26% relative improvements in the LLM-as-a-Judge metric over OpenAI...Mem0 attains a 91% lower p95 latency and saves more than 90% token cost.

两阶段管线：

> Our architecture follows an incremental processing paradigm, enabling it to operate seamlessly within ongoing conversations. As illustrated in Figure 2, the complete pipeline architecture consists of two phases: extraction and update.

> The extraction phase initiates upon ingestion of a new message pair (m_{t-1}, m_t)...the system employs two complementary sources: (1) a conversation summary S retrieved from the database that encapsulates the semantic content of the entire conversation history, and (2) a sequence of recent messages...This dual contextual information, combined with the new message pair, forms a comprehensive prompt...for an extraction function φ implemented via an LLM. The function φ(P) then extracts a set of salient memories Ω = {ω_1, ω_2, ..., ω_n} specifically from the new exchange while maintaining awareness of the conversation's broader context, resulting in candidate facts for potential inclusion in the knowledge base.

四操作决策（冲突/冗余处理的核心）：

> Following extraction, the update phase evaluates each candidate fact against existing memories to maintain consistency and avoid redundancy...For each fact, the system first retrieves the top s semantically similar memories using vector embeddings from the database. These retrieved memories, along with the candidate fact, are then presented to the LLM through a function-calling interface we refer to as a 'tool call.' The LLM itself determines which of four distinct operations to execute: ADD for creation of new memories when no semantically equivalent memory exists; UPDATE for augmentation of existing memories with complementary information; DELETE for removal of memories contradicted by new information; and NOOP when the candidate fact requires no modification to the knowledge base. Rather than using a separate classifier, we leverage the LLM's reasoning capabilities to directly select the appropriate operation based on the semantic relationship between the candidate fact and existing memories.

> In our experimental evaluation, we configured the system with 'm' = 10 previous messages for contextual reference and 's' = 10 similar memories for comparative analysis. All language model operations utilized GPT-4o-mini as the inference engine.

图记忆变体的冲突处理（软删除）：

> When integrating new information, Mem0^g employs a sophisticated storage and update strategy...we implement a conflict detection mechanism that identifies potentially conflicting existing relationships when new information arrives. An LLM-based update resolver determines if certain relationships should be obsolete, marking them as invalid rather than physically removing them to enable temporal reasoning.

对竞品 Zep 的延迟指控（论战一方，详见 Zep 条目）：

> Beyond token inefficiency, our experiments revealed significant operational bottlenecks with Zep. After adding memories to Zep's system, we observed that immediate memory retrieval attempts often failed to answer our queries correctly. Interestingly, re-running identical searches after a delay of several hours yielded considerably better results.

## 核心机制拆解（中文）

- **数据模型**: 自然语言短事实条目（base 版，向量库）+ 实体-关系三元组（graph 版 Mem0^g，Neo4j）。记忆单元是"原子事实"粒度，不是文档块。
- **流程**: 每个新消息对触发——① extraction：用【全局会话摘要（异步定期刷新）+ 最近 10 条消息 + 新消息对】提示 LLM 抽出候选事实；② update：对每条候选事实检索 top-10 相似旧记忆，LLM 通过 tool call 在 ADD/UPDATE/DELETE/NOOP 四操作中决策并执行。
- **触发时机**: 逐条消息对即时触发（incremental），摘要异步刷新——即"边聊边提炼"，无独立反思阶段。
- **成本**: 每消息对 1 次 extraction 调用 + N 次 update 决策（可用 GPT-4o-mini 级小模型）；论文卖点即 p95 1.44s 总延迟、比 full-context 省 90%+ token。NOOP 的存在意味着大多数消息其实不产生记忆写入。

## 证据与局限

- LOCOMO 基准上宣称超过 OpenAI Memory / LangMem / Zep（产品版）等；但 Zep 团队随后发文（见 Zep 条目）指出其实验对 Zep 配置错误（用户模型、时间戳、串行检索三处），修正后 Zep 反超约 10%。双方都用 LLM-as-a-Judge，指标本身有随机性（Mem0 自己跑了 10 次取均值）。
- Zep 方还指出 LoCoMo 本身有缺陷：全上下文基线（~73% J）就超过 Mem0 最好成绩（~68%），说明该基准没能真正压测记忆。
- 机制层面的真实教训：四操作集 + "检索相似旧记忆再决策"是消歧/冲突的最小可行设计，成本可控且可解释——这部分的价值独立于基准论战。

## 对我们的适用性

1. **四操作集是我们飞轮缺的那半**: 我们的 agent_memory_entry 当年大概率只做 ADD——"边写边攒经验条目"，没有 UPDATE/DELETE/NOOP，导致库越滚越脏最后只能整体停用。重启飞轮时应把"新经验 vs 旧经验 → 四操作裁决"作为硬性设计，尤其 NOOP（大多数轨迹不值得入库）能天然控量。
2. **"提炼什么"粒度**: Mem0 抽的是原子事实（"用户偏好古代建筑"），对写作场景对应的是"角色设定事实/世界观事实/用户审美偏好"——这部分与 structured-provider 的 KnowledgeSegment 契约天然对接：飞轮产出的确定性事实可走 structured-provider 装配，而非全塞进向量库。
3. **何时提炼**: 逐消息即时抽取适合聊天产品；我们是长创作会话，逐条触发过于频繁，可降频为"每个工具循环结束/每个场景写完"触发一次批量 extraction，再配异步摘要刷新（全局书稿状态摘要），完全符合其"dual context"设计。
4. **软删除而非物理删除**: 图版"标记 invalid 而非删除以支持时间推理"对小说设定演变（角色改名、世界观修订）极有用——设定库应保留版本史而不是覆盖。
