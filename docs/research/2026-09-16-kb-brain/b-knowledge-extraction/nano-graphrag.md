# nano-graphrag：1100 行的可魔改 GraphRAG 参考实现

- 链接：https://github.com/gusye1234/nano-graphrag（~4k stars；注意：原 README 写于 HKUDS，现维护者为 gusye1234）
- 时间：2024-06 起，2026-09 仍可安装（PyPI `nano-graphrag`）
- 来源：GitHub README 原文抓取（readme.md，main 分支）

## 原文摘录

**README：**

> 😭 [GraphRAG](https://arxiv.org/pdf/2404.16130) is good and powerful, but the official [implementation](https://github.com/microsoft/graphrag/tree/main) is difficult/painful to **read or hack**.
>
> 😊 This project provides a **smaller, faster, cleaner** GraphRAG, while remaining the core functionality(see benchmark and issues ).
>
> 🎁 Excluding `tests` and prompts, `nano-graphrag` is about **1100 lines of code**.
>
> 👌 Small yet portable(faiss, neo4j, ollama...), asynchronous and fully typed.

**增量插入：**

> `nano-graphrag` supports incremental insert, no duplicated computation or data will be added

**查询模式：**

> ```python
> # Perform global graphrag search
> print(graph_func.query("What are the top themes in this story?"))
> # Perform local graphrag search (I think is better and more scalable one)
> print(graph_func.query("What are the top themes in this story?", param=QueryParam(mode="local")))
> ```

## 核心机制拆解（中文）

- 完整复刻 GraphRAG 主线：chunk → 实体/关系抽取（prompt 几乎照搬微软官方）→ gleaning 补抽 → Leiden 社区 + 社区报告 → global（map-reduce 社区）与 local（实体邻域）双查询。
- 关键工程价值：**所有 prompt 集中在 `nano_graphrag/prompts.py` 单文件**、存储抽象（KV/向量/图三接口可换 faiss/neo4j/ollama）、全异步。
- 增量插入：新文档独立抽取后并入既有存储，跳过已存在社区重算（local 模式受益明显）。
- LightRAG 即由 HKUDS 在本项目的思想上发展而来（作者群重叠，LightRAG 论文引用了它）。

## 证据与局限

- 证据：README + 源码结构直接可读；社区把它当作"读懂 GraphRAG 每一步"的教学实现。
- 局限：维护趋缓（作者转向 memobase）；无时间维度、无消歧、无矛盾处理；规模上限低（单机存储）。

## 对我们的适用性

1. **最适合当"逐行教材"**：想理解 GraphRAG 式抽取→合并→社区报告的每一步中间数据长什么样，读它 1100 行比读微软工程化代码快十倍；我们设计"文档提炼层"的中间产物格式时可对照它调试。
2. 它的 `prompts.py` 单文件集中管理抽取/合并/报告全部 prompt 的组织方式，适合我们直接效仿（便于版本化与 A/B）。
3. 不建议作为生产依赖（维护状态）；机制应移植进我们自研管线。
