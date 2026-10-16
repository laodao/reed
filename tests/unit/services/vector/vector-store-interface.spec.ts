/**
 * 步骤0 阶段1：IVectorStore 接口类型与签名测试
 * @description 验证向后兼容（旧 8 方法签名零改动）+ 新增 3 方法签名正确。
 *              这是编译期保障：只要本文件能通过 TS 类型检查，接口契约就成立。
 */

import { describe, expect, it } from 'vitest'
import type {
  IVectorStore,
  VectorRecord,
  VectorMetadataFilter,
  VectorDeleteByFilter,
  VectorMetadataSearchResult,
  VectorSearchResult,
} from '@core/platform/services/vector/vector-store.interface'
import type {
  LwVectorEntityType,
  LwVectorSearchResult,
  LwVectorSearchOptions,
  LwVectorIndexStats,
  StoryStage,
} from '@shared/types/longwriting.types'

// 辅助：构造一个满足 IVectorStore 的 mock（全方法）
function makeMockStore(): IVectorStore {
  return {
    isReady: () => true,
    insert: async (_r: VectorRecord) => {},
    insertBatch: async (_r: VectorRecord[]) => {},
    getByChunkId: async (_id: string) => null,
    searchSimilar: async (
      _kbid: string,
      _vec: number[],
      _topK: number,
      _opts?: { distanceMetric?: 'cosine' | 'l2' | 'inner_product' },
    ): Promise<VectorSearchResult[]> => [],
    deleteByChunkId: async (_id: string) => {},
    deleteByChunkIds: async (_ids: string[]) => {},
    deleteByKnowledgeBaseId: async (_kbid: string) => {},
    countByKnowledgeBaseId: async (_kbid: string) => 0,
    // 新增 3 方法
    searchByMetadata: async (
      _vec: number[],
      _filter: VectorMetadataFilter,
      _topK: number,
      _scoreThreshold?: number,
    ): Promise<VectorMetadataSearchResult[]> => [],
    deleteByMetadata: async (_filter: VectorDeleteByFilter) => 0,
    countByProject: async (_projectId: string) => 0,
  }
}

describe('IVectorStore 步骤0 扩展', () => {
  it('向后兼容：旧 8 方法签名不变，可正常调用', async () => {
    const store = makeMockStore()
    // 旧调用方式必须仍然成立（验收 0.1）
    const record: VectorRecord = {
      id: 'r1',
      chunkId: 'c1',
      knowledgeBaseId: 'kb1',
      vector: [0.1, 0.2],
      createdAt: new Date(),
    }
    await store.insert(record)
    await store.insertBatch([record])
    expect(await store.isReady()).toBe(true)
    expect(await store.getByChunkId('c1')).toBeNull()
    await store.searchSimilar('kb1', [0.1], 5)
    await store.searchSimilar('kb1', [0.1], 5, { distanceMetric: 'cosine' })
    await store.deleteByChunkId('c1')
    await store.deleteByChunkIds(['c1'])
    await store.deleteByKnowledgeBaseId('kb1')
    expect(await store.countByKnowledgeBaseId('kb1')).toBe(0)
  })

  it('VectorRecord 新增 4 元数据字段均为可选（旧数据可省略）', () => {
    // 不传新字段 → 仍合法（旧 KB 入库路径）
    const legacy: VectorRecord = {
      id: 'r1',
      chunkId: 'c1',
      knowledgeBaseId: 'kb1',
      vector: [0.1],
      createdAt: new Date(),
    }
    expect(legacy.projectId).toBeUndefined()

    // 长文模块传新字段
    const lw: VectorRecord = {
      id: 'r2',
      chunkId: 'c2',
      knowledgeBaseId: '__lw__',
      vector: [0.2],
      createdAt: new Date().toISOString(),
      projectId: 'p1',
      entityType: 'character',
      entityId: 'char_1',
      chapterNumber: null,
    }
    expect(lw.projectId).toBe('p1')
    expect(lw.entityType).toBe('character')
  })

  it('新增 3 方法签名正确可调用', async () => {
    const store = makeMockStore()
    const filter: VectorMetadataFilter = {
      projectId: 'p1',
      entityType: 'character',
      chapterNumberLte: 5,
    }
    const results = await store.searchByMetadata([0.1], filter, 10, 0.5)
    expect(results).toEqual([])
    const deleted = await store.deleteByMetadata({ projectId: 'p1' })
    expect(deleted).toBe(0)
    const count = await store.countByProject('p1')
    expect(count).toBe(0)
  })

  it('VectorMetadataFilter 支持全部过滤字段', () => {
    const f: VectorMetadataFilter = {
      projectId: 'p1',
      entityType: 'chapter',
      entityId: 'o1',
      chapterNumber: 3,
      chapterNumberLte: 3,
      chapterNumberGte: 1,
    }
    expect(f.chapterNumberLte).toBe(3)
  })

  it('VectorMetadataSearchResult 含 metadata', () => {
    const r: VectorMetadataSearchResult = {
      chunkId: 'c1',
      score: 0.92,
      metadata: { projectId: 'p1', entityType: 'character', entityId: 'e1' },
    }
    expect(r.metadata.entityType).toBe('character')
  })
})

describe('长文向量 shared types', () => {
  it('LwVectorEntityType 联合类型', () => {
    const types: LwVectorEntityType[] = [
      'character', 'location', 'item', 'faction', 'skill',
      'plot', 'outline', 'chapter', 'memory', 'event',
      'graph_edge', 'timeline', 'foreshadow',
    ]
    expect(types).toHaveLength(13)
  })

  it('LwVectorSearchResult 结构', () => {
    const r: LwVectorSearchResult = {
      entityType: 'memory',
      entityId: 'm1',
      chunkId: 'c1',
      score: 0.88,
      preview: '林锋被迫离职',
    }
    expect(r.preview).toBe('林锋被迫离职')
  })

  it('LwVectorSearchOptions 可选字段', () => {
    const opts: LwVectorSearchOptions = {
      entityType: 'character',
      chapterNumberLte: 10,
      topK: 5,
      scoreThreshold: 0.6,
    }
    expect(opts.topK).toBe(5)
    const empty: LwVectorSearchOptions = {}
    expect(empty.entityType).toBeUndefined()
  })

  it('LwVectorIndexStats 结构', () => {
    const s: LwVectorIndexStats = {
      entityCount: 12,
      chapterCount: 5,
      totalChunks: 30,
    }
    expect(s.totalChunks).toBe(30)
  })

  it("StoryStage 含 'embedding'", () => {
    const stage: StoryStage = 'embedding'
    expect(stage).toBe('embedding')
    // 其他 stage 仍合法
    const others: StoryStage[] = ['overview', 'plot', 'background', 'characters', 'skills', 'outline', 'chapters']
    expect(others).toHaveLength(7)
  })
})
