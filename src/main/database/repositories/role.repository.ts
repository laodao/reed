/**
 * 角色数据访问层
 * @module database/repositories/role
 * @description 提供角色的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { Role, CreateRoleRequest, UpdateRoleRequest } from '../../../shared/types'
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
   * 获取所有角色
   * @returns Promise<Role[]>
   */
  async getAll(): Promise<Role[]> {
    const result = this.db.exec(
      `SELECT id, name, description, system_prompt, avatar, is_builtin, created_at, updated_at
       FROM roles
       ORDER BY created_at DESC`
    )
    const roles: Role[] = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        roles.push({
          id: row[0] as string,
          name: row[1] as string,
          description: (row[2] as string) || undefined,
          systemPrompt: (row[3] as string) || undefined,
          avatar: (row[4] as string) || undefined,
          isBuiltin: !!row[5],
          createdAt: new Date(row[6] as string),
          updatedAt: new Date(row[7] as string)
        })
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
      `SELECT id, name, description, system_prompt, avatar, is_builtin, created_at, updated_at
       FROM roles
       WHERE id = ?`,
      [id]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0]
      return {
        id: row[0] as string,
        name: row[1] as string,
        description: (row[2] as string) || undefined,
        systemPrompt: (row[3] as string) || undefined,
        avatar: (row[4] as string) || undefined,
        isBuiltin: !!row[5],
        createdAt: new Date(row[6] as string),
        updatedAt: new Date(row[7] as string)
      }
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
    this.db.run(
      `INSERT INTO roles (id, name, description, system_prompt, avatar, is_builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, request.name, request.description || null, request.systemPrompt || null, request.avatar || null, now, now]
    )
    this.dbManager.save()
    return {
      id,
      name: request.name,
      description: request.description,
      systemPrompt: request.systemPrompt,
      avatar: request.avatar,
      isBuiltin: false,
      createdAt: new Date(now),
      updatedAt: new Date(now)
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

    if (fields.length > 0) {
      fields.push('updated_at = datetime("now")')
      values.push(id)
      this.db.run(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`, values)
      this.dbManager.save()
    }
  }

  /**
   * 删除角色
   * @param id - 角色ID
   * @returns Promise<void>
   */
  async delete(id: string): Promise<void> {
    this.db.run('DELETE FROM roles WHERE id = ? AND is_builtin = 0', [id])
    this.dbManager.save()
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
