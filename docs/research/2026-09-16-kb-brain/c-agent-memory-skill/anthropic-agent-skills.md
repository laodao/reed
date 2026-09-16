# Anthropic Agent Skills: SKILL.md 与渐进披露（程序性知识的文件夹化 + 2025-2026 开放标准演进）

- 链接: 工程博客 https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills （2025-10-16）; 开放标准规范 https://agentskills.io/specification （2025-12-18）
- 作者: Barry Zhang, Keith Lazuka, Mahesh Murag（Anthropic）
- 时间: 2025-10-16（发布）; 2025-12-18（开放标准，文内注明 "Update: We've published Agent Skills as an open standard for cross-platform portability. (December 18, 2025)"）
- 来源: Anthropic 官方博客 + agentskills.io 规范。抓取方式: curl 原文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

定义与比喻：

> This led us to create Agent Skills: organized folders of instructions, scripts, and resources that agents can discover and load dynamically to perform better at specific tasks. Skills extend Claude's capabilities by packaging your expertise into composable resources for Claude, transforming general-purpose agents into specialized agents that fit your needs.

> Building a skill for an agent is like putting together an onboarding guide for a new hire...anyone can now specialize their agents with composable capabilities by capturing and sharing their procedural knowledge.

渐进披露三层：

> At its simplest, a skill is a directory that contains a SKILL.md file. This file must start with YAML frontmatter that contains some required metadata: name and description. At startup, the agent pre-loads the name and description of every installed skill into its system prompt. This metadata is the first level of progressive disclosure: it provides just enough information for Claude to know when each skill should be used without loading all of it into context. The actual body of this file is the second level of detail. If Claude thinks the skill is relevant to the current task, it will load the skill by reading its full SKILL.md into context.

> ...skills can bundle additional files within the skill directory and reference them by name from SKILL.md. These additional linked files are the third level (and beyond) of detail, which Claude can choose to navigate and discover only as needed.

> Progressive disclosure is the core design principle that makes Agent Skills flexible and scalable...Agents with a filesystem and code execution tools don't need to read the entirety of a skill into their context window when working on a particular task. This means that the amount of context that can be bundled into a skill is effectively unbounded.

代码即技能（确定性优先）：

> Skills can also include code for Claude to execute as tools at its discretion...certain operations are better suited for traditional code execution. For example, sorting a list via token generation is far more expensive than simply running a sorting algorithm. Beyond efficiency concerns, many applications require the deterministic reliability that only code can provide.

用 Claude 迭代出技能（经验沉淀的官方姿势）：

> Iterate with Claude: As you work on a task with Claude, ask Claude to capture its successful approaches and common mistakes into reusable context and code within a skill. If it goes off track when using a skill to complete a task, ask it to self-reflect on what went wrong. This process will help you discover what context Claude actually needs, instead of trying to anticipate it upfront.

> Start with evaluation: Identify specific gaps in your agents' capabilities by running them on representative tasks and observing where they struggle or require additional context. Then build skills incrementally to address these shortcomings.

对"技能资产化生态"的定义（程序性知识打包）：

> Skills provide Claude with new capabilities through instructions and code. While this makes them powerful, it also means that malicious skills may introduce vulnerabilities...We recommend installing skills only from trusted sources.

> Looking further ahead, we hope to enable agents to create, edit, and evaluate Skills on their own, letting them codify their own patterns of behavior into reusable capabilities.

开放标准规范（agentskills.io/specification）：

> A skill is a directory containing, at minimum, a SKILL.md file:
> skill-name/
> ├── SKILL.md # Required: metadata + instructions
> ├── scripts/ # Optional: executable code
> ├── references/ # Optional: documentation
> ├── assets/ # Optional: templates, resources

> name: Max 64 characters. Lowercase letters, numbers, and hyphens only...description: Max 1024 characters. Non-empty. Describes what the skill does and when to use it...Should include specific keywords that help agents identify relevant [skills]...license / compatibility / metadata / allowed-tools (Experimental).

生态演进（2025-12 开放后的行业采纳，搜索核实）: agentskills.io 发布规范与 SDK，OpenAI Codex、Microsoft Agent Framework 等相继兼容该目录格式；社区将"文件夹 + SKILL.md"视为与 MCP 互补的标准——MCP 管"工具连接协议"，Skills 管"程序性知识打包"。（来源: agentskills.io、Microsoft Learn、Unite.ai 报道，2026-09-16 检索）

## 核心机制拆解（中文）

- **数据模型**: 技能 = 文件夹（SKILL.md 必选 + scripts/references/assets 可选目录）。SKILL.md = YAML frontmatter（name ≤64 字符、description ≤1024 字符——什么场景用、含触发关键词）+ Markdown 正文。规范建议 SKILL.md 控制在约 500 行 / 5k token 内。
- **流程**: 启动时全部技能的 name+description 预载入 system prompt（常驻开销极小）→ agent 判断相关则读全文 → 再按需读引用文件。触发靠 description 里的"when to use"关键词与任务匹配。
- **触发时机**: 消费是任务驱动的（渐进披露三级）；生产（写技能）官方推荐"与 Claude 协作时让它把成功做法和常见错误沉淀进技能"——半自动、人在环。
- **成本**: 常驻成本 = 每技能几十 token 的元数据；本体零成本直到命中。代码脚本可不进上下文直接执行。

## 证据与局限

- 这是工程实践而非论文：无基准实验，证据是 2025-10 到 2025-12 即开放为跨厂商标准、2026 年被 OpenAI/Microsoft 等采纳的采用曲线——"格式极简"被验证为生态护城河。
- 局限：① 触发完全依赖 description 质量，描述差则永远不被命中（官方博客也强调要特别打磨 name/description）；② 无版本/冲突管理——多技能间指令冲突需作者自律；③ 技能仍是人写的为主，"agent 自动创建技能"在博客中仅是展望（"we hope to enable"）。
- 对 MCP 的关系：互补（MCP=连接，Skills=知识），社区已形成共识。

## 对我们的适用性

1. **这是我们"技能资产化"可直接采用的外部格式**: 领域学习包/写作方法论完全可以落成"文件夹 + SKILL.md（方法论文 + 触发描述）+ references（讲义卡）+ assets（模板）"。好处：与 Claude 生态互通、用户可手工编辑、渐进披露天然控制 token 成本——本地优先产品里技能库就是磁盘上的普通目录，零基础设施。
2. **description 是检索接口**: 三级披露的启示——我们知识库的每条"方法论/思想"资产必须有高质量的"何时用我"描述并常驻（廉价），本体按需加载。这直接回答"怎么消费"：不是 RAG 全文召回，而是元数据触发 + 按需读全文。
3. **半自动沉淀流程已被官方背书**: "让 Claude 在任务中把成功做法与常见错误捕获进技能，跑偏时让它自省"——这给了我们飞轮重启的产品形态：不是全自动后台蒸馏，而是任务收尾时 agent 提议"要不要把这次的打法存成技能卡" + 用户一键确认。审批流我们现成。
4. **评估先行**: "Start with evaluation: 先跑代表性任务找到 agent 的能力缺口，再增量建技能"——我们重启经验提炼前，应先从 agent_trajectory 统计"哪些任务类型反复失败/反复被用户改写"，从缺口出发沉淀，而不是无差别蒸馏全部轨迹（当年飞轮的错误大概率在此）。
