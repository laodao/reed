# Plan 1 实施计划 · 基础设施 + 试点（批次 0 + 批次 1 子集）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 TypeORM + 双方言基础设施搭起来；用 `api-keys`（已是 async）和 `settings`（同步 → 异步迁移代表）两个试点 Repository 验证完整迁移流水线。

**Architecture:** `src/core/database/` 新增平台无关的 `config.ts` / `data-source.ts` / `base-repository.ts` / `schema-drift.ts` / `entities/`；`tests/unit/` 新增双方言 fixture；`DatabaseManager` 改造为"better-sqlite3 + TypeORM 并存"模式，迁完的 Repo 用 DataSource、未迁的 Repo 仍用旧 db。

**Tech Stack:** TypeORM 0.3.x + better-sqlite3（已有）+ pg（新增）+ vitest（已有）+ Docker PostgreSQL 16。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-typeorm-repositories-design.md`

**Plan 1 验收（DoD）：**
```bash
SKIP_PG_TESTS=1 npm run test:unit       # 全绿（基础设施 + api-keys + settings）
npm run typecheck                       # 0 错误
npm run dev                             # 应用启动正常，settings/api-keys 功能可用
```

---

## 文件结构

### 新建

| 文件 | 职责 |
|---|---|
| `src/core/database/config.ts` | DbConfig 类型 + `loadDbConfigFromEnv` |
| `src/core/database/data-source.ts` | `createDataSource` 工厂 |
| `src/core/database/base-repository.ts` | `BaseRepository<TEntity, TDto>` 基类 |
| `src/core/database/schema-drift.ts` | `checkSchemaDrift` 启动校验 |
| `src/core/database/entities/index.ts` | Entity barrel export |
| `src/core/database/entities/api-key.entity.ts` | api_keys 表 Entity |
| `src/core/database/entities/settings.entity.ts` | settings 表 Entity |
| `tests/unit/helpers/create-test-data-source.ts` | 双方言测试 DataSource fixture |
| `tests/unit/repositories/api-key.repository.spec.ts` | api-keys Repository 测试 |
| `tests/unit/repositories/settings.repository.spec.ts` | settings Repository 测试 |
| `scripts/test-pg-up.sh` | 启动测试用 PostgreSQL Docker 容器 |
| `scripts/test-pg-down.sh` | 停止测试用 PostgreSQL Docker 容器 |
| `vitest.config.ts` | vitest 配置（如尚未存在） |

### 修改

| 文件 | 改动 |
|---|---|
| `package.json` | 加 typeorm / pg / @types/pg 依赖；加测试脚本 |
| `tsconfig.json` | 加 `experimentalDecorators` / `emitDecoratorMetadata` |
| `src/core/database/repositories/api-key.repository.ts` | 构造函数收 `DataSource`；内部走 TypeORM |
| `src/core/database/repositories/settings.repository.ts` | 同上；同步签名改为 `Promise<T>` |
| `src/electron/database/index.ts` | 加 `dataSource` 字段；加 `loadDbConfigFromEnv` 调用；加漂移检查；试点 Repo 实例化用 `dataSource` |
| `src/electron/ipc/handlers/settings.handler.ts` | settings 相关调用加 `await` |

---

## Phase A · 基础设施

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 typeorm、pg、@types/pg**

```bash
cd /home/ubuntu/workdir/the-bot
npm install typeorm pg
npm install --save-dev @types/pg
```

Expected: `package.json` 中 `dependencies` 出现 `typeorm` / `pg`，`devDependencies` 出现 `@types/pg`。`reflect-metadata` 已被 typeorm 作为 peer 依赖装入。

- [ ] **Step 2: 验证版本**

Run: `node -e "console.log(require('typeorm/package.json').version)"`
Expected: 输出形如 `0.3.x`。

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 typeorm / pg / @types/pg 依赖"
```

---

### Task 2: 启用 TypeScript 装饰器与元数据

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: 编辑 tsconfig.json**

把 `compilerOptions` 块替换为以下（在原有基础上加 `experimentalDecorators` / `emitDecoratorMetadata` / `strictPropertyInitialization: false`）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",

    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictPropertyInitialization": false,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"],
      "@core/*": ["src/core/*"],
      "@electron/*": ["src/electron/*"]
    }
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.vue",
    "electron.vite.config.ts"
  ],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

> **为什么 `strictPropertyInitialization: false`**：TypeORM Entity 的 `@Column` 字段在 TypeScript 严格模式下报"未初始化"，而装饰器会在运行时填充——这是 TypeORM 官方推荐的关闭项。我们用 `!:` 后缀避免逐字段加 default；关掉这个 flag 允许两种写法共存。

- [ ] **Step 2: 跑 typecheck 验证**

Run: `npm run typecheck`
Expected: 0 错误（应该和改前一样绿）。

- [ ] **Step 3: 提交**

```bash
git add tsconfig.json
git commit -m "chore: tsconfig 启用 typeorm 所需的装饰器与元数据"
```

---

### Task 3: 创建 `core/database/config.ts`

**Files:**
- Create: `src/core/database/config.ts`

- [ ] **Step 1: 写文件**

```ts
// src/core/database/config.ts
/**
 * 数据库配置类型与加载
 * @module core/database/config
 * @description 平台无关的数据库配置抽象，支持 sqlite / postgres 双方言
 */

export type DbDialect = 'sqlite' | 'postgres'

export interface SqliteDbConfig {
  type: 'sqlite'
  /** 完整文件路径；调用方注入（electron 端传 userData/the_bot.db；测试可传 :memory:） */
  database: string
  /** 启用 WAL 模式（默认 true） */
  enableWal?: boolean
}

export interface PostgresDbConfig {
  type: 'postgres'
  host: string
  port: number
  username: string
  password: string
  database: string
  /** 连接池上限，默认 10 */
  poolSize?: number
  ssl?: boolean
}

export type DbConfig = SqliteDbConfig | PostgresDbConfig

/**
 * 从环境变量加载数据库配置。
 * - 设 DB_TYPE=postgres → 读 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
 * - 设 DB_TYPE=sqlite + SQLITE_PATH → sqlite 配置
 * - 未设 → 返回 null（调用方自己兜底）
 */
export function loadDbConfigFromEnv(): DbConfig | null {
  const dbType = process.env.DB_TYPE
  if (dbType === 'postgres') {
    return {
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? '',
      database: process.env.PGDATABASE ?? 'the_bot',
      poolSize: Number(process.env.PG_POOL_SIZE ?? 10),
      ssl: process.env.PGSSL === 'true',
    }
  }
  if (dbType === 'sqlite') {
    const file = process.env.SQLITE_PATH
    if (!file) return null
    return { type: 'sqlite', database: file, enableWal: true }
  }
  return null
}
```

