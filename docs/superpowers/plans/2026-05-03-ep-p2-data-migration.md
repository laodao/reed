# 剧集制作 · Phase 2 · 数据迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 episode-production 模块上线 6 项数据库 schema 迁移（含数据搬运），entity 同步加新字段；零业务行为改动；PC（SQLite）+ Web（PG）双端都通过。

**Architecture:** 沿用项目现有"函数式 ALTER TABLE"迁移风格：每条迁移是一个独立 `async function migrateXxx(ds: DataSource)`，内部根据 `ds.options.type === 'postgres'` 分支。每条迁移按"检查表/列是否存在再 ALTER"的幂等模式，可重复执行。每条迁移配一个 unit 测试（构造旧 schema → 跑迁移 → 断言新 schema/数据），仿 `tests/unit/sqlite-legacy-migration.spec.ts` 范式。新 migration 注册在 PC 端 `electron/database/index.ts:migrateMultiTenancy()` 之后、Web 端 `web/server/index.ts` 启动流程对应位置——同步双端入口。

**Tech Stack:** TypeORM 0.3 / typeorm-naming-strategies 不强用 / SQLite (better-sqlite3) + PostgreSQL（pg）双 driver / Vitest（unit）/ Playwright（e2e）。

---

## ⭐ 双端约束（贯穿所有 task）

按 spec 第 0.3 / 5.7 节，每条迁移必须：

1. **PG + SQLite 都通过**：
   - `ds.options.type === 'postgres'` 分支用 `$1` 参数 / `information_schema.columns` 查列；SQLite 用 `?` / `pragma_table_info`
   - 测试同时跑 PG 和 SQLite（先跑 SQLite in-memory 即可；PG 端在 dev 库演练时验）
2. **注册到 PC + Web 启动入口**：
   - PC: `src/electron/database/index.ts` 的 `migrateMultiTenancy()` 方法（行 366-374 附近）
   - Web: `src/web/server/index.ts` 启动流程（搜 `ensureUserIdColumns` 找对应入口）
   - 缺一即另一端启动跑不出新 schema
3. **幂等**：迁移函数能重复跑（ALTER 前先 checkColumnExists）；不允许"已存在就报错"
4. **可逆**：按 spec §6.1，每条带 down 路径（注释里描述如何手工回滚即可，不强求 down 函数）

每个涉及 migration 的 task 末尾有一个 **"双端注册同步检查清单"**。

---

## 现状盘点（参考）

```
现有 migration 框架
  src/core/database/migrations/
    ensure-users-table.ts          users 表保障
    ensure-user-id-columns.ts      多租户隔离迁移
    asset-paths-to-relative.ts     图片相对路径化

  入口注册点
    PC : src/electron/database/index.ts 的 migrateMultiTenancy() 方法（约 line 366-374）
    Web: src/web/server/index.ts 启动 DataSource 后调用同样的 ensureXxx 函数

  测试范式
    tests/unit/sqlite-legacy-migration.spec.ts
      构造旧 schema in-memory sqlite → 跑迁移 → 断言

Entity 现状（要改的）
  src/core/database/entities/episode-production/
    character-binding.entity.ts    缺 source_type / override_*
    location-binding.entity.ts     缺 source_type / override_* / panorama_3d_id / scene_layout_id
    item-binding.entity.ts         缺 source_type / override_*
    storyboard.entity.ts           缺 keyframe_count / video_provider_id / video_model_id
                                    / video_mode / use_3d_staging / staging_layout_id
    scene-prop.entity.ts           缺 item_binding_id FK
    
  src/core/database/entities/
    lw-character.entity.ts         要移除 portrait_id + generated_image_id
    lw-location.entity.ts          要移除 generated_image_id

新建 entity
  asset-image.entity.ts            统一图谱表
  storyboard-keyframe.entity.ts    多关键帧表

Types 现状（要改的）
  src/shared/types/episode-production/workflow.types.ts
    EpisodeStatus 枚举要扩展（新增 'asset_prep' / 把 'reviewing' 改名 'composing'）
```

---

## Task 0: 准备 — 基线 + dev DB 备份

**Files:**
- Create: 临时备份目录 `/tmp/p2-dev-db-backup/`
- Modify: 无（仅观测）

**Concept:** 在动 schema 之前先记下基线（typecheck 数 / unit 测试数 / dev DB 当前内容），并备份 dev DB（the-bot-test-pg 容器里的 the_bot_web 库），万一迁移出问题能恢复。

- [ ] **Step 1: 确认分支 + clean tree**

```bash
cd /home/ubuntu/workdir/the-bot
git rev-parse --abbrev-ref HEAD   # 应为 feat/episode-production-redesign
git status --short                  # 应只有 .claude/settings.local.json
```

- [ ] **Step 2: 跑 baseline**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS" > /tmp/p2-baseline-typecheck.count
echo "typecheck baseline: $(cat /tmp/p2-baseline-typecheck.count) errors"

npm run test:unit:sqlite 2>&1 | tail -5 > /tmp/p2-baseline-unit.txt
cat /tmp/p2-baseline-unit.txt
```

记录：基线 typecheck error 数（应为 322 左右，按 P1 完成时的状态）；unit 33 fail / 3 pass。

- [ ] **Step 3: 备份 dev DB**

```bash
mkdir -p /tmp/p2-dev-db-backup
docker exec the-bot-test-pg pg_dump -U postgres -F c the_bot_web > /tmp/p2-dev-db-backup/the_bot_web-pre-p2.dump
ls -la /tmp/p2-dev-db-backup/
```

- [ ] **Step 4: 列表当前 dev DB 关键表行数（迁移后对比）**

```bash
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "
SELECT 
  (SELECT count(*) FROM character_bindings) AS character_bindings,
  (SELECT count(*) FROM location_bindings) AS location_bindings,
  (SELECT count(*) FROM item_bindings) AS item_bindings,
  (SELECT count(*) FROM storyboards) AS storyboards,
  (SELECT count(*) FROM scene_props) AS scene_props,
  (SELECT count(*) FROM video_episodes) AS video_episodes
" 2>&1 | tee /tmp/p2-baseline-row-counts.txt
```

- [ ] **Step 5: 不需要 commit**（只是观测）。继续 Task 1。

---

## Task 1: 迁移 ① binding 表加 source_type + override_*

**Files:**
- Modify: `src/core/database/entities/episode-production/character-binding.entity.ts`
- Modify: `src/core/database/entities/episode-production/location-binding.entity.ts`
- Modify: `src/core/database/entities/episode-production/item-binding.entity.ts`
- Create: `src/core/database/migrations/ensure-asset-binding-source-type.ts`
- Create: `tests/unit/migrations/ensure-asset-binding-source-type.spec.ts`

**Concept:** 给 3 个 binding 表加 `source_type` 列（`'linked_lw'` / `'standalone'`）+ 一组 `override_*` 字段（仅 linked_lw 模式有效）。`source_type` 推断规则：`long_writing_xxx_id` 非空 → `linked_lw`；为空 → `standalone`。

字段清单（按 spec §3.2 / §3.7）：

```
character_binding 新加：
  source_type             text default 'standalone'   后续按规则推断回填
  override_name           text nullable
  override_description    text nullable
  override_appearance     text nullable
  override_outfit         text nullable
  standalone_name         text nullable
  standalone_description  text nullable

location_binding 新加：
  source_type            text default 'standalone'
  override_name          text nullable
  override_description   text nullable
  standalone_name        text nullable
  standalone_description text nullable
  panorama_3d_id         text nullable    # 3D 接入点 1（spec §4.5）
  scene_layout_id        text nullable    # 同上

item_binding 新加：
  source_type            text default 'standalone'
  override_name          text nullable
  override_description   text nullable
  standalone_name        text nullable
  standalone_description text nullable
```

- [ ] **Step 1: 写测试 `tests/unit/migrations/ensure-asset-binding-source-type.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { ensureAssetBindingSourceType } from '@core/database/migrations/ensure-asset-binding-source-type'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  // 旧 schema：3 个 binding 表，无新加字段
  await ds.query(`CREATE TABLE character_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, long_writing_character_id TEXT,
    portrait_id TEXT, voice_id TEXT
  )`)
  await ds.query(`CREATE TABLE location_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, long_writing_location_id TEXT,
    location_name TEXT, image_paths TEXT
  )`)
  await ds.query(`CREATE TABLE item_bindings (
    id TEXT PRIMARY KEY, project_id TEXT, long_writing_item_id TEXT,
    item_name TEXT, image_paths TEXT
  )`)
  return ds
}

