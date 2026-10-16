/**
 * 知识大脑 v3 M2 迁移：五形态存储的三个新载荷
 *
 * 1. kb_entities.attrs——体系树节点属性槽（境界：能力/寿命/突破条件；地理：特征/势力）
 * 2. kb_knowledge_edges.valid_from_chapter / valid_until_chapter——关系随章节演变
 *    （第 X 章结盟、第 Y 章反目：边带区间，NULL=未观察/始终有效）
 * 3. kb_notes.structure_stages——阶段表载荷（structure-map/character-arc：
 *    [{name,position,function,coreConflict,turnPoint,cost,evidence}]）
 *
 * 幂等；SQLite + PG 双方言（照 add-kb-atom-role 先例）。
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

export async function addKbBrainV3Structures(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const int = isPg ? 'integer' : 'INTEGER'

  if (!(await checkColumnExists(ds, 'kb_entities', 'attrs', isPg))) {
    await ds.query(`ALTER TABLE kb_entities ADD COLUMN attrs ${vc}`)
    console.log('[add-kb-brain-v3-structures] kb_entities 加列 attrs')
  }
  if (!(await checkColumnExists(ds, 'kb_knowledge_edges', 'valid_from_chapter', isPg))) {
    await ds.query(`ALTER TABLE kb_knowledge_edges ADD COLUMN valid_from_chapter ${int}`)
    await ds.query(`ALTER TABLE kb_knowledge_edges ADD COLUMN valid_until_chapter ${int}`)
    console.log('[add-kb-brain-v3-structures] kb_knowledge_edges 加列 valid_from/valid_until_chapter')
  }
  if (!(await checkColumnExists(ds, 'kb_notes', 'structure_stages', isPg))) {
    await ds.query(`ALTER TABLE kb_notes ADD COLUMN structure_stages ${vc}`)
    console.log('[add-kb-brain-v3-structures] kb_notes 加列 structure_stages')
  }
}
