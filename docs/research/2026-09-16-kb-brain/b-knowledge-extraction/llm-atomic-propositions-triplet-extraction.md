# LLM 原子命题辅助 OpenIE 三元组抽取（2026 前沿：命题化作为抽取中间层）

- 链接：https://arxiv.org/abs/2604.02866（2026-04-03，Luc Pommeret, Thomas Gerald, Patrick Paroubek, Sahar Ghannay, Christophe Servan, Sophie Rosset — LISN CNRS / CEA，法国）
- 时间：2026-04
- 来源：arXiv API 原文抓取

## 原文摘录

**论文摘要：**

> Knowledge Graph construction from natural language requires extracting structured triplets from complex, information-dense sentences. In this paper, we investigate if the decomposition of text into atomic propositions (minimal, semantically autonomous units of information) can improve the triplet extraction. We introduce MPropositionneur-V2, a small multilingual model covering six European languages trained by knowledge distillation from Qwen3-32B into a Qwen3-0.6B architecture, and we evaluate its integration into two extraction paradigms: entity-centric (GLiREL) and generative (Qwen3). Experiments on SMiLER, FewRel, DocRED and CaRB show that atomic propositions benefit weaker extractors (GLiREL, CoreNLP, 0.6B models), improving relation recall and, in the multilingual setting, overall accuracy. For stronger LLMs, a fallback combination strategy recovers entity recall losses while preserving the gains in relation extraction. These results show that atomic propositions are an interpretable intermediate data structure that complements extractors without replacing them.

## 核心机制拆解（中文）

**核心思想：命题化作为抽取的"中间表示"（两段式）：** 复杂长句 →（第 1 步）原子命题序列 →（第 2 步）从命题抽三元组，而不是直接从长句抽三元组。命题 = "minimal, semantically autonomous units of information"，每条承载一个谓词性信息，天然接近三元组但保留自然语言可读性。

**成本工程（对我们最有参考价值）：** 用 Qwen3-32B 当教师、蒸馏出 **Qwen3-0.6B** 的专职"命题器"（Propositioner），六语言通用，本地可跑——把最贵的"分解"步骤从 API LLM 下放到 0.6B 小模型。

**结论分层：** 弱抽取器（0.6B、GLiREL、CoreNLP）+ 命题中间层 → 关系召回显著提升；强 LLM 直接抽三元组已够好，但"fallback 组合策略"（命题版+直抽版合并）能补回实体召回损失——即**命题层不替代抽取器，而是可插拔增强**。

**评测基准：** SMiLER / FewRel / DocRED / CaRB（CaRB 是 OpenIE 标准评测集）。

## 证据与局限

- 证据：四个标准基准上的系统对比；蒸馏小模型开源可复现（MPropositionneur-V2）。
- 局限：欧语为主（未含中文，但多语言架构表明可迁移）；命题化仍是"每句必跑"的额外一步，强 LLM 场景收益边际；单文档句子级实验，未验证跨文档知识融合。

## 对我们的适用性

1. **两段式抽取架构（句子→命题→结构化）正中我们需求**：先产出自包含原子事实（人可读、可溯源、可入库），再选择性结构化进图谱——抽取失败时命题层仍有独立价值（直接检索/引用），符合"提炼即资产"。
2. **0.6B 蒸馏命题器**证明"本地小模型做原子化、云端强模型做判断"的成本分层在 2026 已是可行工程路线，适配 Electron 本地优先架构（离线可跑命题化）。
3. "弱抽取器受益最大"提示：如果我们本地用小模型抽三元组，加命题中间层的边际收益最大。
4. 中文需自验：需在中文文档上小规模验证命题器质量，或直接用国产小模型蒸馏中文命题器（该论文方法可照搬）。
