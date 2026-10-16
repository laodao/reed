# Deep Research 综述: A Survey of Autonomous Research Agents（四阶段研究管线）

- 链接: https://arxiv.org/abs/2508.12752
- 作者: Wenlin Zhang, Xiaopeng Li, Yingyi Zhang, Pengyue Jia, Yichao Wang, Huifeng Guo, Yong Liu, Xiangyu Zhao（CityU HK 等）
- 发表时间: 2025-08-18
- 来源: arXiv（同主题可参照 arXiv:2506.18096 "Deep Research Agents: A Systematic Examination and Roadmap"）

## 原文摘录

### Abstract（arXiv:2508.12752，原文）

> The rapid advancement of large language models (LLMs) has driven the development of agentic systems capable of autonomously performing complex tasks. Despite their impressive capabilities, LLMs remain constrained by their internal knowledge boundaries. To overcome these limitations, the paradigm of deep research has been proposed, wherein agents actively engage in planning, retrieval, and synthesis to generate comprehensive and faithful analytical reports grounded in web-based evidence. In this survey, we provide a systematic overview of the deep research pipeline, which comprises four core stages: planning, question developing, web exploration, and report generation. For each stage, we analyze the key technical challenges and categorize representative methods developed to address them. Furthermore, we summarize recent advances in optimization techniques and benchmarks tailored for deep research. Finally, we discuss open challenges and promising research directions, aiming to chart a roadmap toward building more capable and trustworthy deep research agents.

## 核心机制拆解

Deep Research（OpenAI/Gemini Deep Research 类产品背后的范式）= **自主规划 + 迭代检索 + 综合成报**的 agent 系统。综述给出四阶段管线：

1. **Planning（规划）**：把用户模糊请求分解为研究计划——任务树/大纲（哪些子问题、查什么、顺序）。技术挑战：任务粒度控制、计划可执行性、动态重规划（研究发现要能反过来修订计划）。
2. **Question developing（问题生成）**：把大纲节点展开为具体检索 query，包括 query 分解、改写、多视角生成（同一子问题的不同问法提高召回）。
3. **Web exploration（探索检索）**：多轮"检索-读-再检索"循环；关键包括证据的广度/深度平衡、来源去重与可信度过滤、中间发现累积进工作记忆。
4. **Report generation（成报）**：证据组织（大纲驱动）、综合撰写、引用落地（claim→source 对齐）。

综述同时整理了优化技术（SFT/RL 训练研究轨迹、过程奖励）与专用基准（如 ReportBench 类生成式评测）。

**与 Agentic RAG 的关系**：Deep Research 是 Agentic RAG 的"最长形式"——目标从"答一个问题"升级为"产出一篇有引用的分析报告"，这正是我们"跨文档综合与创作辅助"的直接同构物。

## 证据与成本

- 综述无自有实验；引用的各 DR 系统（OpenAI/Gemini Deep Research、各类开源复现）在研究类基准上远超单轮 RAG，但**单任务成本是普通问答的 10-100 倍**（几十次检索 + 数十万 token 生成），耗时分钟级。
- 开放挑战：事实一致性（长报告的幻觉累积）、引用质量评测、成本控制、过程可中断/可引导（human-in-the-loop）。

## 对我们的适用性

1. **"跨文档综合"的产品蓝图就是本地 Deep Research（高）**：四阶段管线可原样映射：planning=我们的 workflow 引擎编排；question developing=多 query 生成与路由；exploration=知识库多源检索（混合检索/图谱/摘要树/学习包）替代 web；report=长文模块/研究笔记写作。我们已经拥有全部运行时组件，缺的是把它们串成"研究模式"的编排模板。
2. **研究产物沉淀回知识库形成闭环（高，差异化机会）**：云端 Deep Research 的报告是一次性的；我们可以把研究过程产物（子问题树、证据卡、综合结论）结构化沉淀进知识库（进摘要树/学习包），使"研究"变成大脑的增量学习——这是本地知识库相对云端 deep research 的独特优势。
3. **成本与时长必须分级（高）**：分钟级、10-100 倍成本的模式只能作为显式"深度研究模式"（用户主动触发、预算可设、看门狗限流）；日常问答保持轻量管线（呼应 agentic-rag-survey.md 的难度感知路由）。
4. **引用落地与我们 QA 直出对齐（中-高）**：report generation 阶段的 claim→source 对齐（与 Self-RAG 的 ISSUP、命题索引呼应）应作为我们研究模式的硬要求：每个结论带证据回链，创作工具的信任底线。
