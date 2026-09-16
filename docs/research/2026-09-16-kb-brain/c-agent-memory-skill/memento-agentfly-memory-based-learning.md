# Memento（曾名 AgentFly）: Case Bank + 案例推理（不微调的"记忆即学习"，2025 经验学习旗舰）

- 链接: https://arxiv.org/abs/2508.16153 （代码 https://github.com/Agent-on-the-Fly/Memento）
- 作者: Jiaqi Chen, Zixuan Wang, Feng Zhao 等（详见论文; 项目名 Memento, 初版标题 AgentFly: Fine-tuning LLM Agents without Fine-tuning LLMs）
- 时间: 2025-08-21 v1; v2 更名 Memento
- 来源: arXiv。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: ...our method enables low-cost continual adaptation via memory-based online reinforcement learning. We formalise this as a Memory-augmented Markov Decision Process (M-MDP), equipped with a neural case-selection policy to guide action decisions. Past experiences are stored in an episodic memory, either differentiable or non-parametric...Memento...attains top-1 on GAIA validation (87.88% Pass@3) and 79.40% on the test set...while case-based memory adds 4.7% to 9.6% absolute points on out-of-distribution tasks.

认知科学动机（四步人类学习模型）：

> We observe that humans' performance steadily improves because each experience is (i) encoded as an episodic trace, (ii) distilled into abstract rules during sleep-dependent consolidation, (iii) selectively reinforced by dopamine-driven credit assignment, and (iv) retrieved through case- or analogy-based reasoning when similar problems arise...This approach aligns with the principles of case-based reasoning (CBR), a psychologically grounded learning strategy supported by evidence that humans often solve problems by recalling analogous past situations.

三组件架构与 Case Bank：

> Memento comprises three principal components: (i) a planner, (ii) a tool-enabled executor, and (iii) a growing Case Bank that stores past trajectories as episodic memory. Instead of relying solely on the LLM's parametric memory, which is fixed after training, online case-based reasoning in Memento is implemented by storing rich episodic traces.

案例即三元组、仅成功任务写入：

> In the planning stage, Planner...receives the task instruction and queries the case memory for relevant case triplets (s_i, a_i, r_i), where s_i is the task, a_i is the plan, r_i indicates success...The retrieved cases are concatenated with the current task instruction to form the prompt, guiding the LLM to generate a plan for each subtask...If the task is unfinished, the planner replans based on updated context; otherwise, the final result is returned, and the case memory is updated with new experiences only upon task completion.

神经案例选择策略（给案例学"价值"）：

> To empower the agent to selectively leverage high-utility cases to augment planning from past experiences, we design a differential memory mechanism in Memento via a parametric Q-function...the single-step Q-learning loss...allows supervised-learning-style training of which cases help.

写入的复利效应与失败案例的价值：

> This Write operation is continuously performed throughout the agent's execution, allowing the case bank to grow into a comprehensive and transferable repository of experiences incrementally. By accumulating both successes and failures, the memory not only enables retrospective analysis for informed avoidance of past mistakes but also provides successful trajectories that prospectively guide future planning.

对相关工作版图的一段浓缩（信息量极大）：

> MemoryBank couples retrieval with an Ebbinghaus-style forgetting schedule...Mem0 adopts a structured memory mechanism with explicit operations (ADD, UPDATE, DELETE, NOOP). A-MEM maintains memory via a typological network...Several lines of work distil operational knowledge from interaction traces: ExpeL collects trajectories and converts them into reusable natural-language insights and rules; AutoGuide compresses offline logs into concise, conditional, context-aware guidelines; and Agent Workflow Memory induces frequently used subtask sequences as auxiliary skills. Finally, Agent-KB and Alita construct shared knowledge bases and optimised toolsets to support agentic problem solving.

## 核心机制拆解（中文）

- **数据模型**: Case Bank 存三元组（任务 s、计划 a、成败 r）；非参数版纯向量检索，参数版带一个在线训练的 Q 函数给"该案例对此类任务有多大帮助"打分（案例选择策略）。
- **流程**: 新任务→planner 检索 top-K 相似案例（相似度检索器或 Q 函数排序）→案例拼进 prompt 生成计划→executor 带 MCP 工具执行→子任务记忆记录中间结果→完成后才把新案例写入 Case Bank 并更新 Q 函数。
- **触发时机**: 写入 = 任务完成时（含失败任务也存，供"避坑"）；读取 = 每个任务规划时。学习信号 = 任务级成败（单步奖励，避免自举不稳定）。
- **成本**: 无梯度更新 LLM（Q 函数是个小头）；每任务增加 K 条案例的 prompt 开销。

## 证据与局限

- GAIA 验证集第一（87.88% Pass@3）；消融干净地分离了三层增益：工具（+28.8~63.3 分）> 规划（+11.0~32.5）> 案例推理（+3.7~8.2）——CBR 是稳定的增量改进而非魔法。OOD 数据集（MusiQue/Bamboogle/PopQA）上 +4.7%~9.6% 绝对提升，证明经验可迁移。
- 还发现数据污染问题：DeepResearcher 上离线执行器反超在线工具版，提示外部检索可能引入噪声。
- 局限：案例是"任务-计划"粒度的粗粒度复用；Q 函数需要成败标签（仍是判分依赖）；单步简化牺牲了跨步骤信用分配。

## 对我们的适用性

1. **"三元组最小案例格式"很实用**: （写作任务描述, 采取的方案/计划, 成败）。相比 A-Mem 的七字段笔记，这个格式抽取成本极低、够用即可检索。我们的飞轮 2.0 可以先用三元组跑起来，再逐步富化字段——避免一开始 schema 过重。
2. **"任务完成才写入"+ 失败也写入**: 与 Voyager 的"验证过才入库"一致，但补充了失败案例的独立价值（避坑检索）。我们应同时存"用户拒绝的方案"与"采纳的方案"，消费时检索同任务近邻，正反对照。
3. **Q 函数思想可降维实现**: 不训练神经网络，用统计计数（某条经验被检索后任务成功率/采纳率的变化）就能近似"案例效用分"，作为 ExpeL 式 UPVOTE/DOWNVOTE 的客观化版本——把两个机制合并成一个轻量评分。
4. **增益结构清醒剂**: 消融显示案例记忆的增益（个位数）远小于工具与规划（数十分）——对"知识库变大脑"的期望管理：记忆/经验系统是稳定的锦上添花，不是雪中送炭；先把 harness 和 structured-provider 做扎实的判断被数据支持。
