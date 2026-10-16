/**
 * 长文写作图谱表（阶段 0）：
 * - lw_events：故事事件节点（章节确认时创建，时间线锚点 chapter_number）
 * - lw_graph_edges：关系边（带 valid_from_chapter / valid_until_chapter 时间线）
 * - lw_projects 补 wizard_state 列（向导跳过标记 JSON）
 * - lw_character_relations 收编到 lw_graph_edges（原表保留兼容，幂等）
 *
 * 兼容 SQLite + PG，幂等（表/索引/列已存在则跳过）。
 * 模板：create-lw-vector-indices.ts / create-apps-tables.ts（ensureColumn）。
 */

import type { DataSource } from 'typeorm'

/**
 * 建 lw_events / lw_graph_edges 表 + lw_projects.wizard_state 列 + character_relation 收编。
 * @param ds TypeORM DataSource（SQLite 或 PostgreSQL）
 */
export async function createLwGraphTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  await ensureTable(ds, 'lw_events', isPg, createEventsDDL(isPg))
  await ensureTable(ds, 'lw_graph_edges', isPg, createEdgesDDL(isPg))

  // 索引（幂等）
  await ensureIndex(ds, isPg, 'idx_lw_events_project_id', 'lw_events', '(project_id)')
  await ensureIndex(ds, isPg, 'idx_lw_events_chapter', 'lw_events', '(project_id, chapter_number)')
  await ensureIndex(ds, isPg, 'idx_lw_graph_edges_project_id', 'lw_graph_edges', '(project_id)')
  await ensureIndex(ds, isPg, 'idx_lw_graph_edges_source', 'lw_graph_edges', '(project_id, source_type, source_id)')
  await ensureIndex(ds, isPg, 'idx_lw_graph_edges_target', 'lw_graph_edges', '(project_id, target_type, target_id)')
  await ensureIndex(ds, isPg, 'idx_lw_graph_edges_relation', 'lw_graph_edges', '(project_id, relation_type)')

  // lw_projects 补 wizard_state 列（向导跳过标记 JSON）
  await ensureColumn(ds, 'lw_projects', 'wizard_state', isPg ? 'text' : 'TEXT', isPg)

  // lw_design_messages 补 metadata 列（对话式工作流：动作摘要/关联实体/建议 chips 元数据）
  await ensureColumn(ds, 'lw_design_messages', 'metadata', isPg ? 'text' : 'TEXT', isPg)

  // 事件生命周期 + 边来源溯源（存量库补列；新装库 DDL 已含）
  await ensureColumn(ds, 'lw_events', 'state', isPg ? "varchar DEFAULT 'happened'" : "TEXT DEFAULT 'happened'", isPg)
  await ensureColumn(ds, 'lw_graph_edges', 'origin', isPg ? 'text' : 'TEXT', isPg)

  // character_relation 收编（幂等：不重复插入）
  await migrateCharacterRelations(ds, isPg)

  console.log('[create-lw-graph-tables] lw_events / lw_graph_edges / wizard_state 就绪')
}

// ─── DDL ───────────────────────────────────────────────────────────────────

function createEventsDDL(isPg: boolean): string {
  if (isPg) {
    return `
      CREATE TABLE lw_events (
        id                varchar PRIMARY KEY,
        user_id           varchar,
        project_id        varchar NOT NULL,
        name              varchar NOT NULL,
        description       text,
        chapter_number    integer NOT NULL,
        story_time        text,
        involved_entities text,
        state_before      text,
        state_after       text,
        state             varchar DEFAULT 'happened',
        created_at        bigint,
        updated_at        bigint
      )
    `
  }
  return `
    CREATE TABLE lw_events (
      id                TEXT PRIMARY KEY,
      user_id           TEXT,
      project_id        TEXT NOT NULL,
      name              TEXT NOT NULL,
      description       TEXT,
      chapter_number    INTEGER NOT NULL,
      story_time        TEXT,
      involved_entities TEXT,
      state_before      TEXT,
      state_after       TEXT,
      state             TEXT DEFAULT 'happened',
      created_at        INTEGER,
      updated_at        INTEGER
    )
  `
}

