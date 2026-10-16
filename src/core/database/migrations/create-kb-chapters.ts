/**
 * 知识库章节表（kb_chapters）迁移
 *
 * 用途：文档处理后把「章节结构」落为一等实体（树形数据），承载：
 * - 章节树（title/level/parent_id/ordering/起止偏移）
 * - 章节摘要（summary + summary_status 流转 pending→done/failed，失败可重试）
 * 消费面：检索上下文注入（M3）、UI 章节树（M5）、章节摘要（M3）
 *
 * 与切片同源：章节由 StructureDetector.detect(md) 的 sections 构建，
 * 无结构的文档落单条「整篇章节」（摘要退化为整篇摘要）。
 * 幂等；兼容 SQLite + PG（datetime/timestamp、varchar/TEXT）。
 */
import type { DataSource } from 'typeorm'

export async function createKbChapters(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'kb_chapters', isPg))) {
    await ds.query(`
      CREATE TABLE kb_chapters (
        id                 ${vc} PRIMARY KEY,
        user_id            ${vc},
        document_id        ${vc} NOT NULL,
        knowledge_base_id  ${vc} NOT NULL,
        title              ${vc} NOT NULL,
        level              INTEGER DEFAULT 1,
        parent_title       ${vc},
        parent_id          ${vc},
        ordering           INTEGER DEFAULT 0,
        start_offset       INTEGER,
        end_offset         INTEGER,
        content            ${vc},
        content_hash       ${vc},
        summary            ${vc},
        summary_status     ${vc} DEFAULT 'pending',
        summary_error      ${vc},
        created_at         ${dt},
        updated_at         ${dt}
      )
    `)
    console.log('[create-kb-chapters] 表 kb_chapters 创建完成')
  }

  // 章节正文（摘要生成的数据源；已建表的库补列，幂等）
  if (!(await checkColumnExists(ds, 'kb_chapters', 'content', isPg))) {
    await ds.query(`ALTER TABLE kb_chapters ADD COLUMN content ${vc}`)
    console.log('[create-kb-chapters] kb_chapters 加列 content')
  }

  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_chapters_document ON kb_chapters (document_id)')
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_chapters_parent ON kb_chapters (parent_id)')
  await ds.query(
    isPg
      ? 'CREATE INDEX IF NOT EXISTS idx_kb_chapters_kb ON kb_chapters (knowledge_base_id)'
      : 'CREATE INDEX IF NOT EXISTS idx_kb_chapters_kb ON kb_chapters (knowledge_base_id)',
  )
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = current_schema() LIMIT 1`,
      [table],
    )
    return rows.length > 0
  }
  const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table])
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
  const rows = await ds.query(`SELECT 1 FROM pragma_table_info(?) WHERE name = ? LIMIT 1`, [table, column])
  return rows.length > 0
}