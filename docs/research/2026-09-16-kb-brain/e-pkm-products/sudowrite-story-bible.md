# Sudowrite Story Bible——"知识库辅助创作"的先行产品形态（附 Scrivener 背景）

- 链接：https://www.sudowrite.com/ ；文档 https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC ；博客 https://sudowrite.com/blog/story-bible-template/
- 公司：Sudowrite
- 时间：Story Engine 2022-2023；Story Bible 持续演进至 2025

## 原文摘录（保留原文不翻译，资料存档）

> "Story Bible takes you step-by-step from idea, to outline, to beating out chapters, to 1,000s of words, in your style."

> Write 工具："It **analyzes your characters, tone, and plot arc** and suggests the next 300 words in your voice." — "like autocomplete on steroids."

> Canvas 工具："will suggest alternate plot points, character secrets, and plot twists with you."

> What is Story Bible（文档）："Story Bible **gathers the core elements of your story in one place so that you and Sudowrite's AI can reference them** as you develop your work." 双重目的：keeping you organized 与 "**Keep the AI on track**" — "**a source of truth that both you and the AI can refer back to later.**" 每个项目一份，**persistent across documents**。

> 上下文级联（文档）：
> - **Braindump** — "the starting point of Story Bible"，手动想法池；喂 Synopsis 生成。
> - **Genre** / **Style** — 影响 Synopsis、Outline、Scenes 与 "both Beat and Prose Generation in Draft"。
> - **Synopsis**（由 Braindump+Genre 生成）— "influences the generation of Characters, Worldbuilding, Outline, and Scenes."
> - **Characters** / **Worldbuilding**（由 Synopsis 派生，Worldbuilding 有 "smart import ... from existing text"）— 喂 Outline、Scenes、Draft。
> - **Outline** — "directly informs Scene generation."
> - **Scenes** — "directly influence Prose Generation in Draft."
> - 一致性边界：prose/scene 生成 "will **only look at explicitly mentioned** Characters and Worldbuilding elements."

> 博客："Sudowrite's Story Bible **stays persistent across your entire project**. The Write feature remembers **up to 20,000 words of your story plus all your Story Bible context**."

> Series Support：Story Bible 数据在同一 folder 层级的项目间共享，"keeping characters and worldbuilding consistent across a series."

（背景对照：Scrivener 传统上是 binder+research folder——作者手工把 PDF/图片/笔记拖进 Research 区，写作时分屏参考，AI 出现前"知识库辅助写作"=手动文件夹+分屏。）

## 机制/方法论拆解（中文）

**"知识→创造"的机制**
- **Story Bible = 结构化上下文仓**：把小说知识切成固定槽位（Genre/Style/Synopsis/Characters/Worldbuilding/Outline/Scenes），**每个槽位都是生成下游的输入**——上下文不是"检索出来的"，而是"按依赖关系级联供给的"（Braindump→Synopsis→Characters/World→Outline→Scenes→Prose）。
- **Source of truth 双消费**：同一份结构既服务作者组织，也服务 AI grounding——这正是我们"知识库=作者与 agent 共享的大脑"的先例。
- **选择性注入的显式边界**：只有"显式提及"的 Character/World 元素进入生成——作者通过"在场景里点名"控制知识注入，模型不乱拿。
- **持久化+窗口**：全项目持久 + 最近 2 万字工作记忆；系列级共享保证跨书一致。
- **从粗到细的生成漏斗**：idea→outline→beats→scenes→prose，每一层都是上一层的"知识展开"。

**为什么有效**：解决了长篇 AI 写作的根本矛盾（上下文有限 vs. 设定庞杂）——把"知识"压缩进结构化槽位而非塞原文。

## 局限与批评

- Story Bible 槽位是**手工填充/半自动**：作者仍要自己写 synopsis、建角色卡；没有"从任意资料自动建脑"的能力（smart import 仅限从已有正文抽取）。
- 20k 词记忆窗口硬限制；无真正的知识图谱/RAG——一致性靠槽位而非检索。
- 生成质量受槽位写作质量制约（"garbage in"问题）；风格/逻辑冲突检测弱。
- 云端订阅，本地优先缺失；长篇系列的深度一致性（时间线/伏笔管理）仍靠人脑。

## 对我们的适用性（本条目与我们最直接相关）

1. **"槽位化上下文级联"应升级为"知识图上下文装配"**：Sudowrite 证明固定槽位有效；我们的差异是把槽位背后的来源换成自动提炼的原子知识网络——写作时 agent 按场景需要从图里装配上下文（而非人工填槽）。
2. **"source of truth，both you and the AI"** 是产品原则级借鉴：知识卡必须人机双读——这决定我们的卡片格式（人读正文+机器读 frontmatter）。
3. **"显式提及才注入"是防串味的交互模式**：作者在场景中点名设定元素（或由 agent 提议点名），用户可审——比全自动 RAG 更可控，可作为我们注入策略的默认层。
4. 系列级知识共享（跨项目 Story Bible）直接对应我们"领域学习包跨书复用+世界观连续性"需求。
5. 空档=机会：Sudowrite 不能吸收外部研究资料自动长出 Story Bible；我们的"入库→提炼→装配"正是补这条链。
