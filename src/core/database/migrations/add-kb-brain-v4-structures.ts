/**
 * 知识大脑 v4 迁移：整书结构化漏斗的存储地基
 *
 * 1. kb_chapters.brain_card / brain_card_hash——章级结构化阅读卡
 *    （书级漏斗统一中间层：梗概/事件/人物事实/设定事实/伏笔动作/文风，
 *    全部带章号；逐章落盘、只随本章内容变化重做）
 * 2. kb_brain_artifacts——书级过程工件表（编年段梗概/卷梗概/名册快照/
 *    覆盖账本/审校报告）：成品归知识卡、过程归工件（deepwrite 同款纪律），
 *    不进知识卡列表与检索供给
 *
 * 幂等；SQLite + PG 双方言（照 add-kb-brain-v3-structures 先例）。
 * 注册点（双入口）：Electron src/electron/database/index.ts / Web src/web/server/index.ts
 */
import type { DataSource } from 'typeorm'

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}' AND table_schema = current_schema()`
    : `PRAGMA table_info(${table})`
  const rows = (await ds.query(sql)) as Array<Record<string, unknown>>
  if (isPg) return Number(rows[0]?.count ?? 0) > 0
  return rows.some((r) => r['name'] === column)
}

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = current_schema()`
    : `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
  const rows = (await ds.query(sql)) as Array<Record<string, unknown>>
  if (isPg) return Number(rows[0]?.count ?? 0) > 0
  return rows.length > 0
}

export async function addKbBrainV4Structures(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'

  // 1. 章级阅读卡（可空加列；有效性由章级台账 passType='card' 管理）
  if (!(await checkColumnExists(ds, 'kb_chapters', 'brain_card', isPg))) {
    await ds.query(`ALTER TABLE kb_chapters ADD COLUMN brain_card ${vc}`)
    console.log('[add-kb-brain-v4-structures] kb_chapters 加列 brain_card')
  }
  if (!(await checkColumnExists(ds, 'kb_chapters', 'brain_card_hash', isPg))) {
    await ds.query(`ALTER TABLE kb_chapters ADD COLUMN brain_card_hash ${vc}`)
    console.log('[add-kb-brain-v4-structures] kb_chapters 加列 brain_card_hash')
  }

  // 2. 书级过程工件表（UNIQUE(document_id, artifact_key)；替换式更新不膨胀）
  if (!(await checkTableExists(ds, 'kb_brain_artifacts', isPg))) {
    await ds.query(`
      CREATE TABLE kb_brain_artifacts (
        id               ${vc} PRIMARY KEY,
        user_id          ${vc},
        knowledge_base_id ${vc} NOT NULL,
        document_id      ${vc} NOT NULL,
        artifact_key     ${vc} NOT NULL,
        content_hash     ${vc},
        body             ${vc},
        created_at       ${dt},
        updated_at       ${dt}
      )
    `)
    await ds.query(`CREATE INDEX IF NOT EXISTS idx_kb_artifacts_document ON kb_brain_artifacts (document_id)`)
    await ds.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_artifacts_doc_key ON kb_brain_artifacts (document_id, artifact_key)`
    )
    console.log('[add-kb-brain-v4-structures] 表 kb_brain_artifacts 创建完成')
  }
}
