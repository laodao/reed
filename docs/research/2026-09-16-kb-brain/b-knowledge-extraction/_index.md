# 知识提取调研索引：用 LLM 从文档构建知识库/知识图谱/事实库（2024-2026 + 奠基工作）

- 调研日期：2026-09-16
- 方法：WebSearch 定位 + curl（走代理 `http://127.0.0.1:7897`）抓取 arXiv API / GitHub raw README / 官方文档 / 源码，全部原文摘录存档于本目录
- 覆盖主题：LLM-OpenIE 与原子事实 / KG 构建 pipeline / 时序 KG 记忆 / 图+向量混合索引 / 冲突与知识编辑 / 开源系统知识提取层 / 2025-26 趋势

## 汇总表

| # | 条目 | 类型 | 一句话核心 | 对我们最值得拿走的东西 |
|---|------|------|-----------|------------------------|
| 1 | [zep-graphiti-temporal-kg](./zep-graphiti-temporal-kg.md) | 论文+系统+源码 | 双时间线时序 KG 记忆引擎（valid_at/invalid_at，矛盾即失效不删除） | dedupe 的 duplicate/contradicted 判定 prompt；fact 反泛化规则；bi-temporal 的"摄入时间线" |
| 2 | [graphrag-from-local-to-global](./graphrag-from-local-to-global.md) | 论文+官方文档 | 实体/关系/社区/claim 四层索引 + 全层 text_unit 溯源 | covariates(claim) 表 schema（subject/object/status/时间区间/source_text）；描述合并策略 |
| 3 | [lightrag](./lightrag.md) | 论文+系统+源码 | 轻量双层（low/high-level）图检索 + 增量更新 | 索引期 LLM cache 支撑删除重建；Section Context 消歧（防注入写法） |
| 4 | [nano-graphrag](./nano-graphrag.md) | 系统 | 1100 行 GraphRAG 参考实现 | 逐行教材 + prompt 单文件集中管理 |
| 5 | [dense-x-retrieval-propositions](./dense-x-retrieval-propositions.md) | 论文（奠基） | proposition = atomic + self-contained + concise NL 检索单元 | 原子事实三要件定义；细粒度不伤检索的实证 |
| 6 | [llm-atomic-propositions-triplet-extraction](./llm-atomic-propositions-triplet-extraction.md) | 论文（2026） | 命题化作为抽取中间层；32B→0.6B 蒸馏命题器 | 两段式抽取（句子→命题→结构化）；本地小模型做原子化的成本分层 |
| 7 | [kggen-kg-from-plain-text](./kggen-kg-from-plain-text.md) | 论文+库 | 多遍不同切分抽取 + 实体聚类合并；MINE 信息保持基准 | 多遍聚合抽取法；kg-gen 可当抽取层原型基线 |
| 8 | [autoschemakg-schema-induction](./autoschemakg-schema-induction.md) | 论文（2025） | 抽取与 schema 归纳同步；实例-概念双层；92% 对齐人工 schema | schema-light：入库时同步归纳候选关系类型映射到我们的六类关系 |
| 9 | [llm-kgc-survey](./llm-kgc-survey.md) | 综述（2025-10） | ontology/抽取/融合三层 × schema-based/free 两轴 | fusion（消歧/合并/冲突）是最薄弱环节=我们的差异化位 |
| 10 | [hipporag-kg-memory](./hipporag-kg-memory.md) | 论文×2 | 海马体理论：KG+个性化 PageRank 一次扩散≈多跳；v2 修正图检索伤事实记忆 | 在我们图上加 PPR 扩散检索；精确层与联想层并联 |
| 11 | [knowledge-conflicts-survey](./knowledge-conflicts-survey.md) | 综述 | 冲突三分类：context-memory / inter-context / intra-memory | inter-context=矛盾扫描靶心；冲突构造法可反向做我们的测试集生成器 |
| 12 | [knowledge-editing-rome-memit](./knowledge-editing-rome-memit.md) | 论文×3 | 权重编辑不可行（连续编辑退化），SERAC 外挂记忆路线胜出 | KME 三维评价（可靠/特异/泛化）用于"关旧开新"验收；成组事务式更新 |
| 13 | [factscore-atomic-facts](./factscore-atomic-facts.md) | 论文（奠基） | 长文→原子事实→逐条检索核验，<2% 人评误差 | 反向=入库提炼流程；正向=草稿设定一致性检查的产品化出口 |
| 14 | [anthropic-context-engineering-notes](./anthropic-context-engineering-notes.md) | 工程博客（2025-09） | context rot→知识须在上下文外结构化沉淀 | sub-agent 蒸馏式多文档综合；"持续写结构化笔记"=持续提炼叙事 |
| 15 | [classic-rag-systems-khoj-qanything-ragflow](./classic-rag-systems-khoj-qanything-ragflow.md) | 系统×3+releases | Khoj/QAnything 知识层=经典 RAG；RAGFlow 2026 转向 Knowledge Compilation | 同批事实多产物渲染（图/时间线/树）；"文档→事实库"生态位 2026-09 仍空缺 |

## 主题覆盖对照

- 主题1（LLM-OpenIE/claim/原子事实）：条目 5、6、13（+2 的 claim 提取）
- 主题2（KG 构建 pipeline）：条目 2、4、7、8、9
- 主题3（时序 KG 与记忆）：条目 1、10（+12 的编辑视角）
- 主题4（图+向量混合与 GraphRAG indexing 细节）：条目 2、3、10
- 主题5（冲突消解/核验/知识编辑）：条目 11、12、13
- 主题6（开源系统知识提取层）：条目 1、3、4、15
- 主题7（2025-26 趋势/context engineering/结构化中间表示/schema-light）：条目 6、8、9、14、15

## 横向结论（快速版）

1. **抽取层已有成熟 prompt 工程资产可抄**（Graphiti 源码、GraphRAG 文档、LightRAG prompt.py、nano-graphrag prompts.py），存储层不必换。
2. **原子事实的表示共识**：自然语言短句（atomic+self-contained）优于裸三元组，三元组/图作为其上的结构化视图。
3. **矛盾处理的主流方案是时序失效（关旧开新）+ 入库时局部判定**（Graphiti），全库离线扫描是空白。
4. **2026 趋势三向汇合**：RAGFlow Knowledge Compilation、Anthropic 结构化资产、schema-light 抽取——"一次提炼、多维结构化产物"。
