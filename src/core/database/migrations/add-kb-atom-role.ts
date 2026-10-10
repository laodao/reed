/**
 * 知识大脑 v3 迁移：kb_atoms 加 role 列（知识/证据二分）
 *
 * role：knowledge=通过换书测试的写作知识（缺省，存量行为不变）；
 * evidence=书内事实（裁决 reader-note 档/存量重判降档）——保留检索锚点与溯源
 * 资格，不进知识供给（provider/取材过滤）。幂等；SQLite + PG 双方言
 * （照 add-kb-entity-scope 先例）。
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

export async function addKbAtomRole(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  if (await checkColumnExists(ds, 'kb_atoms', 'role', isPg)) return
  await ds.query(`ALTER TABLE kb_atoms ADD COLUMN role ${vc} NOT NULL DEFAULT 'knowledge'`)
  console.log('[add-kb-atom-role] kb_atoms 加列 role（缺省 knowledge）')
}
