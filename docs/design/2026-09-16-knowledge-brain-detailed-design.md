# 知识大脑·详细设计（M0-M2 深度展开，M3-M4 契约定版）

- 日期：2026-09-16
- 上游：`2026-09-16-knowledge-brain-design.md`（v2 概念与架构）、`2026-09-16-knowledge-brain-feasibility.md`（承接力核查）
- 定位：**实施级设计**。数据模型落到 DDL、服务落到接口签名、流水线落到算法与 prompt 规格、集成落到代码级改动点。评审现场 = 本文的接口与「与 v2 的差异清单」（§0.3）。
- 精度约定：M0-M2 逐字段逐流程展开；M3-M4 契约定版（接口冻结，实现细节随里程碑细化）。

---

## 0. 总览

### 0.1 模块布局（新增文件清单）

```
src/core/database/
  entities/kb-brain/kb-atom.entity.ts            # 论断
  entities/kb-brain/kb-entity.entity.ts          # 实体
  entities/kb-brain/kb-knowledge-edge.entity.ts  # 语义边
  entities/kb-brain/kb-note.entity.ts            # 卡片（思想/模式/视角）
  entities/kb-brain/kb-digest-pass.entity.ts     # 消化台账（幂等+成本）
  entities/kb-brain/kb-note-review.entity.ts     # 复习日志（M3）
  repositories/kb-atom.repository.ts …（同构 6 个）
  migrations/create-kb-brain-tables.ts           # 一函数建 6 表（方言分支）
src/core/platform/services/kb-brain/
  brain-config.ts            # KbBrainConfig 类型 + ajv schema + 解析/默认值
  atomize.service.ts         # P1 原子化（两段式 prompt + 结构校验）
  entity-resolve.service.ts  # 实体解析/合并
  adjudicate.service.ts      # 裁决（Graphiti 协议移植）
  digest-orchestrator.service.ts  # P1 编排（台账/幂等/并发/重链/进度事件）
  distill.service.ts         # P2 提炼（聚类+两段式反思+提议）
  brain-query.service.ts     # 统一检索池 + PPR（M2）+ CRAG（M3）
  brain-provider.ts          # structured-provider 注册（M3）
  brain-tools.ts             # kb_brain_query agent 工具（M3）
  fsrs.service.ts            # FSRS 调度（ts-fsrs 封装，M3）
  prompts/                   # prompt 模板（§4 指定的 6 份）
src/core/packs/knowledge-base/
  handlers/knowledge-base.handler.ts  # 扩展：kb:brain:* 通道（§7）
  index.ts                             # activate() 装配编排器（订阅域事件）
src/renderer/src/…（§8 组件契约）
```

不新增 pack、不新增引擎依赖；`ts-fsrs` 为唯一新 npm 依赖（M3 引入，MIT，纯 TS）。

### 0.2 数据表总账（逐表审计）

v2 说「4 张表」；详细设计补 2 张运维/学习表，**共 6 张**，理由见 §1.6/§1.7。

| 表 | 用途 | 关键约束 |
|---|---|---|
| kb_atoms | 论断（L1） | 幂等靠台账不靠唯一索引（同文重萃可能多行，由裁决合并） |
| kb_entities | 实体（L2 节点） | `(kb_id, name)` 唯一（软删用 status，不物理删） |
| kb_knowledge_edges | 语义边（L2 边） | `(source_kind,source_id,relation,target_kind,target_id)` 唯一 |
| kb_notes | 卡片（L3） | 同题演进靠 version 字段，不建唯一索引（重提议允许并存待人审） |
| kb_digest_passes | **新增：消化台账** | `UNIQUE(chapter_id, pass_key)` = 幂等锚点；兼成本账本 |
| kb_note_reviews | **新增：复习日志**（M3 迁移随建） | 追加写，FSRS 复算的原始记录 |

### 0.3 与 v2 的差异清单（评审重点）

| # | v2 表述 | 详细设计修正 | 理由 |
|---|---|---|---|
| D1 | 4 张表 | 6 张（+digest_passes 台账、+note_reviews 复习日志） | 幂等键「章节×遍次」需要持久锚点（从 atom 存在性反推不可靠：部分失败/零产出遍无法区分）；FSRS 复算需要评分历史而非只存当前态 |
| D2 | atom status 四态 | **五态**：+`stale`（原文已变更、论断失去出处） | 文档 reprocess 后，旧章节内容里的论断若不被新萃取替代，会变成永远 supported 的幽灵；stale 与 superseded 语义不同（失去出处 vs 被更优论断替代） |
| D3 | P1/P2/P4 = workflow 定义 | P1/P2 = **服务层域事件订阅 + 台账驱动恢复**；P4 = 引擎 cron（若 pack 工作流定义机制支持，照 chapter-writing 先例）或 Electron 侧 interval（Web 后置） | 工作流 journal 的恢复语义是「节点重放」，对多小时批量消化不如台账行级幂等强；台账本身就是更强的 crash-safe 锚。进度可见性用现有 kb 事件通道，不依赖引擎 UI |
| D4 | search() 扩展 include | 保留 include 入参，但内部分流：纯 chunk 路径**一行不改**；brain 模式走 BrainQueryService 组合（复用 KB 服务的嵌入/bm25 计算件） | 现网 search() 的结果解析循环硬编码 `kbChunks.findById`（`knowledge-base.service.ts:1084`），atom/note 命中会被静默丢弃——必须按命名空间分流解析，且不动已验证的存量路径 |
| D5 | 论断溯源 = chunkId | 溯源 = `chapter_id + chapter_hash + offsets`，chunkId 是**可重链**的缓存 | reprocess 会重建 chunks（新 UUID），chunkId 不稳定；章节 hash 稳定（内容不变则不变） |

---

## 1. 数据库设计

### 1.1 kb_atoms（论断）

