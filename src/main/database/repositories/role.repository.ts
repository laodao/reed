/**
 * 角色数据访问层
 * @module database/repositories/role
 * @description 提供角色的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { Role, CreateRoleRequest, UpdateRoleRequest, BuiltinRoleDefinition } from '../../../shared/types'
import { BUILTIN_ROLES } from '../../../shared/types'
import type { DatabaseManager } from '../index'
import { randomUUID } from 'crypto'

/**
   * 角色数据仓库
 */
export class RoleRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
  }

  /**
   * 将数据库行映射为 Role 对象
   * @param row - 数据库行
   * @returns Role
   */
  private mapRowToRole(row: any[]): Role {
    return {
      id: row[0] as string,
      name: row[1] as string,
      description: (row[2] as string) || undefined,
      systemPrompt: (row[3] as string) || undefined,
      avatar: (row[4] as string) || undefined,
      isBuiltin: !!row[5],
      // 模型配置
      defaultModelId: (row[6] as string) || undefined,
      defaultProviderConfigId: (row[7] as string) || undefined,
      autoResetModel: row[8] !== null ? !!row[8] : true,
      // 生成参数
      temperature: row[9] !== null ? (row[9] as number) : undefined,
      topP: row[10] !== null ? (row[10] as number) : undefined,
      maxContextMessages: row[11] !== null ? (row[11] as number) : undefined,
      maxTokens: row[12] !== null ? (row[12] as number) : undefined,
      enableStream: row[13] !== null ? !!row[13] : true,
      customParams: row[14] ? JSON.parse(row[14] as string) : undefined,
      // 知识库配置
      knowledgeBaseIds: row[17] ? JSON.parse(row[17] as string) : undefined,
      knowledgeRetrieveCount: row[18] !== null ? (row[18] as number) : undefined,
      knowledgeThreshold: row[19] !== null ? (row[19] as number) : undefined,
      createdAt: new Date(row[15] as string),
      updatedAt: new Date(row[16] as string)
    }
  }

  /**
   * 获取所有角色
   * @returns Promise<Role[]>
   */
  async getAll(): Promise<Role[]> {
    const result = this.db.exec(
      `SELECT id, name, description, system_prompt, avatar, is_builtin,
              default_model_id, default_provider_config_id, auto_reset_model,
              temperature, top_p, max_context_messages, max_tokens, enable_stream, custom_params,
              knowledge_base_ids, knowledge_retrieve_count, knowledge_threshold,
              created_at, updated_at
       FROM roles
       ORDER BY is_builtin DESC, created_at ASC`
    )
    const roles: Role[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        roles.push(this.mapRowToRole(row))
      })
    }
    return roles
  }

  /**
   * 根据ID获取角色
   * @param id - 角色ID
   * @returns Promise<Role | null>
   */
  async getById(id: string): Promise<Role | null> {
    const result = this.db.exec(
      `SELECT id, name, description, system_prompt, avatar, is_builtin,
              default_model_id, default_provider_config_id, auto_reset_model,
              temperature, top_p, max_context_messages, max_tokens, enable_stream, custom_params,
              knowledge_base_ids, knowledge_retrieve_count, knowledge_threshold,
              created_at, updated_at
       FROM roles
       WHERE id = ?`,
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0]
      return this.mapRowToRole(row)
    }
    return null
  }

  /**
   * 创建角色
   * @param request - 创建请求
   * @returns Promise<Role>
   */
  async create(request: CreateRoleRequest): Promise<Role> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const customParamsJson = request.customParams ? JSON.stringify(request.customParams) : null
    const knowledgeBaseIdsJson = request.knowledgeBaseIds ? JSON.stringify(request.knowledgeBaseIds) : null

    this.db.run(
      `INSERT INTO roles (id, name, description, system_prompt, avatar, is_builtin,
                          default_model_id, default_provider_config_id, auto_reset_model,
                          temperature, top_p, max_context_messages, max_tokens, enable_stream, custom_params,
                          knowledge_base_ids, knowledge_retrieve_count, knowledge_threshold,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        request.name,
        request.description || null,
        request.systemPrompt || null,
        request.avatar || null,
        0, // is_builtin = false for user-created roles
        request.defaultModelId || null,
        request.defaultProviderConfigId || null,
        request.autoResetModel !== undefined ? (request.autoResetModel ? 1 : 0) : 1,
        request.temperature ?? 0.7,
        request.topP ?? 1.0,
        request.maxContextMessages ?? 20,
        request.maxTokens ?? 4096,
        request.enableStream !== undefined ? (request.enableStream ? 1 : 0) : 1,
        customParamsJson,
        knowledgeBaseIdsJson,
        request.knowledgeRetrieveCount ?? 5,
        request.knowledgeThreshold ?? 0.5,
        now,
        now
      ]
    )
    this.dbManager.save()
    return {
      id,
      name: request.name,
      description: request.description,
      systemPrompt: request.systemPrompt,
      avatar: request.avatar,
      isBuiltin: false,
      defaultModelId: request.defaultModelId,
      defaultProviderConfigId: request.defaultProviderConfigId,
      autoResetModel: request.autoResetModel ?? true,
      temperature: request.temperature,
      topP: request.topP,
      maxContextMessages: request.maxContextMessages,
      maxTokens: request.maxTokens,
      enableStream: request.enableStream ?? true,
      customParams: request.customParams,
      knowledgeBaseIds: request.knowledgeBaseIds,
      knowledgeRetrieveCount: request.knowledgeRetrieveCount,
      knowledgeThreshold: request.knowledgeThreshold,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 创建内置角色
   * @param definition - 内置角色定义
   * @returns Promise<Role>
   */
  async createBuiltin(definition: BuiltinRoleDefinition): Promise<Role> {
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO roles (id, name, description, system_prompt, avatar, is_builtin,
                          default_model_id, default_provider_config_id, auto_reset_model,
                          temperature, top_p, max_context_messages, max_tokens, enable_stream, custom_params,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, 1, 0.7, 1.0, 20, 4096, 1, NULL, ?, ?)`,
      [definition.id, definition.name, definition.description, definition.systemPrompt, definition.avatar, now, now]
    )
    this.dbManager.save()
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      systemPrompt: definition.systemPrompt,
      avatar: definition.avatar,
      isBuiltin: true,
      autoResetModel: true,
      temperature: 0.7,
      topP: 1.0,
      maxContextMessages: 20,
      maxTokens: 4096,
      enableStream: true,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    }
  }

  /**
   * 初始化内置角色
   * @returns Promise<void>
   */
  async initBuiltinRoles(): Promise<void> {
    for (const definition of BUILTIN_ROLES) {
      // 检查是否已存在
      const existing = await this.getById(definition.id)
      if (!existing) {
        await this.createBuiltin(definition)
        console.log(`创建内置角色: ${definition.name}`)
      }
    }
  }

  /**
   * 更新角色
   * @param id - 角色ID
   * @param request - 更新请求
   * @returns Promise<void>
   */
  async update(id: string, request: UpdateRoleRequest): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (request.name !== undefined) {
      fields.push('name = ?')
      values.push(request.name)
    }
    if (request.description !== undefined) {
      fields.push('description = ?')
      values.push(request.description)
    }
    if (request.systemPrompt !== undefined) {
      fields.push('system_prompt = ?')
      values.push(request.systemPrompt)
    }
    if (request.avatar !== undefined) {
      fields.push('avatar = ?')
      values.push(request.avatar)
    }
    // 模型配置
    if (request.defaultModelId !== undefined) {
      fields.push('default_model_id = ?')
      values.push(request.defaultModelId || null)
    }
    if (request.defaultProviderConfigId !== undefined) {
      fields.push('default_provider_config_id = ?')
      values.push(request.defaultProviderConfigId || null)
    }
    if (request.autoResetModel !== undefined) {
      fields.push('auto_reset_model = ?')
      values.push(request.autoResetModel ? 1 : 0)
    }
    // 生成参数
    if (request.temperature !== undefined) {
      fields.push('temperature = ?')
      values.push(request.temperature)
    }
    if (request.topP !== undefined) {
      fields.push('top_p = ?')
      values.push(request.topP)
    }
    if (request.maxContextMessages !== undefined) {
      fields.push('max_context_messages = ?')
      values.push(request.maxContextMessages)
    }
    if (request.maxTokens !== undefined) {
      fields.push('max_tokens = ?')
      values.push(request.maxTokens)
    }
    if (request.enableStream !== undefined) {
      fields.push('enable_stream = ?')
      values.push(request.enableStream ? 1 : 0)
    }
    if (request.customParams !== undefined) {
      fields.push('custom_params = ?')
      values.push(request.customParams ? JSON.stringify(request.customParams) : null)
    }
    // 知识库配置
    if (request.knowledgeBaseIds !== undefined) {
      fields.push('knowledge_base_ids = ?')
      values.push(request.knowledgeBaseIds ? JSON.stringify(request.knowledgeBaseIds) : null)
    }
    if (request.knowledgeRetrieveCount !== undefined) {
      fields.push('knowledge_retrieve_count = ?')
      values.push(request.knowledgeRetrieveCount)
    }
    if (request.knowledgeThreshold !== undefined) {
      fields.push('knowledge_threshold = ?')
      values.push(request.knowledgeThreshold)
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime("now")')
      values.push(id)
      this.db.run(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`, values)
      this.dbManager.save()
    }
  }

  /**
   * 删除角色（仅限自定义角色）
   * @param id - 角色ID
   * @returns Promise<{ deleted: boolean; dialogCount: number }> - 删除结果和关联的对话数量
   */
  async delete(id: string): Promise<{ deleted: boolean; dialogCount: number }> {
    // 检查是否为内置角色
    const role = await this.getById(id)
    if (!role) {
      return { deleted: false, dialogCount: 0 }
    }
    if (role.isBuiltin) {
      return { deleted: false, dialogCount: 0 }
    }

    // 统计关联的对话数量
    const countResult = this.db.exec(
      'SELECT COUNT(*) as count FROM dialogs WHERE role_id = ?',
      [id]
    )
    const dialogCount = countResult.length > 0 && countResult[0].values.length > 0
      ? (countResult[0].values[0][0] as number)
      : 0

    // 删除关联的对话及其消息
    if (dialogCount > 0) {
      // 获取所有关联对话的 ID
      const dialogsResult = this.db.exec(
        'SELECT id FROM dialogs WHERE role_id = ?',
        [id]
      )
      if (dialogsResult.length > 0) {
        for (const row of dialogsResult[0].values) {
          const dialogId = row[0] as string
          // 删除对话的消息
          this.db.run('DELETE FROM messages WHERE dialog_id = ?', [dialogId])
        }
      }
      // 删除关联的对话
      this.db.run('DELETE FROM dialogs WHERE role_id = ?', [id])
    }

    // 删除角色
    this.db.run('DELETE FROM roles WHERE id = ?', [id])
    this.dbManager.save()

    return { deleted: true, dialogCount }
  }

  /**
   * 获取角色关联的对话数量
   * @param id - 角色ID
   * @returns Promise<number>
   */
  async getDialogCount(id: string): Promise<number> {
    const result = this.db.exec(
      'SELECT COUNT(*) as count FROM dialogs WHERE role_id = ?',
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number
    }
    return 0
  }

  /**
   * 增加使用次数
   * @param id - 角色ID
   * @returns Promise<void>
   */
  async incrementUseCount(id: string): Promise<void> {
    // 暂未实现使用次数统计
    // 可以在后续版本添加 use_count 字段
  }
}
