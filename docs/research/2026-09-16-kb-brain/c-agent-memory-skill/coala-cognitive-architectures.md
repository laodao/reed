# CoALA: Cognitive Architectures for Language Agents（LLM agent 认知架构的分类学框架）

- 链接: https://arxiv.org/abs/2309.02427 （TMLR 2024; HTML 全文 https://arxiv.org/html/2309.02427v3）
- 作者: Theodore R. Sumers, Shunyu Yao, Karthik Narasimhan, Thomas L. Griffiths
- 时间: 2023-09-05 v1; 2024-03-15 v3 (TMLR camera-ready)
- 来源: arXiv / TMLR。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: ...the field still lacks a systematic framework to organize this burgeoning space...we propose Cognitive Architectures for Language Agents (CoALA), a unified framework that describes language agents with modular memory components, a structured action space to interact with internal memory and external environments, and a generalized decision-making process...

记忆分类（Section 4.1）：

> Under the CoALA framework, language agents explicitly organize information (mainly textural, but other modalities also allowed) into multiple memory modules, each containing a different form of information. These include short-term working memory and several long-term memories: episodic, semantic, and procedural.

> **Working memory**. Working memory maintains active and readily available information as symbolic variables for the current decision cycle...CoALA's notion of working memory is more general: it is a data structure that persists across LLM calls...it serves as the central hub connecting different components of a language agent.

> **Episodic memory**. Episodic memory stores experience from earlier decision cycles. This can consist of training input-output pairs, history event flows, game trajectories from previous episodes, or other representations of the agent's experiences. During the planning stage of a decision cycle, these episodes may be retrieved into working memory to support reasoning. An agent can also write new experiences from working to episodic memory as a form of learning.

> **Semantic memory**. Semantic memory stores an agent's knowledge about the world and itself...While these examples essentially employ a fixed, read-only semantic memory, language agents may also write new knowledge obtained from LLM reasoning into semantic memory as a form of learning to incrementally build up world knowledge from experience.

> **Procedural memory**. Language agents contain two forms of procedural memory: implicit knowledge stored in the LLM weights, and explicit knowledge written in the agent's code. The agent's code can be further divided into two types: procedures that implement actions (reasoning, retrieval, grounding, and learning procedures), and procedures that implement decision-making itself...procedural memory must be initialized by the designer with proper code to bootstrap the agent. Finally, while learning new actions by writing to procedural memory is possible, it is significantly riskier than writing to episodic or semantic memory, as it can easily introduce bugs or allow an agent to subvert its designers' intentions.

决策循环（decision cycle）：

> Internal actions interact with internal memories. Depending on which memory gets accessed and whether the access is read or write, internal actions can be further decomposed into three kinds: retrieval (read from long-term memory), reasoning (update the short-term working memory with LLM), and learning (write to long-term memory).

> In each cycle, the agent can use reasoning and retrieval actions to plan. This planning subprocess selects a grounding or learning action, which is executed to affect the outside world or the agent's long-term memory. CoALA's decision cycle is analogous to a program's "main" procedure...that runs in loops continuously, accepting new perceptual input and calling various action procedures in response.

学习动作（Section 4.5，对我们最关键）：

> Learning occurs by writing information to long-term memory, which includes a spectrum of diverse procedures.

> **Updating episodic memory with experience**...added experiences in episodic memory may be retrieved later as examples and bases for reasoning or decision-making.

> **Updating semantic memory with knowledge**. Recent work has applied LLMs to reason about raw experiences and store the resulting inferences in semantic memory. For example, Reflexion uses an LLM to reflect on failed episodes and stores the results (e.g., "there is no dishwasher in kitchen") as semantic knowledge to be attached to LLM context for solving later episodes.