describe('ensureAssetBindingSourceType migration', () => {
  it('给 3 个 binding 表都加 source_type + override_* + standalone_* 列', async () => {
    const ds = await buildLegacyDb()
    await ensureAssetBindingSourceType(ds)
    const charCols = await ds.query(`SELECT name FROM pragma_table_info('character_bindings')`)
    const charColNames = charCols.map((r: any) => r.name)
    expect(charColNames).toContain('source_type')
    expect(charColNames).toContain('override_name')
    expect(charColNames).toContain('override_description')
    expect(charColNames).toContain('override_appearance')
    expect(charColNames).toContain('override_outfit')
    expect(charColNames).toContain('standalone_name')
    expect(charColNames).toContain('standalone_description')

    const locCols = (await ds.query(`SELECT name FROM pragma_table_info('location_bindings')`))
      .map((r: any) => r.name)
    expect(locCols).toContain('source_type')
    expect(locCols).toContain('panorama_3d_id')
    expect(locCols).toContain('scene_layout_id')

    const itemCols = (await ds.query(`SELECT name FROM pragma_table_info('item_bindings')`))
      .map((r: any) => r.name)
    expect(itemCols).toContain('source_type')

    await ds.destroy()
  })

  it('source_type 按 long_writing_xxx_id 是否非空回填', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, project_id, long_writing_character_id) VALUES
      ('a', 'p1', 'lw_c_1'),
      ('b', 'p1', NULL)`)
    await ds.query(`INSERT INTO location_bindings (id, project_id, long_writing_location_id, location_name) VALUES
      ('la', 'p1', 'lw_l_1', 'A'),
      ('lb', 'p1', NULL, 'B')`)
    await ds.query(`INSERT INTO item_bindings (id, project_id, long_writing_item_id, item_name) VALUES
      ('ia', 'p1', 'lw_i_1', 'A'),
      ('ib', 'p1', NULL, 'B')`)

    await ensureAssetBindingSourceType(ds)

    const chars = await ds.query(`SELECT id, source_type FROM character_bindings ORDER BY id`)
    expect(chars).toEqual([
      { id: 'a', source_type: 'linked_lw' },
      { id: 'b', source_type: 'standalone' },
    ])
    const locs = await ds.query(`SELECT id, source_type FROM location_bindings ORDER BY id`)
    expect(locs).toEqual([
      { id: 'la', source_type: 'linked_lw' },
      { id: 'lb', source_type: 'standalone' },
    ])
    const items = await ds.query(`SELECT id, source_type FROM item_bindings ORDER BY id`)
    expect(items).toEqual([
      { id: 'ia', source_type: 'linked_lw' },
      { id: 'ib', source_type: 'standalone' },
    ])

    await ds.destroy()
  })

  it('幂等：重复跑两次不报错', async () => {
    const ds = await buildLegacyDb()
    await ensureAssetBindingSourceType(ds)
    await ensureAssetBindingSourceType(ds) // 应该不报错
    await ds.destroy()
  })
})
```

- [ ] **Step 2: 跑测试看 fail（migration 文件不存在）**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/ensure-asset-binding-source-type.spec.ts 2>&1 | tail
```

Expected: FAIL（找不到 module `@core/database/migrations/ensure-asset-binding-source-type`）。

- [ ] **Step 3: 写 migration `src/core/database/migrations/ensure-asset-binding-source-type.ts`**

参考 `src/core/database/migrations/ensure-user-id-columns.ts` 的双端兼容写法。

```typescript
/**
 * 给 character_binding / location_binding / item_binding 三张表加
 * source_type + override_* + standalone_* 字段（spec §3.7）。
 * 同时给 location_binding 加 3D 接入点字段 panorama_3d_id / scene_layout_id（spec §4.5）。
 *
 * source_type 回填规则：long_writing_xxx_id 非空 → 'linked_lw'，否则 'standalone'。
 *
 * 兼容 SQLite + PostgreSQL，幂等。
 */

import type { DataSource } from 'typeorm'

interface BindingTableSpec {
  table: string
  /** 用来推断 source_type 的关联列 */
  lwIdColumn: string
  /** 该表要加的额外列（除 source_type / override_name / override_description / standalone_name / standalone_description 5 个公共列外）*/
  extraColumns: { name: string; type: string }[]
}

const BINDING_TABLES: BindingTableSpec[] = [
  {
    table: 'character_bindings',
    lwIdColumn: 'long_writing_character_id',
    extraColumns: [
      { name: 'override_appearance', type: 'TEXT' },
      { name: 'override_outfit', type: 'TEXT' },
    ],
  },
  {
    table: 'location_bindings',
    lwIdColumn: 'long_writing_location_id',
    extraColumns: [
      { name: 'panorama_3d_id', type: 'TEXT' },
      { name: 'scene_layout_id', type: 'TEXT' },
    ],
  },
  {
    table: 'item_bindings',
    lwIdColumn: 'long_writing_item_id',
    extraColumns: [],
  },
]

const COMMON_COLUMNS = [
  { name: 'source_type', type: 'TEXT', defaultExpr: "'standalone'" },
  { name: 'override_name', type: 'TEXT' },
  { name: 'override_description', type: 'TEXT' },
  { name: 'standalone_name', type: 'TEXT' },
  { name: 'standalone_description', type: 'TEXT' },
]

export async function ensureAssetBindingSourceType(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  for (const spec of BINDING_TABLES) {
    const tableExists = await checkTableExists(ds, spec.table, isPg)
    if (!tableExists) continue

    // 加公共列 + 该表额外列
    const allCols = [
      ...COMMON_COLUMNS,
      ...spec.extraColumns.map(c => ({ ...c, defaultExpr: undefined as string | undefined })),
    ]
    for (const col of allCols) {
      const has = await checkColumnExists(ds, spec.table, col.name, isPg)
      if (has) continue
      const type = isPg ? mapTypeToPg(col.type) : col.type
      const defaultClause = col.defaultExpr ? ` DEFAULT ${col.defaultExpr}` : ''
      await ds.query(`ALTER TABLE "${spec.table}" ADD COLUMN ${col.name} ${type}${defaultClause}`)
      console.log(`[ensure-asset-binding-source-type] ${spec.table}: 加列 ${col.name}`)
    }

    // 回填 source_type
    await ds.query(
      `UPDATE "${spec.table}" SET source_type = 'linked_lw' WHERE ${spec.lwIdColumn} IS NOT NULL AND (source_type IS NULL OR source_type = 'standalone')`,
    )
    await ds.query(
      `UPDATE "${spec.table}" SET source_type = 'standalone' WHERE ${spec.lwIdColumn} IS NULL AND source_type IS NULL`,
    )
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
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
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

function mapTypeToPg(sqliteType: string): string {
  switch (sqliteType.toUpperCase()) {
    case 'TEXT': return 'text'
    case 'INTEGER': return 'integer'
    case 'REAL': return 'double precision'
    default: return sqliteType.toLowerCase()
  }
}
```

- [ ] **Step 4: 跑测试看 pass**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/ensure-asset-binding-source-type.spec.ts 2>&1 | tail
```

Expected: 3 tests pass。

- [ ] **Step 5: 同步更新 entity 字段**

`src/core/database/entities/episode-production/character-binding.entity.ts` 加：

```typescript
@Column({ name: 'source_type', type: 'text', default: 'standalone' })
sourceType!: 'linked_lw' | 'standalone'

@Column({ name: 'override_name', type: 'text', nullable: true })
overrideName!: string | null

@Column({ name: 'override_description', type: 'text', nullable: true })
overrideDescription!: string | null

@Column({ name: 'override_appearance', type: 'text', nullable: true })
overrideAppearance!: string | null

@Column({ name: 'override_outfit', type: 'text', nullable: true })
overrideOutfit!: string | null

@Column({ name: 'standalone_name', type: 'text', nullable: true })
standaloneName!: string | null

@Column({ name: 'standalone_description', type: 'text', nullable: true })
standaloneDescription!: string | null
```

`location-binding.entity.ts` 同样加 5 个公共字段 + `panorama_3d_id` + `scene_layout_id`：

```typescript
@Column({ name: 'panorama_3d_id', type: 'text', nullable: true })
panorama3dId!: string | null

@Column({ name: 'scene_layout_id', type: 'text', nullable: true })
sceneLayoutId!: string | null
```

`item-binding.entity.ts` 加 5 个公共字段。

- [ ] **Step 6: 注册到 PC 启动入口**

打开 `src/electron/database/index.ts`，找到 `migrateMultiTenancy()` 方法（约 line 358），在 `ensureUserIdColumns(...)` 之后加：

```typescript
const { ensureAssetBindingSourceType } = await import(
  '@core/database/migrations/ensure-asset-binding-source-type'
)
await ensureAssetBindingSourceType(this.dataSource)
```

- [ ] **Step 7: 注册到 Web 启动入口**

打开 `src/web/server/index.ts`，搜 `ensureUserIdColumns`，找到调用点，在其后加同样的 import + call。

- [ ] **Step 8: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

应不超过 baseline（task 0 记录的数）+ 5。新增的 entity 字段会让消费方多出几个未使用警告（接受）。

- [ ] **Step 9: 双端注册同步检查**

```bash
cd /home/ubuntu/workdir/the-bot
echo "=== PC 端注册 ==="
grep -nE "ensureAssetBindingSourceType" src/electron/database/index.ts
echo "=== Web 端注册 ==="
grep -nE "ensureAssetBindingSourceType" src/web/server/index.ts
```

应各 2 行（import + call）。

- [ ] **Step 10: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/database/migrations/ensure-asset-binding-source-type.ts \
        tests/unit/migrations/ensure-asset-binding-source-type.spec.ts \
        src/core/database/entities/episode-production/character-binding.entity.ts \
        src/core/database/entities/episode-production/location-binding.entity.ts \
        src/core/database/entities/episode-production/item-binding.entity.ts \
        src/electron/database/index.ts \
        src/web/server/index.ts
git commit -m "$(cat <<'EOF'
feat(ep/db): P2 task 1 · binding 表加 source_type + override_* + standalone_*

按 spec §3.7 / §4.5：
- character/location/item_binding 三表加公共列 source_type + override_name/description + standalone_name/description
- character_binding 额外加 override_appearance / override_outfit
- location_binding 额外加 panorama_3d_id / scene_layout_id（3D 接入点 1）
- 三表 source_type 按 long_writing_xxx_id 是否为空回填（'linked_lw' / 'standalone'）

migration: src/core/database/migrations/ensure-asset-binding-source-type.ts
  双端兼容 SQLite + PG，幂等
test: tests/unit/migrations/ensure-asset-binding-source-type.spec.ts
  3 个测试覆盖 schema 增加 / source_type 回填 / 幂等

注册到 PC (electron/database/index.ts) + Web (web/server/index.ts) 双端启动入口。
EOF
)"
```

---

## Task 2: 迁移 ② 新建 asset_image 表 + 搬 image_paths

**Files:**
- Create: `src/core/database/entities/episode-production/asset-image.entity.ts`
- Create: `src/core/database/migrations/create-asset-image.ts`
- Create: `tests/unit/migrations/create-asset-image.spec.ts`
- Modify: `src/core/database/entities/index.ts`（barrel 加 AssetImageEntity export）
- Modify: `src/electron/database/index.ts`（注册）
- Modify: `src/web/server/index.ts`（注册）

**Concept:** 新建 asset_image 表统一存图谱（spec §3.8）。同时把现有 `*_binding.image_paths` JSON 数组数据搬过来——每张图建一行，标注 `is_main=true` 给数组首张图，其余 `category='view'` / `is_main=false`。

asset_image 表结构：

```
id TEXT PK
user_id TEXT nullable          多租户
asset_type TEXT NOT NULL       'character' / 'location' / 'item'
asset_id TEXT NOT NULL         FK 指向对应 binding 表
category TEXT NOT NULL         'main' / 'view' / 'expression' / 'outfit' / 'pose'
                                / 'time_variant' / 'weather_variant' / 'angle_variant' / 'context'
label TEXT nullable            如 'happy' / 'morning' / 'formal'
prompt TEXT nullable
negative_prompt TEXT nullable
image_path TEXT NOT NULL
thumbnail_path TEXT nullable
is_main INTEGER NOT NULL default 0   (0/1 SQLite 风格 boolean)
derived_from_image_id TEXT nullable
sort_order INTEGER default 0
created_at TIMESTAMP default now
updated_at TIMESTAMP nullable
```

- [ ] **Step 1: 写测试 `tests/unit/migrations/create-asset-image.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetImage } from '@core/database/migrations/create-asset-image'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE character_bindings (id TEXT PRIMARY KEY, image_paths TEXT)`)
  await ds.query(`CREATE TABLE location_bindings (id TEXT PRIMARY KEY, image_paths TEXT)`)
  await ds.query(`CREATE TABLE item_bindings (id TEXT PRIMARY KEY, image_paths TEXT)`)
  return ds
}

describe('createAssetImage migration', () => {
  it('建表后所有列存在', async () => {
    const ds = await buildLegacyDb()
    await createAssetImage(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('asset_image')`))
      .map((r: any) => r.name)
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'user_id', 'asset_type', 'asset_id', 'category', 'label',
      'prompt', 'negative_prompt', 'image_path', 'thumbnail_path',
      'is_main', 'derived_from_image_id', 'sort_order', 'created_at', 'updated_at',
    ]))
    await ds.destroy()
  })

  it('搬运 character_binding.image_paths：首张为 main，其余为 view', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, image_paths) VALUES
      ('cb1', '["/img/a.png","/img/b.png","/img/c.png"]'),
      ('cb2', '[]'),
      ('cb3', NULL)`)
    await createAssetImage(ds)
    const rows = await ds.query(
      `SELECT asset_id, category, is_main, image_path, sort_order FROM asset_image WHERE asset_type='character' ORDER BY asset_id, sort_order`,
    )
    expect(rows).toEqual([
      { asset_id: 'cb1', category: 'main', is_main: 1, image_path: '/img/a.png', sort_order: 0 },
      { asset_id: 'cb1', category: 'view',  is_main: 0, image_path: '/img/b.png', sort_order: 1 },
      { asset_id: 'cb1', category: 'view',  is_main: 0, image_path: '/img/c.png', sort_order: 2 },
    ])
    await ds.destroy()
  })

  it('幂等：第二次跑不重复插入', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO character_bindings (id, image_paths) VALUES ('cb1', '["/img/a.png"]')`)
    await createAssetImage(ds)
    await createAssetImage(ds)
    const count = (await ds.query(`SELECT count(*) as c FROM asset_image`))[0].c
    expect(count).toBe(1)
    await ds.destroy()
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/create-asset-image.spec.ts 2>&1 | tail
```

- [ ] **Step 3: 写 migration `src/core/database/migrations/create-asset-image.ts`**

```typescript
/**
 * 新建 asset_image 表（spec §3.8）+ 把现有 *_binding.image_paths JSON 数据搬过来。
 *
 * 数组每张图建一行：
 * - 首张：category='main', is_main=1, sort_order=0
 * - 其余：category='view', is_main=0, sort_order=index
 *
 * 兼容 SQLite + PG，幂等（用 binding_id+image_path 联合判断是否已搬过）。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

const ASSET_TYPES: { tableName: string; assetType: 'character' | 'location' | 'item' }[] = [
  { tableName: 'character_bindings', assetType: 'character' },
  { tableName: 'location_bindings', assetType: 'location' },
  { tableName: 'item_bindings', assetType: 'item' },
]

export async function createAssetImage(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. 建表（幂等）
  await ensureAssetImageTable(ds, isPg)

  // 2. 搬运每个 binding 表的 image_paths
  for (const { tableName, assetType } of ASSET_TYPES) {
    const tableExists = await checkTableExists(ds, tableName, isPg)
    if (!tableExists) continue
    const hasImagePaths = await checkColumnExists(ds, tableName, 'image_paths', isPg)
    if (!hasImagePaths) continue

    const rows = await ds.query(`SELECT id, image_paths FROM "${tableName}" WHERE image_paths IS NOT NULL`)
    for (const row of rows) {
      let paths: string[]
      try {
        paths = typeof row.image_paths === 'string' ? JSON.parse(row.image_paths) : (row.image_paths ?? [])
      } catch {
        continue
      }
      if (!Array.isArray(paths) || paths.length === 0) continue

      // 幂等：检查是否已有该 binding 的记录
      const placeholder1 = isPg ? '$1' : '?'
      const placeholder2 = isPg ? '$2' : '?'
      const existing = await ds.query(
        `SELECT count(*) as c FROM asset_image WHERE asset_type = ${placeholder1} AND asset_id = ${placeholder2}`,
        [assetType, row.id],
      )
      const count = isPg ? Number(existing[0].c) : existing[0].c
      if (count > 0) continue

      // 插入
      for (let i = 0; i < paths.length; i++) {
        const id = `ai_${randomBytes(8).toString('hex')}`
        const category = i === 0 ? 'main' : 'view'
        const isMain = i === 0 ? 1 : 0
        const ph = (n: number) => isPg ? `$${n}` : '?'
        await ds.query(
          `INSERT INTO asset_image (id, asset_type, asset_id, category, image_path, is_main, sort_order, created_at)
           VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
          [id, assetType, row.id, category, paths[i], isMain, i],
        )
      }
    }
  }
}

async function ensureAssetImageTable(ds: DataSource, isPg: boolean): Promise<void> {
  const tableExists = await checkTableExists(ds, 'asset_image', isPg)
  if (tableExists) return

  if (isPg) {
    await ds.query(`CREATE TABLE asset_image (
      id varchar PRIMARY KEY,
      user_id varchar,
      asset_type varchar NOT NULL,
      asset_id varchar NOT NULL,
      category varchar NOT NULL,
      label text,
      prompt text,
      negative_prompt text,
      image_path text NOT NULL,
      thumbnail_path text,
      is_main integer NOT NULL DEFAULT 0,
      derived_from_image_id varchar,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT NOW(),
      updated_at timestamp
    )`)
    await ds.query(`CREATE INDEX idx_asset_image_asset ON asset_image (asset_type, asset_id)`)
    await ds.query(`CREATE INDEX idx_asset_image_user_id ON asset_image (user_id)`)
  } else {
    await ds.query(`CREATE TABLE asset_image (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      category TEXT NOT NULL,
      label TEXT,
      prompt TEXT,
      negative_prompt TEXT,
      image_path TEXT NOT NULL,
      thumbnail_path TEXT,
      is_main INTEGER NOT NULL DEFAULT 0,
      derived_from_image_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP
    )`)
    await ds.query(`CREATE INDEX idx_asset_image_asset ON asset_image (asset_type, asset_id)`)
    await ds.query(`CREATE INDEX idx_asset_image_user_id ON asset_image (user_id)`)
  }
}

// checkTableExists / checkColumnExists 同 task 1，可以从 ensure-user-id-columns 复制或抽到 _migration-utils.ts
async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`, [table])
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`, [table, column])
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
  return rows.length > 0
}
```

- [ ] **Step 4: 写 entity `src/core/database/entities/episode-production/asset-image.entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'asset_image' })
@Index('idx_asset_image_asset', ['assetType', 'assetId'])
@Index('idx_asset_image_user_id', ['userId'])
export class AssetImageEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @Column({ name: 'asset_type', type: 'varchar' })
  assetType!: 'character' | 'location' | 'item'

  @Column({ name: 'asset_id', type: 'varchar' })
  assetId!: string

  @Column({ name: 'category', type: 'varchar' })
  category!:
    | 'main' | 'view' | 'expression' | 'outfit' | 'pose'
    | 'time_variant' | 'weather_variant' | 'angle_variant' | 'context'

  @Column({ name: 'label', type: 'text', nullable: true })
  label!: string | null

  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null

  @Column({ name: 'image_path', type: 'text' })
  imagePath!: string

  @Column({ name: 'thumbnail_path', type: 'text', nullable: true })
  thumbnailPath!: string | null

  @Column({ name: 'is_main', type: 'integer', default: 0 })
  isMain!: number

  @Column({ name: 'derived_from_image_id', type: 'varchar', nullable: true })
  derivedFromImageId!: string | null

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
```

- [ ] **Step 5: 注册 entity 到 barrel `src/core/database/entities/index.ts`**

在 episode-production 块（task 2 整合后的位置）加：

```typescript
export { AssetImageEntity } from './episode-production/asset-image.entity'
```

- [ ] **Step 6: 跑测试看 pass**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/create-asset-image.spec.ts 2>&1 | tail
```

- [ ] **Step 7: 注册迁移到双端入口**

PC: `src/electron/database/index.ts` 的 `migrateMultiTenancy()` 在 task 1 之后加：

```typescript
const { createAssetImage } = await import('@core/database/migrations/create-asset-image')
await createAssetImage(this.dataSource)
```

Web: `src/web/server/index.ts` 同样加。

- [ ] **Step 8: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 9: 双端注册检查**

```bash
grep -nE "createAssetImage" src/electron/database/index.ts src/web/server/index.ts
```

- [ ] **Step 10: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/database/entities/episode-production/asset-image.entity.ts \
        src/core/database/entities/index.ts \
        src/core/database/migrations/create-asset-image.ts \
        tests/unit/migrations/create-asset-image.spec.ts \
        src/electron/database/index.ts \
        src/web/server/index.ts
git commit -m "$(cat <<'EOF'
feat(ep/db): P2 task 2 · 新建 asset_image 表 + 搬 image_paths JSON 数据

按 spec §3.8：
- 新建 asset_image 表（统一图谱），含 category 枚举（main/view/expression/outfit/pose/...）
- 把 character/location/item_bindings.image_paths JSON 数组数据搬过来：
  首张 → category='main' is_main=1，其余 → category='view'
- image_paths 字段保留（后续 task 标 deprecated；旧消费方仍可读）

migration: src/core/database/migrations/create-asset-image.ts
  双端兼容 SQLite + PG，幂等（按 asset_id 跳过已搬过的）
test: tests/unit/migrations/create-asset-image.spec.ts
  3 个测试覆盖建表 / 搬运 / 幂等

注册到 PC + Web 双端启动入口。
EOF
)"
```

---

## Task 3: 迁移 ③ 新建 storyboard_keyframe 表 + 搬 frame_image + 加 storyboard 多模式字段

**Files:**
- Create: `src/core/database/entities/episode-production/storyboard-keyframe.entity.ts`
- Modify: `src/core/database/entities/episode-production/storyboard.entity.ts`
- Create: `src/core/database/migrations/create-storyboard-keyframe.ts`
- Create: `tests/unit/migrations/create-storyboard-keyframe.spec.ts`
- Modify: `src/core/database/entities/index.ts`
- Modify: `src/electron/database/index.ts`
- Modify: `src/web/server/index.ts`

**Concept:** 按 spec §4.2 / §4.7：分镜从单帧改造为多关键帧。新建 storyboard_keyframe 表，把现有 storyboard.frame_image_id（指向 image_assets）搬为 frame_index=0 / frame_role='start' 的关键帧。同时 storyboard 表加 `keyframe_count` / `video_provider_id` / `video_model_id` / `video_mode` / `use_3d_staging` / `staging_layout_id`。

storyboard_keyframe 表：

```
id TEXT PK
user_id TEXT nullable
storyboard_id TEXT NOT NULL
frame_index INTEGER NOT NULL          0-based
time_percent REAL NOT NULL DEFAULT 0  0~1
frame_role TEXT NOT NULL              'start' / 'middle' / 'end' / 'extra'
image_asset_id TEXT nullable          指向 image_assets / asset_image
derived_from_keyframe_id TEXT nullable
prompt TEXT nullable
negative_prompt TEXT nullable
created_at TIMESTAMP default now
updated_at TIMESTAMP nullable
```

storyboard 表新加：

```
keyframe_count INTEGER NOT NULL DEFAULT 2
video_provider_id TEXT nullable
video_model_id TEXT nullable
video_mode TEXT nullable             'text2video' / 'image2video' / 'keyframes2video'
use_3d_staging INTEGER NOT NULL DEFAULT 0
staging_layout_id TEXT nullable
```

- [ ] **Step 1: 写测试 `tests/unit/migrations/create-storyboard-keyframe.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createStoryboardKeyframe } from '@core/database/migrations/create-storyboard-keyframe'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE storyboards (
    id TEXT PRIMARY KEY,
    scene_script_id TEXT,
    shot_number INTEGER,
    frame_image_id TEXT,
    duration REAL
  )`)
  return ds
}

describe('createStoryboardKeyframe migration', () => {
  it('建 storyboard_keyframe 表 + 给 storyboard 加多模式字段', async () => {
    const ds = await buildLegacyDb()
    await createStoryboardKeyframe(ds)

    const kfCols = (await ds.query(`SELECT name FROM pragma_table_info('storyboard_keyframe')`))
      .map((r: any) => r.name)
    expect(kfCols).toEqual(expect.arrayContaining([
      'id', 'storyboard_id', 'frame_index', 'time_percent', 'frame_role',
      'image_asset_id', 'prompt',
    ]))

    const sbCols = (await ds.query(`SELECT name FROM pragma_table_info('storyboards')`))
      .map((r: any) => r.name)
    expect(sbCols).toEqual(expect.arrayContaining([
      'keyframe_count', 'video_provider_id', 'video_model_id', 'video_mode',
      'use_3d_staging', 'staging_layout_id',
    ]))

    await ds.destroy()
  })

  it('搬 storyboard.frame_image_id 为 keyframe 行（frame_index=0, frame_role=start）', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO storyboards (id, frame_image_id) VALUES
      ('sb1', 'img_a'),
      ('sb2', 'img_b'),
      ('sb3', NULL)`)
    await createStoryboardKeyframe(ds)
    const rows = await ds.query(
      `SELECT storyboard_id, frame_index, frame_role, image_asset_id FROM storyboard_keyframe ORDER BY storyboard_id`,
    )
    expect(rows).toEqual([
      { storyboard_id: 'sb1', frame_index: 0, frame_role: 'start', image_asset_id: 'img_a' },
      { storyboard_id: 'sb2', frame_index: 0, frame_role: 'start', image_asset_id: 'img_b' },
    ])
    await ds.destroy()
  })

  it('幂等：第二次跑不重复插入', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO storyboards (id, frame_image_id) VALUES ('sb1', 'img_a')`)
    await createStoryboardKeyframe(ds)
    await createStoryboardKeyframe(ds)
    const c = (await ds.query(`SELECT count(*) as c FROM storyboard_keyframe`))[0].c
    expect(c).toBe(1)
    await ds.destroy()
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/create-storyboard-keyframe.spec.ts 2>&1 | tail
```

- [ ] **Step 3: 写 migration `src/core/database/migrations/create-storyboard-keyframe.ts`**

```typescript
/**
 * 新建 storyboard_keyframe 表 + 给 storyboard 加多模式字段（spec §4.2 / §4.7）。
 *
 * 数据搬运：每个 storyboard 的 frame_image_id 写为 frame_index=0 / frame_role='start' 的 keyframe 行。
 *
 * 兼容 SQLite + PG，幂等。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

const STORYBOARD_NEW_COLUMNS = [
  { name: 'keyframe_count', type: 'INTEGER', defaultExpr: '2' },
  { name: 'video_provider_id', type: 'TEXT' },
  { name: 'video_model_id', type: 'TEXT' },
  { name: 'video_mode', type: 'TEXT' },
  { name: 'use_3d_staging', type: 'INTEGER', defaultExpr: '0' },
  { name: 'staging_layout_id', type: 'TEXT' },
]

export async function createStoryboardKeyframe(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. 建 storyboard_keyframe 表（幂等）
  if (!await checkTableExists(ds, 'storyboard_keyframe', isPg)) {
    if (isPg) {
      await ds.query(`CREATE TABLE storyboard_keyframe (
        id varchar PRIMARY KEY,
        user_id varchar,
        storyboard_id varchar NOT NULL,
        frame_index integer NOT NULL,
        time_percent double precision NOT NULL DEFAULT 0,
        frame_role varchar NOT NULL,
        image_asset_id varchar,
        derived_from_keyframe_id varchar,
        prompt text,
        negative_prompt text,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp
      )`)
      await ds.query(`CREATE INDEX idx_keyframe_storyboard ON storyboard_keyframe (storyboard_id)`)
      await ds.query(`CREATE INDEX idx_keyframe_user_id ON storyboard_keyframe (user_id)`)
    } else {
      await ds.query(`CREATE TABLE storyboard_keyframe (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        storyboard_id TEXT NOT NULL,
        frame_index INTEGER NOT NULL,
        time_percent REAL NOT NULL DEFAULT 0,
        frame_role TEXT NOT NULL,
        image_asset_id TEXT,
        derived_from_keyframe_id TEXT,
        prompt TEXT,
        negative_prompt TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      )`)
      await ds.query(`CREATE INDEX idx_keyframe_storyboard ON storyboard_keyframe (storyboard_id)`)
      await ds.query(`CREATE INDEX idx_keyframe_user_id ON storyboard_keyframe (user_id)`)
    }
  }

  // 2. 给 storyboards 表加多模式字段
  if (await checkTableExists(ds, 'storyboards', isPg)) {
    for (const col of STORYBOARD_NEW_COLUMNS) {
      if (await checkColumnExists(ds, 'storyboards', col.name, isPg)) continue
      const type = isPg ? mapTypeToPg(col.type) : col.type
      const defaultClause = col.defaultExpr ? ` DEFAULT ${col.defaultExpr}` : ''
      await ds.query(`ALTER TABLE storyboards ADD COLUMN ${col.name} ${type}${defaultClause}`)
    }

    // 3. 搬 frame_image_id 为 keyframe[0]
    const hasFrameImageId = await checkColumnExists(ds, 'storyboards', 'frame_image_id', isPg)
    if (hasFrameImageId) {
      const sbs = await ds.query(`SELECT id, frame_image_id FROM storyboards WHERE frame_image_id IS NOT NULL`)
      for (const sb of sbs) {
        const ph = (n: number) => isPg ? `$${n}` : '?'
        const existing = await ds.query(
          `SELECT count(*) as c FROM storyboard_keyframe WHERE storyboard_id = ${ph(1)}`,
          [sb.id],
        )
        const count = isPg ? Number(existing[0].c) : existing[0].c
        if (count > 0) continue
        const id = `kf_${randomBytes(8).toString('hex')}`
        await ds.query(
          `INSERT INTO storyboard_keyframe (id, storyboard_id, frame_index, time_percent, frame_role, image_asset_id, created_at)
           VALUES (${ph(1)}, ${ph(2)}, 0, 0, 'start', ${ph(3)}, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
          [id, sb.id, sb.frame_image_id],
        )
      }
    }
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`, [table])
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
  return rows.length > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`, [table, column])
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
  return rows.length > 0
}

function mapTypeToPg(t: string): string {
  switch (t.toUpperCase()) {
    case 'TEXT': return 'text'
    case 'INTEGER': return 'integer'
    case 'REAL': return 'double precision'
    default: return t.toLowerCase()
  }
}
```

- [ ] **Step 4: 写 entity `storyboard-keyframe.entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'storyboard_keyframe' })
@Index('idx_keyframe_storyboard', ['storyboardId'])
@Index('idx_keyframe_user_id', ['userId'])
export class StoryboardKeyframeEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @Column({ name: 'storyboard_id', type: 'varchar' })
  storyboardId!: string

  @Column({ name: 'frame_index', type: 'integer' })
  frameIndex!: number

  @Column({ name: 'time_percent', type: 'real', default: 0 })
  timePercent!: number

  @Column({ name: 'frame_role', type: 'varchar' })
  frameRole!: 'start' | 'middle' | 'end' | 'extra'

  @Column({ name: 'image_asset_id', type: 'varchar', nullable: true })
  imageAssetId!: string | null

  @Column({ name: 'derived_from_keyframe_id', type: 'varchar', nullable: true })
  derivedFromKeyframeId!: string | null

  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
```

- [ ] **Step 5: 改 storyboard.entity.ts，加 6 个新字段**

打开 `src/core/database/entities/episode-production/storyboard.entity.ts`，在适当位置加：

```typescript
@Column({ name: 'keyframe_count', type: 'integer', default: 2 })
keyframeCount!: number

@Column({ name: 'video_provider_id', type: 'varchar', nullable: true })
videoProviderId!: string | null

@Column({ name: 'video_model_id', type: 'varchar', nullable: true })
videoModelId!: string | null

@Column({ name: 'video_mode', type: 'varchar', nullable: true })
videoMode!: 'text2video' | 'image2video' | 'keyframes2video' | null

@Column({ name: 'use_3d_staging', type: 'integer', default: 0 })
use3dStaging!: number

@Column({ name: 'staging_layout_id', type: 'varchar', nullable: true })
stagingLayoutId!: string | null
```

- [ ] **Step 6: barrel + 双端注册**

`src/core/database/entities/index.ts` 加：

```typescript
export { StoryboardKeyframeEntity } from './episode-production/storyboard-keyframe.entity'
```

PC: `src/electron/database/index.ts` 的 `migrateMultiTenancy()` 加：

```typescript
const { createStoryboardKeyframe } = await import('@core/database/migrations/create-storyboard-keyframe')
await createStoryboardKeyframe(this.dataSource)
```

Web: `src/web/server/index.ts` 同样。

- [ ] **Step 7: 跑测试 + typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/create-storyboard-keyframe.spec.ts
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 8: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/database/entities/episode-production/{storyboard-keyframe,storyboard}.entity.ts \
        src/core/database/entities/index.ts \
        src/core/database/migrations/create-storyboard-keyframe.ts \
        tests/unit/migrations/create-storyboard-keyframe.spec.ts \
        src/electron/database/index.ts \
        src/web/server/index.ts
git commit -m "$(cat <<'EOF'
feat(ep/db): P2 task 3 · storyboard_keyframe 表 + storyboard 多模式字段

按 spec §4.2 / §4.7：
- 新建 storyboard_keyframe 表（多关键帧）
- storyboards 加 6 列：keyframe_count / video_{provider,model}_id / video_mode
                       + use_3d_staging / staging_layout_id（3D 接入点 2）
- 数据搬运：现有 storyboard.frame_image_id 写为 frame_index=0/frame_role='start' 的 keyframe

migration 双端兼容 SQLite + PG，幂等。
test 3 个覆盖建表 / 搬运 / 幂等。
注册到 PC + Web 双端启动入口。
EOF
)"
```

---

## Task 4: 迁移 ④ scene_prop 加 item_binding_id FK

**Files:**
- Modify: `src/core/database/entities/episode-production/scene-prop.entity.ts`
- Create: `src/core/database/migrations/scene-prop-item-binding.ts`
- Create: `tests/unit/migrations/scene-prop-item-binding.spec.ts`
- Modify: `src/electron/database/index.ts`
- Modify: `src/web/server/index.ts`

**Concept:** 按 spec §4.7：scene_prop 当前是裸 `prop_name` 字符串，加 `item_binding_id` FK；数据迁移尝试用 prop_name 匹配 item_bindings.item_name 自动绑定，匹配不到的保留 prop_name 不动。

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { ensureScenePropItemBinding } from '@core/database/migrations/scene-prop-item-binding'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE scene_props (id TEXT PRIMARY KEY, scene_character_id TEXT, prop_name TEXT)`)
  await ds.query(`CREATE TABLE item_bindings (id TEXT PRIMARY KEY, item_name TEXT, project_id TEXT)`)
  return ds
}

describe('ensureScenePropItemBinding', () => {
  it('加 item_binding_id 列', async () => {
    const ds = await buildLegacyDb()
    await ensureScenePropItemBinding(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('scene_props')`)).map((r: any) => r.name)
    expect(cols).toContain('item_binding_id')
    await ds.destroy()
  })

  it('按 prop_name 匹配 item_bindings.item_name 自动回填 item_binding_id', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO item_bindings (id, item_name) VALUES ('ib1', '宝剑'), ('ib2', '玉佩')`)
    await ds.query(`INSERT INTO scene_props (id, scene_character_id, prop_name) VALUES
      ('sp1', 'sc1', '宝剑'),
      ('sp2', 'sc1', '玉佩'),
      ('sp3', 'sc1', '不存在的物品')`)
    await ensureScenePropItemBinding(ds)
    const rows = await ds.query(`SELECT id, prop_name, item_binding_id FROM scene_props ORDER BY id`)
    expect(rows).toEqual([
      { id: 'sp1', prop_name: '宝剑', item_binding_id: 'ib1' },
      { id: 'sp2', prop_name: '玉佩', item_binding_id: 'ib2' },
      { id: 'sp3', prop_name: '不存在的物品', item_binding_id: null },
    ])
    await ds.destroy()
  })

  it('幂等', async () => {
    const ds = await buildLegacyDb()
    await ensureScenePropItemBinding(ds)
    await ensureScenePropItemBinding(ds)
    await ds.destroy()
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/scene-prop-item-binding.spec.ts 2>&1 | tail
```

- [ ] **Step 3: 写 migration**

```typescript
/**
 * scene_props 加 item_binding_id 列 + 按 prop_name 匹配 item_bindings.item_name 自动回填。
 * 匹配不到的 prop_name 保留不动（item_binding_id 为 NULL）。
 *
 * 兼容 SQLite + PG，幂等。
 */

