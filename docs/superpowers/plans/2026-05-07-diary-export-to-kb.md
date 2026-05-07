# 日记导出到知识库 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在日记编辑器中新增"加入知识库"入口，把当前日记的 markdown 内容作为一篇文档导入指定 KB；支持按"来源"去重 → 同源重复导入即更新现有文档。双端等价（PC + Web）。

**Architecture:** 在 `KbDocument` 实体上新增 `source_type` / `source_id` 列与复合索引；`KnowledgeBaseService.addDocument` 增加 upsert 语义——传入 `source` 时先 `findBySource`，命中则覆盖文件 + 清旧 chunks/vectors/inverted-index + 重跑 `processDocument`。前端在 `DiaryEditor.vue` 复用已有"导出"下拉菜单，新增"加入知识库"项弹 `KbPickerDialog.vue` 选目标。

**Tech Stack:** TypeORM (PG + SQLite 兼容)、Vue3 + Element Plus、vitest、自顶向下从 service 契约推 UI。

**对应设计 spec:** `docs/superpowers/specs/2026-05-07-diary-export-to-kb-design.md`

---

## 文件结构

| 路径 | 操作 | 责任 |
|---|---|---|
| `src/shared/types/knowledge-base.types.ts` | 修改 | 新增 `DocumentSource` 类型；扩展 `CreateDocumentRequest`、`KbDocument`、`addDocument` IO 类型 |
| `src/core/database/entities/kb-document.entity.ts` | 修改 | 加 `sourceType` / `sourceId` 两列 |
| `src/core/database/migrations/add-kb-document-source.ts` | 新增 | 加列 + 复合索引；幂等；PG / SQLite 双兼容 |
| `src/core/database/repositories/kb-document.repository.ts` | 修改 | `findBySource(kbId, source)`；`create()` 接受 source；entity→DTO 映射含 source |
| `src/core/services/knowledge-base.service.ts` | 修改 | 提取 `clearDocumentArtifacts` 私有 helper；`addDocument` 加 upsert 路径 |
| `src/web/server/index.ts` | 修改 | 注册新 migration |
| `src/electron/database/index.ts` | 修改 | 注册新 migration |
| `tests/unit/migrations/add-kb-document-source.spec.ts` | 新增 | migration 幂等性 + 加列 / 索引验证 |
| `tests/unit/repositories/knowledge-base.repository.spec.ts` | 修改 | 加 findBySource 用例 |
| `tests/unit/services/knowledge-base.service.spec.ts` | 新增 | upsert 主路径集成测试（真实 DB + 文件） |
| `src/electron/ipc/handlers/knowledge-base.handler.ts` | 修改 | `handleAddDocument` 类型透传（无逻辑变化） |
| `src/preload/index.ts` | 修改 | TS 返回类型同步 |
| `src/renderer/src/components/diary/KbPickerDialog.vue` | 新增 | 选目标 KB 对话框（含空态跳转） |
| `src/renderer/src/components/diary/DiaryEditor.vue` | 修改 | 下拉新增"加入知识库"项；调对话框 |
| `tests/unit/renderer/diary/KbPickerDialog.spec.ts` | 新增 | 组件加载态/空态/选中行为 |

---

## Task 1：新增 `DocumentSource` 类型 + 扩展 IO 契约

**Files:**
- Modify: `src/shared/types/knowledge-base.types.ts`

- [ ] **Step 1: 新增 `DocumentSource` 类型**

`src/shared/types/knowledge-base.types.ts` 末尾追加：

```ts
// ==================== 文档来源 ====================

/**
 * 文档来源标识。
 * 同一 KB 中 (type, id) 二元组唯一对应一篇文档；用于跨模块导入（如日记）的去重 upsert。
 */
export interface DocumentSource {
  /** 来源类型；后续可扩展 'character' / 'long-writing-chapter' 等 */
  type: 'diary'
  /** 来源在所属模块内的稳定 ID（如 diaryEntry.id） */
  id: string
}
```

- [ ] **Step 2: 扩展 `CreateDocumentRequest`**

在原 `CreateDocumentRequest` 接口里追加可选字段：

```ts
export interface CreateDocumentRequest {
  knowledgeBaseId: string
  name: string
  filePath: string
  fileType: FileType
  fileSize: number
  /** 文档来源（跨模块导入用），默认 NULL（用户手动上传） */
  source?: DocumentSource
}
```

- [ ] **Step 3: 扩展 `KbDocument` DTO 加 source 字段**

在 `KbDocument` 接口里新增可选字段：

```ts
export interface KbDocument {
  // ... 原有字段保持不动 ...
  /** 文档来源（DTO 由 sourceType/sourceId 还原） */
  source?: DocumentSource
}
```

- [ ] **Step 4: 类型检查通过**

Run: `npx vue-tsc --noEmit 2>&1 | grep -E "knowledge-base\.types" | head -20`
Expected: 没有 knowledge-base.types.ts 相关错误（其他不相关错误可忽略）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/knowledge-base.types.ts
git commit -m "feat(kb): 新增 DocumentSource 类型 + 扩展 CreateDocumentRequest / KbDocument"
```

---

## Task 2：写 migration `add-kb-document-source.ts`

**Files:**
- Create: `src/core/database/migrations/add-kb-document-source.ts`

参考范例：`src/core/database/migrations/add-storyboard-keyframe-count.ts`（函数式 migration，PG/SQLite 兼容，幂等）。

- [ ] **Step 1: 创建 migration 文件**

```ts
/**
 * kb_documents 增加 source_type / source_id 字段，加复合索引。
 *
 * 用途：跨模块导入（如日记）的去重 upsert——按 (knowledge_base_id, source_type, source_id)
 * 查找已存在的文档；命中则更新内容、清旧 chunks/vectors/inverted-index 后重新跑 processDocument。
 *
 * 用户手动上传的文档保持 source_type / source_id 为 NULL，行为不变。
 *
 * 幂等。兼容 SQLite + PG。
 */

import type { DataSource } from 'typeorm'