> **Updating agent code (procedural memory)**. CoALA allows agents to update their source code, thus modifying the implementation of various procedures...Updating reasoning (e.g., prompt templates)...Updating grounding (e.g., code-based skills). For example, Voyager maintains a curriculum library. Notably, current methods are limited to creating new code skills to interact with external environments. — Updating retrieval. To our knowledge, these learning options are not studied in recent language agents.

对 SOAR 的引述（经典认知架构启示）：

> Soar uses several types of memory to track the agent's state. Working memory reflects the agent's current circumstances: it stores the agent's recent perceptual input, goals, and results from intermediate, internal reasoning. Long term memory is divided into three distinct types. Procedural memory stores the production system itself...Semantic memory stores facts about the world, while episodic memory stores sequences of the agent's past behaviors...Most remarkably, Soar is also capable of writing new productions into its procedural memory – effectively updating its source code.

## 核心机制拆解（中文）

- **数据模型**: 记忆 = 工作记忆（当前决策周期的符号变量，跨 LLM 调用持久的数据结构）+ 三种长期记忆：episodic（轨迹/事件流）、semantic（世界与自我知识，含"从经验推理得到的新知识"）、procedural（LLM 权重内的隐性知识 + agent 代码里的显性知识：动作过程与决策过程本身）。
- **流程**: 决策循环 = planning（用 reasoning+retrieval 提议并评估候选动作）→ execution（执行 grounding 外部动作或 learning 内部写入动作）→ observation → 循环。
- **触发时机**: learning 动作由规划子过程选择——即"何时提炼"在 CoALA 里不是固定定时器，而是决策循环中的一个可选动作类别；论文强调当前多数系统只在"episode 结束后写入 episodic"这一种触发上做了文章。
- **成本**: 框架本身零成本；实践含义是：写 episodic 便宜、写 semantic 中等（需 LLM 反思）、写 procedural 最贵且最有风险（改代码可能引入 bug 或偏离设计者意图）。

## 证据与局限

- 这是定位/分类学论文（提出框架 + 用它归类约 60 个已有 agent），没有新 SOTA 实验；其价值在于给后续所有记忆系统论文提供了共同语言（Mem0/Zep/A-Mem 论文都引用它）。
- 明确指出的研究空白到 2024 年仍大体成立："Updating retrieval"（学习更好的检索过程）几乎无人做；procedural memory 的自动写入只有 Voyager 一类工作。
- 分类边界在实操中会模糊：一条"从轨迹提炼出的经验规则"到底是 semantic（知识）还是 procedural（技能），CoALA 的答案是看消费方式（被检索进 prompt = semantic；被执行 = procedural）。

## 对我们的适用性

1. **给我们的 L1-L3 提供定位语言**: 我们的 agent_trajectory ≈ episodic、structured-provider 的 KnowledgeSegment ≈ 只读 semantic、停用的知识飞轮（agent_memory_entry）≈ "从 episodic 提炼写入 semantic" 的 learning 动作。用 CoALA 视角看，飞轮停用不是因为方向错，而是当时只做了"写入"没设计好"检索消费"两端。
2. **"提炼什么"的答案**: CoALA 把"思想/方法论"对应为 semantic memory 中"由 reasoning 从 raw experience 生成的新知识"，而"技能"对应 procedural memory（可执行代码/工作流）。我们的知识库升级目标可翻译为：从只读 semantic（文档检索）扩展到 可写 semantic（方法论条目）+ 可写 procedural（沉淀为 Skill/工作流资产）。
3. **风险分级直接可用**: 写 episodic/semantic 低风险、写 procedural 高风险（"can easily introduce bugs or subvert its designers' intentions"）——正好匹配我们 harness 的审批/看门狗哲学：自动生成的方法论条目可低门槛入库，自动生成的"技能包"应走人工审批。
4. **"何时提炼"**: CoALA 的 decision-cycle 视角提示提炼不必是后台定时任务，也可以是 agent 在循环内主动选择的 learning 动作（例如任务收尾时触发一次 reflection），这对本地优先、算力受限的 Electron 环境更省。
