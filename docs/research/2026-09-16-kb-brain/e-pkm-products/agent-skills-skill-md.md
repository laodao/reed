# Anthropic Agent Skills 的 SKILL.md——面向 agent 的结构化知识卡格式范本

- 链接：https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices （原 docs.claude.com 跳转）；发布公告 https://www.anthropic.com/news/skills
- 公司：Anthropic
- 时间：2025-10 发布，文档持续更新

## 原文摘录（保留原文不翻译，资料存档）

> SKILL.md "serves as an overview that points Claude to detailed materials as needed" — "like a table of contents in an onboarding guide."

> "Keep SKILL.md body **under 500 lines** for optimal performance."

> Frontmatter "requires two fields"：
> - `name`: "Maximum 64 characters" ... "only lowercase letters, numbers, and hyphens"
> - `description`: "Must be non-empty" ... "Maximum 1,024 characters" ... "Should describe what the Skill does **and when to use it**" ... "Always write in third person"

> Claude uses the description "to **choose the right Skill from potentially 100+ available Skills**."

> **Progressive disclosure（渐进披露）**：
> 1. "At startup, only the metadata (name and description) from all Skills is pre-loaded."
> 2. "Claude reads SKILL.md only when the Skill becomes relevant, and reads additional files only as needed."
> 3. "Utility scripts can be **executed through bash without loading their full contents into context**." Only "the script's output consumes tokens."
> 4. Bundled resources carry "no context penalty until accessed."

> "**Keep references one level deep from SKILL.md**."

> 目录结构示例：`SKILL.md` + `reference.md`/`examples.md`（按需载）+ `scripts/*.py`（执行不载入）；BigQuery 示例按领域拆 `reference/finance.md`、`reference/sales.md`；文件命名要描述性（`form_validation_rules.md`，not `doc2.md`）。

> "**The context window is a public good.**" — "Only add context Claude doesn't already have."

> 命名："Prefer gerund form"（`processing-pdfs`）；自由度匹配：fragile 任务给精确命令，flexible 任务给一般性指导。

> "Create evaluations **BEFORE** writing extensive documentation."

> 迭代：two-Claude loop——"one instance (Claude A) helps author the Skill; another (Claude B) tests it on real tasks."

## 机制/方法论拆解（中文）

**格式机制：什么样的卡片"人读友好+机器高效"**
- **两段式：metadata（name+description）+ 正文（流程知识）**。description 承担**路由功能**（何时用我），正文承担**执行功能**（怎么做）——一张卡同时是"目录项"和"操作手册"。
- **渐进披露是 token 经济学**：常驻上下文的只有 metadata；正文按需载；脚本只执行不载入（输出才花 token）。**知识库天然应该是分级加载的**。
- **一页目录+一级引用**：主卡只放目录，细节拆到同级文件，避免深嵌套导致 agent 只读部分。
- **description 第三人称写"做什么+何时用"**——这就是原子卡"适用场景"字段的来历与写法规范。
- 评估先行于文档。

**为什么重要**：这是目前最大规模验证的"给 agent 的知识卡"格式（100+ skills 并存、路由靠 description），直接回答我们"机器可解析的知识卡怎么设计"。

## 局限与批评

- 为"程序性知识/操作能力"设计（如何做 X），对"陈述性知识/证据型知识"（主张+出处）没有内建字段——需要我们扩展。
- 无版本/冲突机制（skill 之间可能打架）；发现依赖 description 写作质量（文档反复警告第一人称会导致路由失败）。
- 目前生态绑定 Claude 产品（虽为开放目录格式）。

## 对我们的适用性

1. **原子知识卡 schema 直接借鉴**：`name`（kebab-case 稳定 ID）+ `description`（第三人称"是什么+何时用"，≤1024 字符，供 agent 路由）+ 正文（论断/机制/边界）+ frontmatter 字段（来源锚点、置信度、类型）——SKILL.md 是"agent 可调用知识"的最小完备格式。
2. **渐进披露三段加载应是我们知识库的默认架构**：卡目录常驻（名称+一句话）、正文按需、工具/证据脚本只执行——直接指导 agent harness 的上下文预算设计（领域学习包=多张卡+分级引用）。
3. **"description 即路由"意味着提炼质量的验收指标=检索命中率**：写卡时就要模拟"agent 在什么任务里会需要它"，这与 Matuschak 的"API 式标题"完全同构——两个社区独立收敛到同一设计。
4. "context window is a public good"应作为我们装配上下文的工程纪律：注入给写作 agent 的每条知识都要挣自己的 token。
5. 评估先行：先建"这张卡有没有被正确调用/正确引用"的评测集，再谈批量提炼——防止一次性生成上千张无人验证的卡。