- [ ] **Step 2: typecheck 验证**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/core/database/config.ts
git commit -m "feat(database): 添加 DbConfig 类型与环境变量加载"
```

---

### Task 4: 创建 `core/database/entities/index.ts` barrel

**Files:**
- Create: `src/core/database/entities/index.ts`

- [ ] **Step 1: 写文件（空 barrel，后续 Entity 加进来）**

```ts
// src/core/database/entities/index.ts
/**
 * Entity barrel export
 * @description 集中导出所有 TypeORM Entity 类，供 DataSource 自动注册。
 *              每加一个 Entity 文件，必须在此 export。
 */

// Phase A: 基础设施期 - 此 barrel 暂为空
// Phase B 起 Entity 逐个加入：
// export { ApiKeyEntity } from './api-key.entity'
// export { SettingsEntity } from './settings.entity'

export {}
```

- [ ] **Step 2: 提交**

```bash
git add src/core/database/entities/index.ts
git commit -m "feat(database): 添加 entities barrel export 占位"
```

---

### Task 5: 创建 `core/database/data-source.ts`

**Files:**
- Create: `src/core/database/data-source.ts`

- [ ] **Step 1: 写文件**

```ts
// src/core/database/data-source.ts
/**
 * TypeORM DataSource 工厂
 * @module core/database/data-source
 * @description 根据 DbConfig 构造并初始化 DataSource，支持 sqlite / postgres。
 */

import { DataSource, type DataSourceOptions } from 'typeorm'
import type { DbConfig } from './config'
import * as entities from './entities'

export interface CreateDataSourceOptions {
  config: DbConfig
  /** 是否在创建后立即调用 synchronize（测试常用 true，生产由调用方控制） */
  synchronizeOnInit?: boolean
}

/**
 * 创建并初始化 DataSource。
 * - 不做 schema 漂移检查（DatabaseManager 职责）
 * - 不做 synchronize（除非显式 synchronizeOnInit:true）
 */
export async function createDataSource(opts: CreateDataSourceOptions): Promise<DataSource> {
  const ds = new DataSource(buildDataSourceOptions(opts))
  await ds.initialize()
  if (opts.synchronizeOnInit) {
    await ds.synchronize()
  }
  return ds
}

function buildDataSourceOptions(opts: CreateDataSourceOptions): DataSourceOptions {
  const cfg = opts.config
  const allEntities = Object.values(entities).filter(
    v => typeof v === 'function',
  ) as Function[]

  if (cfg.type === 'sqlite') {
    return {
      type: 'better-sqlite3',
      database: cfg.database,
      entities: allEntities as any,
      synchronize: false,
      logging: process.env.DB_LOGGING === 'true',
      prepareDatabase: (db: any) => {
        if (cfg.enableWal !== false && cfg.database !== ':memory:') {
          db.pragma('journal_mode = WAL')
        }
        db.pragma('foreign_keys = ON')
      },
    }
  }

  return {
    type: 'postgres',
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    password: cfg.password,
    database: cfg.database,
    entities: allEntities as any,
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
    extra: { max: cfg.poolSize ?? 10 },
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
  }
}
```

- [ ] **Step 2: typecheck 验证**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/core/database/data-source.ts
git commit -m "feat(database): 添加 createDataSource 工厂支持 sqlite/postgres"
```

---

### Task 6: 创建 `core/database/base-repository.ts`

**Files:**
- Create: `src/core/database/base-repository.ts`

- [ ] **Step 1: 写文件**

```ts
// src/core/database/base-repository.ts
/**
 * Repository 基类
 * @module core/database/base-repository
 * @description 提供 protected 工具方法（查询/删除/存在性检查）+ 强制 toDto 抽象。
 *              不暴露统一 CRUD API，避免子类被诱导改方法名（破坏对外 API 不变）。
 */

import type {
  DataSource,
  EntityTarget,
  Repository,
  FindOptionsWhere,
} from 'typeorm'

export abstract class BaseRepository<TEntity extends object, TDto> {
  protected readonly repo: Repository<TEntity>
  protected readonly dataSource: DataSource

  constructor(dataSource: DataSource, target: EntityTarget<TEntity>) {
    this.dataSource = dataSource
    this.repo = dataSource.getRepository(target)
  }

  /** 子类必须实现：Entity → DTO */
  protected abstract toDto(entity: TEntity): TDto

  /** 可选：DTO/部分 → Entity；默认抛错（仅简单 save 场景使用） */
  protected fromDto(_dto: Partial<TDto>): Partial<TEntity> {
    throw new Error('fromDto not implemented')
  }

  protected toDtoList(entities: TEntity[]): TDto[] {
    return entities.map(e => this.toDto(e))
  }

  protected async findOneByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<TDto | null> {
    const entity = await this.repo.findOne({ where })
    return entity ? this.toDto(entity) : null
  }

  protected async findManyByWhere(
    where: FindOptionsWhere<TEntity>,
    order?: Record<string, 'ASC' | 'DESC'>,
  ): Promise<TDto[]> {
    const entities = await this.repo.find({
      where,
      order: order as any,
    })
    return this.toDtoList(entities)
  }

  protected async deleteByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<void> {
    await this.repo.delete(where)
  }

  protected async existsByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<boolean> {
    const count = await this.repo.count({ where })
    return count > 0
  }
}
```

- [ ] **Step 2: typecheck 验证**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/core/database/base-repository.ts
git commit -m "feat(database): 添加 BaseRepository 基类"
```

---

### Task 7: 创建 `core/database/schema-drift.ts`

**Files:**
- Create: `src/core/database/schema-drift.ts`

- [ ] **Step 1: 写文件**

```ts
// src/core/database/schema-drift.ts
/**
 * Schema 漂移检查
 * @module core/database/schema-drift
 * @description 比对 Entity metadata 与实库 schema，输出差异报告。
 *              漂移报告由调用方决定如何处理（备份/终止/log）。
 *              库不存在或表不存在视为 ok=true（让 synchronize 建表）。
 */

import type { DataSource, EntityMetadata } from 'typeorm'

export interface SchemaDriftReport {
  ok: boolean
  missingTables: string[]
  missingColumns: Array<{ table: string; column: string }>
  typeMismatches: Array<{
    table: string
    column: string
    expected: string
    actual: string
  }>
}

