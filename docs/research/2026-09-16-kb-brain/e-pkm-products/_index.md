# PKM 方法论与 AI 知识产品调研索引（e-pkm-products）

日期：2026-09-16 ｜ 条目：18（方法论 7 / 产品 7 / 研究工具 2 / 开放格式 2）
用途：为"知识库从 RAG 升级为大脑"提供方法论沉淀与产品机制参照（本地优先 AI 创作工具，长篇小说/短剧）。

## 汇总表

| # | 文件 | 主题 | 来源（一手） | 对我们的核心启示（一句话） |
|---|------|------|------------|--------------------------|
| 1 | [evergreen-notes-matuschak.md](evergreen-notes-matuschak.md) | 方法论：常青笔记/原子化/API 式标题/链接优于层级 | notes.andymatuschak.org | 原子卡标题=可引用论断；链接要带"为什么相关"；AI 承担 evergreen 的人工成本 |
| 2 | [zettelkasten-intro.md](zettelkasten-intro.md) | 方法论：Zettelkasten（zettelkasten.de + Luhmann 原文） | zettelkasten.de；luhmann.surge.sh | 文献笔记/永久卡两层分离；"surprise（意外联想）"是大脑 KPI；结构卡承载综合 |
| 3 | [para-tiago-forte.md](para-tiago-forte.md) | 方法论：PARA / Building a Second Brain | fortelabs.com | 按行动性组织：知识挂到当前创作项目；警惕归档冻结与"摘要≠学习" |
| 4 | [collectors-fallacy.md](collectors-fallacy.md) | 方法论：收藏家谬误（笔记失效模式） | zettelkasten.de（2014） | 入库≠学到；提炼验收标准="只靠卡片即可工作"；提炼率应是产品仪表 |
| 5 | [incremental-reading-supermemo.md](incremental-reading-supermemo.md) | 方法论：渐进阅读/知识漏斗 | supermemo.guru（Wayback） | 原文→extract→cloze→复习的管道=我们提炼管道参照；优先级调度+间隔重复 |
| 6 | [smart-notes-ahrens.md](smart-notes-ahrens.md) | 方法论：Smart Notes 三段式+标准化 | soenkeahrens.de + fortelabs 转引 | fleeting→literature→permanent 的时效由 AI 压缩；写作是思考媒介→知识调用嵌入编辑器 |
| 7 | [why-books-dont-work-matuschak.md](why-books-dont-work-matuschak.md) | 方法论：被动阅读失效（transmissionism 批评） | andymatuschak.org/books | RAG 问答仍是"传递主义"；需内建理解机制（转述/测验/复习）；"阅读即理解"为验收标准 |
| 8 | [notebooklm.md](notebooklm.md) | 产品：Google NotebookLM（2023→2026） | blog.google 三篇+支持文档 | AI 产物=可保存可编辑的卡；多文体综合模板；Audio Overview 双人对谈综合 |
| 9 | [reor.md](reor.md) | 产品：Reor 本地 AI 笔记 | github.com/reorproject | "RAG with two generators"；保存即嵌入即关联；天花板=纯相似度无边类型 |
| 10 | [smart-connections-obsidian.md](smart-connections-obsidian.md) | 产品：Obsidian Smart Connections | GitHub README | "AI 提议、人确认"的链接晋升；隐私不该是付费功能 |
| 11 | [heptabase.md](heptabase.md) | 产品：Heptabase 卡片+白板 | heptabase.com | 综合=空间排布（白板式概念图）；CLI 让 Claude Code 直接操作知识库 |
| 12 | [tana.md](tana.md) | 产品：Tana（supertag→agentic 转型） | tana.inc | 结构化输入必须自动化；"AI 只提变更，人批准"；个人 PKM 赛道在退场 |
| 13 | [capacities.md](capacities.md) | 产品：Capacities 对象化笔记 | capacities.io | 实体对象卡+实体归一是小说刚需；对象维护必须 AI 代劳 |
| 14 | [sudowrite-story-bible.md](sudowrite-story-bible.md) | 工具链：Story Bible 知识→创作（对照 Scrivener） | sudowrite.com + docs | source of truth 人机双读；槽位级联供上下文；"显式提及才注入"；系列级共享 |
| 15 | [elicit.md](elicit.md) | 研究工具：Elicit 综述自动化 | elicit.com | extraction table（矩阵+句级引用）；仿系统综述多步工作流且每步可编辑 |
| 16 | [scite-researchrabbit.md](scite-researchrabbit.md) | 研究工具：Scite 引用语境 + ResearchRabbit 图谱 | scite.ai；researchrabbit.ai | 边带语义类型（支持/反驳/提及）；句级回链；种子扩张式图漫游；MCP 化知识库 |
| 17 | [obsidian-markdown-format.md](obsidian-markdown-format.md) | 格式：wikilink/blockref/dataview | help.obsidian.md + GitHub | markdown 正文+YAML frontmatter+块级锚点=人读+机器解析的卡片基座 |
| 18 | [agent-skills-skill-md.md](agent-skills-skill-md.md) | 格式：SKILL.md 渐进披露 | platform.claude.com docs | description 即路由（何时用我）；分级加载管 token；评估先于批量生成 |

## 五条主线结论（速览）

1. **原子卡=论断式标题+双层结构（证据层/论断层）**：Matuschak 与 Anthropic SKILL.md 从两个时代独立收敛到"标题/描述即接口"。
2. **链接必须有语义类型**：Scite（支持/反驳）、Zettelkasten（为什么相关）证明无类型的相似度链接撑不起综合。
3. **结构化知识的输入端必须自动化**：Tana 转型、Capacities/Reor 的天花板、collector's fallacy 全部指向同一点——AI 自动提炼+人批准是唯一可持续路线。
4. **AI 产物必须落成可积累、可编辑的实体（卡/表/地图）**：NotebookLM 的 note、Elicit 的 table、Heptabase 的白板都是"综合结果实体化"。
5. **知识→创作的成熟机制是"结构化上下文装配"**：Sudowrite Story Bible 的槽位级联是先例，其空档（不能自动从外部资料长出 bible）正是我们的机会。

## 检索建议

- 关心提炼形态 → 1/2/4/5/15/18；关心关联机制 → 2/9/10/16/17；关心创作辅助交互 → 6/14/3/7；关心市场格局与治理 → 12/10/8。