export async function addKbDocumentSource(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!(await checkTableExists(ds, 'kb_documents', isPg))) {
    console.log('[add-kb-document-source] kb_documents 不存在，跳过')
    return
  }

  const varchar32 = isPg ? 'varchar(32)' : 'TEXT'
  const varchar64 = isPg ? 'varchar(64)' : 'TEXT'

  if (!(await checkColumnExists(ds, 'kb_documents', 'source_type', isPg))) {
    await ds.query(`ALTER TABLE kb_documents ADD COLUMN source_type ${varchar32}`)
    console.log('[add-kb-document-source] 加列 source_type')
  }

  if (!(await checkColumnExists(ds, 'kb_documents', 'source_id', isPg))) {
    await ds.query(`ALTER TABLE kb_documents ADD COLUMN source_id ${varchar64}`)
    console.log('[add-kb-document-source] 加列 source_id')
  }

  if (!(await checkIndexExists(ds, 'idx_kb_documents_source', isPg))) {
    await ds.query(
      `CREATE INDEX idx_kb_documents_source ON kb_documents (knowledge_base_id, source_type, source_id)`,
    )
    console.log('[add-kb-document-source] 加索引 idx_kb_documents_source')
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows: Array<{ exists: boolean }> = await ds.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS exists`,
      [table],
    )
    return rows[0]?.exists === true
  }
  const rows: Array<{ name: string }> = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [table],
  )
  return rows.length > 0
}

async function checkColumnExists(
  ds: DataSource,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows: Array<{ exists: boolean }> = await ds.query(
      `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) AS exists`,
      [table, column],
    )
    return rows[0]?.exists === true
  }
  const rows: Array<{ name: string }> = await ds.query(`PRAGMA table_info('${table}')`)
  return rows.some(r => r.name === column)
}

async function checkIndexExists(ds: DataSource, indexName: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows: Array<{ exists: boolean }> = await ds.query(
      `SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = $1) AS exists`,
      [indexName],
    )
    return rows[0]?.exists === true
  }
  const rows: Array<{ name: string }> = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='index' AND name = ?`,
    [indexName],
  )
  return rows.length > 0
}
```

- [ ] **Step 2: 检查现有 migration 是否提供共享 helper**

Run: `grep -rn "checkColumnExists\|checkTableExists" /home/ubuntu/workdir/the-bot/src/core/database/migrations/ | head`
预期输出：每个 migration 自带本地 helper（无共享导出）。
**如果**项目里已有 `database/migration-helpers.ts` 之类共享 helper，改用 import；本 task 不再重复定义。

- [ ] **Step 3: Commit**

```bash
git add src/core/database/migrations/add-kb-document-source.ts
git commit -m "feat(db): kb_documents 新增 source_type/source_id 列与复合索引 migration"
```

---

## Task 3：migration 单测

**Files:**
- Create: `tests/unit/migrations/add-kb-document-source.spec.ts`

参考范例：`tests/unit/migrations/add-storyboard-background-ref.spec.ts`（in-memory SQLite + 三场景：legacy 加列 / 已有列幂等 / 表不存在跳过）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { addKbDocumentSource } from '@core/database/migrations/add-kb-document-source'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  // 模拟 migration 之前的 kb_documents 表（无 source_type / source_id）
  await ds.query(`CREATE TABLE kb_documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    name TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size INTEGER,
    status TEXT,
    progress INTEGER,
    chunk_count INTEGER,
    error_message TEXT,
    metadata TEXT,
    created_at DATETIME,
    updated_at DATETIME
  )`)
  return ds
}

async function buildEmptyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  return ds
}

describe('migration: add-kb-document-source', () => {
  it('legacy 表加列 + 索引', async () => {
    const ds = await buildLegacyDb()
    try {
      await addKbDocumentSource(ds)

      const cols: Array<{ name: string }> = await ds.query(`PRAGMA table_info('kb_documents')`)
      const names = cols.map(c => c.name)
      expect(names).toContain('source_type')
      expect(names).toContain('source_id')

      const indexes: Array<{ name: string }> = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='kb_documents'`,
      )
      expect(indexes.some(i => i.name === 'idx_kb_documents_source')).toBe(true)
    } finally {
      await ds.destroy()
    }
  })

  it('幂等：重复执行不报错', async () => {
    const ds = await buildLegacyDb()
    try {
      await addKbDocumentSource(ds)
      await addKbDocumentSource(ds)
      // 二次执行不抛异常即通过
    } finally {
      await ds.destroy()
    }
  })

  it('表不存在时静默跳过', async () => {
    const ds = await buildEmptyDb()
    try {
      // 不应抛
      await expect(addKbDocumentSource(ds)).resolves.toBeUndefined()
    } finally {
      await ds.destroy()
    }
  })
})
```

- [ ] **Step 2: 跑测试，验证全部通过**

Run: `npm test -- tests/unit/migrations/add-kb-document-source.spec.ts`
Expected: 3 passed

- [ ] **Step 3: Commit**

```bash
git add tests/unit/migrations/add-kb-document-source.spec.ts
git commit -m "test(db): add-kb-document-source migration 单测（legacy/幂等/空 DB）"
```

---

## Task 4：Entity 加 `sourceType` / `sourceId` 列

**Files:**
- Modify: `src/core/database/entities/kb-document.entity.ts`

- [ ] **Step 1: 在 entity 类里追加两列**

在 `KbDocumentEntity` 类里、`metadata` 列后面追加（保持原有 column 顺序的相对位置）：

```ts
@Column({ name: 'source_type', type: 'varchar', length: 32, nullable: true })
sourceType!: string | null

@Column({ name: 'source_id', type: 'varchar', length: 64, nullable: true })
sourceId!: string | null
```

注意：`length` 在 SQLite 下会被忽略，TypeORM 兼容；不会影响现有 PG 与 SQLite 测试。

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit 2>&1 | grep "kb-document.entity" | head -10`
Expected: 无相关错误。

- [ ] **Step 3: Commit**

```bash
git add src/core/database/entities/kb-document.entity.ts
git commit -m "feat(db): KbDocumentEntity 新增 sourceType/sourceId 列"
```

---

## Task 5：Repository — `create` 接受 source + 新增 `findBySource`

**Files:**
- Modify: `src/core/database/repositories/kb-document.repository.ts`

