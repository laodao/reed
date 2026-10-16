/**
 * 知识大脑场面事件表迁移（kb_events，v2 设计 §7 原料层/P0）
 *
 * 故事轨原料表：章级场面事件（sceneType/参与者/因果/引句/偏移），
 * 供 P1 pattern-induct 聚类冶炼套路卡。幂等；兼容 SQLite + PG
 * （方言分支照 create-kb-brain-tables 先例）。
 *
 * 注册点（双入口，防漏单端——PR checklist 必查）：
 * - Electron: src/electron/database/index.ts runMultiTenantMigrations
 * - Web:      src/web/server/index.ts ensurePgvectorKbVectors 同层
 */
import type { DataSource } from 'typeorm'

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = current_schema()`
    : `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${table}'`
  const rows = (await ds.query(sql)) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0) > 0
}

export async function createKbBrainEvents(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  if (!(await checkTableExists(ds, 'kb_events', isPg))) {
    await ds.query(`
      CREATE TABLE kb_events (
        id                  ${vc} PRIMARY KEY,
        user_id             ${vc},
        knowledge_base_id   ${vc} NOT NULL,
        source_document_id  ${vc} NOT NULL,
        source_chapter_id   ${vc} NOT NULL,
        source_chapter_hash ${vc},
        scene_type          ${vc} NOT NULL DEFAULT 'other',
        summary             ${vc} NOT NULL,
        participants        ${vc} NOT NULL DEFAULT '[]',
        cause               ${vc},
        outcome             ${vc},
        source_quote        ${vc} NOT NULL,
        start_offset        INTEGER,
        end_offset          INTEGER,
        created_at          ${dt}
      )
    `)
    console.log('[create-kb-brain-events] 表 kb_events 创建完成')
  }
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_events_kb_type ON kb_events (knowledge_base_id, scene_type)',
  )
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_events_doc ON kb_events (source_document_id)')
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_events_chapter ON kb_events (source_chapter_id)')
}
