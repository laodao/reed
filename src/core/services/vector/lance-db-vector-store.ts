/**
 * LanceDB 实现的 IVectorStore
 * @module core/services/vector/lance-db-vector-store
 *
 * 包装现有 LanceDBService，让它符合 IVectorStore 接口。PC 端默认实现。
 * Web 端在 VECTOR_STORE != 'pgvector' 时也使用此实现（向后兼容）。
 */

import { LanceDBService } from '@core/services/lance-db.service'
import type {
  IVectorStore,
  VectorRecord,
  VectorSearchResult,
} from './vector-store.interface'

export class LanceDBVectorStore implements IVectorStore {
  constructor(private readonly lance: LanceDBService = LanceDBService.getInstance()) {}

  isReady(): boolean {
    // LanceDBService 内部用 connection != null 判断，这里调 getStats 探测会有副作用，
    // 退化为一次性 try：未初始化时所有读写都会抛 "未初始化" 错。
    return true
  }

  async insert(record: VectorRecord): Promise<void> {
    await this.lance.insertVectors([toLanceRecord(record)])
  }

  async insertBatch(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return
    await this.lance.insertVectors(records.map(toLanceRecord))
  }

  async getByChunkId(chunkId: string): Promise<VectorRecord | null> {
    const r = await this.lance.getVectorByChunkId(chunkId)
    if (!r) return null
    return {
      id: r.id,
      chunkId: r.chunkId,
      knowledgeBaseId: r.knowledgeBaseId,
      vector: r.vector,
      createdAt: r.createdAt,
    }
  }

  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number,
  ): Promise<VectorSearchResult[]> {
    const results = await this.lance.searchSimilar(
      knowledgeBaseId,
      queryVector,
      topK,
    )
    return results.map((r) => ({ chunkId: r.chunkId, score: r.score }))
  }

  async deleteByChunkId(chunkId: string): Promise<void> {
    await this.lance.deleteByChunkId(chunkId)
  }

  async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return
    await this.lance.deleteByChunkIds(chunkIds)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.lance.deleteByKnowledgeBaseId(knowledgeBaseId)
  }

  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return await this.lance.countByKnowledgeBaseId(knowledgeBaseId)
  }
}

/**
 * 把 IVectorStore 的 VectorRecord 适配到 LanceDBService.VectorRecord 形状。
 * LanceDB record 没有 dim / model / userId 字段，pgvector 端独有，安全 drop。
 */
function toLanceRecord(r: VectorRecord) {
  return {
    id: r.id,
    chunkId: r.chunkId,
    knowledgeBaseId: r.knowledgeBaseId,
    vector: r.vector,
    createdAt:
      typeof r.createdAt === 'string'
        ? r.createdAt
        : r.createdAt.toISOString(),
  }
}