先确认现状：
- `create(request)` 当前硬编码 `metadata: null`（line ~70）
- entity → DTO 映射函数（toDto / 类似名字）需要把 `sourceType`/`sourceId` 还原为 `source: DocumentSource | undefined`

- [ ] **Step 1: 在 entity → DTO 映射里加 source 还原**

定位文件中现有的 entity → DTO 映射函数（搜索 `metadata: (e.metadata` 那段，约 line 38）。在同一 return 对象里追加：

```ts
source: (e.sourceType && e.sourceId)
  ? { type: e.sourceType as DocumentSource['type'], id: e.sourceId }
  : undefined,
```

文件顶部 import：

```ts
import type { DocumentSource } from '@shared/types/knowledge-base.types'
```

- [ ] **Step 2: `create` 传入 sourceType / sourceId**

定位 `async create(request: CreateDocumentRequest)` 里的 `this.repo.create({ ... })` 调用（约 line 56-71），把 `source` 解构进去：

```ts
async create(request: CreateDocumentRequest): Promise<KbDocument> {
  const now = new Date()
  const entity = this.repo.create({
    // ... 原有字段 ...
    metadata: null,
    sourceType: request.source?.type ?? null,
    sourceId: request.source?.id ?? null,
    createdAt: now,
    updatedAt: now,
  } as any)
  // ... 原有保存逻辑 ...
}
```

`createBatch` 同步加上同样两行（如果存在）。

- [ ] **Step 3: 加 `findBySource` 方法**

在 repo 类里 `findById` 附近追加：

```ts
async findBySource(kbId: string, source: DocumentSource): Promise<KbDocument | null> {
  return this.findOneByWhere({
    knowledgeBaseId: kbId,
    sourceType: source.type,
    sourceId: source.id,
  } as any)
}
```

如果项目 base-repository 没有 `findOneByWhere`，参考同 repo 内 `findManyByWhere` 实现（搜索 `findManyByWhere` 看签名），调用 `this.repo.findOne({ where: { ... } })` 等价代替。

- [ ] **Step 4: 写 repo 单测**

修改 `tests/unit/repositories/knowledge-base.repository.spec.ts`，在已有 KB 子系统 describe 块里追加：

```ts
it('KbDocument: findBySource 命中（同 KB 同 source）', async () => {
  const kb = await kbs.create({
    name: 'KB1',
    embeddingModel: 'm',
    embeddingDimension: 1,
    embeddingConfig: {} as any,
  } as any)
  const created = await docs.create({
    knowledgeBaseId: kb.id,
    name: '日记A',
    filePath: '/tmp/a.txt',
    fileType: 'txt',
    fileSize: 100,
    source: { type: 'diary', id: 'diary-1' },
  })
  expect(created.source).toEqual({ type: 'diary', id: 'diary-1' })

  const found = await docs.findBySource(kb.id, { type: 'diary', id: 'diary-1' })
  expect(found?.id).toBe(created.id)
})

it('KbDocument: findBySource 不跨 KB', async () => {
  const kb1 = await kbs.create({ name: 'KB1', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
  const kb2 = await kbs.create({ name: 'KB2', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
  await docs.create({
    knowledgeBaseId: kb1.id,
    name: '日记A',
    filePath: '/tmp/a.txt',
    fileType: 'txt',
    fileSize: 100,
    source: { type: 'diary', id: 'diary-1' },
  })
  const got = await docs.findBySource(kb2.id, { type: 'diary', id: 'diary-1' })
  expect(got).toBeNull()
})

it('KbDocument: 不传 source 时 sourceType/sourceId 为 null', async () => {
  const kb = await kbs.create({ name: 'KB1', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
  const doc = await docs.create({
    knowledgeBaseId: kb.id,
    name: '上传文档',
    filePath: '/tmp/x.txt',
    fileType: 'txt',
    fileSize: 50,
  })
  expect(doc.source).toBeUndefined()
  const got = await docs.findBySource(kb.id, { type: 'diary', id: 'diary-1' })
  expect(got).toBeNull()
})

it('KbDocument: findBySource 不存在返回 null', async () => {
  const kb = await kbs.create({ name: 'KB1', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
  const got = await docs.findBySource(kb.id, { type: 'diary', id: 'no-such' })
  expect(got).toBeNull()
})
```

注意：现有 `createTestDataSource` 用 `synchronize: true` 还是手工 migration？查看 helpers 里的实现。如果是 synchronize，entity 上加列后表自动建好；如果是手工 migration，需要在 helper 里调 `addKbDocumentSource(ds)`。

Run: `grep -n "synchronize\|migration" /home/ubuntu/workdir/the-bot/tests/unit/helpers/create-test-data-source.ts | head`
- 如果 synchronize: true → 直接跑测试
- 如果手工 migration → helper 末尾加调用 `await addKbDocumentSource(ds)`

- [ ] **Step 5: 跑测试**

Run: `npm test -- tests/unit/repositories/knowledge-base.repository.spec.ts`
Expected: 全部 pass（含新增 4 条用例）

- [ ] **Step 6: Commit**

```bash
git add src/core/database/repositories/kb-document.repository.ts tests/unit/repositories/knowledge-base.repository.spec.ts
git commit -m "feat(kb): KbDocumentRepository 支持 source 字段 + findBySource 查询"
```

---

## Task 6：双端注册新 migration

**Files:**
- Modify: `src/web/server/index.ts`
- Modify: `src/electron/database/index.ts`

参考范例：`addStoryboardKeyframeCount` 在两个文件里的注册方式（`grep "addStoryboardKeyframeCount"` 即可定位）。

- [ ] **Step 1: web/server/index.ts 加 import + 调用**

找到 `import { addStoryboardKeyframeCount }` 那一行，在它**下方**追加：

```ts
import { addKbDocumentSource } from '@core/database/migrations/add-kb-document-source'
```

找到 `await addStoryboardKeyframeCount(ds)` 那一行，在它**下方**追加：

```ts
await addKbDocumentSource(ds)
```

- [ ] **Step 2: electron/database/index.ts 加 dynamic import + 调用**

参考现有 `addStoryboardKeyframeCount` 的 dynamic import 块（约 line 454-457），在它后面追加同样结构的块：

```ts
{
  const { addKbDocumentSource } = await import(
    '@core/database/migrations/add-kb-document-source'
  )
  await addKbDocumentSource(this.dataSource)
}
```