interface ActualColumn {
  name: string
  type: string
  notNull: boolean
}

/**
 * 比对 Entity metadata 与实库 schema。
 */
export async function checkSchemaDrift(
  ds: DataSource,
): Promise<SchemaDriftReport> {
  const report: SchemaDriftReport = {
    ok: true,
    missingTables: [],
    missingColumns: [],
    typeMismatches: [],
  }

  for (const meta of ds.entityMetadatas) {
    const tableName = meta.tableName
    const actualCols = await readActualColumns(ds, tableName)
    if (actualCols === null) {
      // 表不存在 - 视为新装场景，让 synchronize 建表
      continue
    }
    checkTableColumns(meta, actualCols, report)
  }

  report.ok =
    report.missingColumns.length === 0 && report.typeMismatches.length === 0
  return report
}

async function readActualColumns(
  ds: DataSource,
  tableName: string,
): Promise<ActualColumn[] | null> {
  if (ds.options.type === 'better-sqlite3' || ds.options.type === 'sqlite') {
    const tableExists = await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
    )
    if (!tableExists || tableExists.length === 0) return null
    const rows = await ds.query(`PRAGMA table_info(${escapeIdent(tableName)})`)
    return rows.map((r: any) => ({
      name: r.name as string,
      type: String(r.type ?? '').toUpperCase(),
      notNull: Number(r.notnull) === 1,
    }))
  }

  // postgres
  const rows = await ds.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName],
  )
  if (!rows || rows.length === 0) return null
  return rows.map((r: any) => ({
    name: r.column_name as string,
    type: String(r.data_type ?? '').toUpperCase(),
    notNull: r.is_nullable === 'NO',
  }))
}

function checkTableColumns(
  meta: EntityMetadata,
  actual: ActualColumn[],
  report: SchemaDriftReport,
): void {
  const actualMap = new Map(actual.map(c => [c.name.toLowerCase(), c]))
  for (const col of meta.columns) {
    const want = col.databaseName.toLowerCase()
    const got = actualMap.get(want)
    if (!got) {
      report.missingColumns.push({
        table: meta.tableName,
        column: col.databaseName,
      })
      continue
    }
    if (!affinityEquivalent(col.type as string, got.type)) {
      report.typeMismatches.push({
        table: meta.tableName,
        column: col.databaseName,
        expected: String(col.type),
        actual: got.type,
      })
    }
  }
}

/**
 * 类型 affinity 比对放宽：
 * - 整数族 / 文本族 / 浮点族 / 时间族内部互通即视为一致
 */
function affinityEquivalent(expected: string, actual: string): boolean {
  const a = normalize(expected)
  const b = normalize(actual)
  return a === b
}

function normalize(t: string): string {
  const s = t.toUpperCase().trim()
  if (/^(INT|INTEGER|BIGINT|SMALLINT)$/.test(s)) return 'INT'
  if (/^(VARCHAR|TEXT|CHARACTER VARYING|CHAR)$/.test(s)) return 'TEXT'
  if (/^(REAL|DOUBLE|FLOAT|NUMERIC|DECIMAL|DOUBLE PRECISION)$/.test(s))
    return 'REAL'
  if (/^(DATETIME|TIMESTAMP|TIMESTAMP WITHOUT TIME ZONE)$/.test(s)) return 'TIME'
  if (/^(BLOB|BYTEA)$/.test(s)) return 'BLOB'
  if (/^(BOOLEAN|BOOL)$/.test(s)) return 'BOOL'
  return s
}

function escapeIdent(name: string): string {
  // sqlite 表名不允许通过 ? 参数化在 PRAGMA 中传入；此处只接受字母数字下划线
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  return `"${name}"`
}
```

- [ ] **Step 2: typecheck 验证**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/core/database/schema-drift.ts
git commit -m "feat(database): 添加 schema 漂移检查工具"
```

---

### Task 8: vitest 配置（必要时新建）

**Files:**
- Create: `vitest.config.ts`（如已存在则修改）

- [ ] **Step 1: 检查现有 vitest 配置**

Run: `ls /home/ubuntu/workdir/the-bot/vitest.config.* 2>&1 || echo "no vitest config"`
Expected: 输出 `no vitest config` 或现有文件路径。如果已有，跳到 Step 3 编辑而非新建。

- [ ] **Step 2: 新建 `vitest.config.ts`**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: false,
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@electron': resolve(__dirname, 'src/electron'),
    },
  },
})
```

- [ ] **Step 3: 验证 vitest 能加载**

Run: `npx vitest run --reporter=basic tests/unit 2>&1 | head -10`
Expected: "No test files found"（因为 tests/unit/ 还没文件），或 0 测试运行。**不应**报"配置加载失败"。

- [ ] **Step 4: 提交**

```bash
git add vitest.config.ts
git commit -m "test: 配置 vitest 加载 tests/unit 套件"
```

---

### Task 9: 创建测试 fixture `create-test-data-source.ts`

**Files:**
- Create: `tests/unit/helpers/create-test-data-source.ts`

- [ ] **Step 1: 写文件**

```ts
// tests/unit/helpers/create-test-data-source.ts
/**
 * 双方言测试 DataSource fixture
 * @description sqlite 用 :memory:，postgres 用 Docker 容器（独立 schema 隔离）。
 */

import { DataSource } from 'typeorm'
import { createDataSource } from '@core/database/data-source'
import type { DbDialect } from '@core/database/config'

export interface TestDataSource {
  ds: DataSource
  /** 清空所有表数据（保留 schema），用例 beforeEach 调用 */
  truncateAll(): Promise<void>
  /** 关闭连接（postgres 还会 DROP SCHEMA） */
  close(): Promise<void>
}

/**
 * 创建测试 DataSource。
 * - sqlite: :memory: + synchronize:true 自动建 schema
 * - postgres: 创建独立 schema（test_<ts>_<rand>），结束 DROP SCHEMA
 */
