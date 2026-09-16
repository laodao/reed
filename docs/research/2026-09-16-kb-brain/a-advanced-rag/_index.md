# 高级 RAG / Agentic RAG / 结构化检索增强 — 调研索引（a-advanced-rag）

调研日期: 2026-09-16 | 共 17 篇，全部经原文抓取存档（arXiv abstract 原文 + 关键正文/官方文档摘录）。

适用性评级说明: 高 = 方向契合且可基于现有资产（章节树/混合检索/lw_graph_edges/agent harness/workflow 引擎/学习包）近期落地; 中 = 价值明确但需裁剪或有成本/工程门槛; 低 = 理念参考为主。

| 文件 | 标题 | 链接 | 一句话核心 | 适用性 |
|---|---|---|---|---|
| hipporag.md | HippoRAG (NeurIPS 2024) | https://arxiv.org/abs/2405.14831 | 实体-三元组异构图 + Personalized PageRank 单步扩散实现多跳检索，比迭代检索便宜 10-30 倍 | 高 |
| raptor.md | RAPTOR (Stanford) | https://arxiv.org/abs/2401.18059 | 递归聚类摘要构建抽象树，摘要节点作为一等检索单元，坍缩树检索自动选抽象层级 | 高 |
| lightrag.md | LightRAG (HKU) | https://arxiv.org/abs/2410.05779 | 高低层关键词→图种子→邻接子图拼装的双层检索 + 增量更新，查询侧 <100 token 起步 | 高 |
| crag-corrective-rag.md | CRAG | https://arxiv.org/abs/2401.15884 | 检索质量评估器分三档纠错（过滤重组/跨源兜底），即插即用无需训练 | 高 |
| memorag.md | MemoRAG (BAAI) | https://arxiv.org/abs/2409.05591 | 轻量系统先对模糊任务生成草稿线索，草稿驱动检索，强系统精答——解决"无明确 query"场景 | 高 |
| search-o1.md | Search-o1 (RUC) | https://arxiv.org/abs/2501.05366 | 推理链中模型自主触发检索 + Reason-in-Documents 独立消化模块再注入 | 高 |
| deep-research-survey.md | Deep Research 综述 (2025) | https://arxiv.org/abs/2508.12752 | 规划→问题生成→迭代探索→成报四阶段研究管线，是"跨文档综合"的产品蓝图 | 高 |
| microsoft-graphrag.md | Microsoft GraphRAG | https://arxiv.org/abs/2404.16130 | 实体图+Leiden 社区+预生成社区报告，全局问题 map-reduce 问答（comprehensiveness 72% 胜率），但索引/查询成本高 | 中-高 |
| sirerag.md | SiReRAG (ICLR 2025) | https://arxiv.org/abs/2412.06206 | 相似树(RAPTOR式)+关联树(共享实体分组)双树平铺进统一检索池——验证"切片+图谱+摘要"合池是最优索引形态 | 中-高 |
| dense-x-retrieval-propositions.md | Dense X Retrieval (EMNLP 2024) | https://arxiv.org/abs/2312.06648 | 命题（原子自包含事实）作为检索单元显著优于段落级，固定预算下覆盖更多事实 | 中-高 |
| hipporag-2.md | HippoRAG 2 | https://arxiv.org/abs/2502.14802 | 事实/理解/联想三类记忆全面超越 RAG；警训：结构化检索不得在事实上退化；查询时 LLM 条件化扩散 | 中-高 |
| self-rag.md | Self-RAG (ICLR 2024) | https://arxiv.org/abs/2310.11511 | 反思 token 化的按需检索与自评（Retrieve?/ISREL/ISSUP/ISUSE），训练路线不可行但四决策点可工作流化 | 中-高 |
| agentic-rag-survey.md | Agentic RAG 综述 (2025) | https://arxiv.org/abs/2501.09136 | 按 agent 数量/控制结构/自治度/知识表示四维分类；难度感知路由是成本安全阀 | 中-高 |
| long-context-vs-rag.md | RAG vs Long-Context (Google) | https://arxiv.org/abs/2407.16833 | 资源充足时长上下文平均更优但贵 1-2 个量级；Self-Route 自路由折中——本地优先下 RAG 地位更稳 | 中-高 |
| context-engineering-survey.md | Context Engineering 综述 (2025) | https://arxiv.org/abs/2507.13334 | RAG/记忆/工具推理/多 agent 统一为上下文工程；关键发现：模型"理解强、长文生成弱"不对称 | 中-高 |
| grag.md | GRAG (UIC/Emory) | https://arxiv.org/abs/2405.16506 | 原生图语料的分治子图检索+文本/图双视角注入；主场景与我们错位，双视角 prompt 可借鉴 | 低-中 |
| memory3-explicit-memory.md | Memory3 显式记忆 | https://arxiv.org/abs/2407.01178 | KV 外挂式第三种记忆（模型层方案，需自训模型）；三层记忆理论叙事可借鉴，技术路线不适用 | 低 |

## 备注

- 调研提纲中的 "SiReRi" 经多轮检索确认不存在，最接近的论文为 SiReRAG（arXiv:2412.06206，递归层级摘要索引主题一致），已按此存档。
- GraphRAG 家族谱系速查: Microsoft GraphRAG（从文本建图做社区摘要，主打全局 QFS）/ LightRAG（平图+双层关键词检索，主打便宜与增量）/ HippoRAG 1→2（实体图+PPR 扩散，主打多跳与记忆）/ GRAG（语料本身是图）。
- 跨条目联动: SiReRAG 用 proposition 做关联分组（链接 dense-x）; Self-RAG 的 ISSUP 与 Deep Research 的引用落地、Search-o1 的 RiD 与 Context Engineering 的处理组件互为印证。
