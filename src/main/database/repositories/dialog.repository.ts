/**
 * 对话数据访问层
 * @module database/repositories/dialog
 * @description 提供对话的数据库操作
 */

import Database from 'better-sqlite3'
import type { Dialog, ContextConfig } from '../../../shared/types'
import { randomUUID } from 'crypto'

/**
 * 对话数据仓库
 */
export class DialogRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 解析上下文配置
   */
  private parseContextConfig(configStr: string | null): ContextConfig | undefined {
    if (!configStr) return undefined
    try {
      return JSON.parse(configStr)
    } catch {
      return undefined
    }
  }

  /**
   * 获取所有对话
   * @returns Promise<Dialog[]>
   */
  async getAll(): Promise<Dialog[]> {
    const rows = this.db.prepare(
      `SELECT id, title, model_id, provider_config_id, role_id, system_prompt,
              context_config, created_at, updated_at, message_count
       FROM dialogs
       ORDER BY updated_at DESC`
    ).all() as any[]

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      modelId: row.model_id,
      providerConfigId: row.provider_config_id || undefined,
      roleId: row.role_id || undefined,
      systemPrompt: row.system_prompt || undefined,
      contextConfig: this.parseContextConfig(row.context_config),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }))
  }

  /**
   * 根据角色 ID 获取对话列表
   * @param roleId - 角色 ID
   * @returns Promise<Dialog[]>
   */
  async getByRoleId(roleId: string | null): Promise<Dialog[]> {
    const rows = roleId
      ? this.db.prepare(
          `SELECT id, title, model_id, provider_config_id, role_id, system_prompt,
                  context_config, created_at, updated_at, message_count
           FROM dialogs
           WHERE role_id = ?
           ORDER BY updated_at DESC`
        ).all(roleId) as any[]
      : this.db.prepare(
          `SELECT id, title, model_id, provider_config_id, role_id, system_prompt,
                  context_config, created_at, updated_at, message_count
           FROM dialogs
           WHERE role_id IS NULL
           ORDER BY updated_at DESC`
        ).all() as any[]

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      modelId: row.model_id,
      providerConfigId: row.provider_config_id || undefined,
      roleId: row.role_id || undefined,
      systemPrompt: row.system_prompt || undefined,
      contextConfig: this.parseContextConfig(row.context_config),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }))
  }

  /**
   * 根据ID获取对话
   * @param id - 对话ID
   * @returns Promise<Dialog | null>
   */
  async getById(id: string): Promise<Dialog | null> {
    const row = this.db.prepare(
      `SELECT id, title, model_id, provider_config_id, role_id, system_prompt,
              context_config, created_at, updated_at, message_count
       FROM dialogs
       WHERE id = ?`
    ).get(id) as any

    if (!row) return null

    return {
      id: row.id,
      title: row.title,
      modelId: row.model_id,
      providerConfigId: row.provider_config_id || undefined,
      roleId: row.role_id || undefined,
      systemPrompt: row.system_prompt || undefined,
      contextConfig: this.parseContextConfig(row.context_config),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }
  }

  /**
   * 创建对话
   * @param dialog - 对话数据
   * @returns Promise<Dialog>
   */
  async create(dialog: Omit<Dialog, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>): Promise<Dialog> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const contextConfigStr = dialog.contextConfig ? JSON.stringify(dialog.contextConfig) : null

    this.db.prepare(
      `INSERT INTO dialogs (id, title, model_id, provider_config_id, role_id, system_prompt,
                            context_config, created_at, updated_at, message_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      id, dialog.title, dialog.modelId, dialog.providerConfigId || null,
      dialog.roleId || null, dialog.systemPrompt || null, contextConfigStr, now, now
    )

    return {
      id,
      title: dialog.title,
      modelId: dialog.modelId,
      providerConfigId: dialog.providerConfigId,
      roleId: dialog.roleId,
      systemPrompt: dialog.systemPrompt,
      contextConfig: dialog.contextConfig,
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
    console.log('[DialogRepository.update] 开始更新, id:', id, ', data:', JSON.stringify(data))
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
    if (data.contextConfig !== undefined) {
      fields.push('context_config = ?')
      values.push(data.contextConfig ? JSON.stringify(data.contextConfig) : null)
    }
    if (data.modelId !== undefined) {
      fields.push('model_id = ?')
      values.push(data.modelId)
      console.log('[DialogRepository.update] 将更新 model_id 为:', data.modelId)
    }
    if (data.providerConfigId !== undefined) {
      fields.push('provider_config_id = ?')
      values.push(data.providerConfigId || null)
      console.log('[DialogRepository.update] 将更新 provider_config_id 为:', data.providerConfigId)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(id)
      const sql = `UPDATE dialogs SET ${fields.join(', ')} WHERE id = ?`
      console.log('[DialogRepository.update] 执行 SQL:', sql)
      console.log('[DialogRepository.update] 参数:', values)
      const result = this.db.prepare(sql).run(...values)
      console.log('[DialogRepository.update] 更新结果 - 受影响行数:', result.changes)
      console.log('[DialogRepository.update] 更新完成')
    } else {
      console.log('[DialogRepository.update] 没有需要更新的字段')
    }
  }

  /**
   * 删除对话
   * @param id - 对话ID
   * @returns Promise<void>
   */
  async delete(id: string): Promise<void> {
    // 先删除关联的消息
    this.db.prepare('DELETE FROM messages WHERE dialog_id = ?').run(id)
    // 再删除对话
    this.db.prepare('DELETE FROM dialogs WHERE id = ?').run(id)
  }

  /**
   * 更新消息计数
   * @param id - 对话ID
   * @param count - 消息数量
   * @returns Promise<void>
   */
  async updateMessageCount(id: string, count: number): Promise<void> {
    this.db.prepare("UPDATE dialogs SET message_count = ?, updated_at = datetime('now') WHERE id = ?").run(count, id)
  }

  /**
   * 更新对话时间戳
   * @param id - 对话ID
   * @returns Promise<void>
   */
  async touch(id: string): Promise<void> {
    this.db.prepare("UPDATE dialogs SET updated_at = datetime('now') WHERE id = ?").run(id)
  }
}