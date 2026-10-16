# Obsidian Markdown 生态格式——wikilink / block ref / dataview（人读友好+机器可解析的卡片格式基座）

- 链接：https://help.obsidian.md/Linking+notes+and+files/Internal+links ；Dataview https://github.com/blacksmithgu/obsidian-dataview （README）；frontmatter/属性 https://help.obsidian.md/Editing+and+formatting/Properties
- 公司：Obsidian（Dynalist Inc.）+ 社区插件
- 时间：2020 起，格式已成为事实标准

## 原文摘录（保留原文不翻译，资料存档）

### Internal links（官方帮助）
> "Learn how to link to notes, attachments, and other files from your notes, using internal links. **By linking notes, you can create a network of knowledge.**"

> "Obsidian supports the following link formats:
> - Wikilink: `[[Three laws of motion]]` or `[[Three laws of motion.md]]`
> - Markdown: `[Three laws of motion](Three%20laws%20of%20motion)`"
> "The examples above are equivalent... By default, due to its more compact format, Obsidian generates links using the Wikilink format. **If interoperability is important to you, you can disable Wikilinks and use Markdown links instead.**"

> "Obsidian can automatically update internal links in your vault when you rename a file."

> Link to a heading: "`[[About Obsidian#Links are first-class citizens]]`"（多级 `#` 支持子标题）

> **Link to a block**: "A block is a unit of text in your note, such as a paragraph, block quote, or list item. You can link to a block by adding `#^` at the end of your link destination, followed by a unique block identifier. For example: `[[2023-01-01#^37066d]]`."

> "You can also create **human-readable block identifiers**... Block identifiers can only consist of Latin letters, numbers, and dashes." 例：`^quote-of-the-day`

> "Block references are specific to Obsidian and **not part of the standard Markdown format.**"

> 显示文本/别名：`[[Example|Custom name]]`；"Use aliases when you want to refer to the same note using different names throughout your vault."

### Dataview（README）
> "Treat your Obsidian Vault as **a database which you can query from**"

> "a pipeline-based, vaguely SQL-looking expression language which can support basic use cases."（DQL；另有 DataviewJS = "a high-powered JavaScript API which gives full access to the Dataview index"）

> "Dataview generates data from your vault by pulling information from **Markdown frontmatter and Inline fields**." Frontmatter is "arbitrary YAML enclosed by `---` at the top of a markdown document"；inline fields: "metadata directly inline in your markdown document via `Key:: Value` syntax."

> 安全边界："Regular Dataview queries are **sandboxed** and cannot make negative changes to your vault."

## 机制/方法论拆解（中文）

**格式机制**
- **三层渐进结构**：①纯文本正文（人读）→ ②wikilink/heading/blockref（关系，`[[卡#小节#^块]]`）→ ③frontmatter YAML 字段 + inline `Key:: Value`（机器可查询数据）。
- **块级寻址**是关键创新：`^block-id` 允许链接到"段落"粒度——证据溯源的最小锚点（注意：块引用是 Obsidian 私有扩展，标准 markdown 不兼容）。
- **双链+反向链接图**：链接自动更新（重命名不断链），backlink 使链接双向免费获得。
- **Dataview 把库变数据库**：frontmatter 字段即列，DQL/JS 查询即视图；知识卡因此可按类型/字段聚合（如"列出所有 status=未消化 且 来源=PDF 的卡"）。
- 设计哲学：**互操作降级路径**——wikilink 可切标准 markdown 链接，YAML 是通用格式，笔记永远是纯文本文件。

**为什么有效**：同一份 markdown 同时服务人（写作/阅读）、图算法（链接网络）、查询引擎（结构化字段）三种消费者；社区生态（数百插件）全部建立在这个开放格式上。

## 局限与批评

- wikilink 与 blockref 非标准，跨工具迁移有损（这是 Logseq/Rem 等的痛点）。
- inline field 语法 `Key::` 侵入正文可读性；类型系统弱（无 schema 强校验，字段名易漂移——这正是 Tana supertag 想解决的）。
- Dataview 查询是只读视图，不能写回（双向同步要 Bases/DB Folder 类插件）。
- 性能：万级笔记下索引有开销。（Obsidian 2025 推出官方 Bases 试图内置此能力。）

## 对我们的适用性

1. **原子知识卡格式应"Obsidian 兼容"**：markdown 正文 + YAML frontmatter（type/来源/置信度/适用场景）+ wikilink 双链 + `^block-id` 式证据锚点——人可读、生态可迁移、agent 可解析，三层全占。
2. **证据溯源做到"块级"**：原子卡引用原文应锚到段落/句子级 ID（我们的文档解析已可产生稳定锚点），等价于 `[[doc#^s12]]`。
3. **类型化 frontmatter 是轻 schema 的甜点位**：比 Tana 全 schema 轻、比裸 markdown 强；配合我们的提炼 agent 强制字段规范，避免字段漂移。
4. **Dataview 思路=知识库的"物化视图"**：概念地图/学习包可视为查询的持久化产物，重算可刷新——与"卡片要生长"契合。
5. 警惕私有扩展锁定：核心数据模型保持可导出为标准 markdown+YAML，作为我们本地优先的诚信承诺。
