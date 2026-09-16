# MemoRAG: Global Memory-Enhanced Retrieval Augmentation（全局记忆 + 草稿线索式检索）

- 链接: https://arxiv.org/abs/2409.05591 （代码: https://github.com/qhjqhj/MemoRAG）
- 作者: Hongjin Qian, Zheng Liu, Peitian Zhang, Kelong Mao, Defu Lian, Zhicheng Dou, Tiejun Huang（BAAI / 人大 / 华科）
- 发表时间: 2024-09-09
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2409.05591，原文）

> Processing long contexts presents a significant challenge for large language models (LLMs). While recent advancements allow LLMs to handle much longer contexts than before (e.g., 32K or 128K tokens), it is computationally expensive and can still be insufficient for many applications. Retrieval-Augmented Generation (RAG) is considered a promising strategy to address this problem. However, conventional RAG methods face inherent limitations because of two underlying requirements: 1) explicitly stated queries, and 2) well-structured knowledge. These conditions, however, do not hold in general long-context processing tasks. In this work, we propose MemoRAG, a novel RAG framework empowered by global memory-augmented retrieval. MemoRAG features a dual-system architecture. First, it employs a light but long-range system to create a global memory of the long context. Once a task is presented, it generates draft answers, providing useful clues for the retrieval tools to locate relevant information within the long context. Finally, it leverages an expensive but expressive system, which generates the final answer based on the retrieved information. Building upon this fundamental framework, we realize the memory module in the form of KV compression, and reinforce its memorization and cluing capacity from the Generation quality's Feedback (a.k.a. RLGF). In our experiments, MemoRAG achieves superior performances across a variety of long-context evaluation tasks, not only complex scenarios where traditional RAG methods struggle, but also simpler ones where RAG is typically applied.

## 核心机制拆解

对传统 RAG 两个隐含前提的批判：**1) query 必须显式明确；2) 知识必须结构良好**。创作型/开放任务（"帮我续写""这一卷有哪些伏笔可以回收"）没有明确 query，传统检索无从下手。

**双系统架构**：
1. **轻量长程系统（记忆模块）**：小模型（如 560M 级）对长文生成**全局记忆**——实现为 KV 压缩（原文的记忆 token 化，可被任务条件化激活）；离线一次构建。
2. **草稿生成（clue 生成）**：任务来了（哪怕很模糊），轻量系统先产出**粗糙草稿答案**——草稿不必精确，但携带了"答案大概长什么样/涉及谁"的线索。
3. **草稿驱动检索**：用草稿（而非原始 query）作为检索信号去定位原文相关片段——把"模糊任务"翻译成"具体检索线索"。
4. **强系统精答**：贵而强的模型基于检索到的原文生成最终答案，替代掉草稿。

训练细节：记忆模块用 RLGF（以最终生成质量为奖励）强化其"线索给出能力"，让草稿更好地服务于检索。

## 证据与成本

- 在长文任务（含模糊任务型，如全局摘要、线索式 QA）上超过传统 RAG 与长上下文基线；简单 QA 也不退化。
- 成本：离线记忆构建（小模型 KV 压缩）一次 + 查询时一次小模型草稿 + 一次强模型生成，约 2-3 倍单次 RAG 调用，远低于迭代 agentic 检索。
- 局限：记忆模块与其 KV 表示绑定特定小模型（要自训/微调）；草稿质量决定检索上限；原文更新需重建记忆。

## 对我们的适用性

1. **"先草稿后检索"完美适配创作辅助（高）**：创作任务的 query 天然模糊（"给这段找素材""检查与前文矛盾"）；用我们的章节树/摘要树 + LLM 先产出"候选要点草稿"（不依赖 KV 小模型，纯文本草稿即可复刻该机制），再以草稿句为多路检索信号——这是对现有"查询路由"的质变升级：从"路由 query"到"先展开 query 成草稿再检索"。
2. **与摘要树天然配合（高）**：我们已有的 LLM 章节摘要就是天然的"全局记忆"文本形态；MemoRAG 验证了全局记忆的价值不在记忆本身而在**生成检索线索**——重新定位我们摘要树的用途：不只是检索目标，还是草稿/线索生成的上下文底座。
3. **无需 KV/小模型也可复刻核心（高）**：其 KV 压缩实现绑模型，但双系统理念（轻量先验草稿 → 强模型精答）用文本中介即可实现：轻量模型（本地小模型）写草稿、云端/大模型精答，符合本地优先分层模型策略。
