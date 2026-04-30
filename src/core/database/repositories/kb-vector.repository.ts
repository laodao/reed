/**
 * 向量数据访问层
 * @module database/repositories/kb-vector.repository
 * @description 使用 LanceDB 提供高效的向量存储和检索操作
 */

import { LanceDBService, VectorRecord } from '@core/services/lance-db.service'
import { getCoreDatabaseManager } from '../database-manager.interface'
import { randomUUID } from 'crypto'

/**
 * 向量实体（兼容旧接口）
 */
export interface KbVectorEntity {
  id: string
  chunkId: string
  knowledgeBaseId: string
  vector: number[]
  createdAt: Date | string
}

/**
 * 向量数据仓库
 * 使用 LanceDB 进行向量存储和检索
 */
export class KbVectorRepository {
  private lanceDB: LanceDBService

  constructor() {
    this.lanceDB = LanceDBService.getInstance()
  }

  /**
   * 创建向量
   */
  async create(data: { chunkId: string; knowledgeBaseId: string; vector: number[] }): Promise<KbVectorEntity> {
    const id = randomUUID()
    const now = new Date().toISOString()

    const record: VectorRecord = {
      id,
      chunkId: data.chunkId,
      knowledgeBaseId: data.knowledgeBaseId,
      vector: data.vector,
      createdAt: now
    }

    await this.lanceDB.insertVectors([record])

    return {
      id,
      chunkId: data.chunkId,
      knowledgeBaseId: data.knowledgeBaseId,
      vector: data.vector,
      createdAt: now
    }
  }

  /**
   * 批量创建向量
   */
  async createBatch(items: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>): Promise<void> {
    const now = new Date().toISOString()

    const records: VectorRecord[] = items.map(item => ({
      id: randomUUID(),
      chunkId: item.chunkId,
      knowledgeBaseId: item.knowledgeBaseId,
      vector: item.vector,
      createdAt: now
    }))

    await this.lanceDB.insertVectors(records)
  }

  /**
   * 根据切片 ID 获取向量
   */
  async findByChunkId(chunkId: string): Promise<KbVectorEntity | null> {
    const record = await this.lanceDB.getVectorByChunkId(chunkId)
    if (!record) return null

    return {
      id: record.id,
      chunkId: record.chunkId,
      knowledgeBaseId: record.knowledgeBaseId,
      vector: record.vector,
      createdAt: record.createdAt
    }
  }

  /**
   * 根据切片 ID 列表获取向量
   */
  async findByChunkIds(chunkIds: string[]): Promise<Map<string, KbVectorEntity>> {
    const result = new Map<string, KbVectorEntity>()

    // LanceDB 不支持批量查询，需要逐个查询
    // 对于大量数据，可以考虑优化
    for (const chunkId of chunkIds) {
      const entity = await this.findByChunkId(chunkId)
      if (entity) {
        result.set(chunkId, entity)
      }
    }

    return result
  }

  /**
   * 根据切片 ID 删除向量
   */
  async deleteByChunkId(chunkId: string): Promise<void> {
    await this.lanceDB.deleteByChunkId(chunkId)
  }

  /**
   * 根据文档 ID 删除向量（通过关联切片）
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    // 需要先从 SQLite 查询该文档的所有切片 ID
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.kbChunks) return

    const chunks = await dbManager.kbChunks.findByDocumentId(documentId)
    const chunkIds = chunks.map(c => c.id)

    if (chunkIds.length > 0) {
      await this.lanceDB.deleteByChunkIds(chunkIds)
    }
  }

  /**
   * 根据知识库 ID 删除所有向量
   */
  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.lanceDB.deleteByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * 统计知识库的向量数量
   */
  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return await this.lanceDB.countByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * 向量相似度搜索
   * 使用 LanceDB 内置索引进行高效检索
   */
  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number
  ): Promise<Array<{ chunkId: string; score: number }>> {
    return await this.lanceDB.searchSimilar(knowledgeBaseId, queryVector, topK)
  }
}