```sql
CREATE TABLE kb_atoms (
  id                      VARCHAR PRIMARY KEY,
  user_id                 VARCHAR NULL,
  knowledge_base_id       VARCHAR NOT NULL,
  statement               TEXT NOT NULL,            -- 自包含论断短句
  type                    VARCHAR NOT NULL,         -- fact|claim|concept|method|insight|open-question
  status                  VARCHAR NOT NULL DEFAULT 'supported',
                          -- supported|suspected|contradicted|superseded|stale
  certainty               REAL NOT NULL DEFAULT 0.8,
  valid_from              VARCHAR NULL,             -- 世界时间（ISO 日期或自由刻度）
  valid_until             VARCHAR NULL,
  source_document_id      VARCHAR NOT NULL,
  source_chapter_id       VARCHAR NULL,             -- D5：主溯源
  source_chapter_hash     VARCHAR NULL,
  source_chunk_id         VARCHAR NULL,             -- 可重链缓存（relink 后更新）
  source_quote            TEXT NOT NULL,            -- ≤200 字；origin=human 时为用户原话
  start_offset            INTEGER NULL,             -- 相对章节正文
  end_offset              INTEGER NULL,
  subject_entity_id       VARCHAR NULL,
  object_entity_id        VARCHAR NULL,
  lens_note_id            VARCHAR NULL,             -- null=公共层
  extraction_pass         VARCHAR NOT NULL DEFAULT 'base#1',
  origin                  VARCHAR NOT NULL DEFAULT 'ai',   -- ai|human
  use_count               INTEGER NOT NULL DEFAULT 0,
  last_used_at            DATETIME NULL,
  superseded_by_atom_id   VARCHAR NULL,
  created_at              DATETIME NULL,
  updated_at              DATETIME NULL
);
CREATE INDEX idx_atoms_kb_status ON kb_atoms(knowledge_base_id, status);
CREATE INDEX idx_atoms_doc       ON kb_atoms(source_document_id);
CREATE INDEX idx_atoms_subj      ON kb_atoms(subject_entity_id);
CREATE INDEX idx_atoms_obj       ON kb_atoms(object_entity_id);
CREATE INDEX idx_atoms_lens      ON kb_atoms(lens_note_id);
CREATE INDEX idx_atoms_pass      ON kb_atoms(source_document_id, extraction_pass);
```

Entity/仓储约定：继承 BaseRepository（scoped 自动注入 user_id，事务路径手动带——可行性核查纪律）；仓储接口：

```ts
interface KbAtomRepository extends BaseRepo<KbAtomRecord> {
  createBatch(rows: KbAtomInput[]): Promise<KbAtomRecord[]>
  findByDocument(documentId: string, opts?: { status?: string[]; lensNoteId?: string | null }): Promise<KbAtomRecord[]>
  findByEntities(kbId: string, entityIds: string[], opts?: { lensNoteId?: string | null; statuses?: string[] }): Promise<KbAtomRecord[]>  // 裁决候选集
  findByChapterHash(documentId: string, chapterHash: string): Promise<KbAtomRecord[]>
  updateStatus(id: string, patch: { status: string; supersededByAtomId?: string | null }): Promise<void>
  incUse(ids: string[]): Promise<void>
  relinkChunk(id: string, chunkId: string): Promise<void>
  markChapterStale(documentId: string, chapterIds: string[]): Promise<number>
  statsByKb(kbId: string): Promise<{ total: number; byStatus: Record<string, number>; byType: Record<string, number>; humanOrigin: number; cited: number }>
}
```

### 1.2 kb_entities（实体）

```sql
CREATE TABLE kb_entities (
  id                VARCHAR PRIMARY KEY,
  user_id           VARCHAR NULL,
  knowledge_base_id VARCHAR NOT NULL,
  name              VARCHAR NOT NULL,
  aliases           TEXT NOT NULL DEFAULT '[]',     -- JSON 数组
  entity_type       VARCHAR NOT NULL,               -- 自由词表（人物|地点|组织|概念|plot-motif|setting-system|…）
  summary           TEXT NULL,
  summary_status    VARCHAR NOT NULL DEFAULT 'pending',  -- pending|done|failed
  status            VARCHAR NOT NULL DEFAULT 'active',   -- active|merged（合并进 target_entity_id）
  target_entity_id  VARCHAR NULL,                   -- merged 时指向规范实体
  created_at        DATETIME NULL, updated_at DATETIME NULL,
  UNIQUE(knowledge_base_id, name)
);
CREATE INDEX idx_entities_kb_type ON kb_entities(knowledge_base_id, entity_type);
```

```ts
interface KbEntityRepository extends BaseRepo<KbEntityRecord> {
  findByName(kbId: string, names: string[]): Promise<KbEntityRecord[]>          // 含 alias 展开
  upsertMention(kbId: string, mention: { name: string; type: string; aliases?: string[] }): Promise<KbEntityRecord>  // 找到即返回/更新别名，找不到建
  merge(fromId: string, toId: string): Promise<void>                              // 边/挂点改指 + from 置 merged
  replaceSummary(id: string, summary: string, status: 'done' | 'failed'): Promise<void>
  pendingSummaries(kbId: string, limit: number): Promise<KbEntityRecord[]>
}
```

### 1.3 kb_knowledge_edges（语义边）

```sql
CREATE TABLE kb_knowledge_edges (
  id                VARCHAR PRIMARY KEY,
  user_id           VARCHAR NULL,
  knowledge_base_id VARCHAR NOT NULL,
  source_kind       VARCHAR NOT NULL,   -- atom|note|entity
  source_id         VARCHAR NOT NULL,
  relation          VARCHAR NOT NULL,   -- supports|refutes|refines|exemplifies|same-as|depends-on|applies-to|leads-to|instance-of
  target_kind       VARCHAR NOT NULL,
  target_id         VARCHAR NOT NULL,
  evidence          TEXT NOT NULL,      -- 为什么相关（一句话，必填）
  confidence        REAL NOT NULL DEFAULT 0.7,
  origin            VARCHAR NOT NULL DEFAULT 'ai',   -- ai|human
  verified          INTEGER NOT NULL DEFAULT 0,
  created_at        DATETIME NULL,
  UNIQUE(source_kind, source_id, relation, target_kind, target_id)
);
CREATE INDEX idx_edges_src ON kb_knowledge_edges(source_kind, source_id);
CREATE INDEX idx_edges_tgt ON kb_knowledge_edges(target_kind, target_id);
```

