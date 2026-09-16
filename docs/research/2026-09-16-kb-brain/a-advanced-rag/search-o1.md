# Search-o1: Agentic Search-Enhanced Large Reasoning Models（推理链中动态检索 + Reason-in-Documents）

- 链接: https://arxiv.org/abs/2501.05366 （代码: https://github.com/syliss/Search-o1）
- 作者: Xiaoxi Li, Guanting Dong, Jiajie Jin, Yuyao Zhang, Yujia Zhou, Yutao Zhu, Peitian Zhang, Zhicheng Dou（人大 RUC / 清华）
- 发表时间: 2025-01-09
- 来源: arXiv

## 原文摘录

### Abstract（arXiv:2501.05366，原文）

> Large reasoning models (LRMs) like OpenAI-o1 have demonstrated impressive long stepwise reasoning capabilities through large-scale reinforcement learning. However, their extended reasoning processes often suffer from knowledge insufficiency, leading to frequent uncertainties and potential errors. To address this limitation, we introduce \textbf{Search-o1}, a framework that enhances LRMs with an agentic retrieval-augmented generation (RAG) mechanism and a Reason-in-Documents module for refining retrieved documents. Search-o1 integrates an agentic search workflow into the reasoning process, enabling dynamic retrieval of external knowledge when LRMs encounter uncertain knowledge points. Additionally, due to the verbose nature of retrieved documents, we design a separate Reason-in-Documents module to deeply analyze the retrieved information before injecting it into the reasoning chain, minimizing noise and preserving coherent reasoning flow. Extensive experiments on complex reasoning tasks in science, mathematics, and coding, as well as six open-domain QA benchmarks, demonstrate the strong performance of Search-o1. This approach enhances the trustworthiness and applicability of LRMs in complex reasoning tasks, paving the way for more reliable and versatile intelligent systems. The code is available at \url{ this https URL }.

## 核心机制拆解

把检索器变成**推理链（chain-of-thought）内部的工具**，而不是前置步骤：

1. **动态触发（when）**：LRM 在长推理过程中遇到知识缺口时，自行生成检索 query（特殊 token 标记，如 `<|begin_search|>query<|end_search|>`），系统暂停推理、执行检索、把结果插入 `<|begin_search_result|>...<|end_search_result|>`，推理继续。检索时机由模型自己判断，无需外部规划器。
2. **Reason-in-Documents（how to digest）**：检索回的原始文档冗长嘈杂，直接塞回推理链会打断推理流。RiD 模块是一个**独立的中转 LLM 调用**：只负责把检索文档压缩成与当前推理步骤直接相关的结构化要点，再注入推理链。
3. **迭代**：一次复杂推理可触发多次检索，形成"推理-检索-消化-再推理"循环。

训练侧：从强 LRM 蒸馏带搜索的推理轨迹，微调模型学会何时插检索标记（也提供免训练 prompt 版可用）。

## 证据与成本

- 科学（GPQA）/数学（AIME）/代码（LiveCodeBench）+ 6 个开放域 QA 基准上稳定优于原生 LRM 与单步 RAG。
- 成本：一次任务多次检索 + 每次 RiD 额外 LLM 调用，总调用量 2-5 倍于单次 RAG；推理型模型长 CoT 本身 token 也贵。
- 局限：触发与 query 质量依赖模型能力（小模型易过度/不足检索）；中文开放域语料检索质量影响效果。

## 对我们的适用性

1. **与我们 agent harness 的工具循环完全同构（高）**：「推理中遇到知识缺口→生成检索请求→工具返回→消化→继续」就是我们的工具循环 + 知识库工具化；Search-o1 验证了这条路在复杂任务上的有效性，无需发明新范式，重点是**把触发权交给模型**（harness 提供 search 工具 + 结果注入格式）。
2. **Reason-in-Documents 是关键工程细节（高）**：直接把检索原文塞回上下文会污染推理/创作流——对我们尤其重要：创作场景上下文本来就有长文设定，检索结果应先经独立"消化"调用压缩成要点/引文卡片再注入，这个模式值得做成 workflow 引擎里的标准节点。
3. **适配"研究模式"（中-高）**：我们的长文创作前调研（查设定一致性、跨文档找素材）正是这种多轮"推理-检索"场景；看门狗限制检索次数（对应 RiD 成本控制），审批机制允许用户看到每次检索的 query（可解释性优于黑盒 agent）。
