/**
 * 设计对话消息仓库
 * @module database/repositories/lw-design-message.repository
 * 符合第三范式，替代JSON存储
 */

import Database from 'better-sqlite3'
import { DesignMessage } from '../../../shared/types/longwriting.types'

/**
 * 设计对话消息仓库
 */
export class LwDesignMessageRepository {
  constructor(private db: Database.Database) {}

  /**
   * 根据对话ID获取所有消息
   */
  getByConversationId(conversationId: string): DesignMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lw_design_messages WHERE conversation_id = ? ORDER BY sort_order ASC, timestamp ASC
    `)
    const rows = stmt.all(conversationId) as any[]
    return rows.map(this.mapToMessage)
  }

  /**
   * 根据ID获取消息
   */
  getById(id: string): DesignMessage | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_design_messages WHERE id = ?`)
    const row = stmt.get(id) as any
    return row ? this.mapToMessage(row) : null
  }

  /**
   * 获取对话的消息数量
   */
  countByConversationId(conversationId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM lw_design_messages WHERE conversation_id = ?
    `)
    const result = stmt.get(conversationId) as any
    return result?.count || 0
  }

  /**
   * 添加消息
   */
  add(conversationId: string, message: Omit<DesignMessage, 'timestamp'> & { timestamp?: number }): DesignMessage {
    const id = this.generateId()
    const now = Date.now()
    const timestamp = message.timestamp || now

    // 获取当前最大排序号
    const maxOrderStmt = this.db.prepare(`
      SELECT MAX(sort_order) as max_order FROM lw_design_messages WHERE conversation_id = ?
    `)
    const maxOrderResult = maxOrderStmt.get(conversationId) as any
    const sortOrder = (maxOrderResult?.max_order ?? -1) + 1

    const stmt = this.db.prepare(`
      INSERT INTO lw_design_messages (id, conversation_id, role, content, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, conversationId, message.role, message.content, timestamp, sortOrder)

    return {
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp
    }
  }

  /**
   * 批量添加消息（事务）
   */
  batchAdd(conversationId: string, messages: DesignMessage[]): void {
    if (messages.length === 0) return

    const stmt = this.db.prepare(`
      INSERT INTO lw_design_messages (id, conversation_id, role, content, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      messages.forEach((msg, index) => {
        const id = this.generateId()
        stmt.run(id, conversationId, msg.role, msg.content, msg.timestamp, index)
      })
    })

    transaction()
  }

  /**
   * 替换对话的所有消息
   */
  replaceAll(conversationId: string, messages: DesignMessage[]): void {
    const transaction = this.db.transaction(() => {
      // 先删除现有消息
      this.deleteByConversationId(conversationId)
      // 再添加新消息
      this.batchAdd(conversationId, messages)
    })
    transaction()
  }

  /**
   * 删除消息
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM lw_design_messages WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 删除对话的所有消息
   */
  deleteByConversationId(conversationId: string): number {
    const stmt = this.db.prepare('DELETE FROM lw_design_messages WHERE conversation_id = ?')
    const result = stmt.run(conversationId)
    return result.changes
  }

  /**
   * 迁移：从JSON字段迁移到关联表
   */
  migrateFromJson(conversationId: string): number {
    // 获取对话的消息JSON
    const stmt = this.db.prepare(`
      SELECT messages FROM lw_design_conversations WHERE id = ?
    `)
    const result = stmt.get(conversationId) as any

    if (!result?.messages) return 0

    const messages: DesignMessage[] = this.parseJsonArray(result.messages)
    if (messages.length === 0) return 0

    this.batchAdd(conversationId, messages)
    return messages.length
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `dm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 映射数据库行到消息对象
   */
  private mapToMessage(row: any): DesignMessage {
    return {
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: row.timestamp
    }
  }

  /**
   * 解析JSON数组
   */
  private parseJsonArray(jsonStr: string | null): DesignMessage[] {
    if (!jsonStr) return []
    try {
      return JSON.parse(jsonStr)
    } catch {
      return []
    }
  }
}