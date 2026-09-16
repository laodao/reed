# Reor——本地优先 AI 笔记（自动关联的极简实现）

- 链接：https://github.com/reorproject/reor （README，AGPL-3.0）
- 公司/作者：Reor Project（开源，samuelgja/社区）
- 时间：2024 初 Show HN 起活跃

## 原文摘录（保留原文不翻译，资料存档）

> "Private & local AI personal knowledge management app."

> "AI-powered desktop note-taking app" that "automatically links related notes, answers questions on your notes, and provides semantic search." "Everything is stored locally and you can edit your notes with an Obsidian-like markdown editor."

> Core hypothesis: "**AI tools for thought should run models locally**" by default.

> "**One way to think about Reor is as a RAG app with two generators: the LLM and the human.**"

> 工作机制四条：
> 1. "Every note you write is **chunked and embedded** into an internal vector database."
> 2. "Related notes are **connected automatically via vector similarity**."
> 3. "LLM-powered Q&A does **RAG on your corpus of notes**."
> 4. "Everything can be **searched semantically**."

> 技术栈："stands on the shoulders of the giants" — **Ollama, Transformers.js, and LanceDB** — "to enable both LLMs and embedding models to run locally."

> "Reor interacts directly with Ollama" ... "download and run models locally right from inside Reor" ... 可 "connect to an OpenAI-compatible API"。

> "Reor works within a single directory in the filesystem."（Obsidian 兼容 markdown vault）

> 编辑器侧栏实时展示 related notes "retrieved" from your corpus，帮助 cross-referencing ideas。

## 机制/方法论拆解（中文）

**产品机制**
- **"双生成器 RAG"**：人类写笔记+LLM 生成，共享同一个向量库——最简洁的"人机共建大脑"表述，编辑器即 RAG 前端。
- **零成本自动链接**：每次保存即 chunk+embed，侧栏按向量相似度实时推送"相关笔记"——把 Zettelkasten 里最贵的"手动找链接"变成默认背景行为。
- **全本地**：LLM（Ollama）、嵌入（Transformers.js）、向量库（LanceDB）全部在设备上，vault 是纯 markdown 目录。
- **极简取舍**：没有知识图谱 UI、没有原子化机制、没有提炼——只有"相关笔记"侧栏。

**为什么有效**：把"链接"的成本降到零，用户获得 Zettelkasten 的联想收益而无需纪律；本地=隐私卖点。

## 局限与批评

- **纯相似度链接是浅关联**：没有语义类型的边（支持/反驳/细化），无法支撑真正的综合；"related" 退化为搜索结果。
- 无提炼层：知识仍是原文堆，向量库只是检索索引，不产生原子知识——"大脑"只做到了"联想"。
- 模型本地跑在消费级硬件上质量受限；项目迭代近两年放缓（社区活跃度一般）。
- 无超文档组织（没有结构卡/地图）。

## 对我们的适用性

1. **"每次保存→chunk→embed→侧栏相关笔记"是成本最低的联想交付**，值得作为我们写作界面的基线交互（已在做，但要超越纯相似度）。
2. **"RAG with two generators"的定义值得借用作产品哲学**：知识库同时服务人（作者）与 agent（写作助手）两个消费者。
3. Reor 的天花板就是我们的差异化证明：**链接必须有类型与理由**（相关/证据/反驳/示例），提炼必须有结构（原子卡+证据）——否则只是本地 NotebookLM。
4. 本地技术栈选型可参考（Ollama+本地嵌入+LanceDB 均为成熟选择），我们的 Electron+本地优先架构与 Reor 同路。
