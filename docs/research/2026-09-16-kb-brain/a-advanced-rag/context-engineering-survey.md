# A Survey of Context Engineering for Large Language Models（上下文工程：RAG/记忆/工具/多agent 的统一框架）

- 链接: https://arxiv.org/abs/2507.13334
- 作者: Lingrui Mei, Jiayu Yao, Yuyao Ge, Yiwei Wang, Baolong Bi, Yujun Cai, Jiazhi Liu, Mingyu Li, Zhong-Zhi Li, Duzhen Zhang, Chenlin Zhou, Jiayi Mao 等（中科院自动化所等）
- 发表时间: 2025-07-17
- 来源: arXiv（分析 1400+ 篇论文）

## 原文摘录

### Abstract（arXiv:2507.13334，原文）

> The performance of Large Language Models (LLMs) is fundamentally determined by the contextual information provided during inference. This survey introduces Context Engineering, a formal discipline that transcends simple prompt design to encompass the systematic optimization of information payloads for LLMs. We present a comprehensive taxonomy decomposing Context Engineering into its foundational components and the sophisticated implementations that integrate them into intelligent systems. We first examine the foundational components: context retrieval and generation, context processing and context management. We then explore how these components are architecturally integrated to create sophisticated system implementations: retrieval-augmented generation (RAG), memory systems and tool-integrated reasoning, and multi-agent systems. Through this systematic analysis of over 1400 research papers, our survey not only establishes a technical roadmap for the field but also reveals a critical research gap: a fundamental asymmetry exists between model capabilities. While current models, augmented by advanced context engineering, demonstrate remarkable proficiency in understanding complex contexts, they exhibit pronounced limitations in generating equally sophisticated, long-form outputs. Addressing this gap is a defining priority for future research. Ultimately, this survey provides a unified framework for both researchers and engineers advancing context-aware AI.

## 核心机制拆解

Context Engineering = 把"给模型喂什么信息"从手写 prompt 升级为**系统工程学科**。综述的两层分类学：

**基础组件层**：
1. **Context retrieval / generation**（获取上下文）：检索（RAG、工具调用）或生成（自省、草稿、记忆回顾）。
2. **Context processing**（加工）：压缩（摘要/抽取式压缩）、结构化（分段、标记化、KV 级管理）、时序管理（多轮历史裁剪）。
3. **Context management**（管理）：上下文窗口的分配策略（预算管理）、隔离（多任务/多 agent 各自的上下文沙箱）、持久化（跨会话记忆）。

**系统实现层**（组件的架构组合）：
- RAG（检索+处理组合）
- 记忆系统（生成+持久化组合）
- 工具集成推理（工具=上下文获取通道，如 Search-o1）
- 多 agent 系统（上下文隔离与共享拓扑）

**关键发现（对我们最有价值）**：模型能力存在**根本不对称**——"理解复杂上下文"已很强（经上下文工程加持），但"生成同等复杂度的长文输出"仍显著薄弱。也就是说：**喂给模型的结构化信息已经远超它一次性输出的组织能力**。上下文工程的前沿应从"优化输入"转向"支撑长程生成"。

## 证据与成本

- 综述性结论（1400+ 篇文献分析），无自有 benchmark；其对 RAG 与 memory 系统的整合视角被后续工程实践（如 Anthropic 的 context engineering 博客、LangChain/LlamaIndex 的 agentic RAG 产品化）广泛印证。
- 隐含成本观：上下文 token 是稀缺资源，context 管理本质是预算分配问题（检索留多少、历史留多少、工具结果留多少）。

## 对我们的适用性

1. **给"知识库变大脑"提供了正确的抽象层级（高）**：我们做的不是"更好的 RAG"，而是给创作 agent 做上下文工程系统——知识库（检索/记忆）、长文模块（工作记忆）、学习包（结构化知识注入）、agent harness（工具通道）在 context engineering 框架下是同一个问题的组件。这个统一叙事可用于架构决策：各模块产出的最终形态都是"可控注入的上下文 payload"。
2. **"理解强/生成弱"的不对称直指创作工具的核心矛盾（高）**：用户要的是长篇创作输出（一章小说、一篇研究综述），而模型恰恰弱在这里——意味着产品的重心应放在**支撑长程生成的上下文管理**（大纲驱动的分段生成、滚动上下文、每段生成时的定向检索注入），而不是无止境优化检索精度。这直接指导我们长文模块与知识库的联动设计。
3. **上下文预算管理应成为 workflow 引擎的一等能力（中-高）**：在固定窗口内给"检索结果/前文摘要/设定卡/学习包"分配预算并动态裁剪，是本地小模型场景的硬需求；把"上下文预算"做成 workflow 节点参数，比每个功能各自拼 prompt 可维护得多。
4. **记忆系统章节可与我们的时序图谱对读（中）**：综述把 memory 视为 context 的持久化与生成组件，lw_graph_edges 的有效区间+矛盾扫描正是"带时间语义的记忆管理"，在分类学里可定位为 structured memory 实现案例。