具体语法保持和已有块一致（如果上面的写法不一样，照抄已有的）。

- [ ] **Step 3: 启动 web-server 验证 migration 跑过**

确保 web-server 已停止后重启（让它跑 migration）：

```bash
# 用户的 dev 已在 4201 端口运行，不重启即可——tsx watch 应该会自动检测变更并重启；
# 等控制台出现 "[add-kb-document-source]" 日志
```

或手动检查：

Run: `psql ... -c "\\d kb_documents"`（或对应 DB 工具）查看表结构
Expected: 输出含 `source_type` / `source_id` 列与 `idx_kb_documents_source` 索引

- [ ] **Step 4: Commit**

```bash
git add src/web/server/index.ts src/electron/database/index.ts
git commit -m "chore(db): 双端注册 add-kb-document-source migration"
```

---

## Task 7：Service 提取 `clearDocumentArtifacts` private helper

**Files:**
- Modify: `src/core/services/knowledge-base.service.ts`

`reprocessDocument`（line ~334）和后面 Task 8 要加的 upsert 路径都需要"删 vectors / inverted-index / chunks"——抽到 helper 复用。

- [ ] **Step 1: 提取 helper**

在 service 类里，定位 `// ==================== 文档处理 ====================` 注释（line ~357）**之前**追加 private 方法：

```ts
/**
 * 清空一篇文档相关的所有派生数据：vectors / inverted-index / chunks。
 * 由 reprocessDocument 与 addDocument 的 upsert 分支共用。
 * 顺序与 deleteDocument 保持一致，避免外键约束被违反。
 */
private async clearDocumentArtifacts(docId: string): Promise<void> {
  const db = getCoreDatabaseManager()
  if (!db.kbVectors || !db.kbInvertedIndex || !db.kbChunks) return
  await db.kbVectors.deleteByDocumentId(docId)
  await db.kbInvertedIndex.deleteByDocumentId(docId)
  await db.kbChunks.deleteByDocumentId(docId)
}
```

- [ ] **Step 2: 重构 `reprocessDocument` 调 helper**

把 `reprocessDocument` 里的三行 `await db.kbVectors.deleteByDocumentId(docId)` ... 替换为：

```ts
await this.clearDocumentArtifacts(docId)
```

完整替换示例（reprocessDocument 内部）：

```ts
// 原：
await db.kbDocuments.updateProgress(docId, 0)
await db.kbVectors.deleteByDocumentId(docId)
await db.kbInvertedIndex.deleteByDocumentId(docId)
await db.kbChunks.deleteByDocumentId(docId)
await this.processDocument(doc, kb)

// 改为：
await db.kbDocuments.updateProgress(docId, 0)
await this.clearDocumentArtifacts(docId)
await this.processDocument(doc, kb)
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit 2>&1 | grep "knowledge-base.service" | head -10`
Expected: 无相关错误

- [ ] **Step 4: 跑现有 KB 相关测试不破**

Run: `npm test -- tests/unit/repositories/knowledge-base.repository.spec.ts`
Expected: 仍全部 pass（这一步是纯重构，不改外部行为）

- [ ] **Step 5: Commit**

```bash
git add src/core/services/knowledge-base.service.ts
git commit -m "refactor(kb): 抽 clearDocumentArtifacts private helper（reprocess 复用）"
```

---

## Task 8：Service `addDocument` 加 upsert 路径

**Files:**
- Modify: `src/core/services/knowledge-base.service.ts`
- Modify: `src/shared/types/knowledge-base.types.ts`（同步返回类型）

- [ ] **Step 1: 扩展 addDocument 返回类型**

`src/shared/types/knowledge-base.types.ts` 中（如果尚未在 Task 1 里定义就在这步添加）追加：

```ts
/**
 * addDocument 返回数据：upsert 语义下需要让前端区分新建与更新。
 */
export interface AddDocumentResult {
  /** 文档 DTO */
  doc: KbDocument
  /** 是否走的 upsert 更新路径（命中已有 source） */
  isUpdate: boolean
}
```

- [ ] **Step 2: 改造 service `addDocument`**

修改 `src/core/services/knowledge-base.service.ts` `addDocument` 方法（line ~240）。新签名：

```ts
async addDocument(
  kbId: string,
  data: { name: string; type: 'text'; content: string; source?: DocumentSource },
): Promise<{ success: boolean; data?: AddDocumentResult; error?: string }>
```

（顶部 import 追加 `DocumentSource`、`AddDocumentResult`）

完整替换 `addDocument` 实现：

