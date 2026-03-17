/**
 * 对话数据访问层
 * @module database/repositories/dialog
 * @description 提供对话的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { Dialog } from '../../../shared/types'
import type { DatabaseManager } from '../index'
import { randomUUID } from 'crypto'

/**
 * 对话数据仓库
 */
export class DialogRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
  }

  /**
   * 获取所有对话
   * @returns Promise<Dialog[]>
   */
  async getAll(): Promise<Dialog[]> {
    const result = this.db.exec(
      'SELECT id, title, model_id, role_id, system_prompt, created_at, updated_at, message_count FROM dialogs ORDER BY updated_at DESC'
    )
    const dialogs: Dialog[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        dialogs.push({
          id: row[0] as string,
          title: row[1] as string,
          modelId: row[2] as string,
          roleId: (row[3] as string) || undefined,
          systemPrompt: (row[4] as string) || undefined,
          createdAt: new Date(row[5] as string),
          updatedAt: new Date(row[6] as string),
          messageCount: row[7] as number
        })
      })
    }
    return dialogs
  }

  /**
   * 根据ID获取对话
   * @param id - 对话ID
   * @returns Promise<Dialog | null>
   */
  async getById(id: string): Promise<Dialog | null> {
    const result = this.db.exec(
      'SELECT id, title, model_id, role_id, system_prompt, created_at, updated_at, message_count FROM dialogs WHERE id = ?',
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0]
      return {
        id: row[0] as string,
        title: row[1] as string,
        modelId: row[2] as string,
        roleId: (row[3] as string) || undefined,
        systemPrompt: (row[4] as string) || undefined,
        createdAt: new Date(row[5] as string),
        updatedAt: new Date(row[6] as string),
        messageCount: row[7] as number
      }
    }
    return null
  }

  /**
   * 创建对话
   * @param dialog - 对话数据
   * @returns Promise<Dialog>
   */
  async create(dialog: Omit<Dialog, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>): Promise<Dialog> {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO dialogs (id, title, model_id, role_id, system_prompt, created_at, updated_at, message_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, dialog.title, dialog.modelId, dialog.roleId || null, dialog.systemPrompt || null, now, now]
    )
    this.dbManager.save()
    return {
      id,
      title: dialog.title,
      modelId: dialog.modelId,
      roleId: dialog.roleId,
      systemPrompt: dialog.systemPrompt,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      messageCount: 0
    }
  }

  /**
   * 更新对话
   * @param id - 对话ID
   * @param data - 更新数据
   * @returns Promise<void>
   */
  async update(id: string, data: Partial<Dialog>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (data.title !== undefined) {
      fields.push('title = ?')
      values.push(data.title)
    }
    if (data.systemPrompt !== undefined) {
      fields.push('system_prompt = ?')
      values.push(data.systemPrompt)
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime("now")')
      values.push(id)
      this.db.run(`UPDATE dialogs SET ${fields.join(', ')} WHERE id = ?`, values)
      this.dbManager.save()
    }
  }

  /**
   * 删除对话
   * @param id - 对话ID
   * @returns Promise<void>
   */
  async delete(id: string): Promise<void> {
    // 先删除关联的消息
    this.db.run('DELETE FROM messages WHERE dialog_id = ?', [id])
    // 再删除对话
    this.db.run('DELETE FROM dialogs WHERE id = ?', [id])
    this.dbManager.save()
  }

  /**
   * 更新消息计数
   * @param id - 对话ID
   * @param count - 消息数量
   * @returns Promise<void>
   */
  async updateMessageCount(id: string, count: number): Promise<void> {
    this.db.run('UPDATE dialogs SET message_count = ?, updated_at = datetime("now") WHERE id = ?', [count, id])
    this.dbManager.save()
  }

  /**
   * 更新对话时间戳
   * @param id - 对话ID
   * @returns Promise<void>
   */
  async touch(id: string): Promise<void> {
    this.db.run('UPDATE dialogs SET updated_at = datetime("now") WHERE id = ?', [id])
    this.dbManager.save()
  }
}