```ts
interface KbKnowledgeEdgeRepository extends BaseRepo<EdgeRecord> {
  createBatch(rows: EdgeInput[]): Promise<{ created: number; deduped: number }>  // 命中唯一键跳过
  neighborsOf(kbId: string, kinds: Array<'atom' | 'note' | 'entity'>, ids: string[]): Promise<EdgeRecord[]>
  graphSnapshot(kbId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>  // PPR 用（带 LRU 缓存，见 §5.2）
}
```

### 1.4 kb_notes（卡片：思想/模式/视角统一实体）

字段与 v2 §6.4 一致（title/description/body/type/status/evidence/origin/version/patternSkeleton/patternInstances/lensAttention/classicScore/fsrs×4/citedCount/…），DDL 补两列：

```sql
  superseded_note_id VARCHAR NULL,   -- 同题改版的旧版指向（archived 时的血缘）
  tags               TEXT NOT NULL DEFAULT '[]',
  UNIQUE 无；索引：(knowledge_base_id, type, status)、(knowledge_base_id, status)（收件箱查询）
```

```ts
interface KbNoteRepository extends BaseRepo<KbNoteRecord> {
  propose(input: NoteInput): Promise<KbNoteRecord>                       // status=proposed
  publish(id: string, patch?: { title?: string; body?: string; description?: string }): Promise<KbNoteRecord>  // version+1
  reject(id: string): Promise<KbNoteRecord>                              // → archived（留档）
  listProposed(kbId: string, page: number, pageSize: number): Promise<{ rows: KbNoteRecord[]; total: number }>
  findSimilarTitle(kbId: string, title: string): Promise<KbNoteRecord[]> // 提议去重（嵌入或词面）
  dueReviews(kbId: string, now: Date, limit: number): Promise<KbNoteRecord[]>  // M3：R(t,S)<目标保持率
  incCited(ids: string[]): Promise<void>
  recomputeClassic(kbId: string): Promise<void>                          // P4：实例数×引用×收藏
}
```

### 1.5 kb_digest_passes（消化台账——D1 新增）

```sql
CREATE TABLE kb_digest_passes (
  id                VARCHAR PRIMARY KEY,
  user_id           VARCHAR NULL,
  knowledge_base_id VARCHAR NOT NULL,
  document_id       VARCHAR NOT NULL,
  chapter_id        VARCHAR NULL,        -- null=文档级任务（distill/metabolize）
  pass_type         VARCHAR NOT NULL,    -- base|lens|distill|metabolize
  pass_key          VARCHAR NOT NULL,    -- 'base'|'lens:<noteId>'|'distill:<batchId>'|'metabolize:<period>'
  chapter_hash      VARCHAR NULL,        -- 幂等键第二元
  status            VARCHAR NOT NULL DEFAULT 'pending',  -- pending|running|done|failed|skipped
  stats_json        TEXT NULL,           -- {atoms,merged,contradicted,entities,edges,staled}
  cost_json         TEXT NULL,           -- {calls,tokensIn,tokensOut}
  error             TEXT NULL,
  attempts          INTEGER NOT NULL DEFAULT 0,
  created_at        DATETIME NULL, updated_at DATETIME NULL,
  UNIQUE(chapter_id, pass_key)           -- chapter_id 为 null 的行以 (document_id, pass_key) 应用层判重
);
CREATE INDEX idx_passes_pending ON kb_digest_passes(status, updated_at);
```

语义（编排器唯一事实源，见 §3）：

- **入队幂等**：消化某章某遍前先查 `(chapter_id, pass_key)`：`done` 且 `chapter_hash` 相同 → 跳过；`running` → 跳过（防并发重复）；`failed` 且 attempts<3 → 重跑；不存在/`done` 但 hash 变了 → 置 pending 重跑（旧产物处理见 §3.4 重链）。
- **成本台账**：每次 LLM 调用回填 usage（provider 响应含 usage 时累加，不含时记 calls）。仪表的「每本成本」由此聚合。

### 1.6 为什么需要台账表（D1 论证）

从 atom 反推遍次状态有四个不可修复的洞：部分失败（写了一半崩溃，重启后无法区分「未开始」与「完成但零产出」）；零产出遍（一章纯对话场景可能萃不出论断，是合法终态）；视角遍切换（同章多遍并存，状态是矩阵不是标量）；成本归属（usage 需要落点）。一张窄表同时解决四件事。

### 1.7 kb_note_reviews（复习日志——M3）

```sql
CREATE TABLE kb_note_reviews (
  id VARCHAR PRIMARY KEY, user_id VARCHAR NULL,
  note_id VARCHAR NOT NULL, kb_id VARCHAR NOT NULL,
  rating INTEGER NOT NULL,            -- FSRS Rating 1-4（again/hard/good/easy）
  scheduled_days REAL NULL, elapsed_days REAL NULL,
  reviewed_at DATETIME NOT NULL
);
CREATE INDEX idx_reviews_note ON kb_note_reviews(note_id);
```

复习事件只追加；kb_notes 上的 fsrs 字段是「当前态缓存」（由 ts-fsrs 从评分序列重算，缓存可丢弃可重建）。

### 1.8 迁移与装配

