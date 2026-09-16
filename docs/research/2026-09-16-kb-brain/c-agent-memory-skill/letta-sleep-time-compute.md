# Sleep-time Compute（Letta）: 空闲期预计算与记忆重写（从 raw context 到 learned context）

- 链接: 论文 https://arxiv.org/abs/2504.13171 ；产品博客 https://www.letta.com/blog/sleep-time-compute （2025-04-21）
- 作者: Kevin Lin, Charlie Snell, Yu Wang, Charles Packer, Sarah Wooders, Ion Stoica, Joseph E. Gonzalez（Letta/Berkeley）
- 时间: 2025-04-17 论文; 2025-04-21 博客; 产品随 Letta 0.7.0 发布
- 来源: arXiv + Letta 官方博客。抓取方式: arXiv HTML 全文 + 博客原文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

定义：

> We introduce sleep-time compute, which allows models to "think" offline about contexts before queries are presented: by anticipating what queries users might ask and pre-computing useful quantities, we can significantly reduce the compute requirements at test-time...sleep-time compute can reduce the amount of test-time compute needed to achieve the same accuracy by ~5x on Stateful GSM-Symbolic and Stateful AIME and that by scaling sleep-time compute we can further increase accuracy by up to 13%...By amortizing sleep-time compute across related queries about the same context using Multi-Query GSM-Symbolic, we can decrease the average cost per query by 2.5x...finding the predictability of the user query to be well correlated with the efficacy of sleep-time compute.

> In these settings, we could in principle, make useful inferences about the current state (context) offline before, or even during the user's next input. We refer to such a process, as sleep-time compute: where inference is done between interactions with the model while it would otherwise be idle in sleep-time. In practice, this is achieved by prompting the model to generate a new context consisting of inferences about the existing context, which may be potentially useful for answering test-time queries. The re-represented context from sleep-time can then be provided in the prompt at test-time...

博客——记忆视角的表述：

> Reasoning during sleep time transforms "raw context" into "learned context", which can then be used later during test time. Compared to agents which only have access to the raw context, agents that have the opportunity to compute a learned context don't need to perform as much additional reasoning later on, since they have already thought about the material in advance.

> Sleep-time compute fundamentally requires stateful AI agents: systems that maintain memory (or context) over time. Persistent context forms the bridge that allows insights gained during sleep time to improve future capability.

双 agent 拆分（产品化架构）：

> When you create agents with this type, Letta actually creates two agents under the hood: a primary agent and a sleep-time agent...the primary agent is not provided with tools to edit its core memory...These tools are attached to the sleep-time agent, which has the ability to manage both the in-context memory of the primary agent as well as its own in-context memory.

> This approach solves a number of problems with the original MemGPT agent design...the agent may be slower (if it has to call memory operations during conversation) and potentially less reliable...Offloading memory to a sleep-time agent allows memory management to happen asynchronously. Memory formation in MemGPT is incremental, so memories may become messy and disorganized over time. Sleep-time agents on the other hand can continuously improve their learned context to generate clean, concise, and detailed memories.

模型与频率的非对称配置：

> ...it is useful to make the sleep-time agents stronger models since they are less latency constrained - for example, the conversational primary agent can use a fast model like gpt-4o-mini, while the sleep-time agent can use a larger and slower model like gpt-4.1 or Sonnet 3.7. Sleeptime agents can also be configured to run at different frequencies. The higher the frequency setting, the more tokens your agent will use: but the more time the agent will have to revise its learned context.

文档预消化（对我们最相关的用例）：

> ...you can upload a data source to your agent, and a sleep-time agent can parse it in the background, reading over the document and modifying the primary agent's memory to include all of the important findings. Importantly, the sleep-time agent modifies the memory in an "anytime" fashion - so the primary agent can read from this memory whenever, without having to wait for the sleep-time agent to finish its reasoning.

## 核心机制拆解（中文）

- **数据模型**: 主 agent 的核心记忆块（core memory blocks）由睡眠 agent 拥有写权限；睡眠 agent 产出的是"learned context"（对原始上下文的推论重表示），随写随可用（anytime）。
- **流程**: 空闲期睡眠 agent 读原始上下文/记忆 → 预判可能查询、预计算推理 → 重写/重组主 agent 的记忆块。主 agent 对话时零记忆管理开销。
- **触发时机**: 用户不在场的空闲期（可配置频率）；或在用户输入期间并行。关键：与用户交互的关键路径上绝不做提炼。
- **成本**: 把 test-time 的贵推理搬到 idle 时段摊销——同等精度 test-time 算力省 5x，跨多查询摊销再省 2.5x；睡眠 agent 可用更强（更慢更贵）的模型，因为不受延迟约束。

## 证据与局限

- 数学推理（改造的 GSM-Symbolic/AIME）+ 一个 agentic SWE 任务案例；发现最关键的边界条件：**查询可预测性与效果强相关**——用户下一步问什么越难预见，预计算越白费。
- 是合成任务与特定场景的证据，不是通用记忆基准；且睡眠期消耗的 token 是真实成本（只是从延迟敏感时段挪走了）。
- 产品层面（Letta 0.7.0 sleep-time agents）验证了工程可行性：异步、可配频、双模型非对称配置。

## 对我们的适用性

1. **直击我们飞轮的核心痛点**: "记忆增量形成会越来越乱"（MemGPT 遗留问题）与"提炼挤占交互延迟"——sleep-time 拆分一箭双雕：写路径（提炼/重组/清理记忆条目）全部放空闲期，交互路径只读。我们的 Electron 本地应用有大量用户不在写的空闲时段（挂起/后台），是天然的睡眠期。
2. **"怎么组织"的新答案——重写而非追加**: 睡眠 agent 的职责不是往库里加条目，而是持续把零散记忆改写成"clean, concise, detailed"的整块 learned context。对应我们：让后台任务定期把同主题的经验条目合并成结构化方法论文档（像人整理笔记），而不是永远追加碎片。
3. **双模型非对称配置**: 前台写作用快模型保延迟，后台提炼可用本地最强模型（本地优先反而占优——用户机器闲时跑大模型蒸馏不心疼）。
4. **可预测性判据帮我们决定提炼什么**: 用户查询可预测的场景（如"下一章继续写"会反复用到本书设定、角色弧光笔记）预消化收益最高；完全不可预测的闲聊不值得提炼。这给了"提炼什么"一个经济学过滤器。
5. **anytime 语义**: 睡眠产出渐进写入、主 agent 随时可读部分成果——我们的提炼任务应设计为可中断、增量产出，而非长事务一次性交付。
