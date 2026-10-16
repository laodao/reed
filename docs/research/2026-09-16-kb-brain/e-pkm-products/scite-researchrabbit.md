# Scite + ResearchRabbit——引用上下文与文献图谱（"从论文到洞见"的两条机制）

- 链接：https://scite.ai/ （2026 版官网，经代理抓取）；https://researchrabbit.ai/ （2025 改版官网）
- 公司：Scite（Research Solutions 旗下）；ResearchRabbit
- 时间：持续更新至 2026（Scite 已 317M+ 全文库；ResearchRabbit 2025 大改版）

## 原文摘录（保留原文不翻译，资料存档）

### Scite
> "AI for Research — Ask a question, get answers grounded in the scientific literature. **Reads across 317 M+ full-text scholarly articles**."

> "Smart Citations — **See whether a finding has been supported or contradicted by later research**."

> "Verifiable Evidence — Every answer is grounded in real papers, **never generated or hallucinated**."

> "Smart Citations show how later research has **supported, challenged, or discussed** a paper, claim, method, journal, author, institution, or funder, while Scite's AI Assistant **uses those same evidence signals to ground answers** in the broader literature."

> "Built for verification, not just answers — **Every claim Scite's AI makes links back to the specific sentence in the specific paper it came from.** You can check the work in one click. That's the difference between an answer you can cite and an answer you have to re-verify."

> "Scite is built on the **largest licensed database** of scholarly content in AI research, with agreements across 35+ publishers... When other tools hit a paywall, they guess. **Scite reads the paper.**"

> 生态位："Scite **runs inside Claude, ChatGPT, and any MCP-compatible assistant**, plugs into Zotero, and is available through our API."

> 用户证言（佐证机制价值）："The feature that **classifies papers on whether they find supporting or contrasting evidence** for a particular publication saves so much time."

### ResearchRabbit
> "ResearchRabbit analyzes papers you love and finds the research you've been missing."

> "**Turn one paper into a map of ideas.**"

> "explore how your literature review connects and discover the research you've been missing"

> "**Use this as a seed** to see how papers connect, identify what matters."

> "With every search, ResearchRabbit learns, delivering smarter, more relevant recommendations."

> （2025 改版证言）"a cleaner iterative 'rabbit hole' flow and a more configurable **citation graph**"；"analyzes their bibliographies, citations to these articles, and co-authors"

> "Bring your reference library and ResearchRabbit together."

## 机制/方法论拆解（中文）

**Scite：citation context（引用语境）机制**
- 核心资产不是论文而是**引用句**：每条引用被分类为 supporting / contrasting / mentioning——把"某文献被引 N 次"升级为"证据在社区里是被支持还是被反驳"。**这是"边带语义类型"的最大规模工业实现**（我们的原子卡之间的边应有同类标注：支持/冲突/细化/示例）。
- AI 助手**用证据信号做 grounding**：回答先查引用语境，句级回链（"links back to the specific sentence in the specific paper"）。
- 通过 MCP 接进 Claude/ChatGPT——研究知识库成为 agent 可调用的外部记忆。

**ResearchRabbit：种子扩张式文献图谱**
- 交互模型 = "给一篇种子论文→双向扩展（引文/被引/相似）→图上圈选新种子→再扩张"的迭代兔子洞；协同过滤随选择学习口味。
- 把"文献综述"从搜索框变成**图上的漫游**——与 Zettelkasten 的"沿链接漫游"同构。

**为什么有效**：两者都把"知识发现"从文本相似度升级为**关系结构**（引用语境、共引网络），关系本身携带质量信号。

## 局限与批评

- Scite：覆盖依赖出版商协议（部分领域/语言弱）；订阅贵；"never hallucinated"是营销话术（抽取分类仍会出错）。
- ResearchRabbit：只做"发现"，不做提炼/综合；图变大后导航吃力；与笔记工作流脱节。
- 都只服务学术文献场景；对非学术文档（小说资料、行业材料）无解。

## 对我们的适用性

1. **边的语义分类（支持/反驳/提及）应成为我们原子卡关系的标准类型系统**——写小说时"证据冲突提示"（两条资料对同一史实矛盾）直接复用此模型，这是 Scite 验证过的最有价值机制。
2. **"答案可引用 vs. 答案需复核"的分野**是我们 grounding 设计的北极星指标：创作中 AI 建议的每个事实都应句级回链，作者一键核对。
3. **种子扩张式图漫游**适合我们知识库的探索 UI：以一张卡/一个概念为种子，双向展开（引用它的卡/它引用的卡/相似卡），作者圈选纳入当前创作上下文。
4. **MCP/API 化知识库**（Scite 接 Claude/ChatGPT 的方式）是我们 agent harness 对外的自然形态——知识大脑应可被任何 assistant 调用。
5. 共引/共现网络可用于我们自动发现"主题簇"（概念图的自动布局依据），但要以我们的原子卡语义边为主、统计共现为辅。