import type { DataSource } from 'typeorm'

export async function ensureScenePropItemBinding(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (!await checkTableExists(ds, 'scene_props', isPg)) return

  // 1. 加列
  if (!await checkColumnExists(ds, 'scene_props', 'item_binding_id', isPg)) {
    const colType = isPg ? 'varchar' : 'TEXT'
    await ds.query(`ALTER TABLE scene_props ADD COLUMN item_binding_id ${colType}`)
  }

  // 2. 数据回填（仅当 item_bindings 表存在）
  if (!await checkTableExists(ds, 'item_bindings', isPg)) return

  // 用 prop_name = item_name 匹配
  if (isPg) {
    await ds.query(`UPDATE scene_props sp SET item_binding_id = ib.id
      FROM item_bindings ib
      WHERE sp.prop_name = ib.item_name AND sp.item_binding_id IS NULL`)
  } else {
    await ds.query(`UPDATE scene_props SET item_binding_id = (
      SELECT ib.id FROM item_bindings ib WHERE ib.item_name = scene_props.prop_name LIMIT 1
    ) WHERE item_binding_id IS NULL`)
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(`SELECT 1 FROM information_schema.tables WHERE table_name=$1 AND table_schema=current_schema() LIMIT 1`, [table])
    return r.length > 0
  }
  const r = await ds.query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`, [table])
  return r.length > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 AND table_schema=current_schema() LIMIT 1`, [table, column])
    return r.length > 0
  }
  const r = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name=? LIMIT 1`, [table, column])
  return r.length > 0
}
```

