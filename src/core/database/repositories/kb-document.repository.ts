/**
 * 知识库文档数据访问层
 * @module database/repositories/kb-document.repository
 * @description 提供知识库文档的数据库操作
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  KbDocument,
  CreateDocumentRequest,
  DocumentStatus,
  DocumentMetadata
} from '@shared/types/knowledge-base.types'

/**
 * 知识库文档数据仓库
 */
export class KbDocumentRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 KbDocument 对象
   */
  private rowToEntity(row: any): KbDocument {
    return {
      id: row.id,
      knowledgeBaseId: row.knowledge_base_id,
      name: row.name,
      filePath: row.file_path,
      fileType: row.file_type,
      fileSize: row.file_size,
      status: row.status,
      progress: row.progress,
      chunkCount: row.chunk_count,
      errorMessage: row.error_message || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 获取知识库的所有文档
   */
  findByKnowledgeBaseId(knowledgeBaseId: string): KbDocument[] {
    const rows = this.db.prepare(
      'SELECT * FROM kb_documents WHERE knowledge_base_id = ? ORDER BY created_at DESC'
    ).all(knowledgeBaseId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据 ID 获取文档
   */
  findById(id: string): KbDocument | null {
    const row = this.db.prepare(
      'SELECT * FROM kb_documents WHERE id = ?'
    ).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据状态获取文档
   */
  findByStatus(status: DocumentStatus): KbDocument[] {
    const rows = this.db.prepare(
      'SELECT * FROM kb_documents WHERE status = ? ORDER BY created_at ASC'
    ).all(status) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 创建文档
   */
  create(request: CreateDocumentRequest): KbDocument {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO kb_documents (
        id, knowledge_base_id, name, file_path, file_type, file_size,
        status, progress, chunk_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
    `).run(
      id,
      request.knowledgeBaseId,
      request.name,
      request.filePath,
      request.fileType,
      request.fileSize,
      now,
      now
    )

    return {
      id,
      knowledgeBaseId: request.knowledgeBaseId,
      name: request.name,
      filePath: request.filePath,
      fileType: request.fileType,
      fileSize: request.fileSize,
      status: 'pending',
      progress: 0,
      chunkCount: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 批量创建文档
   */
  createBatch(requests: CreateDocumentRequest[]): KbDocument[] {
    const insert = this.db.prepare(`
      INSERT INTO kb_documents (
        id, knowledge_base_id, name, file_path, file_type, file_size,
        status, progress, chunk_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
    `)

    const now = new Date().toISOString()
    const documents: KbDocument[] = []

    const insertMany = this.db.transaction((items: CreateDocumentRequest[]) => {
      for (const request of items) {
        const id = randomUUID()
        insert.run(
          id,
          request.knowledgeBaseId,
          request.name,
          request.filePath,
          request.fileType,
          request.fileSize,
          now,
          now
        )
        documents.push({
          id,
          knowledgeBaseId: request.knowledgeBaseId,
          name: request.name,
          filePath: request.filePath,
          fileType: request.fileType,
          fileSize: request.fileSize,
          status: 'pending',
          progress: 0,
          chunkCount: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now)
        })
      }
    })

    insertMany(requests)
    return documents
  }

  /**
   * 更新处理进度
   */
  updateProgress(id: string, progress: number): void {
    this.db.prepare(`
      UPDATE kb_documents
      SET progress = ?, status = 'processing', updated_at = ?
      WHERE id = ?
    `).run(progress, new Date().toISOString(), id)
  }

  /**
   * 标记为处理完成
   */
  markCompleted(id: string, chunkCount: number): void {
    this.db.prepare(`
      UPDATE kb_documents
      SET status = 'completed', progress = 100, chunk_count = ?, updated_at = ?
      WHERE id = ?
    `).run(chunkCount, new Date().toISOString(), id)
  }

  /**
   * 标记为处理失败
   */
  markFailed(id: string, errorMessage: string): void {
    this.db.prepare(`
      UPDATE kb_documents
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(errorMessage, new Date().toISOString(), id)
  }

  /**
   * 更新元数据
   */
  updateMetadata(id: string, metadata: DocumentMetadata): void {
    this.db.prepare(`
      UPDATE kb_documents
      SET metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(metadata), new Date().toISOString(), id)
  }

  /**
   * 删除文档
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM kb_documents WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 删除知识库的所有文档
   */
  deleteByKnowledgeBaseId(knowledgeBaseId: string): void {
    this.db.prepare(
      'DELETE FROM kb_documents WHERE knowledge_base_id = ?'
    ).run(knowledgeBaseId)
  }

  /**
   * 统计知识库的文档数量
   */
  countByKnowledgeBaseId(knowledgeBaseId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM kb_documents WHERE knowledge_base_id = ?'
    ).get(knowledgeBaseId) as { count: number }
    return row?.count || 0
  }

  /**
   * 统计知识库的总大小
   */
  sumSizeByKnowledgeBaseId(knowledgeBaseId: string): number {
    const row = this.db.prepare(
      'SELECT SUM(file_size) as total FROM kb_documents WHERE knowledge_base_id = ?'
    ).get(knowledgeBaseId) as { total: number | null }
    return row?.total || 0
  }
}