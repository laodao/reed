# Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection（自省 token 化的按需检索）

- 链接: https://arxiv.org/abs/2310.11511 （代码: https://github.com/AkariAsai/self-rag）
- 作者: Akari Asai, Zeqiu Wu, Yizhong Wang, Avirup Sil, Hannaneh Hajishirzi（UW / AI2）
- 发表时间: 2023-10-17（ICLR 2024 Oral）
- 来源: arXiv / ICLR 2024

## 原文摘录

### Abstract（arXiv:2310.11511，原文）

> Despite their remarkable capabilities, large language models (LLMs) often produce responses containing factual inaccuracies due to their sole reliance on the parametric knowledge they encapsulate. Retrieval-Augmented Generation (RAG), an ad hoc approach that augments LMs with retrieval of relevant knowledge, decreases such issues. However, indiscriminately retrieving and incorporating a fixed number of retrieved passages, regardless of whether retrieval is necessary, or passages are relevant, diminishes LM versatility or can lead to unhelpful response generation. We introduce a new framework called Self-Reflective Retrieval-Augmented Generation (Self-RAG) that enhances an LM's quality and factuality through retrieval and self-reflection. Our framework trains a single arbitrary LM that adaptively retrieves passages on-demand, and generates and reflects on retrieved passages and its own generations using special tokens, called reflection tokens. Generating reflection tokens makes the LM controllable during the inference phase, enabling it to tailor its behavior to diverse task requirements. Experiments show that Self-RAG (7B and 13B parameters) significantly outperforms state-of-the-art LLMs and retrieval-augmented models on a diverse set of tasks. Specifically, Self-RAG outperforms ChatGPT and retrieval-augmented Llama2-chat on Open-domain QA, reasoning and fact verification tasks, and it shows significant gains in improving factuality and citation accuracy for long-form generations relative to these models.

## 核心机制拆解

四个决策点全部交给模型自己，通过**反思 token（reflection tokens）**显式化：
1. **Retrieve?**（是否需要检索）：生成中每步判断，不需要检索的问题（常识/创作）直接答。
2. **ISREL**（检索段落是否相关）：对每个候选段落打相关判断，过滤噪声。
3. **ISSUP**（生成内容是否被段落支撑）：证据支持度自评——事实性对齐。
4. **ISUSE**（整体回答是否有用）：效用自评。

**训练方式**：用 GPT-4 造反思 token 的监督数据（critic 数据）→ 用这些数据训练任意 LM 边生成边输出反思 token（含 Retrieve 决策）。**推理时可控**：可以用解码约束（如强制全检索/禁止检索/调 ISREL 阈值）适配不同任务，甚至按 segment tree search 在反思 token 空间上做搜索优化长文质量。

本质：把"检索与否、信不信证据、答案可不可靠"从 pipeline 规则变成**模型内化的自省能力**，并以 token 形式输出（可观测、可约束、可搜索）。

## 证据与成本

- 7B/13B Self-RAG 在开放域 QA/推理/事实核查上超过 ChatGPT 与检索增强 Llama2-chat；长文生成的事实性与引用准确率显著提升（引用准确率提升是其亮点，对创作工具尤其相关）。
- 成本：需要**训练**一个模型（我们场景不可行），推理时多生成反思 token（开销 ~10-20% 额外 token）；不能直接用于闭源 API 模型。
- 局限：反思 token 的校准性依赖训练分布；对域外检索语料，ISREL 判断质量下降。

## 对我们的适用性

1. **训练路线不可行，但四个决策点可工作流化（高）**：我们不训模型，但 Retrieve?/ISREL/ISSUP/ISUSE 四问可以用 prompt + 结构化输出在 agent harness 里实现——生成前先判"是否需要知识库"，生成后做"证据支撑度/有用度"自评，作为回答可信度分级展示给用户。
2. **"按需检索"直接强化现有查询路由（高）**：我们已有查询路由，目前是检索前的静态分类；Self-RAG 证明的增益点是**生成过程中动态决定要不要补检索**（回答写一半发现缺证据再检索），这可以用我们的工具循环（agent harness）实现成"生成-自查-补检"循环，看门狗控制循环次数。
3. **引用准确率提升的启示（中-高）**：ISSUP（每段回答是否被证据支撑）自评为创作工具提供了"逐句溯源"的轻量做法：QA 直出时对每个事实句回链检索命中的命题/chunk（与 dense-x 的命题索引配合），可信度可视化。
