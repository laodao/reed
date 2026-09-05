/**
 * 步骤0 阶段5：LanceDBVectorStore 适配层元数据方法测试
 * @description mock LanceDBService，断言适配层正确转发 searchByMetadata/deleteByMetadata/countByProject，
 *              且 toLanceRecord 透传 4 个新元数据字段。LanceDB 底层迁移由集成测试覆盖。
 */

import { describe, it, expect, vi } from 'vitest'
import { LanceDBVectorStore } from '@core/platform/services/vector/lance-db-vector-store'

/** mock LanceDBService：记录所有调用 */
function makeMockLance() {
  const lance: any = {
    insertVectors: vi.fn(async () => {}),
    getVectorByChunkId: vi.fn(async () => null),
    searchSimilar: vi.fn(async () => []),
    deleteByChunkId: vi.fn(async () => {}),
    deleteByChunkIds: vi.fn(async () => {}),
    deleteByKnowledgeBaseId: vi.fn(async () => {}),
    countByKnowledgeBaseId: vi.fn(async () => 0),
    // 新增底层方法
    searchByMetadata: vi.fn(async () => []),
    deleteByMetadata: vi.fn(async () => 0),
    countByProject: vi.fn(async () => 0),
  }
  return lance
}

describe('LanceDBVectorStore 步骤0 元数据方法（适配层转发）', () => {
  it('searchByMetadata 转发到底层 lance.searchByMetadata', async () => {
    const lance = makeMockLance()
    lance.searchByMetadata.mockResolvedValueOnce([
      { chunkId: 'c1', score: 0.9, metadata: { projectId: 'p1', entityType: 'character' } },
    ])
    const store = new LanceDBVectorStore(lance as any)

    const results = await store.searchByMetadata([0.1, 0.2], { projectId: 'p1', entityType: 'character' }, 5, 0.6)

    expect(lance.searchByMetadata).toHaveBeenCalledWith([0.1, 0.2], { projectId: 'p1', entityType: 'character' }, 5, 0.6)
    expect(results).toHaveLength(1)
    expect(results[0].metadata.projectId).toBe('p1')
  })

  it('deleteByMetadata 转发并返回删除条数', async () => {
    const lance = makeMockLance()
    lance.deleteByMetadata.mockResolvedValueOnce(7)
    const store = new LanceDBVectorStore(lance as any)

    const n = await store.deleteByMetadata({ projectId: 'p1', entityType: 'chapter', chapterNumber: 3 })
    expect(lance.deleteByMetadata).toHaveBeenCalledWith({ projectId: 'p1', entityType: 'chapter', chapterNumber: 3 })
    expect(n).toBe(7)
  })

  it('countByProject 转发', async () => {
    const lance = makeMockLance()
    lance.countByProject.mockResolvedValueOnce(12)
    const store = new LanceDBVectorStore(lance as any)

    const count = await store.countByProject('p1')
    expect(lance.countByProject).toHaveBeenCalledWith('p1')
    expect(count).toBe(12)
  })

  it('insert 透传新元数据字段到底层', async () => {
    const lance = makeMockLance()
    const store = new LanceDBVectorStore(lance as any)

    await store.insert({
      id: 'r1', chunkId: 'c1', knowledgeBaseId: '__lw__', vector: [0.1], createdAt: new Date(),
      projectId: 'p1', entityType: 'character', entityId: 'e1', chapterNumber: 5,
    })

    expect(lance.insertVectors).toHaveBeenCalledTimes(1)
    const passed = lance.insertVectors.mock.calls[0][0][0]
    expect(passed.projectId).toBe('p1')
    expect(passed.entityType).toBe('character')
    expect(passed.entityId).toBe('e1')
    expect(passed.chapterNumber).toBe(5)
  })

  it('insert 旧 KB 数据（无新字段）正常透传', async () => {
    const lance = makeMockLance()
    const store = new LanceDBVectorStore(lance as any)

    await store.insert({
      id: 'r1', chunkId: 'c1', knowledgeBaseId: 'kb1', vector: [0.1], createdAt: new Date(),
    })

    const passed = lance.insertVectors.mock.calls[0][0][0]
    expect(passed.knowledgeBaseId).toBe('kb1')
    expect(passed.projectId).toBeUndefined()
  })

  it('getByChunkId 回填新元数据字段', async () => {
    const lance = makeMockLance()
    lance.getVectorByChunkId.mockResolvedValueOnce({
      id: 'r1', chunkId: 'c1', knowledgeBaseId: '__lw__', vector: [0.1], createdAt: new Date().toISOString(),
      projectId: 'p1', entityType: 'character', entityId: 'e1', chapterNumber: null,
    })
    const store = new LanceDBVectorStore(lance as any)

    const r = await store.getByChunkId('c1')
    expect(r).not.toBeNull()
    expect(r!.projectId).toBe('p1')
    expect(r!.entityType).toBe('character')
    expect(r!.chapterNumber).toBeNull()
  })
})