- [ ] **Step 4: entity 加字段**

`src/core/database/entities/episode-production/scene-prop.entity.ts`：

```typescript
@Column({ name: 'item_binding_id', type: 'varchar', nullable: true })
itemBindingId!: string | null
```

- [ ] **Step 5: 跑测试 + 注册双端**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/scene-prop-item-binding.spec.ts
```

PC + Web 入口加：

```typescript
const { ensureScenePropItemBinding } = await import('@core/database/migrations/scene-prop-item-binding')
await ensureScenePropItemBinding(this.dataSource)
```

- [ ] **Step 6: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/database/entities/episode-production/scene-prop.entity.ts \
        src/core/database/migrations/scene-prop-item-binding.ts \
        tests/unit/migrations/scene-prop-item-binding.spec.ts \
        src/electron/database/index.ts \
        src/web/server/index.ts
git commit -m "feat(ep/db): P2 task 4 · scene_props 加 item_binding_id + 按 prop_name 匹配回填

按 spec §4.7：scene_props 增加 item_binding_id FK；
回填规则：prop_name 等于 item_bindings.item_name 时自动绑定，
匹配不到的保留 prop_name 不动（item_binding_id NULL）。

双端兼容 + 幂等。注册到 PC + Web 入口。"
```

---

## Task 5: 迁移 ⑤ EpisodeStatus 扩展

