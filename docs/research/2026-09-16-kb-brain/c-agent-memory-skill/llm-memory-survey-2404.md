# 综述: A Survey on the Memory Mechanism of LLM-based Agents（写入/管理/读取三操作统一框架）

- 链接: https://arxiv.org/abs/2404.13501
- 作者: Zeyu Zhang, Xiaohe Bo, Chen Ma, Rui Li, Xu Chen, Quanyu Dai, Jieming Zhu, Zhenhua Dong, Ji-Rong Wen（人大高瓴/华为）
- 时间: 2024-04-21 v1（本领域被引最多的记忆综述之一；更新综述可参见 2025 年 "Memory in the Age of LLM Agents" 等后续工作）
- 来源: arXiv。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: ...memory mechanism, as a critical component, enabling agents to remember previous experiences and utilize this knowledge for more rational decision-making...In this survey, we systematically organize existing research and establish three operations (memory writing, memory management, memory reading) from a cognitive science perspective...

三操作统一框架：

> The agent memory module implements these phases through three operations including memory writing, memory management, and memory reading.

> **Memory Management**. Let M_{t-1}^k be the memory contents for task k before step t, and suppose m_t^k is the stored information at step t based on the above memory writing operation, then, the memory management operation can be represented by: [管理 = 对已写入内容的再组织]...Most of the memory management operations are inspired by the working mechanism of human brains. With the strong capability of LLMs to simulate human minds, these operations can help the agents to better generate high-level information and interact with environments.

> **Memory Reading**. Suppose M_t^k is the memory contents for task k at step t, c_t^k is the context of the next action, then, the memory reading operation can be represented by: [读取 = 按当前上下文取相关记忆]...careful design is required to extract useful information based on relevance and other task-orientated factors.

写入与读取的协同、文本 vs 参数的权衡：

> To some extent, the memory reading and writing operations are collaborative, and the forms of memory writing greatly influence the methods of memory reading.

> Textual form is currently the mainstream method to represent the memory contents, which is featured in better interpretability, easier implementation, and faster read-write efficiency...for parametric memory, the information can be integrated into the parameters of the LLM, eliminating the extra costs of these contexts...In a nutshell, textual memory is more efficient in writing, while parametric memory is more efficient in reading.

对代表性系统的定位（供交叉核对）：

> MemGPT considers the agent as an operating system...It designs the working context to hold recent histories, as a part of virtual context management.

> MemoryBank employs a dual-tower dense retrieval model to find related information from past conversations. Each memory entry is encoded into an embedding and subsequently indexed by FAISS to improve the efficiency of retrieval.

## 核心机制拆解（中文）

- **框架**: 记忆 = 写入（what/when/how 存）→ 管理（整合/遗忘/抽象/冲突消解，多为仿脑启发，包括 reflection 类"生成高层信息"的操作）→ 读取（相关性 + 任务导向因素的检索）三操作闭环；跨试验（cross-trial）信息可回流。
- **组织维度**: 按记忆来源（内部轨迹/外部知识）、形式（文本/参数，文本写入高效、参数读取高效）、操作（写/管/读）三维分类全部已有工作。
- **价值**: 它是给"我们要设计哪个操作环节"提供检查清单的地图——我们过去的设计投资集中在"写入"（飞轮）与"读取"（检索），**管理（整合/遗忘/冲突）是普遍被跳过的一环**，这正是综述视角下飞轮退化的结构性解释。

## 证据与局限

- 综述本身无实验；覆盖至 2024 年初的工作（MemGPT/MemoryBank/Reflexion/Generative Agents 等），未覆盖 2025 年的 Mem0/Zep/A-Mem/Memento/Agent KB（本目录其他条目已补齐）。
- "memory management 多为仿脑启发"的观察与后续发展一致：艾宾浩斯遗忘（MemoryBank）、投票淘汰（ExpeL）、边失效（Zep）、四操作合并（Mem0）、笔记演化（A-Mem）——管理操作正在从启发式走向显式操作集。
- 2025-2026 后续综述（如 Memory in the Age of LLM Agents、各 vendor 白皮书）沿用了同样的三段式或 CoALA 分类，说明该框架稳定。

## 对我们的适用性

1. **当检查清单用**: 重启知识飞轮时按"写入 / 管理 / 读取"三栏过设计——特别是管理栏必须显式列出：合并（同主题去重）、淘汰（低分/过期）、冲突消解（新旧设定矛盾）、抽象（碎片→方法论）。当年停用的飞轮大概率三栏只剩一栏。
2. **文本记忆选型被验证**: 对本地优先 + 可解释性要求，文本条目（写入高效、可人工审计、可直接渲染给用户看）优于任何参数化方案——我们的技术选型无需犹豫。
3. **写入形式决定读取方式**: 先定消费形态（怎么被 agent 用）再定存储 schema，顺序反过来必翻车。例如要支持"Agent Skills 式渐进披露"，条目就必须有独立的高质量 description 字段，而不是只有正文。
4. **诚实定位**: 该综述是地图不是弹药；具体机制请直接参考本目录各系统条目。
