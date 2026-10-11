# 统一图存储（GraphStore）设计（2026-10-10）

> 状态：设计稿，待用户确认
> 关联：2026-10-08-unified-data-registry-design.md（登记与存储分离的先例）、2026-10-10-knowledge-brain-v3-redesign.md（kb 图谱消费方）

## 1. 背景与问题

仓库现有 **5 套各自为政的「节点+边」图存储**，全是 TypeORM entity + repository，落在同一个数据库，但表名、schema、去重方式、遍历实现互不相同：

| # | 模块 | 边表 | 作用域 | 端点 | 关系处理 | 去重 | 图算法 |
|---|---|---|---|---|---|---|---|
| A | 长文·主图谱 | `lw_graph_edges` | project_id | 多态 type+id | 自由文本+谓词注册表归一 | 应用层 keySet（只看仍生效边） | 无（R1-R10 规则扫描） |
| B | 长文·IP 库 | `lw_ip_edges` | （用户级） | 同质 | 自由文本 | 无 | 无 |
| C | 长文·世界观库 | `lw_world_edges` | world_id | 同质 | 自由文本 | 无 | 无 |
| D | 知识大脑 | `kb_knowledge_edges` | knowledge_base_id | 多态 kind+id | TS 闭式枚举+白名单 | DB 五元组唯一约束 | PPR+邻域 |
| E | 领域学习 | `dl_relation` | project_id | 同质（恒指 dl_concept） | 自由字符串 | 应用层 upsert | BFS 判环 |

重复实现的代价：
- 名称→ID 解析两套（`graph.service.ts:496` 四级 vs `graph-build.service.ts:117` 两级）；
- 幂等批量建边两套（lw `batchCreate`+keySet vs kb `createBatch`+事务查重）；
- 遍历三套风格（lw 全量拉边过滤、kb PPR、dl BFS 判环）；
- 同一 schema 手工复制三次（lw_graph_edges → ip/world，`lw-world-edge.entity.ts:5` 注释自认"形态复制"）；
- 新模块要图数据就得再抄一套。

不存在共享抽象：全仓库 grep `GraphStore|IGraphStore` 零命中；`src/core/platform/services/graph/` 只有一个纯函数 `ppr.ts`，且仅 kb-brain 在用。

## 2. 目标与非目标

### 目标
1. **一个基础功能模块（GraphStore）**，对外提供统一的图数据 CRUD / 遍历 / 快照 / PPR 接口。
2. **底层存储同一套物理表**，不同业务的图数据用**库名（graph_name）区分**，业务各自创建、互不可见。
3. 五套存量图数据平滑迁移，消费方（IPC handler、前端）零改动。

### 非目标（明确不做）
- **不统一节点表**。节点的"真身"是各业务实体（lw_characters / kb_entities / dl_concept…），带别名、合并、时间线等业务语义；GraphStore 只存边，端点是**不透明引用 `(kind, id)`**，不做 FK 校验（与现状一致）。
- 不收编关系语义策略：kb 的闭式枚举白名单、lw 的谓词注册表归一，**留在模块侧**，在调用 GraphStore 之前执行。存储层对 relation 一视同仁（自由字符串）。
- 不动 workflow DAG（引擎拓扑）、不动 ForceGraph 等渲染组件、不动知识飞轮 provider 注册表（那是检索期供给接口，不是存储）。
- 不做跨图联合查询（v1 各图独立；graph_name 规范已为将来留口）。

## 3. 总体设计

```
┌─ 业务模块（各自保留）────────────────────────────────────┐
│ 长文:graph.service/chapter-graph.processor/consistency   │
│ kb-brain:graph-build/brain-query/metabolize…             │
│ domain-learning:learning-graph.service                   │
│ IP 库 / 世界观库 service                                  │
│   ↑ 模块侧策略：谓词注册表归一、关系白名单、名称解析、抽取管线 │
└──────────┬───────────────────────────────────────────────┘
           │ 唯一依赖面
┌──────────┴───────────────────────────────────────────────┐
│ GraphStoreService（src/core/platform/services/graph/）    │
│  addEdges / updateEdge / removeEdges / listEdges          │
│  neighbors / reachable / findPath / snapshot / ppr / stats│
├──────────────────────────────────────────────────────────┤
│ graph_edges 单表 + BaseRepository（user_id 租户隔离）      │
│ 复用 ppr.ts（平台层纯函数，kb 已在用）                      │
└──────────────────────────────────────────────────────────┘
```