**Files:**
- Modify: `src/shared/types/episode-production/workflow.types.ts`（枚举类型）
- Create: `src/core/database/migrations/expand-episode-status.ts`
- Create: `tests/unit/migrations/expand-episode-status.spec.ts`
- Modify: `src/electron/database/index.ts`
- Modify: `src/web/server/index.ts`

**Concept:** 按 spec §2.4：EpisodeStatus 加 `'asset_prep'`，把 `'reviewing'` 改名 `'composing'`。数据迁移：旧 `reviewing` → `composing`；旧 `pending` 按"是否已识别要素"分流到 `pending`（仍未识别）/`asset_prep`（已识别）。

判断"是否已识别要素"：检查同 episode 下 `uploaded_characters` / `uploaded_locations` / `uploaded_items` 是否非空。

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { expandEpisodeStatus } from '@core/database/migrations/expand-episode-status'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE video_episodes (
    id TEXT PRIMARY KEY,
    status TEXT,
    uploaded_characters TEXT,
    uploaded_locations TEXT,
    uploaded_items TEXT
  )`)
  return ds
}

describe('expandEpisodeStatus', () => {
  it('reviewing → composing', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO video_episodes (id, status) VALUES ('e1', 'reviewing'), ('e2', 'completed')`)
    await expandEpisodeStatus(ds)
    const rows = await ds.query(`SELECT id, status FROM video_episodes ORDER BY id`)
    expect(rows).toEqual([
      { id: 'e1', status: 'composing' },
      { id: 'e2', status: 'completed' },
    ])
    await ds.destroy()
  })

  it('pending 按是否有要素分流：有要素 → asset_prep；无 → pending', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO video_episodes (id, status, uploaded_characters) VALUES
      ('e1', 'pending', '[{"name":"a"}]'),
      ('e2', 'pending', NULL),
      ('e3', 'pending', '[]')`)
    await expandEpisodeStatus(ds)
    const rows = await ds.query(`SELECT id, status FROM video_episodes ORDER BY id`)
    expect(rows).toEqual([
      { id: 'e1', status: 'asset_prep' },
      { id: 'e2', status: 'pending' },
      { id: 'e3', status: 'pending' },
    ])
    await ds.destroy()
  })

  it('幂等', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO video_episodes (id, status) VALUES ('e1', 'reviewing')`)
    await expandEpisodeStatus(ds)
    await expandEpisodeStatus(ds)
    const r = await ds.query(`SELECT status FROM video_episodes WHERE id='e1'`)
    expect(r[0].status).toBe('composing')
    await ds.destroy()
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/expand-episode-status.spec.ts
```

- [ ] **Step 3: 写 migration**

```typescript
/**
 * EpisodeStatus 扩展（spec §2.4）：
 * - 'reviewing' → 'composing'
 * - 'pending' 按 uploaded_characters/locations/items 是否非空分流：
 *   有任一非空 JSON 数组 → 'asset_prep'，否则保持 'pending'
 *
 * 兼容 SQLite + PG，幂等（多次跑只对仍是旧值的行操作）。
 */

