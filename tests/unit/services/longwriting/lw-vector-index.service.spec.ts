/**
 * 步骤0 阶段6：LwVectorIndexService 单元测试
 * @description mock 全部依赖（IVectorStore + dbManager + KnowledgeBaseService.getEmbeddingVectors），
 *              验证：增量更新（hash 跳过/重建）、检索过滤、配置兜底、级联删除。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  IVectorStore,
  VectorRecord,
  VectorMetadataSearchResult,
} from '@core/platform/services/vector/vector-store.interface'

// mock getVectorStore / getCoreDatabaseManager / KnowledgeBaseService
vi.mock('@core/platform/services/vector/vector-store.interface', async (orig) => {
  const actual: any = await orig()
  return {
    ...actual,
    getVectorStore: vi.fn(),
  }
})

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: vi.fn(),
}))

vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: vi.fn().mockImplementation(() => ({
    getEmbeddingVectors: vi.fn(),
  })),
}))

import { LwVectorIndexService } from '@core/platform/services/longwriting/lw-vector-index.service'
import { getVectorStore } from '@core/platform/services/vector/vector-store.interface'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

function makeMockStore(): { store: any; calls: any } {
  const calls: any = { inserts: [], insertBatch: [], deletedByChunkIds: [], searchByMetadata: [], deletedByMetadata: [] }
  const store: IVectorStore = {
    isReady: () => true,
    insert: vi.fn(async (r: VectorRecord) => { calls.inserts.push(r) }),
    insertBatch: vi.fn(async (rs: VectorRecord[]) => { calls.insertBatch.push(...rs) }),
    getByChunkId: vi.fn(async () => null),
    searchSimilar: vi.fn(async () => []),
    deleteByChunkId: vi.fn(async () => {}),
    deleteByChunkIds: vi.fn(async (ids: string[]) => { calls.deletedByChunkIds.push(...ids) }),
    deleteByKnowledgeBaseId: vi.fn(async () => {}),
    countByKnowledgeBaseId: vi.fn(async () => 0),
    searchByMetadata: vi.fn(async (vec, filter, topK, thr): Promise<VectorMetadataSearchResult[]> => {
      calls.searchByMetadata.push({ vec, filter, topK, thr })
      return []
    }),
    deleteByMetadata: vi.fn(async (filter) => { calls.deletedByMetadata.push(filter); return 0 }),
    countByProject: vi.fn(async () => 0),
  }
  return { store, calls }
}

function makeMockRepo() {
  // 简化版：所有方法先返回空 stub，具体行为在 beforeEach 里用 list 重新绑定
  return {
    getContentHashes: vi.fn(async () => new Map<string, string>()),
    create: vi.fn(async (data: any) => data),
    batchCreate: vi.fn(async (list: any[]) => list),
    deleteByChunkIds: vi.fn(async () => 0),
    deleteByEntity: vi.fn(async () => 0),
    deleteByChapter: vi.fn(async () => 0),
    deleteByProject: vi.fn(async () => 0),
    getByEntity: vi.fn(async () => []),
    getByChapter: vi.fn(async () => []),
    getByProject: vi.fn(async () => []),
    countByProject: vi.fn(async () => 0),
  }
}

describe('LwVectorIndexService', () => {
  let svc: LwVectorIndexService
  let mockStore: any
  let mockStoreCalls: any
  let mockDb: any
  let mockLwVectorIndices: any
  let mockEmbeddingService: any

  beforeEach(() => {
    LwVectorIndexService.resetInstance()
    svc = LwVectorIndexService.getInstance()

    const { store, calls } = makeMockStore()
    mockStore = store
    mockStoreCalls = calls
    ;(getVectorStore as any).mockReturnValue(store)

    mockLwVectorIndices = makeMockRepo()
    // 给 makeMockRepo 一个持久 list
    ;(mockLwVectorIndices as any)._list = []
    ;(mockLwVectorIndices as any)._records = () => (mockLwVectorIndices as any)._list
    // 重新绑 getContentHashes 等（闭包捕获 _records）
    const list = () => (mockLwVectorIndices as any)._list
    mockLwVectorIndices.getContentHashes = vi.fn(async (_p, _t, entityId) => {
      const m = new Map<string, string>()
      for (const r of list()) if (r.entityId === entityId) m.set(r.chunkId, r.contentHash)
      return m
    })
    mockLwVectorIndices.create = vi.fn(async (data) => { list().push({ id: 'idx_' + data.chunkId, ...data }); return data })
    mockLwVectorIndices.batchCreate = vi.fn(async (ds) => { for (const d of ds) list().push({ id: 'idx_' + d.chunkId, ...d }); return ds })
    mockLwVectorIndices.deleteByChunkIds = vi.fn(async (ids) => {
      const before = list().length
      ;(mockLwVectorIndices as any)._list = list().filter(r => !ids.includes(r.chunkId))
      return before - list().length
    })
    mockLwVectorIndices.getByEntity = vi.fn(async (_p, _t, entityId) => list().filter(r => r.entityId === entityId))
    mockLwVectorIndices.getByChapter = vi.fn(async (_p, ch) => list().filter(r => r.chapterNumber === ch))

    mockDb = {
      lwVectorIndices: mockLwVectorIndices,
      lwCharacters: { getById: vi.fn(async (id) => ({ id, name: '林锋', rolePosition: 'main' })) },
      lwLocations: { getById: vi.fn(async (id) => ({ id, name: '码头', description: '港口' })), getByProjectId: vi.fn(async () => []) },
      lwItems: { getById: vi.fn(async (id) => ({ id, name: '匕首', description: '凶器' })), getByProjectId: vi.fn(async () => []) },
      lwPlots: { getById: vi.fn(), getByProjectId: vi.fn(async () => []) },
      lwOutlines: { getById: vi.fn(), getByProjectId: vi.fn(async () => []) },
      lwChapters: { getByOutlineIds: vi.fn(async () => []) },
      lwMemories: { getById: vi.fn(), getByProjectId: vi.fn(async () => []) },
      lwCharacters_all: { getByProjectId: vi.fn(async () => []) },
      lwProjectModelConfigs: {
        getByProjectAndStage: vi.fn(async (_p, stage) => {
          if (stage === 'embedding') return { providerConfigId: 'prov1', modelId: 'embed-m' }
          return null
        }),
      },
    }
    // 补 lwCharacters.getByProjectId
    mockDb.lwCharacters.getByProjectId = vi.fn(async () => [])
    ;(getCoreDatabaseManager as any).mockReturnValue(mockDb)

    mockEmbeddingService = { getEmbeddingVectors: vi.fn(async (texts) => texts.map(() => [0.1, 0.2, 0.3])) }
    ;(KnowledgeBaseService as any).mockImplementation(() => mockEmbeddingService)
  })

  it('indexEntity: 首次入库触发 embedding + insert', async () => {
    const r = await svc.indexEntity('p1', 'character', 'c1')
    expect(r.indexed).toBe(true)
    expect(mockEmbeddingService.getEmbeddingVectors).toHaveBeenCalledTimes(1)
    expect(mockStoreCalls.inserts).toHaveLength(1)
    expect(mockStoreCalls.inserts[0].projectId).toBe('p1')
    expect(mockStoreCalls.inserts[0].entityType).toBe('character')
    expect(mockStoreCalls.inserts[0].entityId).toBe('c1')
  })

  it('indexEntity 增量：同内容连调2次，第二次跳过（embedding 只调1次）', async () => {
    await svc.indexEntity('p1', 'character', 'c1')
    await svc.indexEntity('p1', 'character', 'c1')
    expect(mockEmbeddingService.getEmbeddingVectors).toHaveBeenCalledTimes(1)
  })

  it('indexEntity 增量：内容变化后重新 embedding + 删旧 chunk', async () => {
    await svc.indexEntity('p1', 'character', 'c1')
    expect(mockEmbeddingService.getEmbeddingVectors).toHaveBeenCalledTimes(1)
    // 改变实体内容（序列化结果变化）
    mockDb.lwCharacters.getById = vi.fn(async (id) => ({ id, name: '林锋改名了', rolePosition: 'main' }))
    await svc.indexEntity('p1', 'character', 'c1')
    expect(mockEmbeddingService.getEmbeddingVectors).toHaveBeenCalledTimes(2)
    // 旧 chunk 被删
    expect(mockStoreCalls.deletedByChunkIds.length).toBeGreaterThan(0)
  })

  it('resolveEmbeddingConfig: stage=embedding 未配置时回退 chapters', async () => {
    mockDb.lwProjectModelConfigs.getByProjectAndStage = vi.fn(async (_p, stage) => {
      if (stage === 'embedding') return null
      return { providerConfigId: 'prov2', modelId: 'chat-m' }
    })
    await svc.indexEntity('p1', 'character', 'c1')
    expect(mockEmbeddingService.getEmbeddingVectors).toHaveBeenCalledWith(
      [expect.any(String)],
      { providerConfigId: 'prov2', modelId: 'chat-m' },
    )
  })

  it('resolveEmbeddingConfig: 都未配置时抛错（不静默失败）', async () => {
    mockDb.lwProjectModelConfigs.getByProjectAndStage = vi.fn(async () => null)
    await expect(svc.indexEntity('p1', 'character', 'c1')).rejects.toThrow(/未配置 embedding 模型/)
  })

  it('search: 调 store.searchByMetadata 带 projectId + filter', async () => {
    mockStore.searchByMetadata.mockResolvedValueOnce([
      { chunkId: 'ck1', score: 0.9, metadata: { projectId: 'p1', entityType: 'character', entityId: 'c1' } },
    ])
    // 先入库一条，让 getByEntity 能查到 preview
    await svc.indexEntity('p1', 'character', 'c1')

    const results = await svc.search('p1', '林锋', { entityType: 'character', topK: 5 })
    expect(mockStore.searchByMetadata).toHaveBeenCalled()
    const call = mockStore.searchByMetadata.mock.calls[0]
    expect(call[1]).toEqual({ projectId: 'p1', entityType: 'character', chapterNumberLte: undefined })
    expect(results.length).toBeGreaterThanOrEqual(0)
  })

  it('deleteByProject: 双删（store + repo）', async () => {
    await svc.indexEntity('p1', 'character', 'c1')
    await svc.deleteByProject('p1')
    expect(mockStore.deleteByMetadata).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(mockLwVectorIndices.deleteByProject).toHaveBeenCalledWith('p1')
  })

  it('deleteByChapter: 按 chapterNumber 双删', async () => {
    await svc.deleteByChapter('p1', 3)
    expect(mockStore.deleteByMetadata).toHaveBeenCalledWith({ projectId: 'p1', chapterNumber: 3 })
    expect(mockLwVectorIndices.deleteByChapter).toHaveBeenCalledWith('p1', 3)
  })
})
