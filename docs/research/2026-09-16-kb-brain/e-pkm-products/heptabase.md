# Heptabase——卡片+白板的空间化研究工作台

- 链接：https://www.heptabase.com/ （2025-2026 版官网）；学习指南 https://www.heptabase.com/learn/
- 公司：Heptabase（Alan Chan 等）
- 时间：2021 起；2024-2025 转向 "research + AI learning" 定位

## 原文摘录（保留原文不翻译，资料存档）

> "Master anything you learn. Do your best research with AI."

> "an intelligent, visual knowledge base built for students, researchers, and lifelong learners."

> "Use whiteboards and cards to clarify your thinking and stay in flow."

> "Build a connected knowledge base with all your sources, notes, highlights, and discussions in one place."

> "Ask AI to explain any sources, take notes, and organize your knowledge base for you."

> AI Tutor: "An AI agent that guides you toward your goals through structured, personalized learning sessions."

> 功能清单：Block-Based Editor / Bi-Directional Links / Readwise Integration / PDF Annotation / Daily Journals / Web Clipper / Zotero Integration / **Heptabase CLI (working "with Claude Code, Codex, etc.")**

> "Search over 10,000 notes in less than a second."

> "Access all notes and files without an internet connection."

> 学习方法指南："Tackle challenging knowledge with AI." / "Deepen your understanding on a whiteboard."

## 机制/方法论拆解（中文）

**产品机制**
- **卡片+白板双原子**：白板（空间画布）承载"结构/关系/综合"——研究者把多篇文献卡片在白板上聚类、连线、对照；卡片承载原子内容。**综合发生在空间排布里**，而不是在文本生成里。
- **材料流**：PDF 标注/highlight、web clipper、Readwise/Zotero 导入 → 摘录成卡 → 上白板组合 → 写作输出。
- **AI 作为三层助手**：解释来源、代办笔记、整理库；2025 增 AI Tutor（结构化学习会话）。
- **Heptabase CLI（接 Claude Code 等 coding agent）**：2025-2026 的新形态——把本地知识库开放为 agent 可编程对象，白板库即 agent 的操作平面。
- 本地文件+离线可用，性能优先（万卡亚秒检索）。

**为什么有效**：空间画布把"跨文档综合"变成可手势化的操作（拖拽=分组，连线=关系）；白板天然是"结构卡"的 UI。

## 局限与批评

- 白板+卡片对超大规模知识（数百文献）仍然吃力；双击进入卡片后白板语境丢失。
- AI 能力是后加的辅助层，未与白板结构深度耦合（如不能让 AI 自动布图）。
- 无原子知识提炼（卡=人工摘录），订阅较贵；闭源非纯 markdown（导出受限）。

## 对我们的适用性

1. **"综合=空间排布"是强烈的产品启示**：我们的概念图/跨文档综合应该有白板式视图（原子卡可拖拽聚类、连线命名），而不是只有大纲列表——综合的中间状态要可见可改。
2. **CLI 接 agent 是 2026 的关键形态**：Heptabase 让 Claude Code 直接操作知识库，说明"知识库必须对 agent 可编程"（读写卡、建链接）——我们的 agent harness 应提供同等库操作 API。
3. AI Tutor 的"结构化学习会话"与我们领域学习包（讲义卡+测验）方向一致，验证了"学习包"产品化可行。
4. PDF 标注→摘录成卡的链路与我们文档解析链路对应；差异点：我们的摘录应自动原子化而非手工。
