/**
 * 知识大脑 P3 迁移：kb_entities 加 scope 列（品类库跨书归并）
 *
 * scope：book=单书实体（缺省，存量行为不变）；corpus=品类级概念（多书共享，
 * 由 corpus-merge 遍标注）。幂等；SQLite + PG 双方言（照 create-kb-brain-events 先例）。
 *
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

export async function addKbEntityScope(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  if (await checkColumnExists(ds, 'kb_entities', 'scope', isPg)) return
  await ds.query(`ALTER TABLE kb_entities ADD COLUMN scope ${vc} NOT NULL DEFAULT 'book'`)
  console.log('[add-kb-entity-scope] kb_entities 加列 scope（缺省 book）')
}
