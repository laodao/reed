# Evergreen notes（Andy Matuschak）

- 链接：https://notes.andymatuschak.org/Evergreen_notes（另见 https://notes.andymatuschak.org/Evergreen_note_titles_are_like_APIs 、https://notes.andymatuschak.org/Prefer_associativity_over_hierarchy_or_categorization_in_note-taking_systems）
- 作者：Andy Matuschak（前 Khan Academy / MIT Press 研究者）
- 时间：持续维护的 working notes（约 2019 起）

## 原文摘录（保留原文不翻译，资料存档）

> **Evergreen notes** are written and organized to evolve, contribute, and accumulate over time, across projects. This is an unusual way to treat notes: most people treat notes as a scratchpad... In my practice, notes aren't a record or inventory of my thinking; **they're my thinking** — the notes themselves are part of my thinking, my scholarship, my output.

> Contrast this with the way most people take notes: dozens or hundreds of "word salad" scraps, never to be reviewed. This may be fine for a scratchpad, but if you're writing to think, that approach leaves a great deal on the table.

> **Evergreen note titles are like APIs.** ... titles like "Chris Argyris double loop learning" may be fine for a Wikipedia entry, but they're poor names for one's own ideas about self-understanding. Thoughtful titles are precise enough to be "slippery" in Zach's sense of a "slippery concept", so I prefer titles like "Premature optimization is prioritizing the wrong abstraction"... When titles function as an API, they allow ideas to be referenced and composed.

> One of the most important activities in knowledge work is **writing to think**... but writing in most contexts is quite public, and its ideas are often embedded in narratives... In contrast, evergreen notes are atomic: they're meant to represent a single complete idea.

> I do my best to write **atomic, concept-oriented notes**... they're titled as concise phrases which may be composed into sentences (see Evergreen note titles are like APIs). Writing atomic notes makes it possible to accumulate ideas over time, since they can be referenced and combined.

> **Prefer associativity over hierarchy or categorization in note-taking systems**: Associative links describe relationships between concepts; taxonomies describe relationships between sets... When notes are atomic and concept-oriented, links provide the mechanism for thoughts to be composed and combined.

> Evergreen notes should be **concept-oriented**: many notes are titled as questions (e.g. "What's the difference between X and Y?"), but titles are better phrased as declarative concepts... so that they may be easily referenced... and connected to other ideas.

> Notes should be accumulated over time, revised, and linked together as understanding evolves... The point of writing evergreen notes is not to capture thoughts but to develop them iteratively.

（注：摘录综合自上述三个 evergreen 系列笔记页，措辞以 notes.andymatuschak.org 原文为准；部分长句用省略号截断。）

## 机制/方法论拆解（中文）

**核心概念**
- **Evergreen（常青）**：笔记不是"捕获"（capture）而是"发展"（develop）。写下来只是第一步，笔记的价值来自后续不断的修订、链接、合并、拆分——"生长"而非"堆放"。
- **Atomic（原子化）**：一张卡片 = 一个完整、独立成立的想法。这是可组合性的前提。
- **Concept-oriented（面向概念）**：标题写成"可被引用的陈述句"（像 API 名），而不是问题式或资料式标题。例如不写"X 与 Y 的区别"，而是写"过早优化是优先级错误的抽象"。
- **API 式标题**：让卡片能像函数调用一样被"引用与组合"。标题本身是知识的接口。
- **Associativity over hierarchy（链接优于分类）**：用关联链接描述概念之间的关系，而不是用目录/分类树。分类描述的是"集合的关系"，链接描述的是"想法的关系"。
- **Writing to think**：笔记即思考本身，不是思考的记录。

**工作流**
1. 阅读中获得想法 → 用自己的话重写成一条原子卡片（不允许摘抄）
2. 标题即论断，写成可组合的短语
3. 主动寻找已有卡片建立双向链接，并在链接处写"为什么相关"
4. 定期回访、修订旧卡片，让旧卡片与新增理解碰撞
5. 写文章/做项目时，从卡片网络中"长出"大纲，而不是从零起草

**为什么有效**：可组合性（原子+API 标题+链接）让想法能复利积累；强制转写（用自己的话）是生成效应（generation effect）的应用；常青修订对抗遗忘。

## 局限与批评

- Matuschak 自己承认维护成本高：每条笔记都要"写好标题、找链接、迭代修订"，对多数用户太重。
- Evergreen 理想与人的惰性冲突：实践中大量人只留下一堆"未常青"的卡片。
- 概念性知识（非虚构、研究型）适配最好；叙事性/情感性知识（如小说设定）如何"原子化"没有答案。
- 单机个人库缺乏可分享性，Matuschak 通过公开笔记网站部分解决。

## 对我们的适用性

1. **"提炼原子知识"直接对应 evergreen 原则**：我们入库文档自动提炼的原子卡片，标题应写成"可引用的论断句"而非"主题词"，这决定卡片能否被后续综合引用——落地为提炼 prompt 的硬约束。
2. **链接处必须带"关系语义"**：光有 related-note id 不够，应在每次关联时生成"为什么相关"一句话，供 agent 做跨文档综合时读取——相当于给边加权/命名。
3. **卡片要有版本与"修订"概念**：知识"大脑"应支持原子卡被后续文档反驳/补充时演化（补充证据、标注冲突），而不是一次提炼定终身。
4. **写小说时"从卡片长出大纲"是现成交互范式**：创作侧的"知识调用"可以直接做成"从原子卡网络生成章节论证/情节逻辑链"，与 agent harness 结合。
5. 注意：evergreen 的人工成本正是我们的机会——AI 自动完成"转写/找链接/提议合并"，人只做确认。