### 3.1 库名规范（graph_name）

库名是字符串命名空间，格式 `{module}:{scopeKey}`，由各模块的 builder 函数生成（`graph-names.ts`，避免裸字符串散落）：

| 业务 | 库名 | 生成函数 |
|---|---|---|
| 长文主图谱 | `lw:project:{projectId}` | `lwProjectGraph(projectId)` |
| 长文 IP 库 | `lw:ip` | `lwIpGraph()` |
| 长文世界观库 | `lw:world:{worldId}` | `lwWorldGraph(worldId)` |
| 知识大脑 | `kb:{kbId}` | `kbGraph(kbId)` |
| 领域学习 | `dl:project:{projectId}` | `dlProjectGraph(projectId)` |

- **不需要 registry 表**：库名即可区分（用户诉求原话"按照不同的库名区分即可"）。`listGraphs()` 用 `DISTINCT graph_name` 派生，`deleteGraph()` 即按名级联删边。模块元数据（owner、展示名）放代码常量，不进 DB，避免双写漂移。
- 租户：`user_id` 列由 BaseRepository 统一注入（与现状一致，Electron 单用户 null）。同名库天然 per-user 隔离。

### 3.2 端点模型

```ts
type GraphEndpoint = { kind: string; id: string }
```

`kind` 由各模块自定约定并集中登记在 `graph-names.ts`（或 adjacent 常量文件）：lw 用实体类型名（`character|location|item|faction|skill|event`），kb 沿用 `atom|note|entity`，dl 用 `concept`，IP 库 `ip_character`，世界观 `world_entry`。

## 4. 统一存储 schema

新表 `graph_edges`（实体 `entities/graph/graph-edge.entity.ts`，双方言 DDL 按 `create-lw-graph-tables.ts` 模式）：

```sql
CREATE TABLE graph_edges (
  id           varchar PRIMARY KEY,
  user_id      varchar,                  -- BaseRepository 租户隔离
  graph_name   varchar NOT NULL,         -- 库名（§3.1）
  source_kind  varchar NOT NULL,
  source_id    varchar NOT NULL,
  target_kind  varchar NOT NULL,
  target_id    varchar NOT NULL,
  relation     varchar NOT NULL,         -- 自由字符串，策略在模块侧
  label        text,
  description  text,
  evidence     text,                     -- kb 铁律「为什么相关」；其余模块可空
  confidence   real,                     -- kb 边权（PPR 用）；其余可空
  verified     integer DEFAULT 0,        -- kb/dl 人审位
  origin       text,                     -- JSON 溯源（{type:'extract'|'manual',...}）
  valid_from   integer,                  -- 业务序数区间（lw=章节号），NULL=起点不限
  valid_until  integer,                  -- NULL=至今有效
  props        text,                     -- JSON 扩展位，避免以后加列
  created_at   bigint,
  updated_at   bigint                    -- 统一 bigint epoch-ms + transformer（lw 惯例）
);

CREATE INDEX idx_graph_edges_name   ON graph_edges (graph_name);
CREATE INDEX idx_graph_edges_src    ON graph_edges (graph_name, source_kind, source_id);
CREATE INDEX idx_graph_edges_tgt    ON graph_edges (graph_name, target_kind, target_id);
CREATE INDEX idx_graph_edges_rel    ON graph_edges (graph_name, relation);

-- 关键设计：部分唯一索引（PG 与 SQLite 均支持）
CREATE UNIQUE INDEX uq_graph_edges_active
  ON graph_edges (graph_name, source_kind, source_id, relation, target_kind, target_id)
  WHERE valid_until IS NULL;
```

**为什么唯一约束是「部分」的**：lw 的幂等去重键**只看仍生效的边**（`validUntilChapter === null`，`graph.service.ts:308-311`）——"师徒 ch1-5 关停、ch10 重建"是合法操作，硬性五元组唯一会破坏它。`WHERE valid_until IS NULL` 的部分唯一索引恰好同时编码了两端语义：
- 对 lw：只约束"仍生效边不重复"= 现行 keySet 行为；
- 对 kb / dl / ip / world：这些边 `valid_until` 恒为 NULL ⇒ 退化为全量五元组唯一 = kb 现行 DB 约束（`kb-knowledge-edge.entity.ts:39`）。

