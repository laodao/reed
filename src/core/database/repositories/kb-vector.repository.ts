/**
 * 向量数据访问层
 * @module database/repositories/kb-vector.repository
 *
 * V3 改造（plan 2026-05-03 web-vector-store-pgvector-migration）：
 * 不再直接持有 LanceDBService 实例，改为运行时通过 getVectorStore() 解析具体后端。
 * - PC：默认 LanceDBVectorStore（本地 LanceDB）
 * - Web：env VECTOR_STORE=pgvector → PgVectorStore；否则 LanceDBVectorStore
 *
 * 业务层（KnowledgeBaseService）只关心 Repository 接口不变；底层实现在两处启动入口
 * 二选一注册一次。
 */

import { randomUUID } from 'crypto'
import { getCoreDatabaseManager } from '../database-manager.interface'
import { getVectorStore } from '@core/platform/services/vector/vector-store.interface'

/** 向量实体（兼容旧接口） */
export interface KbVectorEntity {
  id: string
  chunkId: string
  knowledgeBaseId: string
  vector: number[]
  createdAt: Date | string
}

/**
 * 向量数据仓库 — 委托 IVectorStore（PC/Web 双端可切）。
 */
export class KbVectorRepository {
  /**
   * 创建向量
   */
  async create(data: {
    chunkId: string
    knowledgeBaseId: string
    vector: number[]
  }): Promise<KbVectorEntity> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await getVectorStore().insert({
      id,
      chunkId: data.chunkId,
      knowledgeBaseId: data.knowledgeBaseId,
      vector: data.vector,
      dim: data.vector.length,
      createdAt: now,
    })
    return {
      id,
      chunkId: data.chunkId,
      knowledgeBaseId: data.knowledgeBaseId,
      vector: data.vector,
      createdAt: now,
    }
  }

  /**
   * 批量创建向量（一次 round trip）
   */
  async createBatch(
    items: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>,
  ): Promise<void> {
    if (items.length === 0) return
    const now = new Date().toISOString()
    const records = items.map((item) => ({
      id: randomUUID(),
      chunkId: item.chunkId,
      knowledgeBaseId: item.knowledgeBaseId,
      vector: item.vector,
      dim: item.vector.length,
      createdAt: now,
    }))
    await getVectorStore().insertBatch(records)
  }

  /**
   * 根据切片 ID 获取向量
   */
  async findByChunkId(chunkId: string): Promise<KbVectorEntity | null> {
    const r = await getVectorStore().getByChunkId(chunkId)
    if (!r) return null
    return {
      id: r.id,
      chunkId: r.chunkId,
      knowledgeBaseId: r.knowledgeBaseId,
      vector: r.vector,
      createdAt: r.createdAt,
    }
  }

  /**
   * 根据切片 ID 列表获取向量（逐个查询；后端如能批量优化可在 IVectorStore 加 method）
   */
  async findByChunkIds(chunkIds: string[]): Promise<Map<string, KbVectorEntity>> {
    const result = new Map<string, KbVectorEntity>()
    for (const chunkId of chunkIds) {
      const entity = await this.findByChunkId(chunkId)
      if (entity) result.set(chunkId, entity)
    }
    return result
  }

  /** 根据切片 ID 删除向量 */
  async deleteByChunkId(chunkId: string): Promise<void> {
    await getVectorStore().deleteByChunkId(chunkId)
  }

  /** 按伪 chunkId 批量删除（atom:/event:/note: 等命名空间行；删文档级联用） */
  async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return
    await getVectorStore().deleteByChunkIds(chunkIds)
  }

  /** 根据文档 ID 删除向量（通过关联切片） */
  async deleteByDocumentId(documentId: string): Promise<void> {
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.kbChunks) return

    const chunks = await dbManager.kbChunks.findByDocumentId(documentId)
    const chunkIds = chunks.map((c) => c.id)
    if (chunkIds.length > 0) {
      await getVectorStore().deleteByChunkIds(chunkIds)
    }
  }

  /** 根据知识库 ID 删除所有向量 */
  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await getVectorStore().deleteByKnowledgeBaseId(knowledgeBaseId)
  }

  /** 统计知识库的向量数量 */
  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return await getVectorStore().countByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * 向量相似度搜索（KNN topK）
   */
  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number,
  ): Promise<Array<{ chunkId: string; score: number }>> {
    const results = await getVectorStore().searchSimilar(
      knowledgeBaseId,
      queryVector,
      topK,
    )
    return results.map((r) => ({ chunkId: r.chunkId, score: r.score }))
  }
}