- `create-kb-brain-tables.ts`：一个导出函数建 6 表，照 `create-kb-chapters.ts` 模板（isPg 方言分支 + checkTableExists + 补列 + 索引）。
- 注册点：`electron/database/index.ts`（runMultiTenantMigrations 内）+ `web/server/index.ts` 各加一次调用。**防漏单端**：迁移函数尾部自检（两入口都会跑，幂等），并在两入口 grep 自查清单写进 PR checklist。
- 实体注册：`database/entities/index.ts` 导出 6 实体；`database-manager.interface.ts` 加 6 仓储字段（可选标记 `?`，旧库渐进装配——照 kbChapters 先例）；electron/web 的 initRepositories 各接一行。

---

## 2. brain-config 与开关面

```ts
// brain-config.ts
export interface KbBrainConfig {
  enabled: boolean
  digestion: { enabled: boolean; scopeDocumentIds?: string[] }
  lenses: { enabledLensNoteIds: string[]; readingCapture: boolean }
  patterns: { settingEnabled: boolean; plotEnabled: boolean }
  autoApproveThreshold: number        // 缺省 0.8
  distillation: { enabled: boolean; importanceThreshold: number }  // 阈值缺省 50
  learning: { enabled: boolean; desiredRetention: number }          // 缺省 0.9
}

export const BRAIN_CONFIG_SCHEMA: JSONSchema   // ajv 校验，响亮失败（对齐 0916 路线）
export function parseBrainConfig(raw: string | null): KbBrainConfig | null
// null/缺 enabled → 返回 null = 大脑关闭（一切入口早退，等价现状）
```

写入路径（复核修正 F4）：`knowledge-base.repository.update` 是**显式字段映射**（rerankConfig 先例），不是透传——需同步改四处：knowledge_base.entity 加 `brain_config`/`brain_state` 列、repository toDto/update 映射、shared types 的 KnowledgeBase/UpdateKnowledgeBaseRequest 加字段、迁移加列。`parseBrainConfig`/`ajv` 依赖已就位（ajv ^8.20.0 在依赖中，无需新增）。

---

## 3. P1 消化流水线（详细流程）

### 3.1 触发与编排（DigestOrchestrator）

```
装配：knowledge-base pack activate() →
  subscribeDomainEvents('kb:document-completed', handler)   // 平台域事件总线
  启动时：recoverPendingPasses()   // 扫 status IN (pending,running) 且 updated_at > 10min 的台账行重跑

handler(event {documentId, status}, envelope.userId):
  uid = envelope.userId ?? LOCAL_DEFAULT_USER_ID            // ALS 教训：事件回调先捕获
  await runWithUserAsync(uid, async () => {
    kb = loadKb(); cfg = parseBrainConfig(kb.brainConfig)
    if (!cfg?.enabled || !cfg.digestion.enabled) { markDocBrain('skipped'); return }
    if (scopeDocumentIds 不含 documentId) { markDocBrain('skipped'); return }
    markDocBrain('digesting', 0)
    chapters = kbChapters.findByDocument(documentId)         // 章节树已由现有流程落库
    for chapter of chapters（顺序，章内批处理）:
      await runBasePass(chapter)                             // §3.2；每章一个台账行
      emitBrainProgress(phase:'base', done/total)
    await relinkAndStale(documentId)                          // §3.4
    await summarizeEntities(kbId)                             // 实体演化摘要（并发3，worker-pool 先例）
    markDocBrain('digested', 100); emitBrainStatus(...)
    maybeScheduleLensPasses(documentId, cfg.lenses)           // 启用的视角卡 → 追加 lens 台账行（低优先级队列）
  })
```

并发控制：**全局消化并发 ≤2 个文档**、实体摘要并发 3（手写 worker-pool，照 `kb-chapter-summary.service.ts:90-102`）；无新依赖。进程内单例信号量（模块级变量 + 计数），防多事件并发超限。

### 3.2 基础遍 runBasePass（章级算法）

```
runBasePass(chapter):
  pass = ensurePass(chapter.id, 'base', chapter.contentHash)   // §1.5 幂等语义；running 则直接返回
  pass.setRunning()
  content = chapter.content 截断至 maxChars=6000（超长章分窗，每窗独立走步骤1-3，共享实体上下文）
  # 步骤1 原子化（低档；KB_ATOMIZE_MODEL env 覆盖，缺省宿主模型）
  batches = 按句切窗（每窗 ≤ N=40 句）
  for batch:
    out = callLlm(ATOMIZE_PROMPT, {章节标题, 窗口文本, 类型说明}, schema=AtomizeOutput)
    atoms += out.atoms            # [{statement,type,certainty,quote,validFrom?,validUntil?,subjectMention?,objectMention?}]
    events += out.events          # [{fromQuote,toQuote,relation:'leads-to',evidence}]（quote 锚定）
    解析链路：extractJsonFromResponse → parseJsonString → isJsonTruncated?callAIWithContinue → ajv 校验失败→错误清单回喂重试1次（cogen 范式）
  【复核修正 F1】偏移量不由模型产出（LLM 数字符偏移不可靠）：模型只输出 quote；
  偏移由定位器推导——窗口文本在章节内的起点已知，indexOf(quote) 命中即得
  start/endOffset（截断至200字）；未命中（模型改写引句）→ offsets=null，溯源退化为章节级。
  events 同理以 quote 定位映射到 atom（多命中取最近）。
  # 步骤2 实体解析
  entities = entityResolve.upsertMentions(kbId, collectMentions(atoms))   # 规范名/别名合并；负面清单在 prompt 内
  atoms 挂 subjectEntityId/objectEntityId
  # 步骤3 裁决（高档；KB_ADJUDICATE_MODEL）
  按实体域分组（公共层：lensNoteId=null），每组：
    candidates = atomRepo.findByEntities(kbId, entityIds, {lensNoteId:null, statuses:['supported','suspected']})
    verdict = callLlm(ADJUDICATE_PROMPT, {新论断编号列表, 现存论断编号列表(含已superseded候选)}, schema=AdjudicateOutput)
    // verdict: { duplicates:[{newIdx,oldId}], contradictions:[{newIdx,oldId,severity}], novel:[newIdx] }
    在同一 scopedTx 内落库（§3.3）
  # 步骤4 入池
  novel 原子逐条：向量 → kb_vectors(chunkId=`atom:<id>`)；倒排行 → kb_inverted_index(chunkId=atom id)
  leads-to 边：events 的句级索引映射到 atom（按 quote 定位）→ kb_knowledge_edges(relation='leads-to')
  pass.setDone(stats, cost)
```