字段取舍说明：
- `valid_from/valid_until` 提为一级列而非塞 `props`：lw 的章节时间线是高频查询维度（一致性规则、章节确认管线都要按"第 N 章仍生效"过滤），JSON 过滤代价高；语义上定义为"业务自定的序数区间"，非 lw 独占。
- `evidence/confidence/verified/origin` 提为一级列：kb 与 dl 已在用，且是通用"证据/置信/人审/溯源"语义，不是 kb 私有。
- 时间戳统一 bigint epoch-ms + transformer（lw 惯例；kb/dl 现为 Date，迁移时 `getTime()` 换算）。

## 5. 统一接口（GraphStoreService）

位置：`src/core/platform/services/graph/store/`（与既有 `ppr.ts` 同目录收敛）。

```ts
// graph.types.ts
interface GraphEdgeSpec {
  source: GraphEndpoint
  target: GraphEndpoint
  relation: string
  label?: string
  description?: string
  evidence?: string
  confidence?: number          // 默认 null
  verified?: boolean           // 默认 false
  origin?: unknown             // JSON
  validFrom?: number | null
  validUntil?: number | null
  props?: Record<string, unknown>
}
interface GraphEdge extends GraphEdgeSpec {
  id: string
  graphName: string
  createdAt: number
  updatedAt: number
}
interface EdgeFilter {
  relation?: string | string[]
  source?: GraphEndpoint       // 单端点过滤
  target?: GraphEndpoint
  kind?: string                // 按 kind 过滤任一端
  validAt?: number             // valid_from <= x 且 (valid_until 为 NULL 或 >= x)
  verified?: boolean
}

// graph-store.service.ts —— 无状态，构造时注入 db-manager 访问器（沿用各服务
// getCoreDatabaseManager() 惰性获取模式，不引入新的全局容器）
class GraphStoreService {
  // 写
  addEdge(graph: string, spec: GraphEdgeSpec,
          opts?: { dedupe?: 'active-only' | 'strict' | 'none' }): Promise<GraphEdge>
  addEdges(graph: string, specs: GraphEdgeSpec[],
          opts?: { dedupe?: 'active-only' | 'strict' | 'none' }):
          Promise<{ created: GraphEdge[]; skipped: number }>   // 事务内幂等批量（收口 lw keySet 与 kb createBatch 两套）
  updateEdge(graph: string, edgeId: string, patch: Partial<GraphEdgeSpec>): Promise<GraphEdge>
  removeEdge(graph: string, edgeId: string): Promise<void>
  removeEdges(graph: string, filter: EdgeFilter): Promise<number>
  removeGraph(graph: string): Promise<number>                  // 按库名级联删（purge 用）

  // 读
  listEdges(graph: string, filter?: EdgeFilter): Promise<GraphEdge[]>
  neighbors(graph: string, endpoint: GraphEndpoint,
          opts?: { direction?: 'out' | 'in' | 'both'; relations?: string[]; validAt?: number }):
          Promise<Array<{ edge: GraphEdge; neighbor: GraphEndpoint }>>
  snapshot(graph: string, filter?: EdgeFilter):
          Promise<{ nodes: GraphEndpoint[]; edges: GraphEdge[] }>  // 供 PPR / 图视图

  // 算法（收口三套遍历实现）
  reachable(graph: string, start: GraphEndpoint,
          opts?: { direction?: 'out' | 'in' | 'both'; relations?: string[]; validAt?: number }):
          Promise<Set<string>>                                  // dl 判环用它替换内联 BFS
  ppr(graph: string, seeds: GraphEndpoint[],
          opts?: { weight?: (e: GraphEdge) => number; damping?; topK? }):   // 包装既有 ppr.ts
          Promise<Array<{ endpoint: GraphEndpoint; score: number }>>

  // 运维
  listGraphs(prefix?: string): Promise<Array<{ graphName: string; edgeCount: number }>>
  stats(graph: string): Promise<{ edgeCount: number; byRelation: Record<string, number>; byKind: Record<string, number> }>
}
```

约定：
- `dedupe` 缺省 `'active-only'`（= lw 现行为，匹配部分唯一索引）；kb/dl 传 `'strict'`；导入/重建类管线可传 `'none'` 省一次查重。**批内也按五元组去重**（同批两条同键只落一条，计数进 `skipped`），否则批内第二条会撞唯一索引抛错而非跳过。
- 所有方法第一参数都是库名 ⇒ 库间天然隔离；BaseRepository 注入 user_id。
- PPR 包装：端点编码为 `${kind}:${id}` 节点 key，`weight` 回调从边取权（kb 传 `e.confidence`）；对齐 `ppr.ts` 的 `PPRGraph{nodes,edges:[s,t,w]}` 签名。
- 注册：`database-manager.interface.ts` 增 `graphEdges?: GraphEdgeRepository | null`（可选字段，不破坏现有实现）；实体加入 `entities/index.ts` barrel（两端 DataSource 经此自动装配）；仓储在两端 DatabaseManager 构造处实例化（与 `lwGraphEdges` 同款）。

