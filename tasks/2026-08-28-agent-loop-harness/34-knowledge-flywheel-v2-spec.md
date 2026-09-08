# 34 · 知识飞轮 v2 详细设计——分层知识 + 向量化 + 图谱融合 + 系统知识（v2 修订，待确认后开工）

> 33 号实测反馈：现有飞轮太简单，期望知识模块支持 agent 获取知识和记忆，且分层：
> 用户习惯/喜好 → 业务模块（长文写作、剧集制作、未来更多）→ 项目级。
> v2 修订（用户追问）：①是纯文本保存吗？要不要向量化存储？②长文的图谱如何与知识集成融合？
> 本版基于对 KB 检索链路、长文图谱实体/接口、embedding 基础设施的代码级调查重写，**经确认后分期开工**。
> ✅ 已过对抗评审（2026-09-08）：P0×2（向量 scope 过滤机制不存在→改 kbId 分区键方案；租户隔离 topK 漏召回→分区键按构造隔离）、
> P1×3（置信度闸门语义写反、provider 契约与 GraphService 缺口、会话结束钩子不存在）已修订入文；
> 执行拆分见 `subtasks/`（KE-1→KE-2→KE-3→KE-4）。

## 1. 现状盘点（v1 + 可复用的既有设施）

### 1.1 飞轮自身（v1）

- 实体 `agent_memory_entries`：userId + kind(fact/sop/preference/skill/episode-ref) + contentJson{title,content,tags} + confidence + status + use/success 计数 + **embedding_id（预留死字段，全仓无读写**，注释"向量后置"）。
- 写入仅一条路：任务 succeeded 后 distill ≤3 条；失败教训回写。读取 `assemble(taskText)` 纯关键词命中 top-3。
- 生效（评审修正）：CONFIDENCE_GATE=0.7 **以下直接丢弃**；≥0.7 也一律 `pending_review`，`approve()` 人工放行是唯一 active 路径（memory-flywheel.ts:100-116,157-163）——v2 沿用该保守语义。

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
**但检索面升级为混合检索**。"要不要向量化"答案是**要**，且只做检索面。

**存储路线（评审 P0 修订）：knowledgeBaseId 分区键方案，零 IVectorStore 接口改动。**
评审查明：`VectorMetadataFilter` 只有 projectId/entityType/entityId/chapterNumber 五个固定字段、
kb_vectors 是固定列无通用 metadata、且 pgvector **查询不过滤 userId**（topK 先截断，取回后校验会漏召回）——
扩展接口要动双实现+双端迁移，不值得。改用分区键：

```
分区键约定：knowledgeBaseId = 'mem:{userId}'                     （L1 用户层）
          = 'mem:{userId}:biz:{module}'                         （L2 业务层）
          = 'mem:{userId}:proj:{module}:{projectId}'            （L3 项目层）
写入：条目生效（approve）后异步嵌入（getEmbeddingVectors，模型=提供商 embedding 配置）
      → searchSimilar 所用同一 IVectorStore，按层写入对应分区；回填 embedding_id + content_hash + embed_model
      → 失败降级：只留关键词检索（检索面永不因 embedding 挂掉）
更新：content_hash **或 embed_model** 变了才重嵌入（评审 P2-8：换提供商后旧向量失配的漂移纪律）
删除：条目失效/删除时同步删向量记录（按记录 id）
读取：assemble 按层各查各的分区（searchSimilar(kbId=分区键)）——分层配额天然对齐，
      租户隔离**按构造成立**（分区键含 userId，永不查别人的分区；单测强制）
      → 各层结果加权融合（L3×1.3/L2×1.15/L1×1.0）→ 分层配额截断
```

- 成本：embedding 是最便宜档 API，条目级一次性；批量嵌入+失败重试幂等。
- 评审 P2-6 配套：迁移走 SQLite/PG 双方言（create-agent-memory-entries.ts 先例）并注册进
  electron/web 两个迁移序列；repository 新增 listActiveByScope（或 listActive+内存过滤，量级可接受）。

## 4. 图谱融合（长文 L3 的双通道设计）

### 4.1 边界裁决：存储不统一，检索/沉淀接口统一（用户问询钉死的边界）