### 3.3 裁决落库事务（关旧开新的原子性）

```
scopedTx(async tx => {
  for d of verdict.duplicates:  novelAtoms[d.newIdx].丢弃; old.incUse(); 记 merge 统计
  for c of verdict.contradictions:
    if severity=='update':  old.updateStatus('superseded',{supersededBy:new.id}); new 入库
    if severity=='conflict': old.updateStatus('suspected'); new 入库; 产出人审项（冲突面）
  for i of verdict.novel:   new 入库（certainty ≥ autoApproveThreshold ? 直接 supported : supported+标记待复核）
})
```

裁决域 = `(lensNoteId ?? 公共层) × 实体重叠`。**跨视角零互裁**在查询层保证：`findByEntities` 的 lensNoteId 过滤与公共层（null）严格分域——这是 M2 验收里的回归测试项（可行性核查 POC 6.3）。

### 3.4 重链与失效（reprocess 互操作，D5）

文档 reprocess 后（chunks 全部换新 UUID、章节树重建），`kb:document-completed` 再次触发编排器：

```
relinkAndStale(documentId):
  newChapters = 当前章节树（id 新，contentHash 稳定）
  for chapter where 旧 pass 记录存在:
    old = atoms.findByChapterHash(documentId, hash) 若 chapter.contentHash == pass.chapter_hash:
      重链：按 start/endOffset 落在新 chunk 区间 → atom.relinkChunk(chunkId)   // 出处跳转恢复
    else（章节内容变了）:
      runBasePass 覆盖新内容（裁决自然 supersede 旧论断）
      兜底：未被新萃取覆盖的旧章 atom → markChapterStale（status='stale'，D2）  // 防幽灵论断
```

### 3.5 视角遍（lens pass）

- 台账 pass_key=`lens:<noteId>`；prompt = ATOMIZE_PROMPT 的变体：注入视角卡的 `lensAttention`（attendTo/questions），type 集偏向观感（claim/insight），产出 atom 带 lensNoteId + extractionPass=`lens:<noteId>#<n>`。
- 触发：文档基础遍完成后按 cfg.lenses.enabledLensNoteIds 排队（优先级低于基础遍）；新视角卡启用/用户显式要求时对指定文档补排。
- 裁决域随 lensNoteId 自动分域（§3.3），无额外逻辑。

### 3.6 观感捕捉（human origin）

M2 范围（对话引导式留 M3 的 kb_brain_query 工具上下文）：

```ts
// IPC kb:brain:captureReading
captureReading(input: {
  knowledgeBaseId: string; documentId: string
  quote: string; remark: string            // remark=用户原话，永不改写
  startOffset: number; endOffset: number   // 相对章节
  lensNoteId?: string
}): { atomId: string }
```

落库：kb_atoms(origin='human', status='supported', certainty=1.0, extractionPass='human:ui', sourceQuote=remark, 附 quote 锚点)；**不参与自动裁决**；计入品味侧写（cited/use 信号）。UI 入口 = 文档查看的选区工具条（照 DL 选区笔记先例，§8）。

---

## 4. Prompt 规格（六份，M0 POC 的调优对象）

实现落位 `kb-brain/prompts/`，模板常量 + 注入槽。以下为定稿骨架（中文产出，产出 JSON 全部过 ajv）：

**P-1 ATOMIZE（两段式合一调用）**

```
系统：你是文学资料研究员。把给定章节文本提炼为「原子论断」。
规则：
1. 每条论断必须自包含（无代词悬挂、无"它/本书"回指）、一句话、≤60字。
2. 忠实原文细节：专名/数量/身份不许泛化（"Gamecube"不得写成"游戏机"）。
3. type 分类：fact(情节/设定事实) claim(观点/作者态度，标"据称") concept(概念定义)
   method(写作手法/结构规律) insight(可迁移洞见) open-question(文本未交代的悬置点)。
4. 世界时间：仅当文本明确给出事实的有效期/先后变化时填 validFrom/validUntil。
5. 事件序列：相邻句若有因果/转折推进，输出 events（句级索引对 + 一句 evidence）。
6. 宁缺毋滥：纯过场描写/无信息对话不产出。
用户：章节标题：{title}\n文本：{window}\n已知名词表（优先挂点）：{entityNames}
产出 schema：{ atoms: [{statement,type,certainty,quote,startOffset,endOffset,validFrom?,validUntil?,subjectMention?,objectMention?}], events: [{fromIdx,toIdx,evidence}] }
```

**P-2 ENTITY（含负面清单，Graphiti 移植）**

```
从论断的 mention 中识别实体：人物/地点/组织/物品/概念/情节母题/设定体系。
判据："能否拥有自己的百科词条，或在本库范围内足以区分同类项"。
NEVER：代词；抽象情感词（愤怒/成长）；裸称谓（爸爸→"X的父亲"）。
产出：{ entities: [{name(规范名),type,aliases[]}] }
```

**P-3 ADJUDICATE（Graphiti dedupe 协议）**

```
你是知识库裁决员。NEW FACTS 与 EXISTING FACTS 已编号。
对每条新论断判定：duplicate（语义等同旧条）/ contradicts（同关系不同细节=更新；
事实互斥=冲突）/ novel（无关）。同一条旧论断可同时被指为 duplicate 与 contradicted。
判例：职务晋升→contradicts(更新)；不同日事件→两者皆非。
跨视角（观感类）不在此判——只裁决事实与方法层。
产出：{ duplicates:[{newIdx,oldIdx}], contradictions:[{newIdx,oldIdx,severity:update|conflict}], novel:[idx] }
```

