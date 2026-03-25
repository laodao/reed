/**
 * 向量数据访问层
 * @module database/repositories/kb-vector.repository
 * @description 提供向量的数据库操作
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

/**
 * 向量实体
 */
interface KbVectorEntity {
  id: string
  chunkId: string
  knowledgeBaseId: string
  vector: number[]
  createdAt: Date | string
}

/**
 * 向量数据仓库
 */
export class KbVectorRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为实体
   */
  private rowToEntity(row: any): KbVectorEntity {
    // 将 BLOB 转换为 Float32 数组，再转换为普通数组
    const vectorBuffer = row.vector as Buffer
    const float32Array = new Float32Array(
      vectorBuffer.buffer,
      vectorBuffer.byteOffset,
      vectorBuffer.byteLength / 4
    )
    return {
      id: row.id,
      chunkId: row.chunk_id,
      knowledgeBaseId: row.knowledge_base_id,
      vector: Array.from(float32Array),
      createdAt: new Date(row.created_at)
    }
  }

  /**
   * 将向量数组转换为 Buffer
   */
  private vectorToBuffer(vector: number[]): Buffer {
    const float32Array = new Float32Array(vector)
    return Buffer.from(float32Array.buffer)
  }

  /**
   * 创建向量
   */
  create(data: { chunkId: string; knowledgeBaseId: string; vector: number[] }): KbVectorEntity {
    const id = randomUUID()
    const now = new Date().toISOString()
    const vectorBuffer = this.vectorToBuffer(data.vector)

    this.db.prepare(`
      INSERT INTO kb_vectors (id, chunk_id, knowledge_base_id, vector, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.chunkId, data.knowledgeBaseId, vectorBuffer, now)

    return {
      id,
      chunkId: data.chunkId,
      knowledgeBaseId: data.knowledgeBaseId,
      vector: data.vector,
      createdAt: new Date(now)
    }
  }

  /**
   * 批量创建向量
   */
  createBatch(items: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>): void {
    const insert = this.db.prepare(`
      INSERT INTO kb_vectors (id, chunk_id, knowledge_base_id, vector, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const now = new Date().toISOString()

    const insertMany = this.db.transaction((data: typeof items) => {
      for (const item of data) {
        const id = randomUUID()
        const vectorBuffer = this.vectorToBuffer(item.vector)
        insert.run(id, item.chunkId, item.knowledgeBaseId, vectorBuffer, now)
      }
    })

    insertMany(items)
  }

  /**
   * 根据切片 ID 获取向量
   */
  findByChunkId(chunkId: string): KbVectorEntity | null {
    const row = this.db.prepare(
      'SELECT * FROM kb_vectors WHERE chunk_id = ?'
    ).get(chunkId) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据切片 ID 列表获取向量
   */
  findByChunkIds(chunkIds: string[]): Map<string, KbVectorEntity> {
    if (chunkIds.length === 0) return new Map()

    const placeholders = chunkIds.map(() => '?').join(',')
    const rows = this.db.prepare(
      `SELECT * FROM kb_vectors WHERE chunk_id IN (${placeholders})`
    ).all(...chunkIds) as any[]

    const result = new Map<string, KbVectorEntity>()
    for (const row of rows) {
      const entity = this.rowToEntity(row)
      result.set(entity.chunkId, entity)
    }
    return result
  }

  /**
   * 根据切片 ID 删除向量
   */
  deleteByChunkId(chunkId: string): void {
    this.db.prepare(
      'DELETE FROM kb_vectors WHERE chunk_id = ?'
    ).run(chunkId)
  }

  /**
   * 根据文档 ID 删除向量（通过关联切片）
   */
  deleteByDocumentId(documentId: string): void {
    this.db.prepare(`
      DELETE FROM kb_vectors
      WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE document_id = ?)
    `).run(documentId)
  }

  /**
   * 根据知识库 ID 删除所有向量
   */
  deleteByKnowledgeBaseId(knowledgeBaseId: string): void {
    this.db.prepare(
      'DELETE FROM kb_vectors WHERE knowledge_base_id = ?'
    ).run(knowledgeBaseId)
  }

  /**
   * 统计知识库的向量数量
   */
  countByKnowledgeBaseId(knowledgeBaseId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM kb_vectors WHERE knowledge_base_id = ?'
    ).get(knowledgeBaseId) as { count: number }
    return row?.count || 0
  }

  /**
   * 向量相似度搜索（余弦相似度）
   * 注意：这是基础实现，对于大规模数据建议使用 FAISS 或 hnswlib
   */
  searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number
  ): Array<{ chunkId: string; score: number }> {
    // 获取该知识库的所有向量
    const rows = this.db.prepare(`
      SELECT id, chunk_id, vector FROM kb_vectors WHERE knowledge_base_id = ?
    `).all(knowledgeBaseId) as any[]

    if (rows.length === 0) return []

    // 计算余弦相似度
    const results: Array<{ chunkId: string; score: number }> = []
    const queryNorm = Math.sqrt(queryVector.reduce((sum, v) => sum + v * v, 0))

    for (const row of rows) {
      const vectorBuffer = row.vector as Buffer
      const dbVector = Array.from(new Float32Array(
        vectorBuffer.buffer,
        vectorBuffer.byteOffset,
        vectorBuffer.byteLength / 4
      ))

      // 计算点积
      let dotProduct = 0
      let dbNorm = 0
      for (let i = 0; i < queryVector.length && i < dbVector.length; i++) {
        dotProduct += queryVector[i] * dbVector[i]
        dbNorm += dbVector[i] * dbVector[i]
      }
      dbNorm = Math.sqrt(dbNorm)

      // 余弦相似度
      const score = queryNorm > 0 && dbNorm > 0 ? dotProduct / (queryNorm * dbNorm) : 0

      results.push({ chunkId: row.chunk_id, score })
    }

    // 按相似度降序排序，返回 Top-K
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }
}