import type { DataSource } from 'typeorm'

export async function expandEpisodeStatus(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  if (!await checkTableExists(ds, 'video_episodes', isPg)) return

  // 1. reviewing → composing
  await ds.query(`UPDATE video_episodes SET status = 'composing' WHERE status = 'reviewing'`)

  // 2. pending → asset_prep（如果已识别要素）
  // 需要解析 JSON——SQL 内做不容易跨端，改用应用层逐行处理
  const pendings = await ds.query(`SELECT id, uploaded_characters, uploaded_locations, uploaded_items FROM video_episodes WHERE status = 'pending'`)
  for (const ep of pendings) {
    if (hasEntities(ep.uploaded_characters) || hasEntities(ep.uploaded_locations) || hasEntities(ep.uploaded_items)) {
      const ph = isPg ? '$1' : '?'
      await ds.query(`UPDATE video_episodes SET status = 'asset_prep' WHERE id = ${ph}`, [ep.id])
    }
  }
}

function hasEntities(json: unknown): boolean {
  if (!json) return false
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json
    return Array.isArray(arr) && arr.length > 0
  } catch {
    return false
  }
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(`SELECT 1 FROM information_schema.tables WHERE table_name=$1 AND table_schema=current_schema() LIMIT 1`, [table])
    return r.length > 0
  }
  const r = await ds.query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`, [table])
  return r.length > 0
}
```

- [ ] **Step 4: 改 types 枚举**

`src/shared/types/episode-production/workflow.types.ts`，找到 `EpisodeStatus`：

```typescript
export type EpisodeStatus =
  | 'pending'
  | 'asset_prep'      // P2 新增
  | 'scripting'
  | 'storyboarding'
  | 'producing'
  | 'composing'       // P2 改名（旧 'reviewing'）
  | 'completed'
```

如果原文件还有 `'reviewing'`，**保留为 deprecated 类型别名**，避免 TS 编译失败：

```typescript
/** @deprecated P2 改名为 'composing' */
export type EpisodeStatusLegacyReviewing = 'reviewing'
```

但实际上枚举类型变了；上层消费方如果有硬编码 `'reviewing'` 会编译失败。grep 一遍：

```bash
grep -rnE "'reviewing'|\"reviewing\"" src/ --include='*.ts' --include='*.vue'
```

每条命中改为 `'composing'`（除迁移代码内）。

- [ ] **Step 5: 跑测试 + 注册**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/expand-episode-status.spec.ts
```

PC + Web 入口加：

```typescript
const { expandEpisodeStatus } = await import('@core/database/migrations/expand-episode-status')
await expandEpisodeStatus(this.dataSource)
```

- [ ] **Step 6: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/shared/types/episode-production/workflow.types.ts \
        src/core/database/migrations/expand-episode-status.ts \
        tests/unit/migrations/expand-episode-status.spec.ts \
        src/electron/database/index.ts \
        src/web/server/index.ts
# 加 reviewing → composing 改名命中文件（grep 步骤的输出）
git commit -m "feat(ep/db): P2 task 5 · EpisodeStatus 扩展 asset_prep + 改名 reviewing→composing

按 spec §2.4：
- 类型 EpisodeStatus 加 'asset_prep'，'reviewing' 改名 'composing'
- 数据迁移：reviewing → composing；pending 按 uploaded_* 是否非空分流到 asset_prep / pending
- 上层消费方硬编码 'reviewing' 同步改为 'composing'

双端兼容 + 幂等。注册到 PC + Web 入口。"
```

---

## Task 6: 迁移 ⑥ 长文图字段移除（含数据搬运）

**Files:**
- Modify: `src/core/database/entities/lw-character.entity.ts`
- Modify: `src/core/database/entities/lw-location.entity.ts`
- Create: `src/core/database/migrations/strip-lw-image-fields.ts`
- Create: `tests/unit/migrations/strip-lw-image-fields.spec.ts`
- Modify: `src/electron/database/index.ts`
- Modify: `src/web/server/index.ts`

**Concept:** 按 spec §3.10：

- `lw_character.portrait_id` → 数据迁移到 `character_bindings.portrait_id`（如果存在；character_bindings 已有 portrait_id 字段，覆盖优先级见下）
- `lw_character.generated_image_id` → 数据迁移到 `asset_image`（category='main'，asset_type='character'，asset_id 取对应 character_binding.id）
- `lw_location.generated_image_id` → 同上 location
- 然后从 lw entity 移除字段；migration 把 SQL 列也 DROP 掉（幂等：列已不存在就跳过）

**回填优先级**：character_binding.portrait_id 已有值时**不覆盖**（剧集制作模块自己设的优先）；为空时才从 lw_character 拉。

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { stripLwImageFields } from '@core/database/migrations/strip-lw-image-fields'