**P-4 DISTILL（两段式反思）**

```
第一段：对论断簇提出 3 个高阶问题（这批证据共同回答了什么？分歧在哪？边界在哪？）
第二段：产出思想卡：title=完整论断句（可独立引用）；description=第三人称"何时用我"≤200字；
body=markdown 正文；evidence=引用论断编号（because-of 指针）；type=methodology|insight|synthesis。
禁止：无证据断言；title 写成名词短语而非论断。
```

**P-5 SETTING-PATTERN（设定卡归纳）**

```
输入：同一 setting-system 实体下的规则类论断（跨书）。
产出：patternSkeleton=规则集维度（来源×代价×限制×成长曲线）；参数槽定义；
patternInstances=每本书的取值+变形说明+evidenceAtomIds；崩坏点注记（有反例证据时）。
```

**P-6 LENS-PASS（视角遍）**

```
你是「{lensTitle}」视角的评论家。看什么：{attendTo}；问什么：{questions}。
对同一章节重读，产出观感论断（type 偏 claim/insight，标 lensNoteId）：
每条须指回具体证据（quote+offsets）。不做事实性裁决，只做视角性观察。
```

---

## 5. 检索与查询

### 5.1 统一池（brain 模式分流，D4）

`KnowledgeBaseService.search()` 改动（**向后兼容是硬约束**）：

```ts
// 入参扩展（SearchRequest）：
include?: Array<'chunk' | 'atom' | 'note'>   // 缺省/['chunk'] → 走现有代码路径，零行为变化
lensNoteId?: string
// 实现分流：
if (!include || onlyChunk(include)) return existingSearchPath(req)    // 存量路径一行不动
return brainQuery.search(req)                                          // 新路径
```

```ts
// BrainQueryService.search 组合（复用 KB 服务的计算件，不复制实现）：
1. 向量召回：getEmbeddingVectors(query) → kbVectors.searchSimilar(kbId, vec, fetchK)
   → 按 chunkId 前缀分流：'qa:' 剔除；'atom:'/'note:' 按include；裸 id=chunk
2. 词法召回：BM25（复用 tokenizeForIndex 与 postings 查询；atom/note 的倒排行同表存储，
   候选长度直接用 statement/title+description 分词长度——不查 kb_chunks）
3. 融合：跨类型 RRF（k=60；类型内先各自归一排序）——atom 短句稠密、余弦天然偏高，
   加权融合会偏科，RRF 只用名次天然免疫
4. 结果解析（命名空间注册表）：
   resolveHit = { chunk: 现有逻辑, atom: kbAtoms.findById→携带 provenance 回链, note: kbNotes.findById→title/description/evidence }
   同文档去重：atom 与其源 chunk 同时命中 → 保 atom、chunk 降级为 context 字段
5. intent='synthesize'（或查询路由判定综合型）→ atom/note 主导（chunk 降权 0.5 进 RRF 前的名次计算）
```

SearchResult 扩展（可选字段，不破坏现有消费者）：

```ts
interface SearchResult {
  …现有字段…
  kind?: 'chunk' | 'atom' | 'note'
  atom?: { id: string; type: string; status: string; quote: string; jumpTo: { chapterId: string; startOffset: number } }
  note?: { id: string; title: string; type: string; evidenceCount: number }
}
```

倒排建索引：`buildIndex` 泛化为 `buildIndexFor(items, keyId)`，atom 入池时对 statement 建行（chunkId 列存 atom id——该列本就是字符串键，无 schema 变更；**注意**：现有 `bm25Scores` 的 docLen 回查会 miss atom，brain 路径用自己的长度计算，见上）。
【复核修正 F2】倒排清理缺口：现有 `kbInvertedIndex.deleteByDocumentId` 是经 kb_chunks 查 chunkId 后删除——atom 的倒排行（chunkId=`atom:<id>`）不在该路径上，**永不随文档删除而清理**。文档删除/重消化的清理入口必须显式按 atom id 列表调 `deleteByChunkId`（kb_atoms 先查后删）。

### 5.2 PPR 多跳（M2）

```ts
// 平台层：platform/services/graph/ppr.ts（无新依赖，幂迭代）
export function personalizedPageRank(graph: { nodes: string[]; edges: Array<[string, string, number]> },
  seeds: Map<string, number>, opts?: { damping?: 0.85; iterations?: 20; eps?: 1e-6 }): Map<string, number>

// kb-brain 内：graphCache = LRU<kbId, {nodes,edges,builtAt}>（容量4，TTL 10min，写边/实体合并时失效）
// 查询流程：query 提及 → 实体解析（复用 entityResolve）→ seeds → PPR → top 实体邻域
//   → 展开为：实体摘要段 + 该邻域内 atom（带 validFrom/until 双时间线过滤）→ 作为 brain 结果的图路补充
```

`lw_graph_edges` 侧是否复用同一 PPR 函数：是（平台层函数，长文图谱后续接入自愿）；本方案不改长文代码。

### 5.3 CRAG 纠错层（M3 契约）

```ts
interface RetrievalVerdict { grade: 'correct' | 'incorrect' | 'ambiguous'; reason: string; rewrittenQuery?: string }
// rerank 后若 cfg 启用：一次低档调用判级（依据=命中与 query 的覆盖度/自相矛盾信号）
// incorrect → 图路（§5.2）+ rewrittenQuery 重试一次；仍差 → 返回原结果并附 grade 提示
// 失败降级原序（fail-soft，对齐 rerank 先例）
```

---

## 6. P2 提炼与生命周期

### 6.1 重要性账户

- 计数器存 knowledge_bases 行的 `brain_state` JSON（新列）：`{ importance: number, lastDistillAt }`。
- 累计规则：新落库 atom 按 type 计分（method=3, insight=3, open-question=2, claim=1, fact=0.2，human×2）；超 `distillation.importanceThreshold` → 排 distill 任务（台账 pass_type='distill'）；执行后清零。
- 手动触发：IPC `kb:brain:distill(kbId, scope?)`（任务边界闸门）。

