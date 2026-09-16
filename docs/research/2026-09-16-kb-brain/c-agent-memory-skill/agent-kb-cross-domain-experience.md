# Agent KB: 共享经验库与师生双相检索（Reason-Retrieve-Refine；跨框架经验复用）

- 链接: https://arxiv.org/abs/2507.06229 （ICML 2025 Workshop 认可）
- 作者: Xiangru Tang, Tianrui Qin, Tianhao Peng, Ziyang Zhou 等（UIUC/哥大等 20 人团队）
- 时间: 2025-07-08 v1; 2025-10-27 更新（即检索任务中提到的 "AgentKN/Agent-KB" 一系工作）
- 来源: arXiv。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: AI agent frameworks operate in isolation, forcing agents to rediscover solutions and repeat mistakes across different systems...We introduce AGENT KB, a universal memory infrastructure enabling seamless experience sharing across heterogeneous agent frameworks without retraining. AGENT KB aggregates trajectories into a structured knowledge base and serves lightweight APIs. At inference time, hybrid retrieval operates through two stages: planning seeds agents with cross-domain workflows, while feedback applies targeted diagnostic fixes. A disagreement gate ensures retrieved knowledge enhances rather than disrupts reasoning, addressing knowledge interference in cross-framework transfer...compared to baseline pass@1, smolagents with AGENT KB achieve up to 18.7pp gains at pass@3 (55.2% -> 73.9%), while OpenHands improves 4.0pp on SWE-bench pass@1 (24.3% -> 28.3%)...automatically generated experiences matching manual curation.

双粒度知识 + 先推理后检索：

> Agent KB first engages agents in preliminary reasoning about the problem, directing subsequent experience retrieval to relevant solution patterns rather than just matching surface features. We design a novel teacher-student dual-phase retrieval mechanism: student agents first retrieve workflow-level patterns to structure their approach, while teacher agents subsequently identify specific execution patterns to refine implementation details.

Reason-Retrieve-Refine 三循环：

> As shown in Figure 2, Agent KB consists of two main phases: Agent KB construction and Agent KB enhanced inference...when facing a new task, an execution agent performs the actual task solving while two additional agents, a student agent and a teacher agent, implement our novel Reason-Retrieve-Refine pipeline. These auxiliary agents retrieve relevant experiences from Agent KB and adaptively refine them to provide targeted guidance...

> In this architecture, the execution agent performs the actual task solving, while the student agent retrieves workflow-level experiences to provide initial strategic guidance, and the teacher agent analyzes execution trajectories to identify errors and retrieve step-level experiences for refinement.

知识是被适配而非照抄：

> The student then refines these workflows by integrating them with initial reasoning to create and execute a structured plan...Knowledge is dynamically adapted rather than directly copied, enabling effective transfer even between dissimilar domains.

## 核心机制拆解（中文）

- **数据模型**: 双层知识——workflow 级（高层策略：这类问题该怎么打）+ step 级（执行细节：这步该怎么修）。从原始执行日志中离线抽取泛化经验，聚合成结构化库 + 轻量 API。
- **流程**: 构建期——多框架执行日志 → 抽取可泛化经验入 KB。推理期——三 agent 协作：executor 干活；student 先自主推理再检索 workflow 级经验定打法；teacher 监视执行轨迹、发现错误时检索 step 级经验做定向修复。
- **触发时机**: student 在规划时检索（前置）；teacher 在执行出错时检索（后置、诊断式）。disagreement gate 在知识与此刻推理冲突时拒收，防止检索知识干扰推理（知识干扰门控）。
- **成本**: 每任务额外两个辅助 agent 的推理与检索调用；离线构建期一次性抽取成本。

## 证据与局限

- GAIA / HLE / GPQA / SWE-bench 上跨 smolagents、OpenHands、OWL 等框架与多模型家族验证；消融确认 hybrid 双相检索缺一不可；最有意思的结论：**自动生成的经验与人工策展的经验效果相当**。
- 局限：经验库本身的质量治理（错误经验入库会污染共享层）论文着墨不多；三 agent 编排成本对简单任务是负收益（需要任务足够难）。
- 与 Memento 的区别：Memento 是单 agent 私有案例库（在线生长），Agent KB 是跨 agent/跨框架的共享层（离线聚合 + 推理期两相消费）。

## 对我们的适用性

1. **双层粒度直接对应我们的双资产**: workflow 级经验 = 方法论/打法卡（怎么策划一章的高潮），step 级经验 = 具体修错诀窍（如"时间线矛盾时先查第 3 章的日记道具"）。一张卡片别混两层——这是"提炼什么"的粒度切分标准。
2. **student/teacher 分相消费**: 规划时检索打法、执行出错时才检索修错诀窍——比一次性把所有相关经验塞进 prompt 更省 token 且更准。我们的 harness 看门狗事件（工具失败、审批拒绝）正是 teacher 相的天然触发器。
3. **"先推理后检索"（Reason-Retrieve）**: 先让 agent 自己想，再按思路（而非表面相似）检索经验——显著减少"表面关键词匹配拉错卡片"。我们做记忆检索时应把当前计划/思路的嵌入（而非原始任务描述）作为查询，Voyager 也是这么做的（用 task plans 查询）。
4. **disagreement gate 值得抄**: 检索到的旧经验与当前推理冲突时不采纳。写作用户个体风格差异大，"别人的方法论"未必适用此作者——门控 + 引用呈现（供参考而非强制）是更尊重创作者的消费姿态。
5. **"自动经验 ≈ 人工策展"是最鼓舞的结论**: 意味着从轨迹自动提炼经验的质量上限足够高，值得我们投入做管线。
