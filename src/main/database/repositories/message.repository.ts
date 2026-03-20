/**
 * 消息数据访问层
 * @module database/repositories/message
 * @description 提供消息的数据库操作
 */

import Database from 'better-sqlite3'
import type { Message, MessageRole, Attachment, MessageMetadata } from '../../../shared/types'
import { randomUUID } from 'crypto'

/**
 * 消息数据仓库
 */
export class MessageRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 解析附件列表
   */
  private parseAttachments(attachmentsStr: string | null): Attachment[] | undefined {
    if (!attachmentsStr) return undefined
    try {
      return JSON.parse(attachmentsStr)
    } catch {
      return undefined
    }
  }

  /**
   * 解析元数据
   */
  private parseMetadata(metadataStr: string | null): MessageMetadata | undefined {
    if (!metadataStr) return undefined
    try {
      return JSON.parse(metadataStr)
    } catch {
      return undefined
    }
  }

  /**
   * 获取对话的消息列表
   * @param dialogId - 对话ID
   * @returns Promise<Message[]>
   */
  async getByDialogId(dialogId: string): Promise<Message[]> {
    const rows = this.db.prepare(
      `SELECT id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at
       FROM messages
       WHERE dialog_id = ?
       ORDER BY created_at ASC`
    ).all(dialogId) as any[]

    return rows.map(row => ({
      id: row.id,
      dialogId: row.dialog_id,
      role: row.role as MessageRole,
      content: row.content,
      modelId: row.model_id || undefined,
      tokensUsed: row.tokens_used || undefined,
      attachments: this.parseAttachments(row.attachments),
      metadata: this.parseMetadata(row.metadata),
      createdAt: new Date(row.created_at)
    }))
  }

  /**
   * 创建消息
   * @param message - 消息数据
   * @returns Promise<Message>
   */
  async create(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const attachmentsStr = message.attachments ? JSON.stringify(message.attachments) : null
    const metadataStr = message.metadata ? JSON.stringify(message.metadata) : null

    this.db.prepare(
      `INSERT INTO messages (id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, message.dialogId, message.role, message.content,
      message.modelId || null, message.tokensUsed || null,
      attachmentsStr, metadataStr, now
    )

    // 更新对话的 updated_at 和 message_count
    this.db.prepare(
      `UPDATE dialogs SET updated_at = ?, message_count = message_count + 1 WHERE id = ?`
    ).run(now, message.dialogId)

    return {
      id,
      dialogId: message.dialogId,
      role: message.role,
      content: message.content,
      modelId: message.modelId,
      tokensUsed: message.tokensUsed,
      attachments: message.attachments,
      metadata: message.metadata,
      createdAt: new Date(now)
    }
  }

  /**
   * 获取最近 N 条消息
   * @param dialogId - 对话ID
   * @param limit - 数量限制
   * @returns Promise<Message[]>
   */
  async getRecent(dialogId: string, limit: number): Promise<Message[]> {
    const rows = this.db.prepare(
      `SELECT id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at
       FROM messages
       WHERE dialog_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(dialogId, limit) as any[]

    return rows.reverse().map(row => ({
      id: row.id,
      dialogId: row.dialog_id,
      role: row.role as MessageRole,
      content: row.content,
      modelId: row.model_id || undefined,
      tokensUsed: row.tokens_used || undefined,
      attachments: this.parseAttachments(row.attachments),
      metadata: this.parseMetadata(row.metadata),
      createdAt: new Date(row.created_at)
    }))
  }

  /**
   * 统计对话消息数量
   * @param dialogId - 对话ID
   * @returns Promise<number>
   */
  async count(dialogId: string): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE dialog_id = ?').get(dialogId) as { count: number }
    return row?.count || 0
  }

  /**
   * 删除对话的所有消息
   * @param dialogId - 对话ID
   * @returns Promise<void>
   */
  async deleteByDialogId(dialogId: string): Promise<void> {
    this.db.prepare('DELETE FROM messages WHERE dialog_id = ?').run(dialogId)
    // 重置对话的 message_count
    this.db.prepare('UPDATE dialogs SET message_count = 0 WHERE id = ?').run(dialogId)
  }

  /**
   * 更新消息内容
   * @param id - 消息ID
   * @param content - 新内容
   * @returns Promise<void>
   */
  async updateContent(id: string, content: string): Promise<void> {
    this.db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id)
  }

  /**
   * 更新消息元数据
   * @param id - 消息ID
   * @param metadata - 元数据
   * @returns Promise<void>
   */
  async updateMetadata(id: string, metadata: MessageMetadata): Promise<void> {
    this.db.prepare('UPDATE messages SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), id)
  }

  /**
   * 根据 ID 获取消息
   * @param id - 消息ID
   * @returns Promise<Message | null>
   */
  async getById(id: string): Promise<Message | null> {
    const row = this.db.prepare(
      `SELECT id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at
       FROM messages
       WHERE id = ?`
    ).get(id) as any

    if (!row) return null

    return {
      id: row.id,
      dialogId: row.dialog_id,
      role: row.role as MessageRole,
      content: row.content,
      modelId: row.model_id || undefined,
      tokensUsed: row.tokens_used || undefined,
      attachments: this.parseAttachments(row.attachments),
      metadata: this.parseMetadata(row.metadata),
      createdAt: new Date(row.created_at)
    }
  }
}