```ts
async addDocument(
  kbId: string,
  data: { name: string; type: 'text'; content: string; source?: DocumentSource },
): Promise<{ success: boolean; data?: AddDocumentResult; error?: string }> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.knowledgeBases || !db.kbDocuments) {
      return { success: false, error: '数据库未初始化' }
    }

    const kb = await db.knowledgeBases.findById(kbId)
    if (!kb) return { success: false, error: '知识库不存在' }

    // 1. 命中已有同源文档 → upsert
    if (data.source) {
      const existing = await db.kbDocuments.findBySource(kbId, data.source)
      if (existing) {
        const newBuf = Buffer.from(data.content, 'utf-8')
        // 覆盖文件内容（复用 existing.filePath，避免文件孤立）
        await fs.promises.writeFile(existing.filePath, newBuf)

        const sizeDelta = newBuf.length - existing.fileSize
        const oldChunkCount = existing.chunkCount

        // 重置 doc 元信息
        await db.kbDocuments.update(existing.id, {
          name: data.name,
          fileSize: newBuf.length,
          status: 'processing',
          progress: 0,
          chunkCount: 0,
          errorMessage: null,
        } as any)

        // 同步 KB 统计：documentCount 不变；totalSize 按 delta；vectorCount 暂减
        if (sizeDelta !== 0) {
          await db.knowledgeBases.incrementTotalSize(kbId, sizeDelta)
        }
        if (oldChunkCount > 0) {
          await db.knowledgeBases.incrementVectorCount(kbId, -oldChunkCount)
        }

        // 清旧 artifacts（chunks/vectors/inverted-index）
        await this.clearDocumentArtifacts(existing.id)

        this.emitKnowledgeBaseStats(kbId)

        // 异步重跑流水线
        const refreshed: KbDocument = {
          ...existing,
          name: data.name,
          fileSize: newBuf.length,
          status: 'processing',
          progress: 0,
          chunkCount: 0,
          errorMessage: undefined,
        }
        this.processDocument(refreshed, kb).catch(e =>
          console.error('[KB] upsert 处理失败:', e),
        )

        return { success: true, data: { doc: refreshed, isUpdate: true } }
      }
    }

    // 2. 未命中或未传 source → 走原新建路径
    const dataPath = getPathProvider().getDataPath()
    const docDir = path.join(dataPath, 'knowledge-base', kbId, 'documents')
    if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true })

    const docId = randomUUID()
    const destPath = path.join(docDir, `${docId}.txt`)
    const contentBuffer = Buffer.from(data.content, 'utf-8')
    await fs.promises.writeFile(destPath, contentBuffer)

    const request: CreateDocumentRequest = {
      knowledgeBaseId: kbId,
      name: data.name,
      filePath: destPath,
      fileType: 'txt',
      fileSize: contentBuffer.length,
      source: data.source,
    }
    const doc = await db.kbDocuments.create(request)

    await db.knowledgeBases.incrementDocumentCount(kbId, 1)
    await db.knowledgeBases.incrementTotalSize(kbId, doc.fileSize)
    this.emitKnowledgeBaseStats(kbId)

    this.processDocument(doc, kb).catch(e =>
      console.error('[KB] 处理失败:', e),
    )

    return { success: true, data: { doc, isUpdate: false } }
  } catch (e: any) {
    console.error('[KB] 添加文档失败:', e)
    return { success: false, error: e.message }
  }
}
```

