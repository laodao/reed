/**
 * PG 直验：episode-production 三列 NOT NULL 放开迁移（B1 的 PG 分支）
 *
 * 覆盖：
 *   - relax-binding-lw-id-nullable   → character_bindings.long_writing_character_id
 *   - relax-video-episode-outline-id → video_episodes.outline_id
 *   - relax-episode-script-outline-id → episode_scripts.outline_id
 *
 * 背景：PG 侧 vitest 全套件被存量 datetime 实体问题阻塞，故按
 * scripts/verify-pg-platform-event-tables.ts 的模式用"无实体 DataSource 直验"。
 *
 * 用法（测试容器）：
 *   PGHOST=localhost PGPORT=5439 PGUSER=postgres PGPASSWORD=postgres \
 *   PGDATABASE=the_bot_test npx tsx scripts/verify-pg-relax-notnull.ts
 */
import { DataSource } from 'typeorm'
import { relaxBindingLwIdNullable } from '../src/core/database/migrations/relax-binding-lw-id-nullable'
import { relaxVideoEpisodeOutlineId } from '../src/core/database/migrations/relax-video-episode-outline-id'
import { relaxEpisodeScriptOutlineId } from '../src/core/database/migrations/relax-episode-script-outline-id'

const EXPECTED: Array<[string, string]> = [
  ['character_bindings', 'long_writing_character_id'],
  ['location_bindings', 'long_writing_location_id'],
  ['item_bindings', 'long_writing_item_id'],
  ['video_episodes', 'outline_id'],
  ['episode_scripts', 'outline_id'],
]

async function main(): Promise<void> {
  const schema = `relax_verify_${Date.now()}`
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
    // 模拟旧 schema：五列 NOT NULL + '' 占位行
    await ds.query(`CREATE TABLE character_bindings (
      id varchar PRIMARY KEY, project_id varchar,
      long_writing_character_id varchar NOT NULL, source_type text DEFAULT 'standalone')`)
    await ds.query(`CREATE TABLE location_bindings (
      id varchar PRIMARY KEY, project_id varchar,
      long_writing_location_id varchar NOT NULL, source_type text DEFAULT 'standalone')`)
    await ds.query(`CREATE TABLE item_bindings (
      id varchar PRIMARY KEY, project_id varchar,
      long_writing_item_id varchar NOT NULL, source_type text DEFAULT 'standalone')`)
    await ds.query(`CREATE TABLE video_episodes (
      id varchar PRIMARY KEY, project_id varchar NOT NULL,
      outline_id text NOT NULL, episode_number integer NOT NULL, title varchar NOT NULL)`)
    await ds.query(`CREATE TABLE episode_scripts (
      id varchar PRIMARY KEY, project_id varchar NOT NULL, episode_id varchar NOT NULL,
      outline_id varchar NOT NULL, synopsis text)`)
    await ds.query(
      `INSERT INTO character_bindings (id, project_id, long_writing_character_id, source_type)
       VALUES ('cb1', 'p1', '', 'standalone')`,
    )
    await ds.query(
      `INSERT INTO video_episodes (id, project_id, outline_id, episode_number, title)
       VALUES ('ve1', 'p1', 'outline_1', 1, '第1集')`,
    )
    await ds.query(
      `INSERT INTO episode_scripts (id, project_id, episode_id, outline_id)
       VALUES ('es1', 'p1', 've1', '')`,
    )

    // 连跑两次（幂等）
    for (let i = 0; i < 2; i++) {
      await relaxBindingLwIdNullable(ds)
      await relaxVideoEpisodeOutlineId(ds)
      await relaxEpisodeScriptOutlineId(ds)
    }

    const cols: Array<{ table_name: string; column_name: string; is_nullable: string }> =
      await ds.query(
        `SELECT table_name, column_name, is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND (table_name, column_name) IN (VALUES
             ('character_bindings','long_writing_character_id'),
             ('location_bindings','long_writing_location_id'),
             ('item_bindings','long_writing_item_id'),
             ('video_episodes','outline_id'),
             ('episode_scripts','outline_id'))`,
      )
    const notNull = EXPECTED.filter(
      ([t, c]) =>
        !cols.some(r => r.table_name === t && r.column_name === c && r.is_nullable === 'YES'),
    )

    // '' 占位回填 + 既有数据保留 + NULL 可插入
    const cb = await ds.query(
      `SELECT long_writing_character_id FROM character_bindings WHERE id = 'cb1'`,
    )
    const ve = await ds.query(`SELECT outline_id FROM video_episodes WHERE id = 've1'`)
    const es = await ds.query(`SELECT outline_id FROM episode_scripts WHERE id = 'es1'`)
    await ds.query(
      `INSERT INTO video_episodes (id, project_id, outline_id, episode_number, title)
       VALUES ('ve2', 'p1', NULL, 2, '第2集')`,
    )

    const backfillOk =
      cb[0].long_writing_character_id === null &&
      ve[0].outline_id === 'outline_1' &&
      es[0].outline_id === null

    if (notNull.length || !backfillOk) {
      console.error('仍 NOT NULL 的列:', notNull, '回填校验:', { cb: cb[0], ve: ve[0], es: es[0] })
      process.exitCode = 1
      return
    }
    console.log(
      `PG 直验通过：${EXPECTED.length} 列全部 nullable，'' → NULL 回填正确，` +
        `既有数据保留，NULL 插入成功，连跑两次幂等`,
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
