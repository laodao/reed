/**
 * 文档切片数据访问层
 * @module database/repositories/kb-chunk.repository
 * @description 提供文档切片的数据库操作
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { KbChunk, CreateChunkRequest, ChunkMetadata } from '../../../shared/types/knowledge-base.types'

/**
 * 文档切片数据仓库
 */
export class KbChunkRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 将数据库行转换为 KbChunk 对象
   */
  private rowToEntity(row: any): KbChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      knowledgeBaseId: row.knowledge_base_id,
      content: row.content,
      chunkIndex: row.chunk_index,
      startOffset: row.start_offset ?? undefined,
      endOffset: row.end_offset ?? undefined,
      title: row.title ?? undefined,
      level: row.level ?? undefined,
      parentChunkId: row.parent_chunk_id ?? undefined,
      splitMethod: row.split_method ?? undefined,
      sectionPath: row.section_path ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at)
    }
  }

  /**
   * 根据 ID 获取切片
   */
  findById(id: string): KbChunk | null {
    const row = this.db.prepare(
      'SELECT * FROM kb_chunks WHERE id = ?'
    ).get(id) as any
    if (!row) return null
    return this.rowToEntity(row)
  }

  /**
   * 根据文档 ID 获取所有切片
   */
  findByDocumentId(documentId: string): KbChunk[] {
    const rows = this.db.prepare(
      'SELECT * FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index ASC'
    ).all(documentId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据文档 ID 分页获取切片（用于大文档处理，减少内存占用）
   */
  findByDocumentIdPaginated(documentId: string, offset: number, limit: number): KbChunk[] {
    const rows = this.db.prepare(
      'SELECT * FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index ASC LIMIT ? OFFSET ?'
    ).all(documentId, limit, offset) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据文档 ID 获取切片数量
   */
  countByDocumentIdPaginated(documentId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM kb_chunks WHERE document_id = ?'
    ).get(documentId) as { count: number }
    return row?.count || 0
  }

  /**
   * 根据知识库 ID 获取所有切片
   */
  findByKnowledgeBaseId(knowledgeBaseId: string): KbChunk[] {
    const rows = this.db.prepare(
      'SELECT * FROM kb_chunks WHERE knowledge_base_id = ? ORDER BY created_at ASC'
    ).all(knowledgeBaseId) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 创建切片
   */
  create(request: CreateChunkRequest): KbChunk {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO kb_chunks (
        id, document_id, knowledge_base_id, content, chunk_index,
        start_offset, end_offset, title, level, parent_chunk_id,
        split_method, section_path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      request.documentId,
      request.knowledgeBaseId,
      request.content,
      request.chunkIndex,
      request.startOffset ?? null,
      request.endOffset ?? null,
      request.title ?? null,
      request.level ?? null,
      request.parentChunkId ?? null,
      request.splitMethod ?? null,
      request.sectionPath ? JSON.stringify(request.sectionPath) : null,
      request.metadata ? JSON.stringify(request.metadata) : null,
      now
    )

    return {
      id,
      documentId: request.documentId,
      knowledgeBaseId: request.knowledgeBaseId,
      content: request.content,
      chunkIndex: request.chunkIndex,
      startOffset: request.startOffset,
      endOffset: request.endOffset,
      title: request.title,
      level: request.level,
      parentChunkId: request.parentChunkId,
      splitMethod: request.splitMethod,
      sectionPath: request.sectionPath ? JSON.stringify(request.sectionPath) : undefined,
      metadata: request.metadata,
      createdAt: new Date(now)
    }
  }

  /**
   * 批量创建切片
   */
  createBatch(requests: CreateChunkRequest[]): KbChunk[] {
    const insert = this.db.prepare(`
      INSERT INTO kb_chunks (
        id, document_id, knowledge_base_id, content, chunk_index,
        start_offset, end_offset, title, level, parent_chunk_id,
        split_method, section_path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const now = new Date().toISOString()
    const chunks: KbChunk[] = []

    const insertMany = this.db.transaction((items: CreateChunkRequest[]) => {
      for (const request of items) {
        const id = randomUUID()
        insert.run(
          id,
          request.documentId,
          request.knowledgeBaseId,
          request.content,
          request.chunkIndex,
          request.startOffset ?? null,
          request.endOffset ?? null,
          request.title ?? null,
          request.level ?? null,
          request.parentChunkId ?? null,
          request.splitMethod ?? null,
          request.sectionPath ? JSON.stringify(request.sectionPath) : null,
          request.metadata ? JSON.stringify(request.metadata) : null,
          now
        )
        chunks.push({
          id,
          documentId: request.documentId,
          knowledgeBaseId: request.knowledgeBaseId,
          content: request.content,
          chunkIndex: request.chunkIndex,
          startOffset: request.startOffset,
          endOffset: request.endOffset,
          title: request.title,
          level: request.level,
          parentChunkId: request.parentChunkId,
          splitMethod: request.splitMethod,
          sectionPath: request.sectionPath ? JSON.stringify(request.sectionPath) : undefined,
          metadata: request.metadata,
          createdAt: new Date(now)
        })
      }
    })

    insertMany(requests)
    return chunks
  }

  /**
   * 删除切片
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM kb_chunks WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }

  /**
   * 根据文档 ID 删除所有切片
   */
  deleteByDocumentId(documentId: string): void {
    this.db.prepare(
      'DELETE FROM kb_chunks WHERE document_id = ?'
    ).run(documentId)
  }

  /**
   * 根据知识库 ID 删除所有切片
   */
  deleteByKnowledgeBaseId(knowledgeBaseId: string): void {
    this.db.prepare(
      'DELETE FROM kb_chunks WHERE knowledge_base_id = ?'
    ).run(knowledgeBaseId)
  }

  /**
   * 统计文档的切片数量
   */
  countByDocumentId(documentId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM kb_chunks WHERE document_id = ?'
    ).get(documentId) as { count: number }
    return row?.count || 0
  }

  /**
   * 统计知识库的切片数量
   */
  countByKnowledgeBaseId(knowledgeBaseId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM kb_chunks WHERE knowledge_base_id = ?'
    ).get(knowledgeBaseId) as { count: number }
    return row?.count || 0
  }

  /**
   * 根据切片 ID 列表获取切片
   */
  findByIds(ids: string[]): KbChunk[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db.prepare(
      `SELECT * FROM kb_chunks WHERE id IN (${placeholders})`
    ).all(...ids) as any[]
    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据标题查找切片
   */
  findByTitle(documentId: string, title: string): KbChunk | null {
    const row = this.db.prepare(
      'SELECT * FROM kb_chunks WHERE document_id = ? AND title = ?'
    ).get(documentId, title) as any
    if (!row) return null
    return this.rowToEntity(row)
  }
}