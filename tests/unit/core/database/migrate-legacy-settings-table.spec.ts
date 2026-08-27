/**
 * settings 旧版 schema 迁移测试
 * @module tests/core/database/migrate-legacy-settings-table
 * @description 旧表（id 主键）→ 新表（key 主键）：数据保留、幂等、新表跳过。
 *              用 node:sqlite 内存库（DatabaseSync 满足 SqliteLikeDb 接口），
 *              避免 better-sqlite3 的 Electron/Node ABI 切换。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { migrateLegacySettingsTable, type SqliteLikeDb } from '@core/database/migrations/migrate-legacy-settings-table'

// node:sqlite 是 Node 22 新增内置模块，vite-node 内置模块表不含它（会把 node: 前缀
// 剥掉当文件解析）。用 process.getBuiltinModule 获取，绕过 vite 模块转换。
type DatabaseSyncCtor = new (path: string, opts?: { readOnly?: boolean }) => {
  exec(sql: string): void
  prepare(sql: string): {
    all(...params: unknown[]): Array<Record<string, unknown>>
  }
  close(): void
}
const nodeSqlite = process.getBuiltinModule('node:sqlite') as {
  DatabaseSync: DatabaseSyncCtor
}

function buildDb(): InstanceType<DatabaseSyncCtor> {
  return new nodeSqlite.DatabaseSync(':memory:')
}

function asDb(db: InstanceType<DatabaseSyncCtor>): SqliteLikeDb {
  // node:sqlite 的 prepare().all() 与 better-sqlite3 签名一致，可直接适配
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => ({
      all: (...params: unknown[]) => db.prepare(sql).all(...params) as Array<Record<string, unknown>>,
    }),
  }
}

function createLegacySettings(db: InstanceType<DatabaseSyncCtor>): void {
  db.exec(`
    CREATE TABLE settings (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT,
      value TEXT,
      created_at datetime,
      updated_at datetime,
      deleted_at datetime,
      user_id TEXT,
      category TEXT,
      description TEXT
    )
  `)
  db.exec(`INSERT INTO settings (id, key, value, updated_at) VALUES
    ('a1', 'language', '"zh-CN"', '2026-03-25 16:15:39'),
    ('a2', 'theme', '"tech-blue"', '2026-08-23 07:07:33'),
    ('a3', 'skin', '"modern"', NULL)`)
}

function columnsOf(db: InstanceType<DatabaseSyncCtor>, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name)
}

describe('migrateLegacySettingsTable', () => {
  let db: InstanceType<DatabaseSyncCtor>

  beforeEach(() => {
    db = buildDb()
  })
  afterEach(() => {
    db.close()
  })

  it('旧表（id 主键）迁移为 key 主键新表', () => {
    createLegacySettings(db)
    const done = migrateLegacySettingsTable(asDb(db))
    expect(done).toBe(true)
    const cols = columnsOf(db, 'settings')
    expect(cols).toContain('key')
    expect(cols).not.toContain('id')
    expect(cols).not.toContain('user_id')
    // key 是主键
    const pk = db.prepare(`PRAGMA table_info(settings)`).all() as Array<{ name: string; pk: number }>
    expect(pk.find(c => c.name === 'key')?.pk).toBe(1)
  })

  it('迁移保留数据（key/value/updated_at）', () => {
    createLegacySettings(db)
    migrateLegacySettingsTable(asDb(db))
    const rows = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ key: 'language', value: '"zh-CN"' })
    expect(rows[1]).toMatchObject({ key: 'skin', value: '"modern"' })
    // updated_at 为 NULL 的行补上默认时间
    expect(rows[1].updated_at).toBeTruthy()
    expect(rows[2]).toMatchObject({ key: 'theme', value: '"tech-blue"' })
  })

  it('幂等：迁移后再次调用返回 false 且不改动数据', () => {
    createLegacySettings(db)
    expect(migrateLegacySettingsTable(asDb(db))).toBe(true)
    expect(migrateLegacySettingsTable(asDb(db))).toBe(false)
    const rows = db.prepare('SELECT COUNT(*) AS n FROM settings').all() as Array<{ n: number }>
    expect(rows[0].n).toBe(3)
    expect(columnsOf(db, 'settings')).not.toContain('id')
  })

  it('新 schema（key 主键）直接跳过，返回 false', () => {
    db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    db.exec(`INSERT INTO settings (key, value) VALUES ('theme', '"tech-blue"')`)
    expect(migrateLegacySettingsTable(asDb(db))).toBe(false)
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 'theme', value: '"tech-blue"' })
  })

  it('无 settings 表时安全跳过，返回 false', () => {
    expect(migrateLegacySettingsTable(asDb(db))).toBe(false)
  })
})
