# Memory3: Language Modeling with Explicit Memory（显式记忆：参数之外第三种记忆）

- 链接: https://arxiv.org/abs/2407.01178
- 作者: Hongkang Yang, Zehao Lin, Wenjin Wang, Hao Wu, Zhiyu Li, Bo Tang, Wenqiang Wei, Jinbo Wang, Zeyun Tang, Shichao Song, Chenyang Xi, Yu Yu（上海算法创新研究院等）
- 发表时间: 2024-07-01
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2407.01178，原文）

> The training and inference of large language models (LLMs) are together a costly process that transports knowledge from raw data to meaningful computation. Inspired by the memory hierarchy of the human brain, we reduce this cost by equipping LLMs with explicit memory, a memory format cheaper than model parameters and text retrieval-augmented generation (RAG). Conceptually, with most of its knowledge externalized to explicit memories, the LLM can enjoy a smaller parameter size, training cost, and inference cost, all proportional to the amount of remaining "abstract knowledge". As a preliminary proof of concept, we train from scratch a 2.4B LLM, which achieves better performance than much larger LLMs as well as RAG models, and maintains higher decoding speed than RAG. The model is named $\text{Memory}^3$, since explicit memory is the third form of memory in LLMs after implicit memory (model parameters) and working memory (context key-values). We introduce a memory circuitry theory to support the externalization of knowledge, and present novel techniques including a memory sparsification mechanism that makes storage tractable and a two-stage pretraining scheme that facilitates memory formation.

## 核心机制拆解

把 LLM 的知识存放分成三层记忆：
1. **隐式记忆**（implicit memory）= 模型参数：最贵，存"抽象知识"（语言能力、常识推理）。
2. **工作记忆**（working memory）= KV cache：上下文窗口。
3. **显式记忆**（explicit memory）= **预计算的 KV cache 文件（"memory块"）**：对常用文本（如经典段落、百科条目）离线算好 attention 的 Key/Value 张量存盘，推理时直接加载拼接，跳过对该文本的 prefill 计算。

机制要点：
- 显式记忆不是文本也不是向量，而是 **token 级 KV 张量**——解码时无需重新编码原文，省 prefill 算力；且与文本的稀疏注意力兼容（memory sparsification：只保留关键 token 的 KV，压存储）。
- 两阶段预训练：先学"如何使用外部 memory 块"（attention 学会读 KV 外挂），再学抽象知识。
- 记忆库与模型版本绑定（KV 依赖模型权重），跨模型不可迁移。

## 证据与成本

- 2.4B 从零训练的概念验证：效果好于更大模型及 RAG 基线，解码快于 RAG（省 prefill）。
- 属于**模型层方案**：需要自己预训练模型，不是应用层可插拔技术；KV 外挂与主流 API 模型（GPT/Claude/Gemini）不兼容（拿不到内部 KV）。
- 局限：记忆只对训练时对齐的模型有效；存储虽经稀疏化仍可观；论文为 proof-of-concept，生态未成型。

## 对我们的适用性

1. **技术路线不可行（低）**：我们是应用层产品，用第三方/开源模型，无法预训练"会读外挂 KV"的模型，也无法为闭源模型生成显式记忆——这条只作理念存档，不建议投入。
2. **理念价值：为"知识库即记忆分层"提供理论叙事（中）**：参数（抽象能力）/上下文（工作记忆）/外部库（长期记忆）的三分法，与我们的产品叙事完全同构——"知识库变大脑"本质上是把长期记忆从"可检索文本"升级为"结构化可计算记忆"（图谱、摘要树、命题），这个分层框架可以用在产品概念与架构文档上。
3. **一个可迁移的提醒（中）**：记忆格式越接近模型计算（KV > 摘要 > 原文），使用成本越低但越绑死模型；我们本地优先支持多模型切换，知识资产必须保持**模型无关**（文本/结构化数据），这是与 Memory3 路线的本质分歧，也是我们不该做 KV 缓存型知识库的依据。