function createEdgesDDL(isPg: boolean): string {
  if (isPg) {
    return `
      CREATE TABLE lw_graph_edges (
        id                   varchar PRIMARY KEY,
        user_id              varchar,
        project_id           varchar NOT NULL,
        source_type          varchar NOT NULL,
        source_id            varchar NOT NULL,
        target_type          varchar NOT NULL,
        target_id            varchar NOT NULL,
        relation_type        varchar NOT NULL,
        label                text,
        valid_from_chapter   integer,
        valid_until_chapter  integer,
        description          text,
        origin               text,
        created_at           bigint,
        updated_at           bigint
      )
    `
  }
  return `
    CREATE TABLE lw_graph_edges (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT,
      project_id          TEXT NOT NULL,
      source_type         TEXT NOT NULL,
      source_id           TEXT NOT NULL,
      target_type         TEXT NOT NULL,
      target_id           TEXT NOT NULL,
      relation_type       TEXT NOT NULL,
      label               TEXT,
      valid_from_chapter  INTEGER,
      valid_until_chapter INTEGER,
      description         TEXT,
      origin              TEXT,
      created_at          INTEGER,
      updated_at          INTEGER
    )
  `
}

// ─── character_relation 收编 ────────────────────────────────────────────────

/**
 * 把 lw_character_relations 老数据导入 lw_graph_edges（幂等）。
 * - source/target_type='character'，relation_type=原值（空则 'related'）
 * - valid_from_chapter=1（老数据无时间线，视为自第 1 章起有效）
 * - user_id 取所属角色的 c.user_id（评审 #64：置 NULL 会让 scoped 查询下
 *   桌面/租户用户看不到迁移数据；老关系表虽无 user_id，但角色行有归属）
 * - 源表内部重复行（同 character+related+relation）先按身份三元组 GROUP BY
 *   去重——确定性拼接 id 会撞主键使整个迁移失败
 * - id 拼接用 COALESCE(rel,'rel') 而存储/守卫用 COALESCE(rel,'related')：
 *   同一对角色的 NULL 关系与字面量 'rel' 关系在源表内会被 GROUP BY 收敛为
 *   同组（无撞键风险），但「上轮迁入的 NULL 关系边」与「本轮新增的字面量
 *   'rel' 关系」会生成相同 id 且守卫（按 relation_type 查重）放行——跨迁移轮
 *   二次 INSERT 撞主键，炸掉整个 DB 初始化（实跑 0922 启动实证）
 *   ——插入按幂等忽略处理（SQLite OR IGNORE / PG ON CONFLICT DO NOTHING）
 * - project_id 从 lw_story_characters 反查
 *
 * 幂等守卫必须按 id 判存在（实测 2026-09-20）：边行的 relation_type/description
 * 会被研讨室运行期改写（如「师兄弟」→「同门」），而 id 后缀仍是迁移当时的类型——
 * 按（源,目标,类型）判存在会误判"未迁移"，重复插入同一 id 直接撞主键，
 * 整库初始化失败、应用无法启动。INSERT 再加 OR IGNORE/ON CONFLICT 兜底。
 */
