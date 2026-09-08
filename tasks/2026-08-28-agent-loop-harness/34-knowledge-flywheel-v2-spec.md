# 34 · 知识飞轮 v2 详细设计——分层知识 + 向量化 + 图谱融合 + 系统知识（v2 修订，待确认后开工）

> 33 号实测反馈：现有飞轮太简单，期望知识模块支持 agent 获取知识和记忆，且分层：
> 用户习惯/喜好 → 业务模块（长文写作、剧集制作、未来更多）→ 项目级。
> v2 修订（用户追问）：①是纯文本保存吗？要不要向量化存储？②长文的图谱如何与知识集成融合？
> 本版基于对 KB 检索链路、长文图谱实体/接口、embedding 基础设施的代码级调查重写，**经确认后分期开工**。

## 1. 现状盘点（v1 + 可复用的既有设施）

### 1.1 飞轮自身（v1）

- 实体 `agent_memory_entries`：userId + kind(fact/sop/preference/skill) + contentJson{title,content,tags} + confidence + status + use/success 计数 + **embedding_id（预留死字段，全仓无读写**，注释"向量后置"）。
- 写入仅一条路：任务 succeeded 后 distill ≤3 条；失败教训回写。读取 `assemble(taskText)` 纯关键词命中 top-3。
- 生效：confidence ≥ 0.7 自动 active，否则待办中心人工批准。

### 1.2 可复用的既有设施（本次调查确认，飞轮不自建）

| 设施 | 现状 | 证据 |
| --- | --- | --- |
| **KB 检索已是混合检索** | `search()`：向量召回 + BM25（jieba 分词倒排索引）加权融合，`vectorWeight` 可调（1=纯向量/0=纯关键词） | knowledge-base.service.ts:963-1045；BM25 参数 :76-77 |
| **向量存储双实现** | `kb_vectors` 表（pgvector `halfvec(8192)` + HNSW 余弦索引）/ LanceDB，env 切换；`IVectorStore.searchSimilar/searchByMetadata` | pg-vector-store.ts:53,146；vector-store.interface.ts:14-40 |
| **embedding 生成函数** | `getEmbeddingVectors(texts, config)`：按提供商路由（dashscope/zhipu/openai 兼容），长文已在复用 | knowledge-base.service.ts:889-938；lw-vector-index.service.ts:478 |
| **向量记账模式** | 长文 `lw_vector_indices`：chunkId↔实体/章节 + contentHash 增量跳过 + preview | lw-vector-index.entity.ts:15-19 |
| **长文图谱（结构化知识）** | 六类节点表（人物/地点/物品/技能/势力/事件，全挂 projectId）+ `lw_graph_edges`（含章节有效期 validFrom/validUntil）+ 实体状态快照 + 一致性规则 R1-R6 + 章节图谱提取流水线 | graph.service.ts:50-331；consistency.service.ts:40-330；chapter-graph.processor.ts:69 |
| **图谱查询接口** | getGraph/getRelations/stateAt/getTimeline/edgesAt 等 20+ IPC 通道与 GraphService 方法——**接口现成，装配层直接调** | longwriting.handler.ts:295-320 |

结论：**向量化不需要新建任何底层**，接上即可；图谱是成熟的独立子系统，飞轮应当引用而非收编。

## 2. 设计总览：四层知识模型

```
┌─ L0 系统知识（新）：业务模块/功能、函数工具、工作流、skill 的结构化快照
├─ L1 用户知识：习惯/喜好/偏好/全局事实（跨业务生效）
├─ L2 业务知识：biz:<moduleId>
└─ L3 项目知识：project:<moduleId>:<projectId>
     = 结构化通道（长文：图谱直查） + 非结构化通道（飞轮记忆向量召回）  ← v2 新划分
```

- 装配合并：三层叠装；同主题冲突按 L3 > L2 > L1 排序；每层 ≤2、总量 ≤6、字节数二次收紧。

## 3. 存储设计：文本本体 + 向量检索面（回答"要不要向量化"）

**记忆本体仍是 SQLite 文本行**（结构化字段可查询、可审计、可人工编辑——这是知识治理需要的），
**但检索面升级为混合检索**——"纯文本保存"指的是本体，"要不要向量化"答案是**要**，且只做检索面：

```
写入：条目 active 时异步嵌入（复用 getEmbeddingVectors；模型=提供商配置的 embedding 模型，
      如 qwen3.7-text-embedding；文本=title+content 拼接，截断到模型上限）
      → 写 IVectorStore（metadata: {scopeBiz, scopeProject, kind, entryId}）
      → 回填 embedding_id + content_hash
      → 失败降级：只留关键词检索，embedding_id 空（检索永不因 embedding 挂掉）
更新：content_hash 变了才重嵌入（lw_vector_indices 同款增量纪律）
删除：条目失效/删除时同步删向量记录
读取：assemble = 向量召回（query 嵌入，searchByMetadata 按 scope 过滤，3 倍召回）
      ∪ 关键词命中（v1 兜底）→ 加权融合（沿用 KB search 的 vectorWeight 公式）
      → 层级权重（L3×1.3/L2×1.15/L1×1.0）→ 分层配额截断
```

- 成本：embedding 是最便宜的 API（文本量=条目本身，几百字），条目级一次性成本；批量嵌入+失败重试幂等。
- 多租户：向量 metadata 带 scope 过滤 + 查询前 userId 校验（与租户 where 纪律同红线，单测强制）。

