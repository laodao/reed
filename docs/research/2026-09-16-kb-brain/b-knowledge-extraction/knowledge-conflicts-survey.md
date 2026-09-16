# 知识冲突综述：context-memory / inter-context / intra-memory 三分类

- 链接：https://arxiv.org/abs/2403.08319（2024-03-13 v2 2024-06，Rongwu Xu, Zehan Qi, Zhijiang Guo, Cunxiang Wang, Hongru Wang, Yue Zhang, Wei Xu — 清华/牛津；EMNLP 2024 Main）
  - 仓库：https://github.com/pillowsofwind/Knowledge-Conflicts-Survey
- 时间：2024-03
- 来源：arXiv API 原文抓取

## 原文摘录

**论文摘要：**

> This survey provides an in-depth analysis of knowledge conflicts for large language models (LLMs), highlighting the complex challenges they encounter when blending contextual and parametric knowledge. Our focus is on three categories of knowledge conflicts: context-memory, inter-context, and intra-memory conflict. These conflicts can significantly impact the trustworthiness and performance of LLMs, especially in real-world applications where noise and misinformation are common. By categorizing these conflicts, exploring the causes, examining the behaviors of LLMs under such conflicts, and reviewing available solutions, this survey aims to shed light on strategies for improving the robustness of LLMs, thereby serving as a valuable resource for advancing research in this evolving area.

## 核心机制拆解（中文）

**三分类（我们矛盾发现模块的概念地图）：**
1. **context-memory**：检索到的外部知识 vs 模型参数知识冲突（模型"知道"的和资料说的不一样）——对我们 = 用户文档 vs LLM 世界知识（历史小说设定与史实冲突即此类）。
2. **inter-context**：**多份外部资料之间互相冲突**——对我们 = 跨文档矛盾扫描的靶心（两本书对同一事件说法不一）。
3. **intra-memory**：模型参数内部自相矛盾。

**LLM 在冲突下的行为（综述汇总结论）：** 模型倾向过度自信、易被错误上下文误导（misinformation susceptibility）；行为受模型规模、冲突类型、上下文位置影响；解决方案包括对比解码、上下文校验、来源可信度加权等。

**对"库内冲突消解"的映射：** 该综述研究的是 LLM 推理时的冲突，但其分类学直接告诉我们知识库侧要在**入库时**就把 inter-context 冲突显式物化（存下冲突对+各自来源），而不是留给生成时模型"临场发挥"。

## 证据与局限

- 证据：EMNLP 2024 主会；配套 GitHub 持续维护论文清单；taxonomy 被后续大量引用。
- 局限：重点是"冲突下模型行为"评测，给出的多是 benchmark 构造法（实体替换/LLM 生成冲突上下文），对"如何构建自动冲突检测系统"只有方向性指引。

## 对我们的适用性

1. **inter-context conflict 是我们知识库升级的核心场景**（多文档对同一事实不同说法），该综述给了我们与学界对齐的术语和引用基点。
2. 其"冲突上下文构造法"（实体替换、LLM 改写生成冲突对）可直接反过来用作我们**矛盾扫描模块的测试集生成器**——自动造已知冲突对，验证扫描召回率。
3. context-memory 分类提醒我们设计第三类检查：原子事实与 LLM 参数知识冲突时（资料与常识相悖），标记为"待人审"而非硬纠——创作场景下"资料是错的/故意的"都可能是合理设定。
4. 检索阶段"来源可信度加权"思路可用于我们多来源冲突时的呈现排序（哪条证据优先展示给作者）。
