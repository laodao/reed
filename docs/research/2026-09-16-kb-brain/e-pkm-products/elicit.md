# Elicit——文献综述自动化（extraction table → research report）

- 链接：https://elicit.com/ ；博客/文档 https://elicit.com/blog/
- 公司：Elicit（Ought 分拆）
- 时间：2021 起；2024-2025 转向 "research report" 形态

## 原文摘录（保留原文不翻译，资料存档）

> "Use AI to search, summarize, extract data from, and chat with over 125 million papers."

> "Elicit can find up to 1,000 relevant papers and analyze up to 20,000 data points at once."

> "Elicit goes **beyond chat to provide rich, interactive tables and multi-step workflows.**"

> Tagline: "Elicit helps researchers be 10x more evidence-based"

> "Elicit generates high-quality research briefs based on a **process inspired by systematic reviews**."

> 提问后 "automatically generates a structured research report with citations in seconds"；report contents（选哪些论文、呈现哪些细节）可由用户修改。

> "Elicit can automate **screening and data extraction** of systematic reviews."

> "Researchers report up to **80% time savings** using Elicit for systematic reviews."

> "**Elicit supports all AI-generated claims with sentence-level citations from the underlying sources.**"

## 机制/方法论拆解（中文）

**"从论文到洞见"的机制**
- **Extraction table（提取表）**：把 N 篇论文拉平成一张矩阵——行=论文，列=研究变量（样本量、干预、结果、方法…），每格是**句级引用**支撑的抽取值。这是"结构化知识提取"最成熟的 UI：**知识=表格单元，证据=单元格背面的原句**。
- **多步工作流**：筛选（screening）→ 数据抽取 → 综合（按列/按主题聚合）→ 生成 research brief（仿系统综述流程）。
- **报告可配置**：生成物的论文集合与字段用户可增删——AI 产物是**可编辑的结构化文档**而非终稿。
- 规模卖点：一次 1000 篇/2 万数据点；句子级引用是一切信任的基础。

**为什么有效**：系统综述（systematic review）是学术界几十年沉淀的"文献→综合"标准流程，Elicit 把它产品化/自动化；表格把非结构化论文变成可比较、可聚合的结构。

## 局限与批评

- 抽取精度依赖论文类型（生物医学 RCT 最强，人文/理论文弱）；复杂字段仍需人工核对。
- 综合层（brief）质量取决于源覆盖；开放获取偏倚。
- 学术场景特化，不能用于一般文档/小说知识。
- 隐私：论文与问题走云端。

## 对我们的适用性

1. **Extraction table 是"原子知识+证据溯源"的成熟 UI 验证**：我们的跨文档综合可以输出"实体×文档"矩阵视图（如：同一主题下各文档的论断/证据/冲突对照表），每格带原文跳转——直接借鉴。
2. **"仿系统综述的多步工作流"值得移植**：入库→筛选→抽取→综合的四段式即我们的提炼管道；每步产物可编辑，而不是一键黑箱。
3. **句级引用（sentence-level citations）是我们"可溯源"的对标标准**：提炼出的每个原子知识必须锚到句（而非仅文档），Elicit 已证明这在产品上可行且被用户认可。
4. "80% 时间节省"的叙事方式：衡量我们大脑的指标应是"从 50 份资料到可用设定文档的时间缩减"。
