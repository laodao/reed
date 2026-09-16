import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createLwPredicateRegistry } from '@core/database/migrations/create-lw-predicate-registry'
import { PREDICATE_VOCABULARY, findVocabularyCollisions } from '@shared/contracts/longwriting-design'

async function buildDb(withEdges: boolean): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  })
  await ds.initialize()
  if (withEdges) {
    // 模拟存量 lw_graph_edges 最小形态（迁移只触碰 relation_type）
    await ds.query(`CREATE TABLE lw_graph_edges (
      id TEXT PRIMARY KEY,
      relation_type TEXT
    )`)
  }
  return ds
}

async function seedEdges(ds: DataSource, rows: Array<[string, string]>) {
  for (const [id, type] of rows) {
    await ds.query(`INSERT INTO lw_graph_edges (id, relation_type) VALUES (?, ?)`, [id, type])
  }
}

describe('migration: create-lw-predicate-registry', () => {
  it('词表自检：内置种子无 synonym 冲突（归一无歧义的前提）', () => {
    expect(findVocabularyCollisions()).toEqual([])
  })

  it('全新库：建表 + 内置种子，无 lw_graph_edges 不崩', async () => {
    const ds = await buildDb(false)
    try {
      await createLwPredicateRegistry(ds)

      const rows: Array<{ scope: string; key: string; source: string }> = await ds.query(
        `SELECT scope, key, source FROM lw_predicate_registry`
      )
      expect(rows.length).toBe(PREDICATE_VOCABULARY.length)
      const 师徒 = rows.find(r => r.key === '师徒')
      expect(师徒?.scope).toBe('relation')
      expect(师徒?.source).toBe('builtin')
      const 持有 = rows.find(r => r.key === '持有')
      expect(持有?.scope).toBe('attribute')
    } finally {
      await ds.destroy()
    }
  })

  it('存量归一：命中词表的边改写为规范词，未命中的入册 discovered', async () => {
    const ds = await buildDb(true)
    try {
      await seedEdges(ds, [
        ['e1', '师父'],
        ['e2', '死敌'],
        ['e3', '道侣'],
        ['e4', '量子纠缠'],
        ['e5', '师徒'], // 已是规范词
      ])
      await createLwPredicateRegistry(ds)

      const edges: Array<{ id: string; relation_type: string }> = await ds.query(
        `SELECT id, relation_type FROM lw_graph_edges ORDER BY id`
      )
      const typeOf = (id: string) => edges.find(e => e.id === id)?.relation_type
      expect(typeOf('e1')).toBe('师徒')
      expect(typeOf('e2')).toBe('仇敌')
      expect(typeOf('e3')).toBe('恋人')
      expect(typeOf('e4')).toBe('量子纠缠') // 未命中：原样保留
      expect(typeOf('e5')).toBe('师徒')

      const discovered: Array<{ key: string; source: string }> = await ds.query(
        `SELECT key, source FROM lw_predicate_registry WHERE source = 'discovered'`
      )
      expect(discovered).toEqual([{ key: '量子纠缠', source: 'discovered' }])
    } finally {
      await ds.destroy()
    }
  })

  it('幂等：重复执行不产生重复 discovered 行、不改写已归一边', async () => {
    const ds = await buildDb(true)
    try {
      await seedEdges(ds, [
        ['e1', '师傅'],
        ['e2', '陌路之交'],
      ])
      await createLwPredicateRegistry(ds)
      await createLwPredicateRegistry(ds)

      const edges: Array<{ id: string; relation_type: string }> = await ds.query(
        `SELECT id, relation_type FROM lw_graph_edges ORDER BY id`
      )
      expect(edges[0].relation_type).toBe('师徒')
      expect(edges[1].relation_type).toBe('陌路之交')

      const discovered: Array<{ key: string }> = await ds.query(
        `SELECT key FROM lw_predicate_registry WHERE source = 'discovered'`
      )
      expect(discovered).toHaveLength(1)
    } finally {
      await ds.destroy()
    }
  })
})
