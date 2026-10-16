/**
 * 迁移单测：create-platform-event-tables（10-event-system §10）
 * - SQLite 内存库建表/索引 + 连跑两次幂等
 * - schema-drift 检查：Entity 列族与 DDL 对齐
 * PG 侧直验见 scripts/verify-pg-platform-event-tables.ts（PG 全套件被存量
 * datetime 实体问题阻塞，不在 vitest 矩阵内）。
 */
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createPlatformEventTables } from '@core/database/migrations/create-platform-event-tables'
import { checkSchemaDrift } from '@core/database/schema-drift'
import {
  PlatformEventCursorEntity,
  PlatformEventDeadLetterEntity,
  PlatformEventEntity,
} from '@core/database/entities/platform-event.entities'

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

async function tableNames(ds: DataSource): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM sqlite_master WHERE type='table'`)
  return rows.map((r: { name: string }) => r.name)
}

async function indexNames(ds: DataSource): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM sqlite_master WHERE type='index'`)
  return rows.map((r: { name: string }) => r.name)
}

describe('migration: create-platform-event-tables', () => {
  it('建三张表 + 全部索引', async () => {
    const ds = await buildEmptyDb()
    try {
      await createPlatformEventTables(ds)
      const tables = await tableNames(ds)
      expect(tables).toContain('platform_events')
      expect(tables).toContain('platform_event_cursors')
      expect(tables).toContain('platform_event_dead_letters')

      const indexes = await indexNames(ds)
      for (const name of [
        'idx_pe_type',
        'idx_pe_aggregate',
        'idx_pe_user_seq',
        'idx_pe_occurred',
        'uq_pec_consumer',
        'idx_pedl_consumer',
      ]) {
        expect(indexes).toContain(name)
      }

      // platform_events 关键列（§4.1）
      const cols: Array<{ name: string }> = await ds.query(`PRAGMA table_info('platform_events')`)
      const names = cols.map(c => c.name)
      for (const col of [
        'seq', 'id', 'user_id', 'type', 'aggregate_kind', 'aggregate_id',
        'actor_kind', 'actor_id', 'payload_json', 'causation_id', 'correlation_id',
        'occurred_at', 'schema_version', 'created_at',
      ]) {
        expect(names).toContain(col)
      }
    } finally {
      await ds.destroy()
    }
  })

  it('幂等：连跑两次不报错', async () => {
    const ds = await buildEmptyDb()
    try {
      await createPlatformEventTables(ds)
      await createPlatformEventTables(ds)
      // 二次执行后表/索引仍在
      expect(await tableNames(ds)).toContain('platform_events')
      expect(await indexNames(ds)).toContain('uq_pec_consumer')
    } finally {
      await ds.destroy()
    }
  })

  it('schema-drift：Entity 声明与迁移 DDL 对齐', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PlatformEventEntity, PlatformEventCursorEntity, PlatformEventDeadLetterEntity],
      synchronize: false,
    })
    await ds.initialize()
    try {
      await createPlatformEventTables(ds)
      const report = await checkSchemaDrift(ds)
      expect(report.missingColumns).toEqual([])
      expect(report.typeMismatches).toEqual([])
      expect(report.ok).toBe(true)
    } finally {
      await ds.destroy()
    }
  })

  it('游标唯一键：同 (consumer_name, user_scope) 重复插入被拒', async () => {
    const ds = await buildEmptyDb()
    try {
      await createPlatformEventTables(ds)
      const insert = (id: string) =>
        ds.query(
          `INSERT INTO platform_event_cursors (id, consumer_name, user_scope, updated_at)
           VALUES (?, 'c1', '*', '2026-01-01 00:00:00')`,
          [id]
        )
      await insert('a')
      await expect(insert('b')).rejects.toThrow(/unique/i)
    } finally {
      await ds.destroy()
    }
  })
})
