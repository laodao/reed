/**
 * 步骤0 阶段4：PgVectorStore 元数据方法测试
 * @description mock DataSource.query，断言 searchByMetadata 的参数化 SQL（防注入）+
 *              scoreThreshold 过滤 + deleteByMetadata（RETURNING）+ countByProject。
 *              不连真实 PG，纯 SQL/参数验证。
 */

import { describe, it, expect, vi } from 'vitest'
import { PgVectorStore } from '@core/services/vector/pg-vector-store'

/** 构造一个 mock DataSource，记录所有 query 调用，可预设返回值 */
function makeMockDs(returns: Record<string, any> = {}) {
  const calls: { sql: string; params: any[] }[] = []
  const ds: any = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params })
      // 按关键词匹配返回预设
      for (const key of Object.keys(returns)) {
        if (sql.includes(key)) return returns[key]
      }
      // SELECT COUNT 默认返回 0
      if (/COUNT/i.test(sql)) return [{ n: 0 }]
      // DELETE ... RETURNING 默认返回空
      if (/RETURNING/i.test(sql)) return []
      // SELECT 默认返回空结果
      if (/^SELECT/i.test(sql.trim())) return []
      return []
    }),
  }
  return { ds, calls }
}

describe('PgVectorStore 步骤0 元数据方法', () => {
  it('searchByMetadata: 全参数化 WHERE（无字符串拼接，防注入）', async () => {
    const { ds, calls } = makeMockDs({
      'embedding <=>': [
        { chunk_id: 'c1', distance: 0.1, project_id: 'p1', entity_type: 'character', entity_id: 'e1', chapter_number: null },
      ],
    })
    const store = new PgVectorStore()
    // 绕过 initialize（不需要真 PG），直接调内部方法
    ;(store as any).requireDs = () => ds

    const results = await store.searchByMetadata(
      [0.1, 0.2],
      { projectId: "p1'; DROP TABLE--", entityType: 'character', chapterNumberLte: 5 },
      10,
    )

    const searchCall = calls.find(c => c.sql.includes('ORDER BY embedding'))
    expect(searchCall).toBeTruthy()
    // 恶意 projectId 必须作为参数（$N）传入，而非拼进 SQL
    expect(searchCall!.sql).not.toContain("DROP TABLE")
    expect(searchCall!.params).toContain("p1'; DROP TABLE--")
    // chapterNumberLte 翻译为 <=
    expect(searchCall!.sql).toMatch(/<=/)
    // 结果带 metadata
    expect(results).toHaveLength(1)
    expect(results[0].metadata.projectId).toBe('p1')
    expect(results[0].metadata.entityType).toBe('character')
  })

  it('searchByMetadata: scoreThreshold 在 JS 侧过滤低分', async () => {
    const { ds } = makeMockDs({
      'embedding <=>': [
        { chunk_id: 'c1', distance: 0.05, project_id: 'p1', entity_type: 'character', entity_id: 'e1', chapter_number: null }, // score≈0.975
        { chunk_id: 'c2', distance: 0.8, project_id: 'p1', entity_type: 'character', entity_id: 'e2', chapter_number: null },  // score≈0.6
      ],
    })
    const store = new PgVectorStore()
    ;(store as any).requireDs = () => ds

    const results = await store.searchByMetadata(
      [0.1],
      { projectId: 'p1' },
      10,
      0.7, // threshold 0.7 → c2(0.6) 被过滤
    )
    expect(results).toHaveLength(1)
    expect(results[0].chunkId).toBe('c1')
  })

  it('searchByMetadata: chapterNumberGte 翻译为 >=', async () => {
    const { ds, calls } = makeMockDs({ 'embedding <=>': [] })
    const store = new PgVectorStore()
    ;(store as any).requireDs = () => ds

    await store.searchByMetadata([0.1], { projectId: 'p1', chapterNumberGte: 3 }, 5)
    const searchCall = calls.find(c => c.sql.includes('ORDER BY embedding'))
    expect(searchCall!.sql).toMatch(/>=/)
  })

  it('deleteByMetadata: DELETE ... RETURNING id，返回删除条数', async () => {
    const { ds, calls } = makeMockDs({
      'RETURNING': [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
    })
    const store = new PgVectorStore()
    ;(store as any).requireDs = () => ds

    const n = await store.deleteByMetadata({ projectId: 'p1', entityType: 'chapter' })
    expect(n).toBe(3)
    const delCall = calls.find(c => c.sql.includes('DELETE FROM kb_vectors'))
    expect(delCall).toBeTruthy()
    expect(delCall!.sql).toMatch(/RETURNING/i)
    expect(delCall!.params).toContain('p1')
    expect(delCall!.params).toContain('chapter')
  })

  it('deleteByMetadata: 参数化防注入', async () => {
    const { ds, calls } = makeMockDs({ 'RETURNING': [] })
    const store = new PgVectorStore()
    ;(store as any).requireDs = () => ds

    await store.deleteByMetadata({ projectId: "evil'; --" })
    const delCall = calls.find(c => c.sql.includes('DELETE FROM kb_vectors'))
    expect(delCall!.sql).not.toContain('evil')
    expect(delCall!.params).toContain("evil'; --")
  })

  it('countByProject: SELECT COUNT ... WHERE project_id', async () => {
    const { ds, calls } = makeMockDs({
      'COUNT': [{ n: 42 }],
    })
    const store = new PgVectorStore()
    ;(store as any).requireDs = () => ds

    const count = await store.countByProject('p1')
    expect(count).toBe(42)
    const countCall = calls.find(c => c.sql.includes('COUNT'))
    expect(countCall!.sql).toMatch(/FROM kb_vectors/)
    expect(countCall!.params).toContain('p1')
  })

  it('insertBatch: 含 4 个新元数据列', async () => {
    const { ds, calls } = makeMockDs()
    const store = new PgVectorStore()
    ;(store as any).requireDs = () => ds

    await store.insertBatch([
      {
        id: 'r1',
        chunkId: 'c1',
        knowledgeBaseId: '__lw__',
        vector: [0.1, 0.2],
        createdAt: new Date(),
        projectId: 'p1',
        entityType: 'character',
        entityId: 'e1',
        chapterNumber: null,
      },
    ])
    const insertCall = calls.find(c => c.sql.includes('INSERT INTO kb_vectors'))
    expect(insertCall).toBeTruthy()
    // SQL 列里含新元数据列
    expect(insertCall!.sql).toContain('project_id')
    expect(insertCall!.sql).toContain('entity_type')
    expect(insertCall!.sql).toContain('entity_id')
    expect(insertCall!.sql).toContain('chapter_number')
    // 参数里含新值
    expect(insertCall!.params).toContain('p1')
    expect(insertCall!.params).toContain('character')
    expect(insertCall!.params).toContain('e1')
  })
})