注意：本改动影响调用 `service.addDocument(...)` 的所有上层（IPC handler / Web 旁路），但因为只是在原 data 字段下新增 `source?` + 返回结构变 `data: KbDocument` → `data: { doc, isUpdate }`，`{success, error}` 形态不变。

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit 2>&1 | grep "knowledge-base.service\|knowledge-base.handler" | head -20`
Expected: 可能出现 `data.doc` 字段访问错误（handler / 调用点未同步），下一个 task 修。

- [ ] **Step 4: Commit**

```bash
git add src/core/services/knowledge-base.service.ts src/shared/types/knowledge-base.types.ts
git commit -m "feat(kb): addDocument 加 upsert 路径（按 source 去重，命中即更新）"
```

---

## Task 9：Service 集成测试 — addDocument upsert

**Files:**
- Create: `tests/unit/services/knowledge-base.service.spec.ts`

参考基础设施：`tests/unit/repositories/knowledge-base.repository.spec.ts`（用 `createTestDataSource` 起真实 DB）。

为了让 service 在测试环境下能跑：
- 它依赖 `getCoreDatabaseManager()` 拿仓库——测试要先把测试 DataSource 注入到 manager 里
- 它依赖 `getPathProvider()` 拿数据目录——测试要 mock 一个 tmp 目录
- `processDocument` 内部调 embedding——测试里要 stub（避免真去调网络）

如果项目里已有 service 测试基础设施（搜索 `KnowledgeBaseService` 的现有测试 / mock 工厂），优先复用；本 task 只覆盖**核心 upsert 行为**，不涉及 embedding 全流程。

- [ ] **Step 1: 检查现有 service 测试基础设施**

Run: `find /home/ubuntu/workdir/the-bot/tests -name "*service*" -path "*knowledge*"`
- 如果有结果 → 复用其 setup 模式
- 没有 → 用下面的 mock + 真实 repo 方案

- [ ] **Step 2: 写最小可行的 upsert spec**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KnowledgeBaseService } from '@core/services/knowledge-base.service'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'

// 注入测试 DB manager + path provider
import * as dbModule from '@core/database/database-manager.interface'
import * as pathModule from '@core/interfaces/path.interface'

describe.each(getTestDialects())('KnowledgeBaseService.addDocument [%s]', dialect => {
  let tds: TestDataSource
  let tmpDir: string
  let svc: KnowledgeBaseService
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-svc-test-'))

    // 注入 DB manager
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      knowledgeBases: kbs,
      kbDocuments: docs,
      kbChunks: new KbChunkRepository(tds.ds),
      kbInvertedIndex: new KbInvertedIndexRepository(tds.ds),
      kbVectors: { deleteByDocumentId: vi.fn().mockResolvedValue(undefined) } as any,
    } as any)

    // 注入 path provider
    vi.spyOn(pathModule, 'getPathProvider').mockReturnValue({
      getDataPath: () => tmpDir,
    } as any)

    svc = new KnowledgeBaseService()

    // Stub embedding 流水线，避免真调 API
    ;(svc as any).processDocument = vi.fn().mockResolvedValue(undefined)
  })

  afterAll(async () => {
    await tds.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  async function makeKb(): Promise<string> {
    const kb = await kbs.create({
      name: 'KB1',
      embeddingModel: 'm',
      embeddingDimension: 1,
      embeddingConfig: {} as any,
    } as any)
    return kb.id
  }

  it('无 source → 新建路径，isUpdate=false，sourceType/sourceId 为 NULL', async () => {
    const kbId = await makeKb()
    const result = await svc.addDocument(kbId, {
      name: '手动文档',
      type: 'text',
      content: 'hello',
    })
    expect(result.success).toBe(true)
    expect(result.data!.isUpdate).toBe(false)
    expect(result.data!.doc.source).toBeUndefined()
  })

  it('有 source 未命中 → 新建并持久化 source', async () => {
    const kbId = await makeKb()
    const result = await svc.addDocument(kbId, {
      name: '日记A',
      type: 'text',
      content: '内容',
      source: { type: 'diary', id: 'entry-1' },
    })
    expect(result.success).toBe(true)
    expect(result.data!.isUpdate).toBe(false)
    expect(result.data!.doc.source).toEqual({ type: 'diary', id: 'entry-1' })

    const found = await docs.findBySource(kbId, { type: 'diary', id: 'entry-1' })
    expect(found).not.toBeNull()
  })

  it('有 source 命中 → 走 upsert 路径，复用 doc.id 与 filePath', async () => {
    const kbId = await makeKb()
    const first = await svc.addDocument(kbId, {
      name: '日记A v1',
      type: 'text',
      content: '旧内容',
      source: { type: 'diary', id: 'entry-1' },
    })
    const firstDocId = first.data!.doc.id
    const firstFilePath = first.data!.doc.filePath

    const second = await svc.addDocument(kbId, {
      name: '日记A v2',
      type: 'text',
      content: '新内容（更长一点）',
      source: { type: 'diary', id: 'entry-1' },
    })
    expect(second.data!.isUpdate).toBe(true)
    expect(second.data!.doc.id).toBe(firstDocId)              // 复用同一 doc
    expect(second.data!.doc.filePath).toBe(firstFilePath)      // 复用同一文件路径
    expect(second.data!.doc.name).toBe('日记A v2')             // name 已更新
    expect(second.data!.doc.fileSize).toBe(Buffer.byteLength('新内容（更长一点）', 'utf-8'))

    // 文件内容确实被覆盖
    const onDisk = fs.readFileSync(firstFilePath, 'utf-8')
    expect(onDisk).toBe('新内容（更长一点）')

    // KB 级 documentCount 仍是 1（未递增）
    const kb = await kbs.findById(kbId)
    expect(kb!.documentCount).toBe(1)
  })

  it('upsert 路径调 clearDocumentArtifacts（间接通过 vector repo 调用次数验证）', async () => {
    const kbId = await makeKb()
    await svc.addDocument(kbId, {
      name: 'X',
      type: 'text',
      content: 'a',
      source: { type: 'diary', id: 'd1' },
    })

    const vectors = (dbModule.getCoreDatabaseManager() as any).kbVectors
    await svc.addDocument(kbId, {
      name: 'X',
      type: 'text',
      content: 'b',
      source: { type: 'diary', id: 'd1' },
    })
    expect(vectors.deleteByDocumentId).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 跑测试**

Run: `npm test -- tests/unit/services/knowledge-base.service.spec.ts`
Expected: 全部 pass

如果 `tests/unit/services/` 目录不存在，需先 `mkdir -p`。

- [ ] **Step 4: Commit**

```bash
git add tests/unit/services/knowledge-base.service.spec.ts
git commit -m "test(kb): KnowledgeBaseService.addDocument upsert 集成测试"
```

---

## Task 10：IPC handler / preload TS 类型同步

**Files:**
- Modify: `src/electron/ipc/handlers/knowledge-base.handler.ts`
- Modify: `src/preload/index.ts`

注：**handler 内部逻辑无需改动**（透明转发 service 返回值）；只是 TS 签名上让前端能拿到 `isUpdate`。

- [ ] **Step 1: handler 入参类型同步**

定位 `handleAddDocument`（line ~189）：

```ts
async function handleAddDocument(
  _event: any,
  data: { knowledgeBaseId: string; data: { name: string; type: 'text'; content: string } },
) {
  return await service.addDocument(data.knowledgeBaseId, data.data)
}
```

把入参 `data: {...}` 改为：

```ts
data: {
  knowledgeBaseId: string
  data: { name: string; type: 'text'; content: string; source?: DocumentSource }
}
```

文件顶部 import：

```ts
import type { DocumentSource } from '@shared/types/knowledge-base.types'
```

- [ ] **Step 2: preload 类型同步**

`src/preload/index.ts` 找到 `addDocument` 暴露点（搜索 `addDocument`）。同步入参类型让 TS 编辑器能推断出 `source` 可选：

```ts
addDocument: (
  kbId: string,
  data: { name: string; type: 'text'; content: string; source?: DocumentSource },
) => ipcRenderer.invoke('knowledge-base:add-document', { knowledgeBaseId: kbId, data }),
```

文件顶部 import：

```ts
import type { DocumentSource } from '@shared/types/knowledge-base.types'
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit 2>&1 | grep -E "knowledge-base|MessageItem" | head -20`
Expected: 无相关错误

- [ ] **Step 4: Commit**

```bash
git add src/electron/ipc/handlers/knowledge-base.handler.ts src/preload/index.ts
git commit -m "chore(kb): IPC/preload 类型同步 addDocument source 入参"
```

---

## Task 11：新组件 `KbPickerDialog.vue`

**Files:**
- Create: `src/renderer/src/components/diary/KbPickerDialog.vue`

- [ ] **Step 1: 写组件**

```vue
<template>
  <el-dialog
    :model-value="modelValue"
    title="加入知识库"
    width="500px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="loading" class="state-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中...</span>
    </div>

    <el-alert
      v-else-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
    >
      <template #default>
        <el-button text @click="loadKbs">重试</el-button>
      </template>
    </el-alert>

    <div v-else-if="kbs.length === 0" class="state-empty">
      <el-icon :size="48" color="var(--el-text-color-placeholder)">
        <Box />
      </el-icon>
      <p>还没有知识库</p>
      <el-button type="primary" @click="goCreateKb">去新建知识库 →</el-button>
    </div>

    <el-radio-group
      v-else
      v-model="selectedKbId"
      class="kb-list"
    >
      <el-radio
        v-for="kb in kbs"
        :key="kb.id"
        :value="kb.id"
        :label="kb.id"
        class="kb-item"
      >
        <div class="kb-name">{{ kb.name }}</div>
        <div v-if="kb.description" class="kb-desc">{{ kb.description }}</div>
        <div class="kb-meta">
          {{ kb.documentCount }} 篇文档 · {{ kb.embeddingModel }}
        </div>
      </el-radio>
    </el-radio-group>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :disabled="!selectedKbId || importing"
        :loading="importing"
        @click="handleConfirm"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading, Box } from '@element-plus/icons-vue'
import type { KnowledgeBase } from '@shared/types/knowledge-base.types'

const props = defineProps<{
  modelValue: boolean
  entryId: string
  title: string
  content: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'imported': [{ kbId: string; isUpdate: boolean }]
}>()

const router = useRouter()
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const kbs = ref<KnowledgeBase[]>([])
const selectedKbId = ref<string | null>(null)
const importing = ref(false)

watch(
  () => props.modelValue,
  open => {
    if (open) {
      selectedKbId.value = null
      errorMsg.value = null
      loadKbs()
    }
  },
)

