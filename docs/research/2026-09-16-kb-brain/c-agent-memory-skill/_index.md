# 调研索引: LLM Agent 记忆系统与经验/技能蒸馏（2024-2026 + 奠基）

- 调研日期: 2026-09-16
- 方法: WebSearch + curl（arXiv API 逐字摘要 / arXiv HTML 全文 / 官方博客原文）抓取，全部条目均含真实原文摘录（空白规范化，未翻译）。
- 用途: 知识库从"检索"升级为"大脑"——提炼思想/方法论/技能，为创作生产服务的机制调研。

## 汇总表

| # | 条目 | 主题归类 | 核心机制一句话 | 对我们最值得抄的一点 |
|---|------|---------|---------------|---------------------|
| 1 | [CoALA 认知架构](coala-cognitive-architectures.md) | 认知架构/奠基 | 工作记忆 + episodic/semantic/procedural 三长期记忆 + 决策循环中的 learning 动作 | "从轨迹提炼的规则=semantic；沉淀为可执行资产=procedural"的定位语言；写 procedural 风险高应走审批 |
| 2 | [MemGPT/Letta 虚拟上下文](memgpt-letta-virtual-context.md) | 记忆系统/奠基 | OS 式 main/external context 分级 + LLM 函数调用搬数据 + 70%/100% 两段溢出控制 | 70% 水位预警让 agent 自救、100% 递归摘要 flush；原始数据永不删（non-lossy） |
| 3 | [Mem0 抽取合并管线](mem0-memory-extraction-pipeline.md) | 记忆系统/2025 | extraction（摘要+近讯+新消息→候选事实）→ update（ADD/UPDATE/DELETE/NOOP 四操作裁决） | 四操作集（尤其 NOOP）+ 冲突时"标记失效而非物理删除"；但基准数字有争议 |
| 4 | [A-Mem Zettelkasten](a-mem-zettelkasten-agentic-notes.md) | 记忆系统/2025 | 笔记 = {原文,时间,关键词,标签,上下文描述,向量,链接}；写入即建链+旧卡演化 | 原子性卡片 schema + 向量初筛/LLM 精判两层链接；演化需加版本而非原地替换 |
| 5 | [MemoryBank 遗忘曲线](memorybank-ebbinghaus-forgetting.md) | 记忆系统/2023-24 | 记忆强度随时间衰减、被回忆则强化；日级 insight→全局画像两级聚合 | 检索分数乘"最近消费时间"衰减因子；两级（会话级→全局）聚合模板 |
| 6 | [Zep/Graphiti 时序知识图谱](zep-graphiti-temporal-knowledge-graph.md) | 时序图谱/2025 + 论战 | episode→entity→community 三层图 + 双时间线 + 边失效（新信息优先） | 四时间戳/软失效的"设定演变史"；论战元教训：记忆系统必须自带评测集 |
| 7 | [Generative Agents 反思流](generative-agents-reflection.md) | 反思提炼/奠基 | 观察→1-10 重要性打分→累计超阈值触发两段式反思（先提问再带引用总结）→反思树 | "重要性账户"定提炼时机；insight 必须带证据指针（because of 1,2,8,15） |
| 8 | [Reflexion→ExpeL 经验学习](expel-reflexion-experiential-learning.md) | 反思提炼/奠基 | 言语反馈存记忆；跨任务经验池 + insight 的 ADD/UPVOTE/DOWNVOTE/EDIT 投票演化 | 失败/成功对照对提炼；计数归零自动淘汰——飞轮自洁的最小机制 |
| 9 | [Voyager 技能库](voyager-skill-library.md) | 技能资产化/奠基 | 描述嵌入为 key、可执行代码为 value；自验证通过才入库；技能可复合 | 验证信号（用户采纳）决定入库资格；"写成通用可复用"的提炼约束 |
| 10 | [Anthropic Agent Skills](anthropic-agent-skills.md) | 技能资产化/2025-26 | 文件夹+SKILL.md；渐进披露三级（元数据常驻→按需读全文→按需读附件）；2025-12 开放标准 | 直接采用其目录格式做我们的技能/学习包资产；description 即检索接口 |
| 11 | [Letta Sleep-time Compute](letta-sleep-time-compute.md) | 2025-26 新范式 | 空闲期把 raw context 重写为 learned context；双 agent（对话/记忆管理）拆分 | 提炼全部搬离交互关键路径；后台用更强模型重写整理而非追加 |
| 12 | [Memento（AgentFly）案例学习](memento-agentfly-memory-based-learning.md) | 2025-26 经验学习 | Case Bank（任务,计划,成败）三元组 + 神经案例选择策略；任务完成才写入 | 三元组最小案例格式；案例效用分（Q 值思想的统计降维版） |
| 13 | [Agent KB 共享经验库](agent-kb-cross-domain-experience.md) | 2025-26 经验学习 | workflow 级/step 级双粒度经验 + student(规划时)/teacher(出错时)双相检索 + disagreement gate | 先推理后检索（用思路而非表面词查）；执行出错才查修错诀窍 |
| 14 | [AI Scientist idea 档案](ai-scientist-idea-archive.md) | 方法论提炼 | idea 档案（描述+计划+三维分）条件生成新 idea；查重过滤；评审分回流 | "点子库"资产层 + 分数回流闭环（飞轮缺的最后一环） |
| 15 | [LLM Agent 记忆综述](llm-memory-survey-2404.md) | 综述/地图 | 记忆 = 写入/管理/读取三操作统一框架；文本写入高效、参数读取高效 | "管理"（合并/淘汰/冲突/抽象）是被普遍跳过的一栏——飞轮退化诊断书 |

## 主题覆盖对照（对任务清单）

- 认知架构（CoALA / SOAR/ACT-R 启示）→ 条目 1（内含 SOAR 记忆/学习原文）
- 记忆系统（MemGPT/Letta、Mem0、A-Mem、MemoryBank、sleep-time）→ 条目 2、3、4、5、11
- 时序图谱（Zep/Graphiti、vs Mem0 论战）→ 条目 6（含双方原文）
- 反思与经验提炼（Generative Agents、Reflexion、ExpeL、Voyager）→ 条目 7、8、9
- 技能资产化（Anthropic Skills、生态 2025-26）→ 条目 10
- 2025-26 新工作（AgentFly/Memento、AgentKB、survey、sleep-time、写入/遗忘/冲突策略）→ 条目 11、12、13、15（遗忘/冲突策略散见于 3/4/5/6/8）
- 方法论提炼/隐性经验显性化 → 条目 14（及 8/12/13）

## 横向收敛（多来源独立收敛到同一设计，可信度最高）

1. **淘汰/冲突裁决必须与写入同在**: ExpeL 投票计数、Mem0 四操作、Zep 边失效、Memento 案例效用——四个独立来源全部包含"旧条目可被否决/失效"机制。ADD-only 的记忆库必然退化。
2. **验证/成败信号是入库门槛**: Voyager 自验证、ExpeL 成败对、Memento 完成才写入、AI Scientist 评审回流。
3. **提炼时机避开交互关键路径**: sleep-time（空闲期）、ExpeL（离线批）、Generative Agents（重要性阈值）、Memento（任务完成时）——没有一家在对话中途做重提炼。
4. **消费决定组织**: 渐进披露（Skills）、两级粒度（Agent KB）、检索带引用（Generative Agents/ExpeL fewshot）——schema 由消费方式倒推。
