# 知识大脑改造·调研存档（2026-09-16）

为 `docs/design/2026-09-16-knowledge-brain-design.md`（知识库「知识大脑」改造方案）做的五路并行调研一手资料存档。每份文件含：原文摘录（保留原文语言，未翻译）、机制拆解、证据与局限、对本产品的适用性。各目录 `_index.md` 有汇总表。

| 目录 | 主题 | 条目数 | 代表条目 |
|---|---|---|---|
| `a-advanced-rag/` | 高级 RAG / Agentic RAG / Deep Research | 17+索引 | GraphRAG、LightRAG、HippoRAG 1/2、RAPTOR、SiReRAG、CRAG、Self-RAG、Search-o1、MemoRAG |
| `b-knowledge-extraction/` | LLM 知识抽取 / 事实库 / 时序图谱 / 开源系统 | 16 | Zep-Graphiti（含 3 个抽取 prompt 源码）、GraphRAG covariates schema、Dense X 命题、FActScore、KGGen、RAGFlow Knowledge Compilation 转向 |
| `c-agent-memory-skill/` | agent 记忆 / 经验与技能蒸馏 / 认知架构 | 16 | CoALA、MemGPT/Letta（sleep-time）、Mem0、A-Mem、Generative Agents 反思、ExpeL、Voyager、Anthropic Agent Skills |
| `d-learning-science/` | 学习科学（标注证据等级） | 16 | 检索练习双元分析（Adesope/Yang）、FSRS、合意困难（Bjork）、protégé effect、Chi 专家-新手、哈佛 AI 导师 RCT |
| `e-pkm-products/` | PKM 方法论 / AI 知识产品 / 研究工具 / 开放格式 | 19 | evergreen notes、Zettelkasten、NotebookLM、Scite Smart Citations、Elicit、Sudowrite Story Bible、SKILL.md、Obsidian 格式 |

调研方法：WebSearch 定位 → WebFetch/curl（代理 127.0.0.1:7897 兜底）抓原文 → 只入档真实抓到原文的条目；两处 arXiv ID 错配（GRAG/Dense X）与不存在条目（"SiReRi"）已在档案内注明。少数出版方拦截的文献（Bertsch、Mayer、SOLO 原文、NotebookLM SIGDOC 论文、Mem.ai）未强行入档，在相关条目内以次级来源标注。