## 6. 存量数据 → 统一存储的字段映射

| 旧表.列 | 新列 | 说明 |
|---|---|---|
| （所有旧表）`id` | `id` | **保留原 id**，避免破坏任何外部引用 |
| lw.`project_id` / kb.`knowledge_base_id` / dl.`project_id` / world.`world_id` | `graph_name` | 按 §3.1 拼名；ip 表无作用域列 ⇒ `lw:ip` |
| lw.`source_type` / kb.`source_kind` | `source_kind` | dl/ip/world 补常量 kind（`concept` / `ip_character` / `world_entry`） |
| 各表.`source_id` / `target_id` | 同名 | |
| lw.`relation_type` / kb.`relation` / dl.`relation_type` | `relation` | |
| lw.`label` / ip.`label` / world.`label` | `label` | |
| lw.`description` / ip.`description` | `description` | |
| kb.`evidence` / dl.`evidence` | `evidence` | kb 必填由模块侧继续保证 |
| kb.`confidence` | `confidence` | 其余模块置 NULL |
| kb.`verified` / dl.`verified` | `verified` | 其余置 0 |
| lw.`origin` / kb.`origin` / world.`origin` | `origin` | kb 的 `'ai'\|'human'` 包成 JSON `{"type":"ai"}` 统一为对象形态 |
| lw.`valid_from_chapter` / `valid_until_chapter` | `valid_from` / `valid_until` | 其余置 NULL |
| — | `props` | 预留，迁移不填 |
| 各表.`created_at`（Date 或 bigint） | `created_at`（bigint） | Date ⇒ `getTime()` |
| — | `updated_at` | = created_at |

## 7. 数据迁移方案

新迁移 `create-unified-graph-tables.ts`（幂等，双方言，仿 `create-lw-graph-tables.ts`）：

1. **建表**：`ensureTable` + `ensureIndex`（普通索引）。部分唯一索引（`uq_graph_edges_active`）**只由迁移 SQL 创建，不进 entity 装饰器**——TypeORM `@Index` 不支持 `WHERE` 子句。
2. **回填（TS 读-写回填，非纯 `INSERT…SELECT`）**：五段回填用裸 SQL 读旧表（不依赖旧 entity 注册）→ TS 逐行映射（§6）→ 批量 insert 新表。选 TS 而非 SQL 的原因：kb/dl 的 `created_at` 在 SQLite 里是 datetime 字符串要转 epoch ms、kb 的 `origin` 要包成 JSON、dl/ip/world 要补常量 kind——这些在 SQL 里跨方言写又脆又难测。
   - **缺表容忍**：老库可能还没有 ip/world 表（2026-10-10 实测 `the-bot-kb-brain-data/the_bot.db` 即无 `lw_ip_edges/lw_world_edges`）——回填前查 `information_schema`/`sqlite_master`，缺表跳过并记日志。
   - **幂等守卫**：先取 `graph_edges` 已有 id 集合，跳过已迁移行（原 id 保留直迁）。
   - **去重先行**：回填时按 (graph_name, source_kind, source_id, relation, target_kind, target_id, 有效期区间) 收敛——**实测主库存在 1 组活跃重复边**（同项目「恋人」边两条，2026-10-10 数据），保留 `created_at` 最早一条，日志输出"去重 N 条"。撞部分唯一索引的脏数据在回填阶段清掉，不阻塞建索引。
3. **验证（对账）**：迁移尾部逐源 `COUNT(*)` 对比新表对应库名行数（差额=去重数），不一致打 WARN 不 fail（不阻塞启动）。
4. **挂载点**：两端都在 `addLwProjectCoverPath` 之后（Electron `runMultiTenantMigrations` 尾部 `trace.report` 之前；Web `initDatabase` 在 `new WebDatabaseManager(ds)` 之前）——保证 5 个源迁移全部先行。
5. **旧表处置**：切换期间保留不写；全部消费方切完并发布一个版本后，由后续清理迁移 drop（§8 Phase 3）。