### 6.2 distill 流程

```
1. 取材：未消费的 supported atoms（按 createdAt 增量；排除已入 evidence 的）
2. 聚类：statement 向量 → 阈值聚类（复用嵌入接口；簇大小 8-30）→ 每簇一次「关系类型判定」
   低档调用（Chi 1981：输出簇间深层结构关系而非词面相似）→ 同构簇合并
3. P-4 两段式反思 → 思想卡草稿（proposed）
4. 设定卡（cfg.patterns.settingEnabled）：按 entity_type='setting-system' 的实体分组 → P-5 → 模式卡（proposed）
5. 提议去重：findSimilarTitle（词面+嵌入双查）命中 → 改为对既有卡提「改版提议」（version 链）
6. 全部进收件箱（kb_notes.status=proposed）；通知走 NotificationCenter（dl-notice 先例）
```

审批动线：收件箱列表（page/pending）→ 批准（publish，version+1）/ 改写后批准 / 拒绝（archived 留档）。会话内实时审批（agent 正在提炼时）：ApprovalCoordinator（平台件无守卫，照 EP 三件套转译）。

### 6.3 品味侧写与代谢（M4 契约）

- 品味侧写：`brain_state.taste = { lensWeights: Record<lensNoteId, number> }`——由 human origin atom 分布 + 各视角卡产物被 publish/cite 的频率周期重算；用于视角遍优先级与 brain 查询的 lens 加权。
- 代谢（cron）：合并近重复（嵌入 + 同实体 + 同域，置信度合并规则取高）、实体摘要重写（要义强化）、孤儿边收敛、classicScore 重算（实例数×cited×收藏）、细节衰减（仅检索 boost：`decay = exp(-λ·ageDays)·(1+ln(1+useCount))`，作用于 brain 查询的 RRF 名次微调，不物理删不降 status）。

---

## 7. IPC / 事件契约

### 7.1 通道（handler 注册照 `knowledge-base.handler.ts` 现有模式；`kb:` 前缀守卫已覆盖）

| 通道 | 方向 | 载荷 |
|---|---|---|
| `kb:brain:get-config` / `kb:brain:update-config` | invoke | {kbId} / {kbId, patch: KbBrainConfig} |
| `kb:brain:doc-status` | invoke | {kbId} → 文档 brainStatus 批量 |
| `kb:brain:list-atoms` | invoke | {kbId, documentId?, page, pageSize, filter:{type,status,lensNoteId,origin}} |
| `kb:brain:get-atom` | invoke | {atomId} → 含 provenance 与 superseded 血缘 |
| `kb:brain:list-notes` | invoke | {kbId, type?, status?, page, pageSize} |
| `kb:brain:proposal-inbox` | invoke | {kbId, page, pageSize}（status=proposed） |
| `kb:brain:decide-proposal` | invoke | {noteId, action:'publish'\|'publish-edited'\|'reject', patch?} |
| `kb:brain:create-lens` / `kb:brain:enable-lens` | invoke | 视角卡 CRUD（note type='lens'） |
| `kb:brain:capture-reading` | invoke | §3.6 载荷 |
| `kb:brain:distill` | invoke | {kbId, scope?} 手动触发 |
| `kb:brain:stats` | invoke | {kbId} → 消化率仪表数据（§8.3） |
| `kb:brain:review-next` / `kb:brain:review-grade` | invoke | M3：{kbId} / {noteId, rating:1-4} |
| `kb:brain:search` | invoke | brain 模式检索直通（调试/面板用） |

### 7.2 事件（复用 `getEventEmitter` → Electron 广播链，preload 订阅照现有 on* 模式）

| 通道 | 载荷 |
|---|---|
| `kb:brain:progress` | {documentId, phase:'base'\|'lens'\|'entity-summary', progress, passKey} |
| `kb:brain:status` | {documentId, brainStatus, error?} |
| `kb:brain:proposal-ready` | {kbId, count}（收件箱提醒） |
| `kb:brain:conflict-found` | {kbId, atomIds[]}（suspected 人审项） |

---

## 8. 渲染层契约（组件清单，不展开视觉稿）

挂点：`KnowledgeBase.vue` 单体（2054 行）的数据页签区扩展为四 tab：文档 / QA / **论断** / **卡片**。

| 组件 | 契约 | 先例 |
|---|---|---|
| BrainConfigDialog | brainConfig 编辑（开关组+阈值+视角启停）；保存走 update-config | 新建对话框，照 rerank 配置区（`:421-465`） |
| AtomListPanel | 论断分页表：statement/type/status/来源（点击跳文档查看器锚点）/视角/计数；筛选项=通道 filter | QA tab（`:285-315`） |
| NoteListPanel | 卡片分页：title/type/status/version/citedCount/classicScore；proposed 行内联审批按钮 | 同上 |
| ProposalInboxDrawer | proposed 队列抽屉：批准/改写/拒绝 + evidence 指针点开 | StoryRoom ArtifactCard 四动作 |
| BrainStatsBar | header-stats 扩展：论断数/消化率/待审数/（学习库）到期复习数 | `:108-112` |
| DocumentViewerAnchor | 文档查看（章节 markdown 只读渲染）+ 选区工具条（capture-reading） | DL DomainLearningSpace 选区笔记（`:1613-1705`） |
| store 扩展 | Pinia knowledge-base store 增 brain 状态切片 + `kb:brain:*` 事件监听 | `stores/knowledge-base.ts:94-161` |

活动流：消化进度直接进文档表格行（复用现有 progress 列渲染）；全局提醒走 NotificationCenter。

---

## 9. M0 评测与 POC（先行闸门）

### 9.1 评测集

