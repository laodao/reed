/**
 * 谓词注册表 + 存量关系归一迁移（2026-09-16 结构化设定方案 M0，设计文档 §4.2）
 *
 * - lw_predicate_registry：受控词表（关系/属性谓词的规范 key + 同义词）
 * - 内置词表种子：来自 @shared/contracts/longwriting-design（单一事实源）
 * - 存量归一：lw_graph_edges.relation_type 命中词表的改写为规范 key；
 *   未命中的原样入册（source='discovered'）——非破坏，可重跑幂等
 *
 * 归一改写是安全的：lw_graph_edges 是唯一存量消费方，UI 直接渲染
 * relation_type，中文规范词改写后展示语义不变（'师父'→'师徒'）。
 *
 * 接入点：
 * - Electron：src/electron/database/index.ts runMultiTenantMigrations()
 * - Web：src/web/server/index.ts initDatabase()
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { checkTableExists } from './migration-utils'
import { PREDICATE_VOCABULARY, normalizePredicate } from '@shared/contracts/longwriting-design'

export async function createLwPredicateRegistry(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const ph = (i: number) => (isPg ? `$${i + 1}` : '?')

  // 1. 建表 + 唯一索引
  await ds.query(`
    CREATE TABLE IF NOT EXISTS lw_predicate_registry (
      id varchar PRIMARY KEY,
      user_id varchar NULL,
      scope varchar NOT NULL,
      key varchar NOT NULL,
      label varchar NOT NULL,
      synonyms text NULL,
      source varchar DEFAULT 'builtin',
      enabled integer DEFAULT 1,
      created_at bigint NULL,
      updated_at bigint NULL
    )
  `)
  await ds.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_lw_predicate_registry_scope_key ON lw_predicate_registry (scope, key)`
  )

  const now = Date.now()

  // 2. 内置词表种子：按 (scope,key) 幂等，已存在不覆盖（保住 manual/discovered 治理结果）
  for (const entry of PREDICATE_VOCABULARY) {
    const dup = await ds.query(`SELECT id FROM lw_predicate_registry WHERE scope = ${ph(0)} AND key = ${ph(1)}`, [
      entry.scope,
      entry.key,
    ])
    if (dup.length > 0) continue
    await ds.query(
      `INSERT INTO lw_predicate_registry (id, user_id, scope, key, label, synonyms, source, enabled, created_at, updated_at)
       VALUES (${ph(0)}, NULL, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, 'builtin', 1, ${ph(5)}, ${ph(6)})`,
      [`pred_${randomUUID().slice(0, 8)}`, entry.scope, entry.key, entry.label, JSON.stringify(entry.synonyms), now, now]
    )
  }

  // 3. 存量归一：lw_graph_edges 可能尚未建表（迁移注册顺序已保证在后，
  //    但保留守卫——全新库部分路径可能只跑到本迁移）
  const hasEdges = await checkTableExists(ds, 'lw_graph_edges', isPg)
  if (!hasEdges) return

  // 已注册 key 集合（含 discovered），避免重复入册
  const registered = new Set<string>(
    (await ds.query(`SELECT scope, key FROM lw_predicate_registry`)).map(
      (r: { scope: string; key: string }) => `${r.scope} ${r.key}`
    )
  )
  const vocabEntries = PREDICATE_VOCABULARY.map(e => ({
    scope: e.scope,
    key: e.key,
    label: e.label,
    synonyms: e.synonyms,
  }))

  const distincts: Array<{ relation_type: string | null }> = await ds.query(
    `SELECT DISTINCT relation_type FROM lw_graph_edges WHERE relation_type IS NOT NULL`
  )
  for (const { relation_type } of distincts) {
    const raw = (relation_type ?? '').trim()
    if (!raw) continue
    const normalized = normalizePredicate(raw, vocabEntries, 'relation')
    if (normalized) {
      // 命中词表：存量边改写为规范 key（幂等：重跑时 raw 已是规范词）
      if (raw !== normalized) {
        await ds.query(`UPDATE lw_graph_edges SET relation_type = ${ph(0)} WHERE relation_type = ${ph(1)}`, [
          normalized,
          raw,
        ])
      }
      continue
    }
    // 未命中：原样入册 discovered（边值不动）
    if (!registered.has(`relation ${raw}`)) {
      await ds.query(
        `INSERT INTO lw_predicate_registry (id, user_id, scope, key, label, synonyms, source, enabled, created_at, updated_at)
         VALUES (${ph(0)}, NULL, 'relation', ${ph(1)}, ${ph(2)}, NULL, 'discovered', 1, ${ph(3)}, ${ph(4)})`,
        [`pred_${randomUUID().slice(0, 8)}`, raw, raw, now, now]
      )
      registered.add(`relation ${raw}`)
    }
  }
}
