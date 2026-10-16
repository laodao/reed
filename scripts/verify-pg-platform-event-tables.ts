/**
 * PG 直验：create-platform-event-tables 在 PostgreSQL 上建表/索引 + 幂等
 *
 * 背景：PG 侧 vitest 全套件被存量 datetime 实体问题阻塞（不在本次范围修复），
 * 故按 10-event-system §10 用"无实体 DataSource 直验脚本"验证 PG 迁移。
 *
 * 用法（测试容器）：
 *   PGHOST=localhost PGPORT=5439 PGUSER=postgres PGPASSWORD=postgres \
 *   PGDATABASE=the_bot_test npx tsx scripts/verify-pg-platform-event-tables.ts
 */
import { DataSource } from 'typeorm'
import { createPlatformEventTables } from '../src/core/database/migrations/create-platform-event-tables'

const EXPECTED_TABLES = ['platform_events', 'platform_event_cursors', 'platform_event_dead_letters']
const EXPECTED_INDEXES = [
  'idx_pe_type',
  'idx_pe_aggregate',
  'idx_pe_user_seq',
  'idx_pe_occurred',
  'uq_pec_consumer',
  'idx_pedl_consumer',
]

async function main(): Promise<void> {
  const schema = `evt_verify_${Date.now()}`
  const conn = {
    type: 'postgres' as const,
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    username: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'the_bot_test',
  }
  const admin = new DataSource({ ...conn, synchronize: false })
  await admin.initialize()
  await admin.query(`CREATE SCHEMA "${schema}"`)
  const ds = new DataSource({ ...conn, schema, entities: [], synchronize: false })
  await ds.initialize()
  try {
    await createPlatformEventTables(ds)
    await createPlatformEventTables(ds) // 幂等：连跑两次

    const tables: Array<{ table_name: string }> = await ds.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [EXPECTED_TABLES]
    )
    const indexes: Array<{ indexname: string }> = await ds.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = ANY($1)`,
      [EXPECTED_INDEXES]
    )
    const missingTables = EXPECTED_TABLES.filter(t => !tables.some(r => r.table_name === t))
    const missingIndexes = EXPECTED_INDEXES.filter(i => !indexes.some(r => r.indexname === i))

    // BIGSERIAL 落库核验（迁移先于 synchronize 建表时）
    const seqType: Array<{ data_type: string }> = await ds.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'platform_events' AND column_name = 'seq'`
    )

    if (missingTables.length || missingIndexes.length) {
      console.error('缺失表:', missingTables, '缺失索引:', missingIndexes)
      process.exitCode = 1
      return
    }
    // 写入/自增冒烟：BIGSERIAL 分配 seq
    const ins = await ds.query(
      `INSERT INTO platform_events (id, type, aggregate_kind, aggregate_id, actor_kind, occurred_at, created_at)
       VALUES ('v1', 'kb:verify', 'kb', 'd1', 'system', now(), now()) RETURNING seq`
    )
    console.log(
      `PG 直验通过：表 ${tables.length}/3，索引 ${indexes.length}/6，` +
        `seq 列类型 ${seqType[0]?.data_type}，写入冒烟 seq=${ins[0].seq}`
    )
  } finally {
    await ds.destroy()
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.destroy()
  }
}

main().catch(e => {
  console.error('PG 直验失败:', e)
  process.exitCode = 1
})