export async function createTestDataSource(
  dialect: DbDialect,
): Promise<TestDataSource> {
  if (dialect === 'sqlite') {
    const ds = await createDataSource({
      config: { type: 'sqlite', database: ':memory:', enableWal: false },
      synchronizeOnInit: true,
    })
    return wrap(ds)
  }

  const schemaName = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const ds = await createDataSource({
    config: {
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: process.env.PGDATABASE ?? 'the_bot_test',
    },
    synchronizeOnInit: false,
  })
  await ds.query(`CREATE SCHEMA "${schemaName}"`)
  await ds.query(`SET search_path TO "${schemaName}"`)
  await ds.synchronize()
  return wrap(ds, async () => {
    await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`)
  })
}

function wrap(
  ds: DataSource,
  beforeClose?: () => Promise<unknown>,
): TestDataSource {
  return {
    ds,
    async truncateAll() {
      const meta = ds.entityMetadatas
      // 倒序删避免外键问题
      for (const m of [...meta].reverse()) {
        await ds.getRepository(m.target).clear()
      }
    },
    async close() {
      try {
        if (beforeClose) await beforeClose()
      } finally {
        await ds.destroy()
      }
    },
  }
}

/** 双方言测试矩阵：默认两个；SKIP_PG_TESTS=1 时只跑 sqlite */
export function getTestDialects(): readonly DbDialect[] {
  return process.env.SKIP_PG_TESTS
    ? (['sqlite'] as const)
    : (['sqlite', 'postgres'] as const)
}
```

- [ ] **Step 2: typecheck 验证**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 3: 提交**

```bash
git add tests/unit/helpers/create-test-data-source.ts
git commit -m "test: 添加双方言测试 DataSource fixture"
```

---

### Task 10: PG Docker 启停脚本

**Files:**
- Create: `scripts/test-pg-up.sh`
- Create: `scripts/test-pg-down.sh`

- [ ] **Step 1: 写 `scripts/test-pg-up.sh`**

```bash
#!/usr/bin/env bash
# 启动测试用 PostgreSQL Docker 容器
# 已存在同名容器则跳过启动；通过环境变量 PGHOST/PGPORT 覆盖默认值。
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-the-bot-test-pg}"
PG_PORT="${PGPORT:-5432}"
PG_PASSWORD="${PGPASSWORD:-postgres}"
PG_DATABASE="${PGDATABASE:-the_bot_test}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[test-pg-up] 容器 $CONTAINER_NAME 已在运行，跳过启动"
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[test-pg-up] 移除已停止的旧容器 $CONTAINER_NAME"
  docker rm "$CONTAINER_NAME" >/dev/null
fi

echo "[test-pg-up] 启动 $CONTAINER_NAME (port=$PG_PORT, db=$PG_DATABASE)"
docker run -d --rm --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DATABASE" \
  -p "$PG_PORT:5432" \
  "$PG_IMAGE" >/dev/null

# 等就绪
echo "[test-pg-up] 等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    echo "[test-pg-up] 就绪"
    exit 0
  fi
  sleep 1
done

echo "[test-pg-up] PostgreSQL 30s 未就绪，启动失败" >&2
exit 1
```

- [ ] **Step 2: 写 `scripts/test-pg-down.sh`**

```bash
#!/usr/bin/env bash
# 停止测试用 PostgreSQL Docker 容器
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-the-bot-test-pg}"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[test-pg-down] 停止 $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" >/dev/null
else
  echo "[test-pg-down] 容器 $CONTAINER_NAME 不在运行"
fi
```

- [ ] **Step 3: 加可执行权限**

Run: `chmod +x scripts/test-pg-up.sh scripts/test-pg-down.sh`

- [ ] **Step 4: 验证脚本语法**

Run: `bash -n scripts/test-pg-up.sh && bash -n scripts/test-pg-down.sh && echo OK`
Expected: 输出 `OK`。

- [ ] **Step 5: 提交**

```bash
git add scripts/test-pg-up.sh scripts/test-pg-down.sh
git commit -m "test: 添加 PG Docker 启停脚本"
```

---

### Task 11: 扩充 package.json 测试脚本

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 找到 scripts 段，添加新脚本**

在 `package.json` 的 `scripts` 段中，把现有的 `"test"`、`"test:coverage"` 行附近替换为：

```json
"test": "vitest",
"test:unit": "vitest run tests/unit",
"test:unit:sqlite": "SKIP_PG_TESTS=1 vitest run tests/unit",
"test:unit:pg": "vitest run tests/unit",
"test:coverage": "vitest run --coverage",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:debug": "playwright test --debug",
"pg:up": "bash scripts/test-pg-up.sh",
"pg:down": "bash scripts/test-pg-down.sh",
```

> **不要**改其他脚本（`dev`/`build`/`lint`/...）。

- [ ] **Step 2: 验证 npm 脚本可解析**

Run: `npm run | head -30`
Expected: 输出包含 `test:unit`、`test:unit:sqlite`、`pg:up`、`pg:down`。

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "chore: 扩充测试脚本（双方言矩阵 + PG Docker 启停）"
```

---

## Phase B · 试点 1: api-keys（已是 async 签名，最简洁）

### Task 12: 编写 ApiKeyEntity

**Files:**
- Create: `src/core/database/entities/api-key.entity.ts`
- Modify: `src/core/database/entities/index.ts`

> **对齐 DDL（来自 `src/electron/database/index.ts:267-274`）：**
> ```sql
> CREATE TABLE IF NOT EXISTS api_keys (
>   provider TEXT PRIMARY KEY,
>   encrypted_key TEXT NOT NULL,
>   endpoint TEXT,
>   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
>   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
> )
> ```

- [ ] **Step 1: 写 Entity**

```ts
// src/core/database/entities/api-key.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity({ name: 'api_keys' })
export class ApiKeyEntity {
  @PrimaryColumn({ name: 'provider', type: 'varchar' })
  provider!: string

  @Column({ name: 'encrypted_key', type: 'text' })
  encryptedKey!: string

  @Column({ name: 'endpoint', type: 'text', nullable: true })
  endpoint!: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
```

- [ ] **Step 2: 在 entities/index.ts 中 export**

替换 `src/core/database/entities/index.ts` 内容为：

```ts
// src/core/database/entities/index.ts
export { ApiKeyEntity } from './api-key.entity'
```

> 注意：移除原 `export {}` 占位行。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 4: 提交（Entity 单独一个 commit，便于回退）**

```bash
git add src/core/database/entities/api-key.entity.ts src/core/database/entities/index.ts
git commit -m "feat(database): 添加 ApiKeyEntity（对齐现有 api_keys 表 DDL）"
```

---

### Task 13: 写 ApiKeyRepository 测试（先红）

**Files:**
- Create: `tests/unit/repositories/api-key.repository.spec.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/unit/repositories/api-key.repository.spec.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { ApiKeyRepository } from '@core/database/repositories/api-key.repository'

describe.each(getTestDialects())('ApiKeyRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: ApiKeyRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new ApiKeyRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('save 后 get 返回相同值', async () => {
    await repo.save('openai', 'enc-key', 'https://api.example.com')
    const got = await repo.get('openai')
    expect(got).toEqual({
      encryptedKey: 'enc-key',
      endpoint: 'https://api.example.com',
    })
  })

  it('save 不传 endpoint 时 get 返回 endpoint=undefined', async () => {
    await repo.save('anthropic', 'k2')
    const got = await repo.get('anthropic')
    expect(got).toEqual({ encryptedKey: 'k2', endpoint: undefined })
  })

  it('get 不存在的 provider 返回 null', async () => {
    expect(await repo.get('nope')).toBeNull()
  })

  it('save 同 provider 第二次为 update 不是 insert', async () => {
    await repo.save('openai', 'k1')
    await repo.save('openai', 'k2', 'https://x')
    const got = await repo.get('openai')
    expect(got).toEqual({ encryptedKey: 'k2', endpoint: 'https://x' })
  })

  it('exists 返回正确布尔', async () => {
    expect(await repo.exists('openai')).toBe(false)
    await repo.save('openai', 'k')
    expect(await repo.exists('openai')).toBe(true)
  })

  it('delete 后 exists=false', async () => {
    await repo.save('openai', 'k')
    await repo.delete('openai')
    expect(await repo.exists('openai')).toBe(false)
  })

  it('getAll 返回 provider + hasEndpoint 摘要', async () => {
    await repo.save('openai', 'k1', 'https://x')
    await repo.save('anthropic', 'k2')
    const all = await repo.getAll()
    expect(all).toHaveLength(2)
    expect(all).toEqual(
      expect.arrayContaining([
        { provider: 'openai', hasEndpoint: true },
        { provider: 'anthropic', hasEndpoint: false },
      ]),
    )
  })

  it('getAll 空表返回 []', async () => {
    expect(await repo.getAll()).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试，验证它们失败（因为 ApiKeyRepository 还没改造，签名不接 DataSource）**

Run: `SKIP_PG_TESTS=1 npx vitest run tests/unit/repositories/api-key.repository.spec.ts 2>&1 | tail -30`
Expected: FAIL，错误信息形如 `Argument of type 'DataSource' is not assignable to parameter of type 'Database'`，或运行时类型错误。

> 这是预期的"红"状态——测试已写但生产代码尚未改造。

- [ ] **Step 3: 提交（红状态也要提交，方便回看 TDD 流程）**

```bash
git add tests/unit/repositories/api-key.repository.spec.ts
git commit -m "test(api-key): 添加 ApiKeyRepository 测试（TypeORM 改造前红状态）"
```

---

### Task 14: 改造 ApiKeyRepository 用 TypeORM

**Files:**
- Modify: `src/core/database/repositories/api-key.repository.ts`

- [ ] **Step 1: 完整替换 `api-key.repository.ts` 内容**

```ts
// src/core/database/repositories/api-key.repository.ts
/**
 * API 密钥数据访问层
 * @module database/repositories/api-key
 * @description 提供 API 密钥的数据库操作，密钥以加密形式存储。
 *              基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import type { DataSource } from 'typeorm'
import { ApiKeyEntity } from '../entities/api-key.entity'
import { BaseRepository } from '../base-repository'

interface ApiKeyDto {
  encryptedKey: string
  endpoint?: string
}

export class ApiKeyRepository extends BaseRepository<ApiKeyEntity, ApiKeyDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, ApiKeyEntity)
  }

  protected toDto(e: ApiKeyEntity): ApiKeyDto {
    return {
      encryptedKey: e.encryptedKey,
      endpoint: e.endpoint || undefined,
    }
  }

  /**
   * 获取所有已配置的密钥摘要
   */
  async getAll(): Promise<Array<{ provider: string; hasEndpoint: boolean }>> {
    const entities = await this.repo.find({ select: ['provider', 'endpoint'] })
    return entities.map(e => ({
      provider: e.provider,
      hasEndpoint: !!e.endpoint,
    }))
  }

  /**
   * 保存（upsert）密钥
   */
  async save(
    provider: string,
    encryptedKey: string,
    endpoint?: string,
  ): Promise<void> {
    await this.repo.save({
      provider,
      encryptedKey,
      endpoint: endpoint ?? null,
    })
  }

  /**
   * 获取密钥
   */
  async get(provider: string): Promise<ApiKeyDto | null> {
    return this.findOneByWhere({ provider } as any)
  }

  /**
   * 删除密钥
   */
  async delete(provider: string): Promise<void> {
    await this.deleteByWhere({ provider } as any)
  }

  /**
   * 检查密钥是否存在
   */
  async exists(provider: string): Promise<boolean> {
    return this.existsByWhere({ provider } as any)
  }
}
```

- [ ] **Step 2: 运行测试，验证全绿**

Run: `SKIP_PG_TESTS=1 npx vitest run tests/unit/repositories/api-key.repository.spec.ts 2>&1 | tail -20`
Expected: 8 个测试全绿。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 4: 提交**

```bash
git add src/core/database/repositories/api-key.repository.ts
git commit -m "refactor(api-key): ApiKeyRepository 切换到 TypeORM 实现"
```

---

### Task 15: 让 DatabaseManager 持有 DataSource 并把 apiKeys 切到新构造

**Files:**
- Modify: `src/electron/database/index.ts`

> 这一步**关键**——一次性把"创建 DataSource + 漂移检查 + apiKeys 切换"整合到 `initialize()` 里。其他 64 个 Repo 在后续 Plan 里逐个切，本 Task 只动 apiKeys 一个。

- [ ] **Step 1: 在 imports 段最上方新增**

```ts
import type { DataSource } from 'typeorm'
import { createDataSource } from '@core/database/data-source'
import { loadDbConfigFromEnv, type DbConfig } from '@core/database/config'
import { checkSchemaDrift } from '@core/database/schema-drift'
```

- [ ] **Step 2: 在 `DatabaseManager` 类的 `db: Database.Database | null = null` 后面加**

```ts
  /** TypeORM DataSource —— 已迁移到 TypeORM 的 Repository 用此连接 */
  public dataSource: DataSource | null = null
```

- [ ] **Step 3: 找到 `initialize()` 方法体里**实例化 `apiKeys`** 那一行**，把它改造为完整的 DataSource 初始化流程

定位：搜索 `this.apiKeys = new ApiKeyRepository(`，应该在文件后半段（按 `grep -n "this.apiKeys = new" src/electron/database/index.ts` 查行号）。

把那一行 `this.apiKeys = new ApiKeyRepository(this.db)` 替换为下面的逻辑——但这个逻辑应该放在 `runLegacyDdl` 完成、`this.db` 创建完成之后、其他 Repository 实例化**之前**：

具体步骤：
1. **找到 `runLegacyDdl()` / 旧的 schema 创建** 完成的那个点（一般紧接着 `this.db = new Database(...)` 的多个 `CREATE TABLE` 块结束之后）；
2. **在那之后插入** DataSource 创建块：

```ts
    // === Phase 1 增量迁移：建立 TypeORM DataSource ===
    const cfg: DbConfig = loadDbConfigFromEnv() ?? {
      type: 'sqlite' as const,
      database: this.dbPath,
      enableWal: true,
    }

    this.dataSource = await createDataSource({ config: cfg })

    // 漂移检查（仅 sqlite + 已有数据库文件场景）
    if (cfg.type === 'sqlite' && fs.existsSync(this.dbPath)) {
      const report = await checkSchemaDrift(this.dataSource)
      if (!report.ok) {
        const backupPath = `${this.dbPath}.bak.${Date.now()}`
        fs.copyFileSync(this.dbPath, backupPath)
        console.error('[DatabaseManager] Schema drift detected:', report)
        console.error('[DatabaseManager] DB backed up to:', backupPath)
        throw new Error(
          `Schema drift detected (backup: ${backupPath}): ${JSON.stringify(report)}`,
        )
      }
    }

    // synchronize：漂移=0 时 no-op；新库会建表
    await this.dataSource.synchronize()
    // === END Phase 1 ===
```

3. 把现有的 `this.apiKeys = new ApiKeyRepository(this.db)` 替换为：

```ts
    this.apiKeys = new ApiKeyRepository(this.dataSource)
```

> **其他 Repo 实例化暂不动**（它们继续用 `this.db`，下个 Plan 处理）。

- [ ] **Step 4: 在 `close()` 方法里加 dataSource destroy**

定位：搜索 `close()` 方法，可能形如：
```ts
async close(): Promise<void> {
  if (this.db) {
    this.db.close()
    this.db = null
  }
}
```

把它改为：
```ts
async close(): Promise<void> {
  if (this.dataSource && this.dataSource.isInitialized) {
    await this.dataSource.destroy()
    this.dataSource = null
  }
  if (this.db) {
    this.db.close()
    this.db = null
  }
}
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 6: 启动应用 dev 模式做烟雾测试**

Run: `npm run dev`
- 应用应能正常启动；
- 进入"设置 → API 密钥"页面（或对应的 Provider 配置入口）；
- 验证现有密钥仍能正常读取、保存、删除；
- 检查 console 无 `Schema drift detected` 报错；
- Ctrl+C 关闭。

> **如果出现漂移报错**：表明 ApiKeyEntity 与现有 api_keys 表 DDL 没对齐。检查报告中具体的列差异，回到 Task 12 修正 Entity 后重跑。

- [ ] **Step 7: 提交**

```bash
git add src/electron/database/index.ts
git commit -m "refactor(database): DatabaseManager 接入 TypeORM DataSource，apiKeys 切换为新构造"
```

---

## Phase C · 试点 2: settings（同步 → 异步迁移代表）

### Task 16: 编写 SettingsEntity

**Files:**
- Create: `src/core/database/entities/settings.entity.ts`
- Modify: `src/core/database/entities/index.ts`

> **对齐 DDL（来自 `src/electron/database/index.ts:258-262`）：**
> ```sql
> CREATE TABLE IF NOT EXISTS settings (
>   key TEXT PRIMARY KEY,
>   value TEXT NOT NULL,
>   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
> )
> ```

- [ ] **Step 1: 写 Entity**

```ts
// src/core/database/entities/settings.entity.ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity({ name: 'settings' })
export class SettingsEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar' })
  key!: string

  @Column({ name: 'value', type: 'text' })
  value!: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
```

- [ ] **Step 2: 把 SettingsEntity 加入 entities/index.ts**

替换 `src/core/database/entities/index.ts`：

```ts
// src/core/database/entities/index.ts
export { ApiKeyEntity } from './api-key.entity'
export { SettingsEntity } from './settings.entity'
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 4: 提交**

```bash
git add src/core/database/entities/settings.entity.ts src/core/database/entities/index.ts
git commit -m "feat(database): 添加 SettingsEntity"
```

---

### Task 17: 调用站点调研

**Files:**
- Read only: 全代码库

> 同步 → 异步迁移必须先把所有调用点找全，避免漏改。

- [ ] **Step 1: grep 调用站点**

Run:
```bash
grep -rn "dbManager\.settings\." src/ tests/ 2>&1
grep -rn "DatabaseManager.*\.settings\b" src/ 2>&1 | head -20
grep -rn "SettingsRepository" src/ 2>&1 | head -20
```

把所有命中行抄到下面（这是参考——执行 Task 18 修改时按这份清单逐个改）：

```
预期命中清单（基于已知，实际可能略多）：
- src/electron/ipc/handlers/settings.handler.ts:35  const value = dbManager.settings.get(key)
- src/electron/ipc/handlers/settings.handler.ts:38  const allSettings = dbManager.settings.getAll()
- src/electron/ipc/handlers/settings.handler.ts:63  dbManager.settings.set(payload.key, payload.value)
- 其他可能：data-path.handler.ts、其他 service 中读取 settings 的位置
```

> **执行 Task 17 前**：把实际 grep 结果记录到一个临时文件 `/tmp/settings-callers.txt` 或贴到本任务 Step 1 输出里，作为 Task 18 的依据。

- [ ] **Step 2: 不需要提交（纯调研）**

---

### Task 18: 写 SettingsRepository 测试（先红）

**Files:**
- Create: `tests/unit/repositories/settings.repository.spec.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/unit/repositories/settings.repository.spec.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { SettingsRepository } from '@core/database/repositories/settings.repository'

describe.each(getTestDialects())('SettingsRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: SettingsRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new SettingsRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('set 后 get 返回 JSON 反序列化的值', async () => {
    await repo.set('theme', 'dark')
    expect(await repo.get('theme')).toBe('dark')
  })

  it('set 复杂对象 → get 返回深相等', async () => {
    const cfg = { font: 'noto', size: 14, nested: { a: [1, 2, 3] } }
    await repo.set('uiCfg', cfg)
    expect(await repo.get('uiCfg')).toEqual(cfg)
  })

  it('set boolean / number / null 都能往返', async () => {
    await repo.set('flag', true)
    await repo.set('count', 42)
    await repo.set('val', null)
    expect(await repo.get('flag')).toBe(true)
    expect(await repo.get('count')).toBe(42)
    expect(await repo.get('val')).toBeNull()
  })

  it('get 不存在的 key 返回 null', async () => {
    expect(await repo.get('nope')).toBeNull()
  })

  it('set 同 key 第二次为 upsert', async () => {
    await repo.set('theme', 'light')
    await repo.set('theme', 'dark')
    expect(await repo.get('theme')).toBe('dark')
  })

  it('getAll 返回所有键值映射（值已反序列化）', async () => {
    await repo.set('a', 1)
    await repo.set('b', 'two')
    await repo.set('c', { nested: true })
    const all = await repo.getAll()
    expect(all).toEqual({ a: 1, b: 'two', c: { nested: true } })
  })

  it('getAll 空表返回 {}', async () => {
    expect(await repo.getAll()).toEqual({})
  })

  it('delete 后 get 返回 null', async () => {
    await repo.set('foo', 'bar')
    await repo.delete('foo')
    expect(await repo.get('foo')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试验证它们失败**

Run: `SKIP_PG_TESTS=1 npx vitest run tests/unit/repositories/settings.repository.spec.ts 2>&1 | tail -30`
Expected: FAIL（要么类型错误"Argument of type 'DataSource' is not assignable to..."，要么所有 it 失败）。

- [ ] **Step 3: 提交红状态**

```bash
git add tests/unit/repositories/settings.repository.spec.ts
git commit -m "test(settings): 添加 SettingsRepository 测试（异步签名预期）"
```

---

### Task 19: 改造 SettingsRepository（同步 → 异步 + TypeORM）

**Files:**
- Modify: `src/core/database/repositories/settings.repository.ts`

- [ ] **Step 1: 完整替换文件内容**

```ts
// src/core/database/repositories/settings.repository.ts
/**
 * 设置数据访问层
 * @module database/repositories/settings
 * @description 键值对设置存储，value 列以 JSON 字符串保存。
 *              基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *
 * 注意：v2 起方法签名从同步改为异步（返回 Promise）。
 *      所有调用点必须加 await。详见 Spec §1.3。
 */

import type { DataSource } from 'typeorm'
import { SettingsEntity } from '../entities/settings.entity'
import { BaseRepository } from '../base-repository'

interface SettingsDto {
  key: string
  value: unknown
}

export class SettingsRepository extends BaseRepository<
  SettingsEntity,
  SettingsDto
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SettingsEntity)
  }

  protected toDto(e: SettingsEntity): SettingsDto {
    return { key: e.key, value: this.parseValue(e.value) }
  }

  private parseValue(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  /**
   * 获取设置值。返回 JSON 反序列化的值；不存在返回 null。
   */
  async get(key: string): Promise<unknown> {
    const entity = await this.repo.findOne({
      where: { key } as any,
      select: ['value'],
    })
    if (!entity) return null
    return this.parseValue(entity.value)
  }

  /**
   * 保存设置值（upsert，value 以 JSON 字符串存储）。
   */
  async set(key: string, value: unknown): Promise<void> {
    await this.repo.save({
      key,
      value: JSON.stringify(value),
    })
  }

  /**
   * 获取所有设置（值已反序列化）。
   */
  async getAll(): Promise<Record<string, unknown>> {
    const entities = await this.repo.find({ select: ['key', 'value'] })
    const out: Record<string, unknown> = {}
    for (const e of entities) {
      out[e.key] = this.parseValue(e.value)
    }
    return out
  }

  /**
   * 删除设置。
   */
  async delete(key: string): Promise<void> {
    await this.deleteByWhere({ key } as any)
  }
}
```

> **关键点**：
> - `value` 列保留 `text` 类型（不用 `simple-json`）——因为现有 settings 表是 `value TEXT NOT NULL`，存储的是 `JSON.stringify` 后的字符串；改为 `simple-json` 列定义会改变 DDL，引发漂移检查失败。
> - 反序列化逻辑（`parseValue`）保留原 try-catch fallback：JSON 解析失败时返回原始字符串，行为与旧实现一致。

- [ ] **Step 2: 跑测试验证全绿**

Run: `SKIP_PG_TESTS=1 npx vitest run tests/unit/repositories/settings.repository.spec.ts 2>&1 | tail -20`
Expected: 8 个测试全绿。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: **会报错**——`settings.handler.ts` 调用 `dbManager.settings.get(key)` 时拿到 `Promise<unknown>` 而代码当作 `unknown` 用。这预期。

- [ ] **Step 4: 暂不提交**（typecheck 红的状态不提交，下个 Task 修调用站点后一起提交）

---

### Task 20: 更新 settings 调用站点（加 await）

**Files:**
- Modify: `src/electron/ipc/handlers/settings.handler.ts`
- Modify: 其他 Task 17 调研发现的调用文件（按实际清单）

- [ ] **Step 1: 修改 `settings.handler.ts`**

读取 `src/electron/ipc/handlers/settings.handler.ts` 全文，定位三个调用点（行号大致 35 / 38 / 63）。

把：
```ts
const value = dbManager.settings.get(key)
```
改为：
```ts
const value = await dbManager.settings.get(key)
```

把：
```ts
const allSettings = dbManager.settings.getAll()
```
改为：
```ts
const allSettings = await dbManager.settings.getAll()
```

把：
```ts
dbManager.settings.set(payload.key, payload.value)
```
改为：
```ts
await dbManager.settings.set(payload.key, payload.value)
```

> 三处所在的 IPC handler 函数本身应该已经是 `async` 的（IPC handler 都是异步）。如果某处所在函数不是 async，也要标 `async`。

- [ ] **Step 2: 处理 Task 17 调研出的其他调用站点**

按 Task 17 grep 出的清单逐个文件检查。对每个 `dbManager.settings.{get|set|getAll|delete}` 调用：
- 加 `await`；
- 如果所在函数不是 `async`，标记为 `async`；
- 如果调用方依赖返回值且自己也被同步调用——回溯整条链路全部 async 化。

> **特别注意**：DatabaseManager 内部也用 `this.db.prepare('SELECT value FROM settings ...')` 直读 settings 表（详见 `src/electron/database/index.ts` 多个迁移检查代码点）。**这些不通过 SettingsRepository**，本任务不动它们。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 错误。如果还有红，说明有调用点漏改，回 Step 2 继续。

- [ ] **Step 4: 跑现有测试套件确认无回归**

Run: `SKIP_PG_TESTS=1 npm run test:unit 2>&1 | tail -10`
Expected: 全绿。

- [ ] **Step 5: 把 settings 切到 dataSource 实例化**

修改 `src/electron/database/index.ts`，把：
```ts
this.settings = new SettingsRepository(this.db)
```
改为：
```ts
this.settings = new SettingsRepository(this.dataSource)
```

定位：`grep -n "new SettingsRepository" src/electron/database/index.ts`。

- [ ] **Step 6: typecheck + 启动 dev 烟雾测试**

```bash
npm run typecheck
npm run dev
```
- 进入"设置"页面，切换主题、字体大小等，验证读写 settings 正常；
- 重启应用验证持久化生效；
- console 无错误。

- [ ] **Step 7: 提交（一次性把 Repository 改造 + 调用站点更新 + DatabaseManager 切换 提交）**

```bash
git add src/core/database/repositories/settings.repository.ts \
        src/electron/ipc/handlers/settings.handler.ts \
        src/electron/database/index.ts
# 如果 Step 2 改了其他文件也一起 add
git commit -m "refactor(settings): SettingsRepository 切到 TypeORM 异步签名 + 同步调用点"
```

---

## Phase D · Plan 1 收尾

### Task 21: 跑完整 sqlite 单测套件

**Files:** N/A

- [ ] **Step 1: 跑全部单测**

Run: `SKIP_PG_TESTS=1 npm run test:unit 2>&1 | tail -20`
Expected: api-key 8 个 + settings 8 个 = 16 测试全绿，0 失败。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 错误。

- [ ] **Step 3: lint**

Run: `npm run lint 2>&1 | tail -10`
Expected: 0 warning / 0 error。如有，按提示修复并重跑。

---

### Task 22: 跑 PG 矩阵（可选但推荐）

**Files:** N/A

> 本任务需要本机能跑 Docker。无 Docker 环境可跳过，但 Plan 1 完成 commit message 中标记 "PG matrix not yet verified"。

- [ ] **Step 1: 启 PG 容器**

Run: `npm run pg:up 2>&1 | tail -5`
Expected: 输出 `[test-pg-up] 就绪`。

- [ ] **Step 2: 跑 PG 矩阵**

Run: `PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=the_bot_test npm run test:unit 2>&1 | tail -30`
Expected: api-key 16 个（sqlite 8 + pg 8） + settings 16 个（sqlite 8 + pg 8） = 32 测试全绿。

- [ ] **Step 3: 关 PG 容器**

Run: `npm run pg:down`
Expected: 输出 `[test-pg-down] 停止 the-bot-test-pg`。

---

### Task 23: 跑 e2e（验证电桌应用层无回归）

**Files:** N/A

- [ ] **Step 1: 跑 e2e**

Run: `npm run test:e2e 2>&1 | tail -20`
Expected: 现有 e2e 全绿。

> 如果 e2e 失败，定位是不是 settings/api-keys 异步化导致的回归。检查 IPC handler 是否漏 await。

---

### Task 24: 打 Plan 1 完成 tag

**Files:** N/A

- [ ] **Step 1: 检查 git 状态干净**

Run: `git status`
Expected: working tree clean。

- [ ] **Step 2: 打 tag**

```bash
git tag phase1/plan-1-infra-and-pilot
git log --oneline -20  # 检查 Plan 1 期间所有 commit 的可读性
```

> **不要 push tag**（用户没要求）。tag 仅作本地回退点。

- [ ] **Step 3: 更新 Plan 1 完成状态**

不需要修改文件，但在对话中明确告知用户：
- Plan 1 已完成
- 试点验证通过
- 准备进入 Plan 2（中等复杂度 + KB 子系统）

---

## Self-Review

### Spec 覆盖

| Spec 章节 | 对应任务 |
|---|---|
| §2.3 目录结构 | Task 3-7 + Task 9-10 创建相应文件 |
| §3 Entity 层 | Task 12 (ApiKeyEntity) + Task 16 (SettingsEntity) 演示 §3.1-3.6 |
| §4 Repository 层 | Task 14 (ApiKeyRepository) + Task 19 (SettingsRepository) 演示 §4.1-4.5 |
| §5.1 配置层 | Task 3 |
| §5.2 DataSource 工厂 | Task 5 |
| §5.3 漂移检查 | Task 7 + Task 15 接入 |
| §5.4 DatabaseManager 改造 | Task 15（apiKeys）+ Task 20 Step 5（settings） |
| §6 测试基础设施 | Task 8-10（vitest + fixture + Docker 脚本）+ Task 13/18 演示 |
| §1.3 同步→异步例外 | Task 17（调研）+ Task 19/20（settings 案例） |
| §7 实施序列批次 0+1 | 整个 Plan 1 覆盖 |

### Placeholder 扫描

- [x] 无 "TBD" / "TODO" / "implement later"。
- [x] 所有 step 含完整代码或完整命令。
- [x] 调用站点清单（Task 17）给出已知命中的文件 + 行号，并要求执行时 grep 实际确认（这是必要的——某些 Service 内部调用我们没遍历到全部）。
- [x] Task 15 Step 3 涉及"找到代码插入点"——给出了具体定位方法（grep 指令）。

### 类型一致性

- [x] `ApiKeyDto` / `SettingsDto` 在测试和 Repository 中类型一致。
- [x] `BaseRepository<TEntity, TDto>` 泛型签名在所有子类中一致。
- [x] `DataSource` 类型在 fixture / Repository / DatabaseManager 中均通过 `import type` 引入，避免运行时副作用。
- [x] `DbConfig` / `DbDialect` 类型从 `@core/database/config` 单一来源。

### 备注

1. **Plan 1 不包含**所有 65 个 Repo——只是基础设施 + 2 个试点。其余 63 个在 Plan 2-5 处理。
2. **Plan 1 完成后应用必须能跑**——验收 DoD 包括 `npm run dev` 启动正常 + e2e 全绿。
3. **Tag `phase1/plan-1-infra-and-pilot`** 是回退点，Plan 2 出问题随时回滚。
4. **PG 矩阵**（Task 22）可选——本地无 Docker 时降级跑 sqlite-only，Plan 1 不阻塞；但完整 Phase 1 验收（spec §8）要求 PG 矩阵全绿，最迟在 Plan 5 收尾时必须验证。