| 维度 | 裁决 | 理由 |
| --- | --- | --- |
| **存储** | 各自拥有：图谱表留在长文域，飞轮表在飞轮，KB 表在 KB——**不收编、不搬家** | 三者数据形态与语义完全不同（章节有效期/实体类型/一致性规则都是长文领域概念）；没有共享消费者需要直读原始存储；搬表=让知识模块理解每个业务的领域模型 |
| **检索（读）** | **知识飞轮模块提供统一对外接口**：宿主/agent 只对知识模块说话，内部扇出 L0 快照 + 记忆混合检索 + 结构化提供方（图谱=第一个注册者） | 契合"知识模块是 agent 获取知识的统一入口"的期望；消费方不感知知识来自图谱还是记忆 |
| **写入** | 两类分开：知识沉淀类（任务经验/对话偏好/章节事件摘要）统一走知识模块写入 API；领域操作类（实体 CRUD/边维护/关系生成）留在各域 handler——那是领域操作不是知识沉淀 | 防止知识模块变成"什么都能写"的大杂烩；领域完整性约束留在领域内 |

### 4.2 结构化提供方契约（最小接口，单实现不起注册中心）

```ts
/** 知识模块对结构化知识源的最小契约（M-Ke3 落地；唯一实现=长文图谱） */
interface StructuredKnowledgeProvider {
  readonly id: string                       // 'longwriting-graph'
  supports(scope: { bizModule?: string; projectId?: string }): boolean
  query(req: {
    scope: { bizModule?: string; projectId?: string }
    topics: string[]                        // 装配目标提取的实体/主题词
    budget: { maxSegments: number; maxChars: number }
  }): Promise<KnowledgeSegment[]>
}
interface KnowledgeSegment {
  layer: 'L3'
  kind: 'structured-fact'                   // 确定性事实段，装配预算内优先
  text: string                              // 已序列化的紧凑事实（关系/状态/矛盾）
  source: { provider: string; ref: string } // 溯源（如 entityType:entityId）
}
```

- 长文侧实现（评审 P1-4 修正）= 三个服务的组装器，**名称→ID 解析是真实工作量**：
  `resolveEntities` 要求 `{type, name}` 且 `findByName` 精确等值匹配（graph.service.ts:379-382）——
  组装器需自行做别名/部分名容错（装配主题词 → 6 类实体逐类尝试 + 失败跳过）；
  `stateAt/getRelations` 需要 chapterNumber（须先推导"当前章"：项目最新章节或装配入参携带）；
  `scanContradictions` 在 **ConsistencyService**（consistency.service.ts:128）不在 GraphService。
  topics→实体解析的召回率是该 provider 的主要质量风险，M-Ke3 干跑单独验证。
- 守约：抽象按真实消费者数划定（当前 1 个实现）——**不做** provider 插件注册中心/管理 UI；EP 将来若需要（设定集），照同一契约加第二个实现时再谈演进。

### 4.3 装配双通道合并

```
L3 项目知识装配（知识模块统一入口）：
  通道A 结构化（provider.query，确定性事实）→ 预算内优先注入
  通道B 非结构化（飞轮记忆向量+关键词召回）→ 相关性排序续装
  合并：总量守恒；A 是确定性事实故排序权重高于 B
```

- 图谱→记忆的**沉淀**（不是复制）：章节确认流水线跑完后，把本章事件摘要（事件名/涉及实体/状态变化）
  经知识模块写入 API 存为 L3 记忆（kind=fact，source=chapter_graph）——可被向量召回，跨项目检索不带图谱全量。
- 非长文业务：无结构化提供方就只有 B 通道——装配接口一致，天然分层。
- 不做的事：不把图谱节点/边向量化进飞轮（确定性直查已覆盖，复制进向量库=双份真相）。

## 5. L0 系统知识层

（与 v1 版设计一致，要点保留）

- 内容=能力目录的结构化快照（业务模块/函数工具/工作流/skill/模块域工具），**单一事实源=统一工具注册表**
  （discover_capabilities 与 L0 同源：直连工具 + `pack:*` 模块域工具 + 已发布工作流 + 技能），快照是读优化。
  模块域工具经 pack 命名空间注册（`pack:ep-agent:*` / `pack:lw-agent:*`），M6.5-d 迁完后目录即覆盖全系统。
- **摘要进上下文、目录走工具**：装配时只注入几百字节摘要（"系统有 X 模块/Y 工具/Z 工作流/W skill，详情用 discover_capabilities 查"）；全量目录由 agent 按需拉取。
- 变更钩子刷新（工具注册/工作流发布/skill 变更）；免审批（客观事实）；快照带 generatedAt，>24h 强制重算。

