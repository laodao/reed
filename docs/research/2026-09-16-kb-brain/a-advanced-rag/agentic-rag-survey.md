# Agentic RAG 综述: A Survey on Agentic RAG（2025，范式分类学）

- 链接: https://arxiv.org/abs/2501.09136 （代码/资源: https://github.com/asinghcsu/AgenticRAG-Survey）
- 作者: Aditi Singh, Abul Ehtesham, Saket Kumar, Tala Talaei Khoei, Athanasios V. Vasilakos
- 发表时间: 2025-01-15
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2501.09136，原文）

> Large Language Models (LLMs) have advanced artificial intelligence by enabling human-like text generation and natural language understanding. However, their reliance on static training data limits their ability to respond to dynamic, real-time queries, resulting in outdated or inaccurate outputs. Retrieval-Augmented Generation (RAG) has emerged as a solution, enhancing LLMs by integrating real-time data retrieval to provide contextually relevant and up-to-date responses. Despite its promise, traditional RAG systems are constrained by static workflows and lack the adaptability required for multi-step reasoning and complex task management. Agentic Retrieval-Augmented Generation (Agentic RAG) transcends these limitations by embedding autonomous AI agents into the RAG pipeline. These agents leverage agentic design patterns reflection, planning, tool use, and multi-agent collaboration to dynamically manage retrieval strategies, iteratively refine contextual understanding, and adapt workflows through operational structures ranging from sequential steps to adaptive collaboration. This integration enables Agentic RAG systems to deliver flexibility, scalability, and context-awareness across diverse applications. This paper presents an analytical survey of Agentic RAG systems. It traces the evolution of RAG paradigms, introduces a principled taxonomy of Agentic RAG architectures based on agent cardinality, control structure, autonomy, and knowledge representation, and provides a comparative analysis of design trade-offs across existing frameworks. The survey examines applications in healthcare, finance, education, and enterprise document processing, and distills practical lessons for system designers and practitioners. Finally, it identifies key open research challenges related to evaluation, coordination, memory management, efficiency, and governance, outlining directions for future research.

## 核心机制拆解

综述的核心贡献是一套 Agentic RAG **分类学**（taxonomy），四个正交维度：

1. **Agent cardinality（agent 数量）**：单 agent（一个路由/反思者管全部工具）→ 多 agent（专业分工：规划 agent、检索 agent、验证 agent、写作 agent）。
2. **Control structure（控制结构）**：顺序（sequential pipeline，固定 DAG）→ 条件路由（router，按 query 意图分流工具）→ 自适应（orchestrator-worker，动态拆解任务派发）→ 去中心化（peer 协作）。
3. **Autonomy（自治度）**：从"每步人批"到"目标驱动自主循环"。
4. **Knowledge representation（知识表示）**：纯向量 → 结构化（KG/层级摘要）→ 混合。

综述强调的 agentic 设计模式：**反思（reflection）、规划（planning）、工具使用（tool use）、多 agent 协作**——Agentic RAG = 把这四种模式装进检索管线，使"检索策略本身"成为可被 agent 动态管理的东西（改写 query、换工具、决定迭代次数、自评结果再补检）。

典型形态谱系（对我们最有参考价值的部分）：
- Router RAG（单 agent + 条件路由）：最轻，接近我们现状的下一步。
- Multi-agent RAG（规划者/检索者/批评者分离）：适合"深度研究"场景。
- 自适应 RAG（按问题难度决定检索轮次）：效果/成本动态平衡。
- Graph/Agentic 融合（知识表示维度引入 KG）：与我们图谱资产对应。

## 证据与成本

- 综述本身无新实验；其价值是组织了 2023-2025 的散点工作（含医疗/金融/教育/企业文档处理案例），并指出开放挑战：**评测（agentic 流程难评）、协调开销、记忆管理、效率、治理**。
- 隐性成本警示：agent 化会让单次问答的 LLM 调用从 1 次涨到 5-20 次；综述把"efficiency"列为开放问题即源于此——需要难度感知的路由（简单问题不过 agent 层）。

## 对我们的适用性

1. **我们已有一半基础设施（高）**：agent harness（工具循环/审批/看门狗）+ workflow 引擎正是 Agentic RAG 的运行时；缺的只是把"知识库检索"注册为一等工具集（混合检索/图谱查询/摘要树查询/学习包查询各自成工具），让 agent 按需调用与迭代——这是从"管线"到"agent"最小改造路径。
2. **分类学直接指导我们的架构选型（高）**：按四个维度定位——单 agent + 条件路由起步（日常问答不涨成本），"研究模式/跨文档综合"再升级 orchestrator-worker（规划-检索-验证-写作分工）；自治度受审批机制约束（本地优先 + 用户可控是我们的差异化卖点）。
3. **难度感知路由是成本安全阀（高）**：综述反复强调效率问题；我们的看门狗（循环上限/token 预算）与查询路由结合，可以实现"简单事实 1 跳、复杂综合多跳"的自适应深度，避免 agentic 化后成本失控。
4. **教育场景案例与领域学习包同构（中-高）**：综述教育章节的 tutor-agent 模式（按学习者掌握度调整检索与讲解）与我们学习包的掌握度模型直接对接，可作为产品功能参考。
