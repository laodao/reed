# Why books don't work（Andy Matuschak）——被动阅读失效模式

- 链接：https://andymatuschak.org/books/ ；相关笔记 https://notes.andymatuschak.org/z2D1qPwddPktBjpNuwYFVva （"People seem to forget most of what they read"）
- 作者：Andy Matuschak
- 时间：2019（CC BY-NC 3.0）

## 原文摘录（保留原文不翻译，资料存档）

> The medium rests on the assumption that "people absorb knowledge by reading sentences" — which he calls "quite mistaken."

> "As a medium, books are surprisingly bad at conveying knowledge, and readers mostly don't realize it."

> "Most lecture attendees don't absorb the intended knowledge; most book readers don't absorb the intended knowledge. **Failure is the default here.**"

> "Books don't work for the same reason that lectures don't work" — "neither medium has any explicit theory of how people actually learn things."

> Both rest on **"transmissionism"** — "knowledge can be directly transmitted from teacher to student."

> "These skills fall into a bucket which learning science calls **'metacognition'**." ... "many adults lack them" ... the process is "quite taxing."

> "**to understand something, you must actively engage with it.**"

> Readers "struggle to absorb new material when their working memory is already overloaded"; prerequisites must be "not just familiar but **fluent, encoded in long-term memory**."

> "re-testing yourself on material you've learned over expanding intervals" cheaply builds long-term memory.

> "How might we design mediums which do the job of a non-fiction book—but which **actually work reliably**?"

> His ultimate aim: media where **"'reading' is the same as 'understanding'"**.

（相关笔记："People seem to forget most of what they read... They seem to consistently overestimate how much they're absorbing from a book."）

## 机制/方法论拆解（中文）

**核心概念**
- **Transmissionism（传递主义）批评**：书籍/讲座隐含"读者读句子即可吸收知识"的假设，认知科学不支持——理解需要主动建构（生成、组织、联系先备知识），仅"流过眼睛"不产生编码。
- **失效是默认值**：不设计"理解机制"的媒介，读者默认学不会，且**元认知错觉**让读者误以为学会了。
- **条件**：主动参与 + 工作记忆不超载 + 先备知识已流畅编码 + 间隔重测。
- **媒介设计纲领**："阅读即理解"——把认知科学内建进媒介本身（他的 Quantum Country = 书内嵌间隔重复卡）。

**为什么重要（对知识库产品）**：这条批评同样适用于"RAG 知识库"——文档入库+按需检索问答本质上仍是"传递主义"：用户问了就答，答完即忘，不产生用户侧的编码。AI 知识产品必须内建"理解机制"（提炼成可组合卡片、测验、间隔复习、写作时强制转述）。

## 局限与批评

- 聚焦非虚构学习型阅读；虚构/审美阅读目标不同，"吸收论"不适用。
- 解决方案（mnemonic medium）在长篇真实写作场景尚未验证，Orbit 采用有限。
- 对"AI 替读者编码"的路线保持警惕——Matuschak 强调编码必须发生在学习者脑中，AI 提炼可能反而剥夺生成效应。

## 对我们的适用性

1. **警惕"AI 代学"陷阱**：我们自动提炼原子知识是把编码外包给机器——对"作者写作时要用"场景成立（机器编码=机器可调用），但若目标是作者自己理解（世界观内化），仍需"讲义卡+测验+间隔复习"让人脑完成编码。两条线要分开设计。
2. **检索问答≠大脑**：产品叙事上应明确"库不是拿来查的，是拿来长的"——每次写作调用知识时强制做一次"转述/对照/反驳"的微编码动作。
3. **"阅读即理解"是终极验收标准**：我们的领域学习包如果能做到"作者读完包=掌握了该领域关键概念"，就是媒介级创新，而不仅是检索效率提升。
4. 元认知错觉警示：AI 回答的流畅性会放大"已学会"错觉——综合回答必须永远带证据溯源，让用户可核对。
