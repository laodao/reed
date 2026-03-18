/**
 * 消息数据访问层
 * @module database/repositories/message
 * @description 提供消息的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { Message, MessageRole, Attachment, MessageMetadata } from '../../../shared/types'
import type { DatabaseManager } from '../index'
import { randomUUID } from 'crypto'

/**
 * 消息数据仓库
 */
export class MessageRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
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
    const result = this.db.exec(
      `SELECT id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at
       FROM messages
       WHERE dialog_id = ?
       ORDER BY created_at ASC`,
      [dialogId]
    )
    const messages: Message[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        messages.push({
          id: row[0] as string,
          dialogId: row[1] as string,
          role: row[2] as MessageRole,
          content: row[3] as string,
          modelId: (row[4] as string) || undefined,
          tokensUsed: (row[5] as number) || undefined,
          attachments: this.parseAttachments(row[6] as string | null),
          metadata: this.parseMetadata(row[7] as string | null),
          createdAt: new Date(row[8] as string)
        })
      })
    }
    return messages
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

    this.db.run(
      `INSERT INTO messages (id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, message.dialogId, message.role, message.content,
       message.modelId || null, message.tokensUsed || null,
       attachmentsStr, metadataStr, now]
    )
    this.dbManager.save()
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
    const result = this.db.exec(
      `SELECT id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at
       FROM messages
       WHERE dialog_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [dialogId, limit]
    )
    const messages: Message[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        messages.push({
          id: row[0] as string,
          dialogId: row[1] as string,
          role: row[2] as MessageRole,
          content: row[3] as string,
          modelId: (row[4] as string) || undefined,
          tokensUsed: (row[5] as number) || undefined,
          attachments: this.parseAttachments(row[6] as string | null),
          metadata: this.parseMetadata(row[7] as string | null),
          createdAt: new Date(row[8] as string)
        })
      })
    }
    return messages.reverse()
  }

  /**
   * 统计对话消息数量
   * @param dialogId - 对话ID
   * @returns Promise<number>
   */
  async count(dialogId: string): Promise<number> {
    const result = this.db.exec('SELECT COUNT(*) as count FROM messages WHERE dialog_id = ?', [dialogId])
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number
    }
    return 0
  }

  /**
   * 删除对话的所有消息
   * @param dialogId - 对话ID
   * @returns Promise<void>
   */
  async deleteByDialogId(dialogId: string): Promise<void> {
    this.db.run('DELETE FROM messages WHERE dialog_id = ?', [dialogId])
    this.dbManager.save()
  }

  /**
   * 更新消息内容
   * @param id - 消息ID
   * @param content - 新内容
   * @returns Promise<void>
   */
  async updateContent(id: string, content: string): Promise<void> {
    this.db.run('UPDATE messages SET content = ? WHERE id = ?', [content, id])
    this.dbManager.save()
  }

  /**
   * 更新消息元数据
   * @param id - 消息ID
   * @param metadata - 元数据
   * @returns Promise<void>
   */
  async updateMetadata(id: string, metadata: MessageMetadata): Promise<void> {
    this.db.run('UPDATE messages SET metadata = ? WHERE id = ?', [JSON.stringify(metadata), id])
    this.dbManager.save()
  }

  /**
   * 根据 ID 获取消息
   * @param id - 消息ID
   * @returns Promise<Message | null>
   */
  async getById(id: string): Promise<Message | null> {
    const result = this.db.exec(
      `SELECT id, dialog_id, role, content, model_id, tokens_used, attachments, metadata, created_at
       FROM messages
       WHERE id = ?`,
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0]
      return {
        id: row[0] as string,
        dialogId: row[1] as string,
        role: row[2] as MessageRole,
        content: row[3] as string,
        modelId: (row[4] as string) || undefined,
        tokensUsed: (row[5] as number) || undefined,
        attachments: this.parseAttachments(row[6] as string | null),
        metadata: this.parseMetadata(row[7] as string | null),
        createdAt: new Date(row[8] as string)
      }
    }
    return null
  }
}