## 6. 写入路径

| 来源 | 层 | 时机 | 成本控制 |
| --- | --- | --- | --- |
| 任务经验 distill（v1） | 按任务归属打标 L2/L3 | 任务 succeeded | 便宜模型，成功才跑 |
| 对话偏好沉淀（新） | L1 | **per-turn 节流**（评审 P1-5：聊天宿主无"会话结束"钩子——dialog 不关闭、删除即销毁；改为每 N 轮且距上次沉淀 ≥M 轮触发，N/M 默认 8/16，env 可调） | 每会话硬上限 2 次，空结果即止 |
| 章节图谱事件摘要（新，长文） | L3 | 章节确认流水线后 | 零额外 LLM（摘要来自流水线既有产物） |
| 手工录入（新） | 任意层 | 知识飞轮页表单 | 零模型成本，默认 pending |
| 失败教训回写（v1，口径修正） | 同任务归属 | 任务 failed——实为负样本计数回写（reportTaskOutcome(false)），无教训蒸馏；教训蒸馏列入 M-Ke2 可选项 | 不变 |

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

按层切换（系统/用户/业务/项目，业务项目再选具体实例）；条目卡含 kind/来源/置信度/计数/状态。
落地清单（评审 P2-7）：新增 IPC 三件套（am:list-by-scope / am:add-manual / am:deactivate）改
preload+channel-map+handler 三处；`MemoryRow` 加 scope/source 字段；后端补 deactivate（现有仅
approve/archive，无"驳回"）。
errata（评审 P2-9）：IVectorStore 接口在 vector-store.interface.ts:97-157（:14-40 是 VectorRecord）；
向量存储切换实为启动参数 mode:'lance'|'pgvector'（vector/registry.ts:22-35）非 env。

## 9. 测试计划（省成本纪律）

- 单测（mock，零成本）：scope 过滤/融合排序/配额截断/embedding 失败降级/图谱双通道合并/租户隔离（强制用例）。
- 真模型冒烟（一次性）：1 次 distill→嵌入→检索召回断言（结构化产物校验，不做主观评判）；图谱通道用既有测试项目数据直查断言。

## 10. 分期与验收

| 期 | 内容 | 验收 |
| --- | --- | --- |
| M-Ke1 | 两列迁移 + scope 装配 + 任务打标 + 手工录入 + 对话偏好沉淀 + **存量宿主补接** | 单测全绿；长文任务经验落 L3 并在下一任务装配可见 |
| M-Ke2 | **向量化检索**（嵌入管线+混合融合+降级开关） + 分层 UI | 向量召回命中断言；embedding 关闭时关键词兜底可用 |
| M-Ke3 | 结构化提供方契约 + 长文图谱注册（首个 provider）+ 章节摘要沉淀 + L0 系统知识 | 长文装配含图谱事实段；发布新工作流后 L0 摘要变化 |
| 验证 | 知识飞轮 + 各接线模块全面测试（35 号 §6 同款省成本策略） | 见 35 号 §6，一次跑通不重跑 |

**存量宿主补接（M-Ke1 内，用户纪律：所有 agent 功能都需要四大能力）**：
- chat 宿主**记忆装配缺失**——聊天 agent 至今不装配经验（flywheel.assemble 未接，聊天看到的"已装配 N 条"全是任务会话的）；补接 L0+L1（对话未绑定业务时）。
- 全宿主 **ContextManager 未接线**——loop 的 `deps.context` 四个生产宿主全部空缺（长对话无窗口管理/压缩，只有未投产的独立宿主在用）；chat/任务/长文随 M-Ke1 一并接上，EP 随 35 号 §4 接。
- 接线验收：每宿主一条"装配留痕"轨迹（memory_assembly）+ 长对话压缩断言。

## 11. 风险

- 上下文预算：摘要+装配硬上限，超限按权重截断。
- 租户隔离：向量 metadata scope 过滤 + userId 校验，强制单测（红线）。
- pgvector 依赖：LanceDB 切换分支同样支持（IVectorStore 双实现现成）。
- embedding 提供商不可用：降级关键词，检索面永不阻塞。
- 快照陈旧：L0 generatedAt 超龄强制重算。
