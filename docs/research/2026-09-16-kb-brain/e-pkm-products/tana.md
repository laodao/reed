# Tana——从 supertag 大纲到"agentic meeting platform"（2025-2026 转型）

- 链接：https://tana.inc/ （现行产品）；Tana Outliner（旧 PKM 产品）已迁至 outliner.tana.inc
- 公司：Tana（迅捷发展后 2025 重定位）
- 时间：Outliner 约 2020-2024；2025 起转型 agentic meeting platform

## 原文摘录（保留原文不翻译，资料存档）

> "Tana is an **agentic meeting platform**. Work gets done in the meeting, not after."

> "a workspace where your team, your agents, and your shared context come together" — "Agents create documents, file issues, and update your context graph while you talk."

> "Not to be confused with **Tana Outliner**, the company's separate, earlier note-taking outliner."（旧产品 "a tool built on Supertags, nodes, daily notes, or infinite outlining"，2020-2024，现更名迁移）

> "**The context graph is your organizational memory**" — types "explicitly state that something is a thing — a person, company, task, bug, decision"

> Types "give your documents a **defined set of fields**."

> "Search searches text as written, and **turns a sentence into filters** when you ask it to."

> "The AI agents have access to **all the same tools as human participants** in Tana."

> Safety model: "**AI never changes anything without approval. Every change is a proposal you review first**."

## 机制/方法论拆解（中文）

**核心概念（两代产品对照）**
- **旧 Tana（2020-2024）**：supertag=结构化节点类型。任何 node 可打上 supertag，即刻获得 schema（字段、视图、引用）——**笔记从"页面"进化为"带类型的对象"**，查询、聚合、看板都建立在类型系统上。这是"结构化知识卡"在 PKM 里的最完整实现。
- **新 Tana（2025-2026）**：知识图谱不再是编辑器，而是 **"organizational memory（组织记忆）"**——会议进行中 agent 实时从对话抽取结构化对象（决定/任务/bug），写入 context graph。自然语言一句自动变查询过滤器（"turns a sentence into filters"）。
- **治理原则**：AI 的任何写操作都是 proposal，人批准才生效。

**为什么有效/为什么转型**：结构化对象的维护成本在个人场景始终太重（用户要自己建 schema、打 tag），Tana 最终把这套结构化技术转向"会议转录→自动结构化"——**用高带宽对话喂结构，而非靠人手动维护**。这是 PKM 市场的重要信号：结构化的输入端必须自动化。

## 局限与批评

- 转型后不再服务个人 PKM 用户；旧 Outliner 用户被迁移，社区不满。
- 会议场景化后与"长期知识生长"的目标弱化（会议记忆≠知识大脑）。
- 闭源、云端（本地优先缺失）。

## 对我们的适用性

1. **最强启示：结构化知识的输入必须自动化**。Tana 十年验证了"人手动维护结构化笔记"走不通，最终靠"对话/文档→自动抽取对象"续命——我们"入库文档自动提炼原子知识"正是在正确的方向上，且我们有 agent harness 可承担抽取。
2. **"AI never changes anything without approval——every change is a proposal"** 应作为我们大脑写操作的默认治理模型（提炼卡=提议，作者批准入库；反驳/修订也是提议）。
3. **supertag 的 schema 思想可复用为"知识卡类型系统"**：概念卡/论断卡/方法卡/事件卡各有字段 schema（来源、置信度、适用场景），Dataview 式查询才有基座。
4. "把一句话变成查询过滤器"是知识库问答→精确检索的好交互（NL→结构化查询），值得做。
5. 转型本身是竞争情报：个人 PKM 赛道大玩家在退场/转向，"创作专用大脑"的定位空间在变大。
