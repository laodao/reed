/**
 * 设计文档表 + 设计列（2026-09-16 结构化设定方案 M1，设计文档 §4.1/§4.2）
 *
 * - lw_design_documents：spine/卷设计 JSON 契约的草稿与版本存档
 *   （运行时真相仍在各业务表；本表承载设计 pass 草稿、确认后回填 id_map）
 * - lw_foreshadows.involves / develop_chapters / rolled_to：暗线关联补齐
 *   （0916 逐表审计真缝：此前伏笔是孤立文本+两章号，暗线轨迹查询拼不出来）
 * - lw_story_outlines.design_status：设计锁级别 coarse/detailed/locked，
 *   与进度 status（pending/progressing/completed）正交
 *
 * 兼容 SQLite + PG，幂等（表/列已存在则跳过）。
 *
 * 接入点：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations()
 * - Web：src/web/server/index.ts initDatabase()
 */

import type { DataSource } from 'typeorm'

async function addColumn(ds: DataSource, table: string, ddl: string): Promise<void> {
  try {
    await ds.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  } catch (e: any) {
    if (!/duplicate|already exists/i.test(String(e?.message || ''))) throw e
  }
}

export async function addLwDesignDocuments(ds: DataSource): Promise<void> {
  await ds.query(`
    CREATE TABLE IF NOT EXISTS lw_design_documents (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      project_id varchar NOT NULL,
      kind varchar NOT NULL,
      volume_id varchar NULL,
      title varchar NOT NULL,
      doc_json text NOT NULL,
      id_map text NULL,
      status varchar DEFAULT 'draft',
      version integer DEFAULT 1,
      created_at bigint NULL,
      updated_at bigint NULL
    )
  `)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_design_documents_project ON lw_design_documents (project_id)`)
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_lw_design_documents_project_kind ON lw_design_documents (project_id, kind)`)

  // 暗线关联列（卷设计 threads 分解落库的落点）
  await addColumn(ds, 'lw_foreshadows', 'involves text NULL')
  await addColumn(ds, 'lw_foreshadows', 'develop_chapters text NULL')
  await addColumn(ds, 'lw_foreshadows', 'rolled_to integer NULL')

  // 大纲设计锁级别（coarse/detailed/locked；NULL=未走结构化设计的存量卷）
  await addColumn(ds, 'lw_story_outlines', 'design_status varchar NULL')
}