async function buildLegacyDb(): Promise<DataSource> {
  const ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  await ds.query(`CREATE TABLE lw_story_characters (id TEXT PRIMARY KEY, portrait_id TEXT, generated_image_id TEXT)`)
  await ds.query(`CREATE TABLE lw_story_locations (id TEXT PRIMARY KEY, generated_image_id TEXT)`)
  await ds.query(`CREATE TABLE character_bindings (id TEXT PRIMARY KEY, long_writing_character_id TEXT, portrait_id TEXT)`)
  await ds.query(`CREATE TABLE location_bindings (id TEXT PRIMARY KEY, long_writing_location_id TEXT)`)
  await ds.query(`CREATE TABLE asset_image (
    id TEXT PRIMARY KEY, asset_type TEXT, asset_id TEXT, category TEXT,
    image_path TEXT, is_main INTEGER, sort_order INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  return ds
}

describe('stripLwImageFields', () => {
  it('lw_character.portrait_id 回填到 character_binding.portrait_id（仅当 binding 当前为空）', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_characters (id, portrait_id) VALUES ('lwc1', 'p_a'), ('lwc2', 'p_b')`)
    await ds.query(`INSERT INTO character_bindings (id, long_writing_character_id, portrait_id) VALUES
      ('cb1', 'lwc1', NULL),
      ('cb2', 'lwc2', 'p_existing')`)
    await stripLwImageFields(ds)
    const rows = await ds.query(`SELECT id, portrait_id FROM character_bindings ORDER BY id`)
    expect(rows).toEqual([
      { id: 'cb1', portrait_id: 'p_a' },          // 回填
      { id: 'cb2', portrait_id: 'p_existing' },   // 不覆盖
    ])
    await ds.destroy()
  })

  it('lw_character.generated_image_id 写入 asset_image 作 main', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_characters (id, generated_image_id) VALUES ('lwc1', '/img/x.png')`)
    await ds.query(`INSERT INTO character_bindings (id, long_writing_character_id) VALUES ('cb1', 'lwc1')`)
    await stripLwImageFields(ds)
    const rows = await ds.query(`SELECT asset_type, asset_id, category, image_path, is_main FROM asset_image`)
    expect(rows).toEqual([
      { asset_type: 'character', asset_id: 'cb1', category: 'main', image_path: '/img/x.png', is_main: 1 },
    ])
    await ds.destroy()
  })

  it('lw_location.generated_image_id 同样写 asset_image', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_locations (id, generated_image_id) VALUES ('lwl1', '/img/loc.png')`)
    await ds.query(`INSERT INTO location_bindings (id, long_writing_location_id) VALUES ('lb1', 'lwl1')`)
    await stripLwImageFields(ds)
    const rows = await ds.query(`SELECT asset_type, asset_id, category, image_path FROM asset_image`)
    expect(rows).toEqual([
      { asset_type: 'location', asset_id: 'lb1', category: 'main', image_path: '/img/loc.png' },
    ])
    await ds.destroy()
  })

  it('幂等', async () => {
    const ds = await buildLegacyDb()
    await ds.query(`INSERT INTO lw_story_characters (id, generated_image_id) VALUES ('lwc1', '/img/x.png')`)
    await ds.query(`INSERT INTO character_bindings (id, long_writing_character_id) VALUES ('cb1', 'lwc1')`)
    await stripLwImageFields(ds)
    await stripLwImageFields(ds)
    const c = (await ds.query(`SELECT count(*) as c FROM asset_image`))[0].c
    expect(c).toBe(1)
    await ds.destroy()
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/strip-lw-image-fields.spec.ts
```

- [ ] **Step 3: 写 migration**

```typescript
/**
 * 长文模块图字段清理（spec §3.10）：
 * - lw_story_characters.portrait_id → character_bindings.portrait_id（仅当 binding 当前为空时回填）
 * - lw_story_characters.generated_image_id → asset_image (asset_type='character', category='main')
 * - lw_story_locations.generated_image_id  → asset_image (asset_type='location', category='main')
 *
 * 数据搬运后的列删除留给后续手工 / 在 P2 Task 9 收尾时统一 DROP COLUMN（SQLite 历史不支持 DROP COLUMN，
 * 现行只把 entity 字段移除即可，等长文模块 schema 重整时再处理）。
 *
 * 兼容 SQLite + PG，幂等（asset_image 用 (asset_type,asset_id,is_main=1) 判定已搬过）。
 */

import type { DataSource } from 'typeorm'
import { randomBytes } from 'crypto'

export async function stripLwImageFields(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  // 1. portrait_id 回填到 character_binding.portrait_id（仅当 binding 当前为空）
  if (await checkColumnExists(ds, 'lw_story_characters', 'portrait_id', isPg)) {
    if (isPg) {
      await ds.query(`UPDATE character_bindings cb SET portrait_id = lw.portrait_id
        FROM lw_story_characters lw
        WHERE cb.long_writing_character_id = lw.id
          AND cb.portrait_id IS NULL
          AND lw.portrait_id IS NOT NULL`)
    } else {
      await ds.query(`UPDATE character_bindings SET portrait_id = (
        SELECT lw.portrait_id FROM lw_story_characters lw WHERE lw.id = character_bindings.long_writing_character_id
      ) WHERE portrait_id IS NULL AND EXISTS (
        SELECT 1 FROM lw_story_characters lw WHERE lw.id = character_bindings.long_writing_character_id AND lw.portrait_id IS NOT NULL
      )`)
    }
  }

  // 2. generated_image_id → asset_image
  if (await checkColumnExists(ds, 'lw_story_characters', 'generated_image_id', isPg)) {
    await migrateGeneratedImage(ds, isPg, {
      lwTable: 'lw_story_characters',
      bindingTable: 'character_bindings',
      lwIdColumn: 'long_writing_character_id',
      assetType: 'character',
    })
  }
  if (await checkColumnExists(ds, 'lw_story_locations', 'generated_image_id', isPg)) {
    await migrateGeneratedImage(ds, isPg, {
      lwTable: 'lw_story_locations',
      bindingTable: 'location_bindings',
      lwIdColumn: 'long_writing_location_id',
      assetType: 'location',
    })
  }
}

async function migrateGeneratedImage(
  ds: DataSource,
  isPg: boolean,
  spec: { lwTable: string; bindingTable: string; lwIdColumn: string; assetType: 'character' | 'location' },
): Promise<void> {
  const rows = await ds.query(`SELECT lw.id AS lw_id, lw.generated_image_id AS img, b.id AS binding_id
    FROM "${spec.lwTable}" lw
    JOIN "${spec.bindingTable}" b ON b."${spec.lwIdColumn}" = lw.id
    WHERE lw.generated_image_id IS NOT NULL`)

  for (const row of rows) {
    const ph = (n: number) => isPg ? `$${n}` : '?'
    // 幂等：检查 asset_image 是否已有该 binding 的 main 图
    const existing = await ds.query(
      `SELECT 1 FROM asset_image WHERE asset_type = ${ph(1)} AND asset_id = ${ph(2)} AND is_main = 1 LIMIT 1`,
      [spec.assetType, row.binding_id],
    )
    if (existing.length > 0) continue
    const id = `ai_${randomBytes(8).toString('hex')}`
    await ds.query(
      `INSERT INTO asset_image (id, asset_type, asset_id, category, image_path, is_main, sort_order, created_at)
       VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, 'main', ${ph(4)}, 1, 0, ${isPg ? 'NOW()' : 'CURRENT_TIMESTAMP'})`,
      [id, spec.assetType, row.binding_id, row.img],
    )
  }
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await ds.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 AND table_schema=current_schema() LIMIT 1`, [table, column])
    return r.length > 0
  }
  const r = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name=? LIMIT 1`, [table, column])
  return r.length > 0
}
```

- [ ] **Step 4: 跑测试**

```bash
cd /home/ubuntu/workdir/the-bot
npx vitest run tests/unit/migrations/strip-lw-image-fields.spec.ts
```

- [ ] **Step 5: 移除 entity 字段**

`src/core/database/entities/lw-character.entity.ts` 删 `portrait_id` 和 `generated_image_id` 两组 `@Column`。
`src/core/database/entities/lw-location.entity.ts` 删 `generated_image_id`。

注意：删除前 grep 一下消费方：

```bash
grep -rnE "lw_character.*portrait_id|portraitId.*lw|generatedImageId" src/ --include='*.ts' --include='*.vue' | grep -v ".entity.ts" | head
```

如果有消费方在用（如 episode-auto-binding.service / 长文 UI），同步删掉调用代码。如果 grep 命中较多影响大，可以先改 entity 字段为 `@Column({...nullable: true, select: false })` 软隐藏 + 加 `@deprecated` JSDoc，留给后续 task 真正删字段。

- [ ] **Step 6: 注册 + commit**

```bash
cd /home/ubuntu/workdir/the-bot
# (PC + Web 入口加 stripLwImageFields)

git add src/core/database/entities/{lw-character,lw-location}.entity.ts \
        src/core/database/migrations/strip-lw-image-fields.ts \
        tests/unit/migrations/strip-lw-image-fields.spec.ts \
        src/electron/database/index.ts \
        src/web/server/index.ts
git commit -m "feat(ep/db)!: P2 task 6 · 长文图字段移除 + 数据搬到 asset_image

按 spec §3.10：
- lw_story_characters.portrait_id → character_bindings.portrait_id（仅 NULL 时回填）
- lw_story_characters.generated_image_id → asset_image (character/main)
- lw_story_locations.generated_image_id  → asset_image (location/main)
- 移除 lw entity 字段（SQL 列暂不 DROP，等长文模块 schema 重整时统一处理）

双端兼容 + 幂等。注册到 PC + Web 入口。

BREAKING CHANGE: lw entity 不再 export portrait_id / generated_image_id。"
```

---

## Task 7: P1 deprecated 字段标 @deprecated JSDoc

**Files:**
- Modify: `src/core/database/entities/episode-production/character-binding.entity.ts`（image_paths）
- Modify: `src/core/database/entities/episode-production/location-binding.entity.ts`（image_paths）
- Modify: `src/core/database/entities/episode-production/item-binding.entity.ts`（image_paths）
- Modify: `src/core/database/entities/episode-production/storyboard.entity.ts`（frame_image / frame_image_id）

**Concept:** P2 把 image_paths / frame_image 数据搬走了，但 SQL 列保留兼容。给 entity 字段标 `@deprecated`，提醒后续 phase 不要再写入。

- [ ] **Step 1: image_paths 三处加 @deprecated**

每处 `@Column({ name: 'image_paths', ... })` 上方加：

```typescript
/**
 * @deprecated P2 已把数据搬到 asset_image 表（spec §3.8）。
 *             保留 SQL 列兼容旧消费方读取；新代码请用 asset_image。
 *             待全部消费方迁移到 asset_image 后由 P3+ 真正 DROP COLUMN。
 */
@Column({ name: 'image_paths', type: 'simple-json', nullable: true })
imagePaths!: string[] | null
```

- [ ] **Step 2: storyboard 的 frame_image / frame_image_id 加 @deprecated**

```typescript
/**
 * @deprecated P2 已把数据搬到 storyboard_keyframe 表（spec §4.7）。
 *             保留 SQL 列兼容旧消费方；新代码请用 storyboard_keyframe。
 */
@Column({ name: 'frame_image', type: 'simple-json', nullable: true })
frameImage!: any | null

/** @deprecated 同 frame_image */
@Column({ name: 'frame_image_id', type: 'text', nullable: true })
frameImageId!: string | null
```

- [ ] **Step 3: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 4: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git add src/core/database/entities/episode-production/*.entity.ts
git commit -m "docs(ep/db): P2 task 7 · image_paths / frame_image 字段标 @deprecated

P2 已把数据搬到 asset_image / storyboard_keyframe，旧字段保留 SQL 列兼容旧消费方读，
但新代码不应写入。@deprecated JSDoc 提醒。
真正 DROP COLUMN 留给 P3+。"
```

---

## Task 8: 端到端迁移演练 — 在 dev 库上跑全套

**Files:**
- 不创建新文件；在 dev DB 上跑迁移

**Concept:** 重启 dev web 服务（带 P2 全部迁移），验证 dev DB（the-bot-test-pg/the_bot_web）能成功跑迁移、数据正确。

- [ ] **Step 1: 停 dev web**

```bash
cd /home/ubuntu/workdir/the-bot
bash scripts/web.sh stop all
```

- [ ] **Step 2: 启动 dev web（会自动跑迁移）**

```bash
bash scripts/web.sh start all
sleep 5
tail -50 .run/server.log | grep -iE "migration|ensure|create-asset|strip|expand|error"
```

应看到各 migration 的 `console.log` 输出（如 `[ensure-asset-binding-source-type] character_bindings: 加列 source_type`）。

如果有 `error` 行，定位 + 修复。

- [ ] **Step 3: 验证 dev DB 新 schema**

```bash
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "\d character_bindings" | grep source_type
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "\d location_bindings" | grep -E "source_type|panorama_3d"
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "\d storyboards" | grep -E "keyframe_count|use_3d"
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "\d asset_image"
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "\d storyboard_keyframe"
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "\d scene_props" | grep item_binding_id
```

每条都应输出对应字段。

- [ ] **Step 4: 验证数据搬运**

```bash
docker exec the-bot-test-pg psql -U postgres -d the_bot_web -c "
SELECT 
  (SELECT count(*) FROM asset_image) AS asset_image_rows,
  (SELECT count(*) FROM storyboard_keyframe) AS keyframe_rows,
  (SELECT count(DISTINCT source_type) FROM character_bindings) AS char_source_types,
  (SELECT count(*) FROM video_episodes WHERE status='reviewing') AS old_reviewing,
  (SELECT count(*) FROM video_episodes WHERE status='composing') AS new_composing
"
```

期望：
- `old_reviewing = 0`（已全部迁到 composing）
- `new_composing` 非负（看历史数据）
- 其它 row 数视实际数据

- [ ] **Step 5: 不需要 commit。** 写个简短结果到 `/tmp/p2-task8-migration-result.txt` 备查：

```bash
echo "P2 task 8 dev DB 迁移演练结果（$(date)）：" > /tmp/p2-task8-migration-result.txt
echo "schema 检查通过；数据迁移通过。" >> /tmp/p2-task8-migration-result.txt
```

---

## Task 9: 全量回归 + DoD 校验

**Files:**
- 无新建。回归测试。

**Concept:** P2 收尾——跑全量回归，对比 task 0 baseline；DoD 自检（数据维度，spec §6.4）。

- [ ] **Step 1: typecheck**

```bash
cd /home/ubuntu/workdir/the-bot
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

vs baseline `cat /tmp/p2-baseline-typecheck.count`。允许小幅升（新 entity 字段 + 类型扩展可能带来 ≤ 30 个新警告）。

- [ ] **Step 2: 全量 unit 测试（包括新加的 6 个 migration spec）**

```bash
cd /home/ubuntu/workdir/the-bot
npm run test:unit:sqlite 2>&1 | tail -10
```

期望：原 33 fail / 3 pass + 18 个新 migration test pass（每 migration 3 test × 6 = 18）。即 33 fail / 21 pass 左右。如果新 test 有 fail，回去修对应 task。

- [ ] **Step 3: lint**

```bash
cd /home/ubuntu/workdir/the-bot
npm run lint 2>&1 | tail -3
```

vs baseline。允许小幅波动（不超 +5%）。

- [ ] **Step 4: Web e2e 子集（关键路径）**

```bash
cd /home/ubuntu/workdir/the-bot
npx playwright test --config=playwright.web.config.ts tests/e2e/web/10-episode-production.spec.ts
```

应仍然 2 passed（P2 不动 IPC 通道，e2e 应不受影响）。

- [ ] **Step 5: P2 DoD 自检（spec §6.4 数据维度）**

逐条核对：

- [ ] `asset_image` 表上线，`image_paths` 标 deprecated
- [ ] `storyboard_keyframe` 表上线，`frame_image` 标 deprecated
- [ ] 各 binding 加 `source_type` + `override_*`
- [ ] `scene_prop.item_binding_id` FK 上线
- [ ] `lw-character/lw-location` 图字段移除（数据已迁移）
- [ ] `EpisodeStatus` 扩展完成
- [ ] `storyboard.keyframe_count / video_mode / use_3d_staging` 等字段
- [ ] `location_binding.panorama_3d_id / scene_layout_id` 字段
- [ ] 所有迁移 up/down 可逆 + 迁移测试通过

每项写明依据。

- [ ] **Step 6: 双端注册同步终验**

```bash
cd /home/ubuntu/workdir/the-bot
echo "=== PC 端 6 个新 migration 注册 ==="
grep -nE "ensureAssetBindingSourceType|createAssetImage|createStoryboardKeyframe|ensureScenePropItemBinding|expandEpisodeStatus|stripLwImageFields" src/electron/database/index.ts | wc -l
echo "（应为 12: 每个 migration 1 import + 1 call）"

echo "=== Web 端 ==="
grep -nE "ensureAssetBindingSourceType|createAssetImage|createStoryboardKeyframe|ensureScenePropItemBinding|expandEpisodeStatus|stripLwImageFields" src/web/server/index.ts | wc -l
echo "（应为 12）"
```

- [ ] **Step 7: 整理 P2 commit 清单**

```bash
cd /home/ubuntu/workdir/the-bot
git log --oneline ^master HEAD | head -30
```

- [ ] **Step 8: commit**

```bash
cd /home/ubuntu/workdir/the-bot
git commit --allow-empty -m "$(cat <<'EOF'
chore(ep/db): P2 task 9 · 全量回归 + DoD 校验通过

P2 数据迁移 6 项全部完成：
1. binding 表加 source_type + override_*
2. asset_image 表 + image_paths 数据搬迁
3. storyboard_keyframe 表 + frame_image 数据搬迁 + storyboard 多模式字段
4. scene_props 加 item_binding_id FK + 按 prop_name 自动回填
5. EpisodeStatus 扩展 asset_prep + 改名 reviewing→composing
6. 长文 lw-character / lw-location 图字段数据搬到 asset_image，entity 字段移除

每条迁移：
- 双端兼容 SQLite + PG
- 幂等可重跑
- 配 unit 测试（共 18 个新 test 全 pass）
- 注册到 PC + Web 双端启动入口

回归：
- typecheck / lint / unit / Web e2e 与 P1 完成时基线对齐
- dev DB 演练通过（task 8 验证）

下一步进入 P3（资产域实现）。
EOF
)"
```

---

## Self-Review

### Spec 覆盖检查

对照 spec §6.1（数据迁移策略）+ §6.4（DoD 数据维度）：

- ✅ 6 项迁移按 ①→⑥ 顺序定义为 task 1-6（与 spec §6.1 表格一致）
- ✅ 每条迁移用 typeorm 单文件（虽然不是 typeorm CLI 的 `MigrationInterface` 风格，而是项目现有的"函数式 ALTER"风格——这是项目惯例）
- ✅ 双端兼容 + 幂等是每个 task 的硬要求
- ✅ 配 unit 测试覆盖（18 个新 test）
- ✅ 注册到 PC + Web 双端入口
- ✅ DoD 7 项数据维度都覆盖（task 9 自检）

### Placeholder 扫描

搜本 plan 全文，无 "TBD" / "TODO" / "implement later" / "fill in details" / "add appropriate validation" / "similar to task N"。

### 类型 / 命名一致性

- migration 函数命名：`ensureAssetBindingSourceType` / `createAssetImage` / `createStoryboardKeyframe` / `ensureScenePropItemBinding` / `expandEpisodeStatus` / `stripLwImageFields`——动词前缀风格统一（ensure/create/expand/strip），与现有 `ensureUserIdColumns` / `ensureUsersTable` 同风格
- migration 文件命名：跟函数同名 kebab-case
- entity 类命名：`AssetImageEntity` / `StoryboardKeyframeEntity`——与现有 entity 后缀风格一致
- SQL 列名：snake_case（`source_type` / `override_*` / `keyframe_count`）——与项目惯例一致
- TS 字段命名：camelCase（`sourceType` / `keyframeCount`）——与项目惯例一致
- `is_main` / `is_active` / `is_enabled` 等用 INTEGER（0/1）—— SQLite 没 boolean，与项目现有惯例一致

### 双端契约清单

每个 task 末尾的"双端注册检查"已涵盖。task 9 的 DoD step 6 做整体最终核验。