## 8. 消费方切换方案（4 步，每步可独立发布）

每步套路一致：**旧 repository 改 facade（方法签名不变，内部委托 GraphStore）→ 服务层直连 → 老仓储删除**。facade 期保证 handler / IPC / channel-map / 前端零改动。

| 步骤 | 对象 | 涉及调用方 | 要点 |
|---|---|---|---|
| 1（试点） | `lw_ip_edges` + `lw_world_edges` | `ip-library.service.ts:64-73`、`world-library.service.ts:296-311` | API 面最小，验证迁移与唯一索引 |
| 2 | `dl_relation` | `learning-graph.service.ts`（CRUD/`linkPrerequisites`/`confirmRelation`）、Atlas 图视图 | `relation_type='prerequisite'` 字符串原样保留；内联拓扑判环（427-446）与 `wouldCreatePrereqCycle` 改调 `store.reachable()` |
| 3 | `kb_knowledge_edges` | `graph-build.service.ts`（`createBatch`→`addEdges` strict）、`brain-query.service.ts`（快照+PPR→`store.snapshot`+`store.ppr`）、`metabolize/foreshadow-scan/brain-panel/corpus-merge` | kb 侧枚举白名单校验留在 `normalizeRelations`，入库前已过滤；`kb:brain:graph-data` handler 不动 |
| 4 | `lw_graph_edges` | `graph.service.ts`（含 `findByName` 解析后建边）、`chapter-graph.processor.ts`、`consistency.service.ts`（R1-R10 读边）、`purge.service.ts`、`graph-knowledge-provider.ts` | 最复杂：章节时间线用 `validFrom/validUntil`；重跑幂等改 `addEdges dedupe:'active-only'`；`lw_predicate_registry` 不动 |

Phase 3（收尾）：删除 5 个旧 entity/repository 与 `database-manager.interface.ts` 中的注册项（`kbKnowledgeEdges/lwGraphEdges/lwPredicateRegistry 保留谓词表本身`），清理迁移 drop 5 张旧表。

## 9. 各模块保留物（切完之后各模块还剩什么）

| 模块 | 保留（业务语义） | 交给 GraphStore |
|---|---|---|
| 长文 | 节点实体表、谓词注册表+归一、名称→ID 解析、章节抽取管线、R1-R10 规则本身、知识飞轮 provider | 边存取、按章节时间线过滤、幂等建边 |
| kb-brain | `kb_entities`（别名/合并）、关系白名单、抽取/代谢管线、图快照缓存（进程级，失效逻辑照旧） | 边存取、snapshot、PPR、neighbors |
| domain-learning | `dl_concept`、门控语义（prerequisite 的业务规则）、人审流程 | 边存取、环检测（reachable）、Atlas 快照 |
| IP/世界观库 | 库内 CRUD 与 UI | 边存取（含去重，从"无"升级为 active-only） |

## 10. 风险与决策点

| # | 风险/决策 | 处置 |
|---|---|---|
| 1 | 部分唯一索引兼容性 | PG 原生支持；SQLite ≥3.8 支持（better-sqlite3 远新于该版本）。迁移里两端分别 `CREATE UNIQUE INDEX … WHERE` |
| 2 | 历史重复边撞唯一索引 | §7 回填先去重（保留最早），日志报告条数 |
| 3 | lw "关停后重建同名关系"语义 | 部分唯一索引 + `dedupe:'active-only'` 精确保留（§4） |
| 4 | 时间戳形态不统一（bigint vs Date） | 统一 epoch-ms bigint；迁移换算；kb/dl 服务层的对外 DTO 时间格式不变（facade 换算回去） |
| 5 | kb 现有 DB 级唯一约束降级为应用层？ | 不降级：kb 边 `valid_until` 恒 NULL ⇒ 部分唯一索引对 kb 就是全量唯一，强度不变 |
| 6 | 单表性能 | 每个库的边量级为千级，`graph_name` 前导索引足够；无跨图查询 |
| 7 | 迁移对账只 WARN 不 fail | 首版策略：图数据允许极端 case 人工补，不阻塞启动；对账结果打点日志 |
| 8 | 旧表 drop 时机 | 隔一个发布版本，期间保留（不写），回滚只需重挂旧仓储 |
| 9 | kb 去重作用域变化 | 旧 `createBatch` 的查重条件**不含 knowledge_base_id**（跨库去重，潜在缺陷）；统一存储按 graph_name 去重，语义更严谨。行为差异已确认无害（atom/note id 是 UUID，跨库同 id 概率为零），记入切换说明 |
| 10 | 老库缺表（2026-10-10 实测 `the-bot-kb-brain-data` 库无 `lw_ip_edges/lw_world_edges`） | 回填前查表存在性，缺表跳过并记日志（该库启动过旧版本时属正常形态） |
| 11 | Electron 真机库行带 `user_id='local-default-user'`（非 NULL） | 回填原样保留 user_id；BaseRepository 按当前 ALS user 过滤，与现状一致 |