- 位置：`src/core/platform/services/kb-brain/eval/fixtures/`（JSON 入库，随 git 走）。
- 结构：2 个库（A=同类型小说 3 本节选；B=混合文档），每库 40 问（事实型 20 / 综合型 20），标注期望命中的 documentId/chapter 与答案要点。
- Runner：`eval/run-eval.ts`（node 脚本），对比 `search(include:['chunk'])` vs `search(include:['chunk','atom','note'])`，输出 recall@5 / MRR / 事实型不回退校验，报告落 `docs/progress/2026-09-kb-brain-m0-baseline.md`。
- **门线**：综合型 recall@5 提升 ≥5pt 且事实型无回退（−0 容忍），否则不进 M1 批量。

### 9.2 五项 POC（对应可行性报告 §6）

| POC | 实现物 | 验收线 |
|---|---|---|
| 原子化质量 | P-1/P-2 prompt + 3 本书×2 章实跑 + 人工抽检表 | 三要件合格率 ≥85%，实体误抽 ≤10% |
| 裁决正确率 | P-3 + 构造样例集（dup/conflict/unrelated ×20 + 跨视角对） | 分类正确 ≥80%；跨视角零误裁 |
| 事件链对齐 | 2-3 本 leads-to 链 + 人工对齐评估 | 粗粒度骨架（3-6 段）人工可用 ≥60% |
| LanceDB 索引 | 50 万合成向量 + `createIndex(IvfPq)` 前后延迟 | top-20 P95 < 500ms |
| 成本台账 | digest_passes cost_json 实跑一本 | 单本成本可读、入仪表 |

---

## 10. 测试计划

| 层 | 用例 |
|---|---|
| 单元 | 台账幂等（同 hash 重跑/换 hash 重跑/running 防并发）；裁决分域（跨视角不互裁回归）；namespace 分流（qa: 剔除、atom 解析、chunk 回退）；RRF 跨类型融合确定性；重链算法（hash 匹配→chunk 重链；不匹配→stale）；FSRS 包装（ts-fsrs 行为：评分→S/D 更新→due 排序）；brainConfig ajv 响亮失败 |
| 集成 | 假 LLM 注入（照 ChapterLlmFn 注入先例）跑全 P1：上传→事件→台账→atoms/edges/vectors→search 命中；reprocess 互操作（重链+stale+幽灵论断为零）；崩溃恢复（kill 后 recoverPendingPasses 续跑，无重复 atom——唯一性由裁决与台账双保险） |
| 回归 | search() 无 include 参数 = 逐字节旧行为（快照对比）；QA 直出路径不受 atom 命名空间影响；关 brainConfig 后全链路等价现状 |
| 多租户 | 消化事件回调 userId 传播（B 库用户的事件不会写 A 库 atom）；事务路径手动带 userId 的断言 |

---

## 11. 任务切分（依赖序）

| # | 任务 | 里程碑 | 依赖 |
|---|---|---|---|
| T01 | 6 表迁移 + 实体/仓储 + 双端装配 | M1 | — |
| T02 | brain-config（ajv）+ updateKnowledgeBase 透传 | M1 | T01 |
| T03 | prompts P-1/P-2/P-3 + 假 LLM 单测 | M0 | —（与 T01 并行） |
| T04 | 评测集 + runner + 基线报告 | M0 | T03 |
| T05 | POC 五项（§9.2） | M0 | T03（原子化/裁决）；T01（索引/台账） |
| T06 | DigestOrchestrator（订阅/台账/并发/恢复/进度事件） | M1 | T01-T03 |
| T07 | AtomizeService + EntityResolveService | M1 | T03, T06 |
| T08 | AdjudicateService（含分域 + 事务） | M1 | T07 |
| T09 | 入池：向量命名空间 + 倒排泛化 + namespace 注册表 | M1 | T01 |
| T10 | BrainQueryService（RRF 跨类型 + 结果解析 + search 分流） | M1 | T09 |
| T11 | 重链与 stale（reprocess 互操作） | M1 | T06 |
| T12 | 渲染：BrainConfig/AtomList/进度列/store | M1 | T06, T09 |
| T13 | 语义边完善 + 实体摘要演化 + PPR（平台函数+缓存） + 图路查询 | M2 | T07 |
| T14 | DistillService（重要性账户/聚类/P-4）+ 收件箱 UI + 审批动线 | M2 | T08, T13 |
| T15 | 视角卡 CRUD + 视角遍（P-6）+ 分域回归测试 | M2 | T14 |
| T16 | capture-reading + DocumentViewerAnchor（选区工具条） | M2 | T12 |
| T17 | brain-provider 注册（三宿主消费）+ kb_brain_query 工具 | M3 | T10 |
| T18 | CRAG 纠错 + FSRS（ts-fsrs 引入/包装/review 流） | M3 | T13, T17 |
| T19 | 设定模式卡（P-5）+ 创作装配试点（长文场景） | M3 | T14, T17 |
| T20 | 代谢 cron + 品味侧写 + 情节卡试点（P-5 变体+对齐）+ 深度研究流 + 技能导出 | M4 | T14-T19 |

估工：M0 ≈5-8、M1 ≈10-15、M2 ≈12-18、M3 ≈12-18、M4 ≈12-18 人日（与可行性报告一致）。

---

## 12. 风险与回滚

- **总闸**：brainConfig=null/未 enabled → 一切入口早退；search 无 include → 存量路径逐字节不变。两级回滚都验证过回归测试（§10）。
- **迁移可逆**：6 表纯新增，回滚 = drop；knowledge_bases 加列（brain_config/brain_state）nullable 无默认行为。
- **成本熔断**：DigestOrchestrator 检查 digest_passes 成本聚合，单库单日超阈值（env `KB_BRAIN_DAILY_COST_LIMIT`，缺省无限）暂停排队并通知。
- **最坏退路**：原子层质量不达标（M0 门线不过）→ 收缩 type 集（先 fact/method）或全库仅保 lens=结构视角的萃取；情节卡对齐不达标 → 半自动（单书事件链+人工归纳），其余不受影响。
