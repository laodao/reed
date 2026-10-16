# 知识编辑（ROME / MEMIT）及其综述：对"库内知识更新"的启示

- 链接：
  - ROME：https://arxiv.org/abs/2202.05262（2022-02，Kevin Meng, David Bau, Alex Andonian, Yonatan Belinkov — Northeastern；Locating and Editing Factual Associations in GPT）
  - MEMIT：https://arxiv.org/abs/2210.07229（2022-10，Kevin Meng, Arnab Sen Sharma, Alex Andonian, Yonatan Belinkov, David Bau）
  - 综述：https://arxiv.org/abs/2310.16218（2023-10 v4，Song Wang, Yaochen Zhu, Haochen Liu, Zaiyi Zheng, Chen Chen, Jundong Li；ACM Computing Surveys 2024）；论文清单：https://github.com/zjunlp/KnowledgeEditingPapers
- 时间：2022 / 2023
- 来源：arXiv API 原文抓取

## 原文摘录

**ROME 摘要：**

> We analyze the storage and recall of factual associations in autoregressive transformer language models, finding evidence that these associations correspond to localized, directly-editable computations. We first develop a causal intervention for identifying neuron activations that are decisive in a model's factual predictions. This reveals a distinct set of steps in middle-layer feed-forward modules that mediate factual predictions while processing subject tokens. To test our hypothesis that these computations correspond to factual association recall, we modify feed-forward weights to update specific factual associations using Rank-One Model Editing (ROME) ... on a new dataset of counterfactual assertions, on which it simultaneously maintains both specificity and generalization, whereas other methods sacrifice one or another.

**MEMIT 摘要：**

> Recent work has shown exciting promise in updating large language models with new memories, so as to replace obsolete information or add specialized knowledge. However, this line of work is predominantly limited to updating single associations. We develop MEMIT, a method for directly updating a language model with many memories, demonstrating experimentally that it can scale up to thousands of associations for GPT-J (6B) and GPT-NeoX (20B), exceeding prior work by orders of magnitude.

**综述摘要（KME 定义）：**

> Recently, Knowledge-based Model Editing (KME) has attracted increasing attention, which aims to precisely modify the LLMs to incorporate specific knowledge, without negatively influencing other irrelevant knowledge.

## 核心机制拆解（中文）

**ROME/MEMIT 做什么：** 定位-编辑（locate-and-edit）——因果追踪发现事实关联集中在中间层 MLP → 对 MLP 权重做秩一修改（ROME）或批量更新数千条记忆（MEMIT）。目标是**精确改一条知识而不伤其他知识**（specificity + generalization 双达标）。

**KME 方法分类（综述 taxonomy）：** 外挂记忆（memory-based，如 SERAC）/ 参数修改（ROME、MEMIT 系）/ 附加模块（adapter）——共同评价指标：可靠性、泛化、特异性、流畅性。

**对知识库（而非模型权重）的启示——把 KME 语义平移到图存储：**
- "编辑一条知识不能破坏无关知识" = 我们的"关旧开新"必须精准圈定受影响子图（只关旧边、不动实体其他事实）；
- MEMIT 的"批量更新" = 一次文档入库可能同时更新多条事实，需要**成组提交**而非逐条（避免中间态被读）；
- SERAC 式外挂记忆（新知识存外部库、推理时先查库遮蔽旧参数知识）= **检索优先于参数**——本质就是我们路线（外部知识库+RAG）的理论正当性来源。

## 证据与局限

- 证据：ROME/MEMIT 是被引用最多的事实编辑工作（各数千引用）；EasyEdit 工具包可用；综述发表于 ACM CSUR。
- 局限（重要）：后续研究（如 arXiv 2401.01286 综合研究、ACL 2024 "Can We Continually Edit LLMs"）表明**连续编辑下性能快速退化、locate-and-edit 会引发不可控副作用**——直接改权重在产品上不可行。这反而强化了"知识放外部库、编辑在外部库做"的路线。

## 对我们的适用性

1. **不要改模型权重，但 KME 的评价维度要照搬**：我们知识库的更新操作（关旧开新、矛盾修正）应按"可靠性（新事实生效）/特异性（无关事实不受扰）/泛化（同义问法也更新）"三维验收——这比"更新成功"的二元判断严格得多。
2. **MEMIT 的成组编辑**提示我们把"一次文档入库"设计成事务：该文档产生的所有边变更一次性提交，矛盾扫描在事务内完成。
3. SERAC 的"scope 判定"（新知识应遮蔽哪些旧回答）启发我们的矛盾扫描不只找"冲突边"，还要圈定"受影响查询面"——旧事实失效后，哪些 dl_card/讲义引用了它需要重生成（我们已有 kbDocId 溯源，正好支持反向清理）。
4. 诚实说：ROME/MEMIT 本身（权重手术）与我们的系统无关，价值在评价框架与"编辑的事务性"思想。
