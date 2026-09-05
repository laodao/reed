/**
 * PG 直验：create-ep-video-segments 在 PostgreSQL 上建表/加列/存量迁移 + 幂等
 *
 * 背景：PG 侧 vitest 全套件被存量 datetime 实体问题阻塞，
 * 故按 verify-pg-platform-event-tables 模式用"无实体 DataSource 直验脚本"验证 PG 迁移。
 *
 * 用法（测试容器）：
 *   PGHOST=localhost PGPORT=5439 PGUSER=postgres PGPASSWORD=postgres \
 *   PGDATABASE=the_bot_test npx tsx scripts/verify-pg-ep-video-segments.ts
 */
import { DataSource } from 'typeorm'
import { createEpVideoSegments } from '../src/core/database/migrations/create-ep-video-segments'

const EXPECTED_INDEXES = ['idx_evs_episode', 'idx_evs_scene', 'idx_evs_user_id', 'idx_storyboards_segment_id']

async function main(): Promise<void> {
  const schema = `evs_verify_${Date.now()}`
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
  // TypeORM postgres 驱动不会为裸 query 设 search_path，需经 pg options 传入，
  // 否则 CREATE TABLE 会落到 public（the_bot_test public 已有同名业务表）
  const ds = new DataSource({
    ...conn,
    schema,
    entities: [],
    synchronize: false,
    extra: { options: `-c search_path="${schema}"` },
  })
  await ds.initialize()
  try {
    // 模拟迁移前旧库（storyboards 无 segment 列）
    await ds.query(`CREATE TABLE episode_scripts (
      id varchar PRIMARY KEY, project_id varchar, episode_id varchar, status varchar
    )`)
    await ds.query(`CREATE TABLE scene_scripts (
      id varchar PRIMARY KEY, episode_script_id varchar, scene_number integer, location text
    )`)
    await ds.query(`CREATE TABLE storyboards (
      id varchar PRIMARY KEY, scene_script_id varchar, shot_number integer,
      frame_description text, video_path text, duration double precision,
      video_mode varchar, video_provider_id varchar, video_model_id varchar,
      status varchar, user_id varchar
    )`)
    await ds.query(
      `INSERT INTO episode_scripts (id, project_id, episode_id, status) VALUES ('es1', 'vp1', 'ep1', 'completed')`,
    )
    await ds.query(
      `INSERT INTO scene_scripts (id, episode_script_id, scene_number, location) VALUES
         ('sc1', 'es1', 1, '工作室'), ('sc2', 'es1', 2, '巷口')`,
    )
    await ds.query(
      `INSERT INTO storyboards
         (id, scene_script_id, shot_number, frame_description, video_path, duration, video_mode, video_provider_id, video_model_id, status)
       VALUES
         ('sb1', 'sc1', 1, '修书', '/data/v1.mp4', 5.5, 'image2video', 'pc_dash', 'wanx2.1', 'completed'),
         ('sb2', 'sc2', 1, '巷口', '/data/v2.mp4', 4, NULL, NULL, NULL, 'completed'),
         ('sb3', 'sc2', 2, '路人', NULL, 3, NULL, NULL, NULL, 'pending')`,
    )

    await createEpVideoSegments(ds)
    await createEpVideoSegments(ds) // 幂等：连跑两次

    const tables: Array<{ table_name: string }> = await ds.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'ep_video_segments'`,
    )
    const indexes: Array<{ indexname: string }> = await ds.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = ANY($1)`,
      [EXPECTED_INDEXES],
    )
    const cols: Array<{ column_name: string }> = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'storyboards'
         AND column_name IN ('segment_id', 'segment_seq')`,
    )
    const segs: Array<{ seq: number; status: string; video_path: string; duration: number }> =
      await ds.query(`SELECT * FROM ep_video_segments ORDER BY seq`)
    const sb3: Array<{ segment_id: string | null }> = await ds.query(
      `SELECT segment_id FROM storyboards WHERE id = 'sb3'`,
    )
    const backfilled: Array<{ c: number }> = await ds.query(
      `SELECT count(*)::int AS c FROM storyboards WHERE segment_id IS NOT NULL`,
    )

    const missingIndexes = EXPECTED_INDEXES.filter(i => !indexes.some(r => r.indexname === i))
    const problems: string[] = []
    if (tables.length !== 1) problems.push('ep_video_segments 表缺失')
    if (missingIndexes.length) problems.push(`缺索引: ${missingIndexes.join(',')}`)
    if (cols.length !== 2) problems.push('storyboards segment 列缺失')
    if (segs.length !== 2) problems.push(`segment 数=${segs.length}（期望 2，幂等失败）`)
    if (segs[0]?.status !== 'completed' || segs[0]?.video_path !== '/data/v1.mp4' || segs[0]?.duration !== 5.5)
      problems.push(`seg1 字段不符: ${JSON.stringify(segs[0])}`)
    if (sb3[0]?.segment_id !== null) problems.push('无视频分镜被误迁移')
    if (backfilled[0]?.c !== 2) problems.push(`backfill 数=${backfilled[0]?.c}（期望 2）`)

    if (problems.length) {
      console.error('PG 直验失败:', problems)
      process.exitCode = 1
      return
    }
    console.log(
      `PG 直验通过：表 1/1，索引 ${indexes.length}/${EXPECTED_INDEXES.length}，` +
        `storyboards 加列 2/2，存量迁移 ${segs.length} 段（幂等 ×2），backfill 2 行`
    )
  } finally {
    await ds.destroy()
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.destroy()
  }
}

main().catch((e) => {
  console.error('PG 直验异常:', e)
  process.exitCode = 1
})