async function loadKbs() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await window.electronAPI.knowledgeBase.list()
    if (res.success) {
      kbs.value = res.data || []
    } else {
      errorMsg.value = res.error || '加载知识库失败'
    }
  } catch (e) {
    console.error('[KbPickerDialog] loadKbs:', e)
    errorMsg.value = '加载知识库失败'
  } finally {
    loading.value = false
  }
}

function goCreateKb() {
  emit('update:modelValue', false)
  router.push('/knowledge-base')
}

async function handleConfirm() {
  if (!selectedKbId.value) return
  importing.value = true
  try {
    const res = await window.electronAPI.knowledgeBase.addDocument(selectedKbId.value, {
      name: props.title || '未命名日记',
      type: 'text',
      content: props.content,
      source: { type: 'diary', id: props.entryId },
    })
    if (res.success && res.data) {
      ElMessage.success(res.data.isUpdate ? '已更新到知识库' : '已加入知识库')
      emit('imported', { kbId: selectedKbId.value, isUpdate: res.data.isUpdate })
      emit('update:modelValue', false)
    } else {
      ElMessage.error(res.error || '导入失败')
    }
  } catch (e) {
    console.error('[KbPickerDialog] addDocument:', e)
    ElMessage.error('导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<style lang="scss" scoped>
.state-loading,
.state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.kb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  :deep(.el-radio) {
    width: 100%;
    margin-right: 0;
    height: auto;
    padding: 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    transition: all 0.2s;

    &.is-checked {
      border-color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    .el-radio__label {
      flex: 1;
      padding-left: 8px;
    }
  }
}

.kb-item {
  .kb-name {
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .kb-desc {
    font-size: 12px;
    color: var(--el-text-color-regular);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kb-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
  }
}
</style>
```

注意：所有色彩用 `var(--el-*)` 主题变量（per 用户 feedback「UI 必须支持主题切换」）。

- [ ] **Step 2: 类型检查 + 启动检查**

Run: `npx vue-tsc --noEmit 2>&1 | grep "KbPickerDialog" | head`
Expected: 无相关错误

vite HMR 会自动加载（不会马上看到效果，要 Task 12 接入后才能在 UI 上点到）

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/diary/KbPickerDialog.vue
git commit -m "feat(diary): 新增 KbPickerDialog 选目标知识库对话框"
```

---

## Task 12：`DiaryEditor.vue` 接入"加入知识库"

**Files:**
- Modify: `src/renderer/src/components/diary/DiaryEditor.vue`

- [ ] **Step 1: import 对话框组件 + 加 ref**

在 `DiaryEditor.vue` script setup 顶部：

```ts
import KbPickerDialog from './KbPickerDialog.vue'
```

在 script 中（与 `isElectron` 同区）追加：

```ts
const showKbDialog = ref(false)
```

- [ ] **Step 2: 下拉菜单加新项**

模板里 `<el-dropdown-menu>` 内（第一项之后即可）：

```vue
<el-dropdown-item
  command="kb"
  :disabled="!content.trim()"
>
  加入知识库
</el-dropdown-item>
```

- [ ] **Step 3: handleExport 加 'kb' 分支**

`handleExport` 函数顶部追加：

```ts
async function handleExport(format: string) {
  if (format === 'kb') {
    showKbDialog.value = true
    return
  }
  // ... 原有 html / pdf / docx 逻辑保持不动 ...
}
```

- [ ] **Step 4: 模板末尾挂载对话框**

在最外层 `<div class="diary-editor">` **里面、底部**追加：

```vue
<KbPickerDialog
  v-model="showKbDialog"
  :entry-id="entry.id"
  :title="title"
  :content="content"
/>
```

- [ ] **Step 5: 类型检查**

Run: `npx vue-tsc --noEmit 2>&1 | grep "DiaryEditor" | head`
Expected: 无相关错误

- [ ] **Step 6: 浏览器手测（双端）**

确认：
- Web 端：日记编辑器 → 导出下拉显示"加入知识库"项
- 内容为空时该项 disabled
- 点击 → 弹对话框
- KB 列表为空 → 显示"去新建知识库"跳转
- 选 KB → 确定 → toast "已加入知识库"
- 再次选同一 KB 导入 → toast "已更新到知识库"
- PC 端（如可启动）走一遍同流程

如果当前 dev 端没启动，可：

```bash
# Web 端已在 5174 端口跑（vite HMR 应该自动应用）
# PC 端如未启动：在 user 终端用 ! npm run dev
```

主题切换测试：切到暗色主题，确认对话框颜色正常（per 用户 feedback「UI 必须支持主题切换」）

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/diary/DiaryEditor.vue
git commit -m "feat(diary): 编辑器导出菜单接入"加入知识库""
```

---

## Task 13：组件单测 `KbPickerDialog.spec.ts`

**Files:**
- Create: `tests/unit/renderer/diary/KbPickerDialog.spec.ts`

参考：`tests/unit/renderer/` 目录下现有 Vue 组件测试惯例（搜索 mount / @vue/test-utils 用法）。

- [ ] **Step 1: 检查现有 renderer 测试基础设施**

Run: `find /home/ubuntu/workdir/the-bot/tests/unit/renderer -name "*.spec.ts" | head -3`
- 复用其 mount + mock electronAPI 模式

- [ ] **Step 2: 写组件测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import KbPickerDialog from '@/components/diary/KbPickerDialog.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

function setupMockApi(
  list: { success: boolean; data?: any[]; error?: string },
  add?: { success: boolean; data?: { doc: any; isUpdate: boolean }; error?: string },
) {
  ;(window as any).electronAPI = {
    knowledgeBase: {
      list: vi.fn().mockResolvedValue(list),
      addDocument: vi.fn().mockResolvedValue(add ?? { success: true, data: { doc: {}, isUpdate: false } }),
    },
  }
}

describe('KbPickerDialog', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it('列表为空时显示空态 + 跳转按钮', async () => {
    setupMockApi({ success: true, data: [] })
    const wrapper = mount(KbPickerDialog, {
      props: { modelValue: true, entryId: 'e1', title: 't', content: 'c' },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('还没有知识库')
    expect(wrapper.text()).toContain('去新建知识库')

    await wrapper.find('button').trigger('click')   // 第一个按钮 = 跳转
    expect(push).toHaveBeenCalledWith('/knowledge-base')
  })

  it('列表加载失败显示错误 + 重试', async () => {
    setupMockApi({ success: false, error: '网络错误' })
    const wrapper = mount(KbPickerDialog, {
      props: { modelValue: true, entryId: 'e1', title: 't', content: 'c' },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('网络错误')
  })

  it('选中 KB 后确定 → 调用正确 IPC 入参', async () => {
    setupMockApi(
      { success: true, data: [{ id: 'kb-1', name: 'K1', documentCount: 0, embeddingModel: 'm' } as any] },
      { success: true, data: { doc: {}, isUpdate: false } },
    )
    const wrapper = mount(KbPickerDialog, {
      props: { modelValue: true, entryId: 'entry-1', title: '日记', content: '内容' },
    })
    await flushPromises()

    // 选中 radio
    await wrapper.find('input[type="radio"]').setValue()
    // 点确定（最后一个 button）
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    const api = (window as any).electronAPI.knowledgeBase
    expect(api.addDocument).toHaveBeenCalledWith('kb-1', {
      name: '日记',
      type: 'text',
      content: '内容',
      source: { type: 'diary', id: 'entry-1' },
    })

    // 成功后 emit imported
    expect(wrapper.emitted('imported')?.[0]).toEqual([
      { kbId: 'kb-1', isUpdate: false },
    ])
  })

  it('isUpdate=true 时 emit 也带正确 flag', async () => {
    setupMockApi(
      { success: true, data: [{ id: 'kb-1', name: 'K1', documentCount: 0, embeddingModel: 'm' } as any] },
      { success: true, data: { doc: {}, isUpdate: true } },
    )
    const wrapper = mount(KbPickerDialog, {
      props: { modelValue: true, entryId: 'e', title: 't', content: 'c' },
    })
    await flushPromises()
    await wrapper.find('input[type="radio"]').setValue()
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    expect(wrapper.emitted('imported')?.[0]).toEqual([
      { kbId: 'kb-1', isUpdate: true },
    ])
  })
})
```

- [ ] **Step 3: 跑测试**

Run: `npm test -- tests/unit/renderer/diary/KbPickerDialog.spec.ts`
Expected: 4 passed

如有 Element Plus 组件 selector 不命中（el-radio 内部结构差异），适当调整 query。

- [ ] **Step 4: Commit**

```bash
git add tests/unit/renderer/diary/KbPickerDialog.spec.ts
git commit -m "test(diary): KbPickerDialog 组件测试（空态/错误/选中入参/isUpdate）"
```

---

## Task 14：跑全量测试 + 文档同步

**Files:**
- Modify: `docs/manual/episode-production.md`（如果存在日记章节；如果不存在创建 `docs/manual/diary.md`）

- [ ] **Step 1: 跑全量测试**

按用户 feedback「全量测试在最后跑一次即可」，到这里跑：

Run: `npm test -- --run`
Expected: 全部 pass。如有失败排查；不能继续后续 task。

如果 PG / SQLite 之一报错，可分开跑确认是哪一边问题：

Run: `npm run test:unit:sqlite`
Run: `npm run test:unit:pg`

- [ ] **Step 2: 写日记功能手册**

如果 `docs/manual/diary.md` 不存在：创建并加"加入知识库"章节。最小内容：

```markdown
# 日记

## 加入知识库

在日记编辑器顶部，点击右侧"导出"按钮 → 选择"加入知识库"，会弹出对话框让你选目标知识库。

- 列表为空时点"去新建知识库"会跳转到知识库管理页
- 选中知识库 → 确定，当前日记会作为一篇 markdown 文档导入
- 同一篇日记多次导入到同一知识库，**会更新已有文档**（不会产生重复）
- 不同知识库各自独立，导入到 KB-A 不影响 KB-B

注意：日记内容为空时"加入知识库"项会 disabled。
```

如果项目已有日记总手册，把上述章节追加到合适位置。

- [ ] **Step 3: Commit 文档**

```bash
git add docs/manual/diary.md
git commit -m "docs(manual): 日记加入知识库 操作说明"
```

---

## Task 15：清理 + 自检

- [ ] **Step 1: git status 确认干净**

Run: `git status`
Expected: 仅 `.claude/settings.local.json`、`progress/*.png` 等用户本地文件，无项目文件未提交。

- [ ] **Step 2: 复核 commit 历史**

Run: `git log --oneline -15`
Expected: 看到清晰的 task 链条，每个 task 一个或两个 commit。

- [ ] **Step 3: 浏览器双端最终冒烟**

Web 端 + PC 端都过一遍：
1. 日记 → 编辑 → 内容写完
2. 导出 → 加入知识库 → 选 KB → 确定 → toast "已加入知识库"
3. 编辑日记 → 保存 → 再次导出 → 加入同一 KB → 确定 → toast "已更新到知识库"
4. 选不同 KB → 导入 → 确认两个 KB 各有一份文档
5. 切换暗色主题验证对话框颜色正常

- [ ] **Step 4: 关闭 spec 的 DoD 清单**

回到 `docs/superpowers/specs/2026-05-07-diary-export-to-kb-design.md` 的"§10 验收标准（Definition of Done）"逐条 ✓。

---

## 执行顺序与依赖

```
T1 类型 ──┬─ T2 migration ─ T3 migration 测试 ─┐
          │                                    ├─ T6 注册 ─ T7 helper ─ T8 service upsert ─ T9 service 测试 ─ T10 IPC/preload ─┐
          └─ T4 entity ─ T5 repo ──────────────┘                                                                                ├─ T13 组件测试 ─ T14 全量测试 + 手册 ─ T15 自检
                                                                                                                T11 对话框 ─ T12 编辑器接入 ─┘
```

**并行机会**：T2 / T3 与 T4 / T5 可并行（一个加 migration、一个改 entity/repo），但 T6 注册依赖前两条都完成。T11（对话框组件）可以在 T8 完成后立即开始，不必等 T9 测试。

如使用 subagent-driven-development，每个 Task 一个 subagent，main session 在每个 commit 后检查 diff。