## 11. 里程碑

| 阶段 | 内容 | 预估 |
|---|---|---|
| M1 | GraphStore（entity/repo/service/types/names）+ 迁移建表+回填 + 单测（双方言：`pg:up` 跑 PG 用例） | 1.5-2 天 |
| M2 | 步骤 1（IP/世界观）+ 步骤 2（dl）切换 + 回归 | 1-1.5 天 |
| M3 | 步骤 3（kb-brain）切换 + PPR/图视图回归 | 1-1.5 天 |
| M4 | 步骤 4（lw 主图谱）切换 + 一致性规则/章节确认管线回归 | 1.5-2 天 |
| M5 | 收尾：删旧仓储、drop 旧表迁移、文档更新 | 0.5 天 |

总计约 5.5-7.5 天。M1 完成后新模块即可直接用 GraphStore 建图（不必等存量切换完）。

## 12. 测试与验收记录（2026-10-10 M1 完成）

### 12.1 测试清单（39 用例全绿）

| 文件 | 覆盖 | 方言 |
|---|---|---|
| `tests/unit/migrations/create-unified-graph-tables.spec.ts`（7） | 建表/索引幂等、部分唯一索引约束行为（活跃撞键被拒/关停不占键/关停后可重建）、五源回填映射+去重+增量、缺表容忍、PG bigint/timestamp 归一 | sqlite + PG |
| `tests/unit/repositories/graph-edge.repository.spec.ts`（6×2） | CRUD、租户隔离、全过滤条件、端点改指、listGraphs/stats | sqlite + PG |
| `tests/unit/services/graph-store.service.spec.ts`（9×2） | API 全集 + 五业务场景回放：lw 时间线/关停重建/管线重跑、kb strict+PPR+邻域、dl 判环（与 `wouldCreatePrereqCycle` 同判）、ip/world 去重、graph_name 隔离 | sqlite + PG |
| `tests/unit/services/graph-store.real-data.integration.spec.ts`（2） | 真机库副本回填对账 + 字段抽查 + 真实图 API（env 门控） | sqlite |

跑法：
```bash
# 单测（双方言；PG 测试容器：PGPORT=5437 npm run pg:up 变体或自有容器）
node scripts/vitest-electron.cjs run tests/unit/migrations/create-unified-graph-tables.spec.ts \
  tests/unit/repositories/graph-edge.repository.spec.ts tests/unit/services/graph-store.service.spec.ts

# 真机数据集成（先用 better-sqlite3 .backup() 拷快照，绝不动原库）
GRAPH_REAL_DB=/tmp/unified-graph-it/the_bot.db \
GRAPH_REAL_DB_LEGACY=/tmp/unified-graph-it/the-bot-kb-brain-data.db \
node scripts/vitest-electron.cjs run tests/unit/services/graph-store.real-data.integration.spec.ts
```

### 12.2 真机数据回填实测（2026-10-10 主库快照）

- `lw_graph_edges` 读 171 → 活跃去重 1（真实重复「恋人」边组收敛为最早一条）→ 迁入 170；8 个项目图
- `kb_knowledge_edges` 迁入 240（evidence/confidence 齐全，origin `'ai'` → `{"type":"ai"}`）
- 旧 schema 库（缺 ip/world/dl 表）：缺表跳过，71+252=323 全量迁入，重跑幂等
- 输出人工核对：kb PPR（种子=度最高实体「张小凡」）top5 为 张小凡→大竹峰→青云山→太极玄清道→青云门，语义正确；lw 单角色关系时间线（含关停窗 [ch2~3] 与重建边）逐条符合业务语义

### 12.3 M1 后状态

基础设施可交付使用（新模块直接 `GraphStoreService` 建图），**五套存量业务尚未切换**（§8 四步切换待后续批次执行，facade 模式保证 handler/前端零改动）。
