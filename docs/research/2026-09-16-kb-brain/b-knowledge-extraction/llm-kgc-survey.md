# LLM 赋能知识图谱构建综述：schema-based vs schema-free 的全景地图（2025-10）

- 链接：https://arxiv.org/abs/2510.20345（2025-10-23，Haonan Bian）
- 时间：2025-10
- 来源：arXiv API 原文抓取

## 原文摘录

**论文摘要：**

> Knowledge Graphs (KGs) have long served as a fundamental infrastructure for structured knowledge representation and reasoning. With the advent of Large Language Models (LLMs), the construction of KGs has entered a new paradigm-shifting from rule-based and statistical pipelines to language-driven and generative frameworks. This survey provides a comprehensive overview of recent progress in LLM-empowered knowledge graph construction, systematically analyzing how LLMs reshape the classical three-layered pipeline of ontology engineering, knowledge extraction, and knowledge fusion. We first revisit traditional KG methodologies to establish conceptual foundations, and then review emerging LLM-driven approaches from two complementary perspectives: schema-based paradigms, which emphasize structure, normalization, and consistency; and schema-free paradigms, which highlight flexibility, adaptability, and open discovery. Across each stage, we synthesize representative frameworks, analyze their technical mechanisms, and identify their limitations. Finally, the survey outlines key trends and future research directions, including KG-based reasoning for LLMs, dynamic knowledge memory for agentic systems, and multimodal KG construction.

## 核心机制拆解（中文）

**把 LLM-KGC 映射回经典三层管线的分析框架：**
1. **本体工程（ontology engineering）**：schema 从哪来——预定义（schema-based：结构化、规范化、一致性优先）vs 从数据归纳（schema-free：灵活、开放发现优先）；AutoSchemaKG 被引为两范式统一之作。
2. **知识抽取（knowledge extraction）**：实体/关系/事件抽取的 LLM 化（ICL few-shot、指令微调、结构化输出约束）。
3. **知识融合（knowledge fusion）**：实体消歧/对齐（embedding 相似 + LLM 判等）、冲突消解、增量合并——综述明确把 fusion 列为最薄弱环节。

**趋势判断（与我们路线直接相关）：** 未来方向列了 **"dynamic knowledge memory for agentic systems"**（面向 agent 的动态知识记忆）——即 2025-26 共识：KG 从"静态资料库"转向"agent 的可更新记忆"，与时序化（Graphiti 一系）合流。

## 证据与局限

- 证据：单一作者综述（疑似个人长期跟踪），覆盖面广，范式二分清晰，适合当选题地图。
- 局限：非顶级团队 survey，深度一般；对每个方法只有定性描述；无定量对比表；引用截止 2025 年中。

## 对我们的适用性

1. **三层框架可直接当我们的检查表**：文档提炼层设计时分别回答——本体（我们的六类关系+概念图够不够，何时让 schema 增长）、抽取（原子事实+实体+关系）、融合（消歧/矛盾/合并，恰是我们已有强项）。
2. 综述确认"schema-free + schema-based 混合"是主流收敛点——支持我们"人工 schema 打底 + LLM 归纳扩展"的领域学习包进化策略。
3. "knowledge fusion 是最薄弱环节"的判断反向印证：我们把消歧+矛盾扫描做扎实就是差异化优势。
