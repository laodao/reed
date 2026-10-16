/**
 * 倒排索引数据访问层
 * @module database/repositories/kb-inverted-index.repository
 * @description 提供 BM25 关键词检索的倒排索引数据库操作
 */

import Database from 'better-sqlite3'

/**
 * 倒排索引项
 */
interface InvertedIndexItem {
  id: number
  term: string
  chunkId: string
  knowledgeBaseId: string
  termFrequency: number
  positions?: number[]
}

/**
 * 倒排索引数据仓库
 */
export class KbInvertedIndexRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 插入或更新索引项
   */
  upsert(data: {
    term: string
    chunkId: string
    knowledgeBaseId: string
    termFrequency: number
    positions?: number[]
  }): void {
    const positionsJson = data.positions ? JSON.stringify(data.positions) : null

    // 使用 INSERT OR REPLACE
    this.db.prepare(`
      INSERT OR REPLACE INTO kb_inverted_index (
        term, chunk_id, knowledge_base_id, term_frequency, positions
      ) VALUES (?, ?, ?, ?, ?)
    `).run(data.term, data.chunkId, data.knowledgeBaseId, data.termFrequency, positionsJson)
  }

  /**
   * 批量插入索引项
   */
  insertBatch(items: Array<{
    term: string
    chunkId: string
    knowledgeBaseId: string
    termFrequency: number
    positions?: number[]
  }>): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO kb_inverted_index (
        term, chunk_id, knowledge_base_id, term_frequency, positions
      ) VALUES (?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction((data: typeof items) => {
      for (const item of data) {
        const positionsJson = item.positions ? JSON.stringify(item.positions) : null
        insert.run(item.term, item.chunkId, item.knowledgeBaseId, item.termFrequency, positionsJson)
      }
    })

    insertMany(items)
  }

  /**
   * 根据词项和知识库查询
   */
  findByTerm(knowledgeBaseId: string, term: string): InvertedIndexItem[] {
    const rows = this.db.prepare(`
      SELECT id, term, chunk_id, knowledge_base_id, term_frequency, positions
      FROM kb_inverted_index
      WHERE knowledge_base_id = ? AND term = ?
    `).all(knowledgeBaseId, term) as any[]

    return rows.map(row => this.rowToEntity(row))
  }

  /**
   * 根据多个词项查询
   */
  findByTerms(knowledgeBaseId: string, terms: string[]): Map<string, InvertedIndexItem[]> {
    if (terms.length === 0) return new Map()

    const placeholders = terms.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT id, term, chunk_id, knowledge_base_id, term_frequency, positions
      FROM kb_inverted_index
      WHERE knowledge_base_id = ? AND term IN (${placeholders})
    `).all(knowledgeBaseId, ...terms) as any[]

    const result = new Map<string, InvertedIndexItem[]>()
    for (const row of rows) {
      const item = this.rowToEntity(row)
      const existing = result.get(item.term) || []
      existing.push(item)
      result.set(item.term, existing)
    }
    return result
  }

  /**
   * 根据切片 ID 删除索引
   */
  deleteByChunkId(chunkId: string): void {
    this.db.prepare(
      'DELETE FROM kb_inverted_index WHERE chunk_id = ?'
    ).run(chunkId)
  }

  /**
   * 根据文档 ID 删除索引（通过关联切片）
   */
  deleteByDocumentId(documentId: string): void {
    this.db.prepare(`
      DELETE FROM kb_inverted_index
      WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE document_id = ?)
    `).run(documentId)
  }

  /**
   * 根据知识库 ID 删除所有索引
   */
  deleteByKnowledgeBaseId(knowledgeBaseId: string): void {
    this.db.prepare(
      'DELETE FROM kb_inverted_index WHERE knowledge_base_id = ?'
    ).run(knowledgeBaseId)
  }

  /**
   * 获取知识库的文档频率统计（每个词出现在多少文档中）
   */
  getDocumentFrequencies(knowledgeBaseId: string): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT term, COUNT(DISTINCT chunk_id) as df
      FROM kb_inverted_index
      WHERE knowledge_base_id = ?
      GROUP BY term
    `).all(knowledgeBaseId) as any[]

    const result = new Map<string, number>()
    for (const row of rows) {
      result.set(row.term, row.df)
    }
    return result
  }

  /**
   * 获取知识库的总切片数
   */
  getChunkCount(knowledgeBaseId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT chunk_id) as count
      FROM kb_inverted_index
      WHERE knowledge_base_id = ?
    `).get(knowledgeBaseId) as { count: number }
    return row?.count || 0
  }

  /**
   * 获取切片的平均长度（词项总数 / 切片数）
   */
  getAverageChunkLength(knowledgeBaseId: string): number {
    const row = this.db.prepare(`
      SELECT
        SUM(term_frequency) as total_terms,
        COUNT(DISTINCT chunk_id) as chunk_count
      FROM kb_inverted_index
      WHERE knowledge_base_id = ?
    `).get(knowledgeBaseId) as { total_terms: number; chunk_count: number } | undefined

    if (!row || row.chunk_count === 0) return 0
    return row.total_terms / row.chunk_count
  }

  /**
   * 将数据库行转换为实体
   */
  private rowToEntity(row: any): InvertedIndexItem {
    return {
      id: row.id,
      term: row.term,
      chunkId: row.chunk_id,
      knowledgeBaseId: row.knowledge_base_id,
      termFrequency: row.term_frequency,
      positions: row.positions ? JSON.parse(row.positions) : undefined
    }
  }
}