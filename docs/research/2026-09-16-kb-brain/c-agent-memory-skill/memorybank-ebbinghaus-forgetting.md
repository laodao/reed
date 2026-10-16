# MemoryBank: 艾宾浩斯遗忘曲线式记忆（遗忘作为一等公民 + 用户画像沉淀）

- 链接: https://arxiv.org/abs/2305.10250
- 作者: Wanjun Zhong, Lianghong Guo, Qiqi Xiang, Yun Wang, Jiahai Gao, Huijia Wu, Jianxing Tan, Weiming Qian（中大/Speak Data）
- 时间: 2023-05-17 v1; 2024 v3
- 来源: arXiv（AAAI 2024 关联）。抓取方式: arXiv API 摘要 + arXiv HTML 全文（空白规范化），2026-09-16 存档。

## 原文摘录（保留原文不翻译）

> **Abstract (节选)**: ...we propose MemoryBank, a novel memory mechanism tailored for LLMs. MemoryBank enables the models to summon relevant memories, continually evolve through continuous memory updates, comprehend, and adapt to a user's personality over time by synthesizing information from previous interactions...MemoryBank incorporates a memory updating mechanism, inspired by the Ebbinghaus Forgetting Curve theory. This mechanism permits the AI to forget and reinforce memory based on time elapsed and the relative significance of the memory, thereby offering a more human-like memory mechanism and enriched user experience.

三大支柱：

> MemoryBank is a unified mechanism structured around three central pillars: (1) a memory storage serving as the primary data repository, (2) a memory retriever for context-specific memory recollection, and (3) a memory updater drawing inspiration from the Ebbinghaus Forgetting Curve theory, a time-tested psychological principle pertaining to memory retention and forgetting.

遗忘机制的设计动机：

> Forgetting less important memory pieces that are long time ago and have not been recalled much can make the AI companion more natural.

用户画像的分层沉淀（方法论提炼雏形）：

> **Dynamic Personality Understanding**: MemoryBank focuses on user personality understanding. It continuously assesses and updates these understandings with the long-term interactions and creates daily personality insights. These insights are further aggregated to form a global understanding of the user's personality. This multi-tiered approach results in an AI companion that learns, adapts, and tailors its responses to the unique traits of each user...we ask the LLM to deduce with prompts: "Based on the following dialogue, please summarize the user's personality traits and emotions. [dialog]" or "The following are the user's exhibited personality traits and emotions throughout multiple days. Please provide a highly concise and general summary of the user's personality [daily Personalities]".

## 核心机制拆解（中文）

- **数据模型**: 记忆条目带【形成时间 + 最近回忆时间 + 记忆强度】属性；检索用双塔稠密检索（FAISS 索引，survey 原文确认："MemoryBank employs a dual-tower dense retrieval model to find related information from past conversations"）。
- **流程**: 对话→摘要进记忆库→检索时按语义相关性召回→记忆更新器按艾宾浩斯曲线调整强度：长时间未被回忆且重要性低的记忆"遗忘"（降低可检索性/衰减），被再次回忆的记忆"强化"。
- **触发时机**: 检索即强化（recency of recall 影响存活）；画像沉淀是每日批处理（daily insights → 聚合成全局画像）。
- **成本**: 检索侧便宜；画像侧每日一次 LLM 汇总。遗忘本质是排序/衰减而非物理删除的轻量做法。

## 证据与局限

- 评估主要在自建的 SiliconFriend 陪伴场景（ChatGPT 模拟多角色长对话），以定性 + GPT-4 辅助评估为主，缺公开基准的硬对比（对比 Mem0/Zep 的 LOCOMO 论战，证据强度低一档）。
- "遗忘曲线"实际工程化为启发式权重衰减，不是心理学意义上的复现；论文也承认可关闭遗忘机制运行（"Applicability with and without memory forgetting mechanism"）。
- 后续被 Memento 论文总结为："MemoryBank couples retrieval with an Ebbinghaus-style forgetting schedule so older, low-utility items decay while user-relevant facts are reinforced."

## 对我们的适用性

1. **"遗忘"是我们记忆分层里最可能缺失的一维**: L1-L3 若只增不减，检索噪声会随使用时长单调上升。MemoryBank 给出的最小方案：给每条记忆/经验条目记"最近被消费时间 + 消费次数"，检索分数里乘一个衰减因子——不需要物理删除，就能把长期无人引用的条目自然沉底。
2. **两级画像沉淀是"方法论提炼"的极简模板**: 日级 insight → 全局 summary 的两跳聚合，几乎可以直接映射为"每次写作会话产出会话级经验 → 项目级/作者级方法论卡片"。这正是我们飞轮当年应该有的聚合层：不是每次都直接写全局库，先有会话级草稿层。
3. **诚实评估**: 该工作证据强度弱、且面向陪伴对话；建议只取其【衰减因子 + 两级聚合】两个机制点，不作为架构参照。
