/**
 * 知识库数据访问层
 * @module database/repositories/knowledge-base.repository
 * @description 提供知识库的数据库操作
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KnowledgeBaseStats
} from '@shared/types/knowledge-base.types'

/**
 * 知识库数据仓库
 */
export class KnowledgeBaseRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 KnowledgeBase 对象
   */
  private rowToEntity(row: any): KnowledgeBase {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      embeddingModel: row.embedding_model,
      embeddingDimension: row.embedding_dimension,
      embeddingConfig: row.embedding_config || undefined,
      documentCount: row.document_count,
      vectorCount: row.vector_count,
      totalSize: row.total_size,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 获取所有知识库
   */
  findAll(): KnowledgeBase[] {
    const rows = this.db.prepare(
      'SELECT * FROM knowledge_bases ORDER BY created_at DESC'
    ).all() as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据 ID 获取知识库
   */
  findById(id: string): KnowledgeBase | null {
    const row = this.db.prepare(
      'SELECT * FROM knowledge_bases WHERE id = ?'
    ).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据名称检查是否存在
   */
  existsByName(name: string): boolean {
    const row = this.db.prepare(
      'SELECT id FROM knowledge_bases WHERE name = ?'
    ).get(name) as any
    return !!row
  }

  /**
   * 创建知识库
   */
  create(request: CreateKnowledgeBaseRequest): KnowledgeBase {
    const id = randomUUID()
    const now = new Date().toISOString()

    // 从 embeddingConfig 中获取 provider 信息
    const embeddingConfig = request.embeddingConfig
    const provider = embeddingConfig?.provider || 'cloud'

    this.db.prepare(`
      INSERT INTO knowledge_bases (
        id, name, description, embedding_model, embedding_provider,
        embedding_dimension, embedding_config, document_count, vector_count, total_size,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(
      id,
      request.name,
      request.description || null,
      request.embeddingModel,
      provider,
      request.embeddingDimension,
      request.embeddingConfig ? JSON.stringify(request.embeddingConfig) : null,
      now,
      now
    )

    return {
      id,
      name: request.name,
      description: request.description,
      embeddingModel: request.embeddingModel,
      embeddingDimension: request.embeddingDimension,
      embeddingConfig: request.embeddingConfig ? JSON.stringify(request.embeddingConfig) : undefined,
      documentCount: 0,
      vectorCount: 0,
      totalSize: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 更新知识库
   */
  update(id: string, request: UpdateKnowledgeBaseRequest): boolean {
    const fields: string[] = []
    const values: any[] = []

    if (request.name !== undefined) {
      fields.push('name = ?')
      values.push(request.name)
    }
    if (request.description !== undefined) {
      fields.push('description = ?')
      values.push(request.description || null)
    }

    if (fields.length === 0) return false

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const result = this.db.prepare(
      `UPDATE knowledge_bases SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    return result.changes > 0
  }

  /**
   * 删除知识库
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM knowledge_bases WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 更新统计信息
   */
  updateStats(id: string, stats: KnowledgeBaseStats): void {
    this.db.prepare(`
      UPDATE knowledge_bases
      SET document_count = ?, vector_count = ?, total_size = ?, updated_at = ?
      WHERE id = ?
    `).run(stats.documentCount, stats.vectorCount, stats.totalSize, new Date().toISOString(), id)
  }

  /**
   * 增加文档计数
   */
  incrementDocumentCount(id: string, delta: number = 1): void {
    this.db.prepare(`
      UPDATE knowledge_bases
      SET document_count = document_count + ?, updated_at = ?
      WHERE id = ?
    `).run(delta, new Date().toISOString(), id)
  }

  /**
   * 增加向量计数
   */
  incrementVectorCount(id: string, delta: number): void {
    this.db.prepare(`
      UPDATE knowledge_bases
      SET vector_count = vector_count + ?, updated_at = ?
      WHERE id = ?
    `).run(delta, new Date().toISOString(), id)
  }

  /**
   * 增加总大小
   */
  incrementTotalSize(id: string, delta: number): void {
    this.db.prepare(`
      UPDATE knowledge_bases
      SET total_size = total_size + ?, updated_at = ?
      WHERE id = ?
    `).run(delta, new Date().toISOString(), id)
  }

  /**
   * 统计知识库数量
   */
  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM knowledge_bases'
    ).get() as { count: number }
    return row?.count || 0
  }
}