async function migrateCharacterRelations(ds: DataSource, isPg: boolean): Promise<void> {
  const tableExists = await checkTableExists(ds, 'lw_character_relations', isPg)
  const edgesExists = await checkTableExists(ds, 'lw_graph_edges', isPg)
  if (!tableExists || !edgesExists) return

  if (isPg) {
    await ds.query(`
      INSERT INTO lw_graph_edges
        (id, user_id, project_id, source_type, source_id, target_type, target_id,
         relation_type, label, valid_from_chapter, valid_until_chapter, description,
         created_at, updated_at)
      SELECT
        'edge_migrated_' || g.character_id || '_' || g.related_character_id || '_' || g.rel,
        g.owner_user_id,
        g.project_id,
        'character', g.character_id, 'character', g.related_character_id,
        COALESCE(g.relation_type, 'related'),
        g.relation_type,
        1, NULL, g.relation_description,
        g.created_ms, g.created_ms
      FROM (
        SELECT
          cr.character_id,
          cr.related_character_id,
          COALESCE(cr.relation_type, 'rel') AS rel,
          MAX(cr.relation_type) AS relation_type,
          MAX(cr.relation_description) AS relation_description,
          MAX(c.user_id) AS owner_user_id,
          MAX(c.project_id) AS project_id,
          COALESCE(EXTRACT(EPOCH FROM MAX(cr.created_at))::bigint, EXTRACT(EPOCH FROM NOW())::bigint) * 1000 AS created_ms
        FROM lw_character_relations cr
        JOIN lw_story_characters c ON c.id = cr.character_id
        GROUP BY cr.character_id, cr.related_character_id, COALESCE(cr.relation_type, 'rel')
      ) g
      WHERE NOT EXISTS (
        SELECT 1 FROM lw_graph_edges ge
        WHERE ge.id = 'edge_migrated_' || g.character_id || '_' || g.related_character_id || '_' || g.rel
      )
      ON CONFLICT (id) DO NOTHING
    `)
  } else {
    await ds.query(`
      INSERT OR IGNORE INTO lw_graph_edges
        (id, user_id, project_id, source_type, source_id, target_type, target_id,
         relation_type, label, valid_from_chapter, valid_until_chapter, description,
         created_at, updated_at)
      SELECT
        'edge_migrated_' || g.character_id || '_' || g.related_character_id || '_' || g.rel,
        g.owner_user_id,
        g.project_id,
        'character', g.character_id, 'character', g.related_character_id,
        COALESCE(g.relation_type, 'related'),
        g.relation_type,
        1, NULL, g.relation_description,
        g.created_ms, g.created_ms
      FROM (
        SELECT
          cr.character_id,
          cr.related_character_id,
          COALESCE(cr.relation_type, 'rel') AS rel,
          MAX(cr.relation_type) AS relation_type,
          MAX(cr.relation_description) AS relation_description,
          MAX(c.user_id) AS owner_user_id,
          MAX(c.project_id) AS project_id,
          CAST(strftime('%s', COALESCE(MAX(cr.created_at), 'now')) AS INTEGER) * 1000 AS created_ms
        FROM lw_character_relations cr
        JOIN lw_story_characters c ON c.id = cr.character_id
        GROUP BY cr.character_id, cr.related_character_id, COALESCE(cr.relation_type, 'rel')
      ) g
      WHERE NOT EXISTS (
        SELECT 1 FROM lw_graph_edges ge
        WHERE ge.id = 'edge_migrated_' || g.character_id || '_' || g.related_character_id || '_' || g.rel
      )
    `)
  }
}

// ─── 内部工具（与项目其他 migration 同风格） ───────────────────────────────

async function ensureTable(
  ds: DataSource,
  table: string,
  isPg: boolean,
  ddl: string,
): Promise<void> {
  if (await checkTableExists(ds, table, isPg)) return
  await ds.query(ddl)
}

async function checkTableExists(
  ds: DataSource,
  table: string,
  isPg: boolean,
): Promise<boolean> {
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

async function checkIndexExists(
  ds: DataSource,
  indexName: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1 AND schemaname = current_schema() LIMIT 1`,
      [indexName],
    )
    return rows.length > 0
  }
  const rows = await ds.query(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [indexName],
  )
  return rows.length > 0
}

async function ensureIndex(
  ds: DataSource,
  isPg: boolean,
  indexName: string,
  table: string,
  columns: string,
): Promise<void> {
  if (await checkIndexExists(ds, indexName, isPg)) return
  try {
    await ds.query(`CREATE INDEX ${indexName} ON ${table} ${columns}`)
  } catch (e: any) {
    // 索引可能已由 entity synchronize 建过（如 sqlite 测试库），忽略冲突
    if (!/already exists|duplicate/i.test(e.message)) throw e
  }
}

async function ensureColumn(
  ds: DataSource,
  table: string,
  column: string,
  colDef: string,
  isPg: boolean,
): Promise<void> {
  // 表不存在（如仅注册图谱实体的测试库）直接跳过，避免 ALTER 报错
  if (!(await checkTableExists(ds, table, isPg))) return
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = current_schema() LIMIT 1`,
      [table, column],
    )
    if (rows.length === 0) {
      await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
      console.log(`[create-lw-graph-tables] ${table} 补列 ${column}`)
    }
    return
  }
  const cols = await ds.query(`PRAGMA table_info(${table})`)
  if (!cols.some((c: { name: string }) => c.name === column)) {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`)
    console.log(`[create-lw-graph-tables] ${table} 补列 ${column}`)
  }
}