## 4. 图谱融合（长文 L3 的双通道设计）

**原则：图谱是 L3 项目知识的结构化骨架，飞轮引用它而不是复制它。**

```
L3 项目知识装配（长文宿主注入 structuredQuery 端口后）：
  通道A 结构化直查（确定性事实）：
    GraphService.getRelations(主角, 章节号)   → 当前有效关系边
    GraphService.stateAt(entity, chapter)    → 实体状态快照
    ConsistencyService.scanContradictions()  → 已知矛盾（作为"风险知识"注入）
  通道B 非结构化召回（模糊经验）：
    飞轮 L3 记忆向量召回（写作经验、情节事实备忘、风格偏好沉淀）
  合并：A 通道内容序列化为紧凑事实段（预算内优先——它是确定性事实），
        B 通道按相关性排序续装，总量守恒
```

- 图谱→记忆的**沉淀**（不是复制）：章节确认流水线（ChapterGraphProcessor）跑完后，把本章事件摘要
  （事件名/涉及实体/状态变化）写为一条 L3 记忆（kind=fact，来源=chapter_graph）——它可被向量召回，
  且跨项目检索时不携带图谱全量。
- 非长文业务的 L3：没有图谱就只有 B 通道——装配接口一致（structuredQuery 可选注入），实现天然分层。
- 不做的事：不把图谱节点/边向量化进飞轮（图谱有自己的确定性查询接口，复制进向量库会产生双份真相）。

## 5. L0 系统知识层

（与 v1 版设计一致，要点保留）

- 内容=能力目录的结构化快照（业务模块/函数工具/工作流/skill），单一事实源仍是注册表，快照是读优化。
- **摘要进上下文、目录走工具**：装配时只注入几百字节摘要（"系统有 X 模块/Y 工具/Z 工作流/W skill，详情用 discover_capabilities 查"）；全量目录由 agent 按需拉取。
- 变更钩子刷新（工具注册/工作流发布/skill 变更）；免审批（客观事实）；快照带 generatedAt，>24h 强制重算。

## 6. 写入路径

| 来源 | 层 | 时机 | 成本控制 |
| --- | --- | --- | --- |
| 任务经验 distill（v1） | 按任务归属打标 L2/L3 | 任务 succeeded | 便宜模型，成功才跑 |
| 对话偏好沉淀（新） | L1 | 会话结束/节流触发 | 每会话 ≤1 次，空结果即止 |
| 章节图谱事件摘要（新，长文） | L3 | 章节确认流水线后 | 零额外 LLM（摘要来自流水线既有产物） |
| 手工录入（新） | 任意层 | 知识飞轮页表单 | 零模型成本，默认 pending |
| 失败教训回写（v1） | 同任务归属 | 任务 failed | 不变 |

## 7. 数据模型改造

```sql
ALTER TABLE agent_memory_entries ADD COLUMN biz_module VARCHAR NULL;   -- NULL=用户级
ALTER TABLE agent_memory_entries ADD COLUMN project_id VARCHAR NULL;
ALTER TABLE agent_memory_entries ADD COLUMN content_hash VARCHAR NULL; -- 增量嵌入判据
-- embedding_id 激活（指向 kb_vectors/向量记录），无需新表
```

- 组合索引 `(user_id, status, biz_module, project_id)`；存量行 NULL=用户级，零迁移。
- contentJson 增加 `source`（task_distill/chat_preference/manual/chapter_graph/system_snapshot）。

## 8. UI（AgentMemoryView，M-Ke2）

按层切换（系统/用户/业务/项目，业务项目再选具体实例）；条目卡含 kind/来源/置信度/计数/状态；
操作：批准/驳回/失效；手工录入入口。

## 9. 测试计划（省成本纪律）

- 单测（mock，零成本）：scope 过滤/融合排序/配额截断/embedding 失败降级/图谱双通道合并/租户隔离（强制用例）。
- 真模型冒烟（一次性）：1 次 distill→嵌入→检索召回断言（结构化产物校验，不做主观评判）；图谱通道用既有测试项目数据直查断言。

## 10. 分期与验收

| 期 | 内容 | 验收 |
| --- | --- | --- |
| M-Ke1 | 两列迁移 + scope 装配 + 任务打标 + 手工录入 + 对话偏好沉淀 | 单测全绿；长文任务经验落 L3 并在下一任务装配可见 |
| M-Ke2 | **向量化检索**（嵌入管线+混合融合+降级开关） + 分层 UI | 向量召回命中断言；embedding 关闭时关键词兜底可用 |
| M-Ke3 | 图谱双通道（长文 structuredQuery 端口 + 章节摘要沉淀） + L0 系统知识 | 长文装配含图谱事实段；发布新工作流后 L0 摘要变化 |
| 验证 | 知识飞轮 + 各接线模块全面测试（35 号 §5 同款省成本策略） | 见 35 号 §5，一次跑通不重跑 |

## 11. 风险

- 上下文预算：摘要+装配硬上限，超限按权重截断。
- 租户隔离：向量 metadata scope 过滤 + userId 校验，强制单测（红线）。
- pgvector 依赖：LanceDB 切换分支同样支持（IVectorStore 双实现现成）。
- embedding 提供商不可用：降级关键词，检索面永不阻塞。
- 快照陈旧：L0 generatedAt 超龄强制重算。
