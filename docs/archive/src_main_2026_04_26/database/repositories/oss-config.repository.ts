/**
 * OSS 配置数据访问层
 * @module database/repositories/oss-config.repository
 * @description 提供图床/OSS配置的数据库操作
 */

import Database from 'better-sqlite3'
import type {
  OSSConfig,
  OSSConfigRecord,
  CreateOSSConfigRequest,
  UpdateOSSConfigRequest,
  OSSProviderType
} from '../../../shared/types/oss.types'

/**
 * OSS 配置数据仓库
 */
export class OSSConfigRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 初始化表结构
   */
  initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oss_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        access_key_id TEXT NOT NULL,
        access_key_secret TEXT NOT NULL,
        region TEXT NOT NULL,
        bucket TEXT NOT NULL,
        endpoint TEXT,
        custom_domain TEXT,
        path_prefix TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  }

  /**
   * 将数据库行转换为配置对象
   */
  private rowToConfig(row: OSSConfigRecord): OSSConfig {
    const base = {
      id: row.id,
      name: row.name,
      provider: row.provider as OSSProviderType,
      accessKeyId: row.access_key_id,
      accessKeySecret: row.access_key_secret,
      region: row.region,
      bucket: row.bucket,
      endpoint: row.endpoint || undefined,
      customDomain: row.custom_domain || undefined,
      pathPrefix: row.path_prefix || undefined,
      isEnabled: row.is_enabled === 1,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }

    return base as OSSConfig
  }

  /**
   * 创建配置
   */
  create(request: CreateOSSConfigRequest & { id: string; accessKeySecret: string }): OSSConfig {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO oss_configs (
        id, name, provider, access_key_id, access_key_secret,
        region, bucket, endpoint, custom_domain, path_prefix,
        is_enabled, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `)

    stmt.run(
      request.id,
      request.name,
      request.provider,
      request.accessKeyId,
      request.accessKeySecret,
      request.region,
      request.bucket,
      request.endpoint || null,
      request.customDomain || null,
      request.pathPrefix || null,
      now,
      now
    )

    return this.getById(request.id)!
  }

  /**
   * 根据 ID 获取配置
   */
  getById(id: string): OSSConfig | null {
    const row = this.db.prepare(
      'SELECT * FROM oss_configs WHERE id = ?'
    ).get(id) as OSSConfigRecord | undefined

    return row ? this.rowToConfig(row) : null
  }

  /**
   * 获取所有配置
   */
  getAll(): OSSConfig[] {
    const rows = this.db.prepare(
      'SELECT * FROM oss_configs ORDER BY is_default DESC, created_at DESC'
    ).all() as OSSConfigRecord[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 获取已启用的配置
   */
  getEnabled(): OSSConfig[] {
    const rows = this.db.prepare(
      'SELECT * FROM oss_configs WHERE is_enabled = 1 ORDER BY is_default DESC, created_at DESC'
    ).all() as OSSConfigRecord[]

    return rows.map(row => this.rowToConfig(row))
  }

  /**
   * 获取默认配置
   */
  getDefault(): OSSConfig | null {
    const row = this.db.prepare(
      'SELECT * FROM oss_configs WHERE is_enabled = 1 AND is_default = 1'
    ).get() as OSSConfigRecord | undefined

    return row ? this.rowToConfig(row) : null
  }

  /**
   * 更新配置
   */
  update(id: string, request: Partial<UpdateOSSConfigRequest & { accessKeySecret?: string }>): boolean {
    const existing = this.getById(id)
    if (!existing) return false

    const updates: string[] = ['updated_at = ?']
    const values: any[] = [Date.now()]

    if (request.name !== undefined) {
      updates.push('name = ?')
      values.push(request.name)
    }
    if (request.accessKeyId !== undefined) {
      updates.push('access_key_id = ?')
      values.push(request.accessKeyId)
    }
    if (request.accessKeySecret !== undefined) {
      updates.push('access_key_secret = ?')
      values.push(request.accessKeySecret)
    }
    if (request.region !== undefined) {
      updates.push('region = ?')
      values.push(request.region)
    }
    if (request.bucket !== undefined) {
      updates.push('bucket = ?')
      values.push(request.bucket)
    }
    if (request.endpoint !== undefined) {
      updates.push('endpoint = ?')
      values.push(request.endpoint || null)
    }
    if (request.customDomain !== undefined) {
      updates.push('custom_domain = ?')
      values.push(request.customDomain || null)
    }
    if (request.pathPrefix !== undefined) {
      updates.push('path_prefix = ?')
      values.push(request.pathPrefix || null)
    }
    if (request.isEnabled !== undefined) {
      updates.push('is_enabled = ?')
      values.push(request.isEnabled ? 1 : 0)
    }
    if (request.isDefault !== undefined) {
      updates.push('is_default = ?')
      values.push(request.isDefault ? 1 : 0)
    }

    values.push(id)

    const stmt = this.db.prepare(
      `UPDATE oss_configs SET ${updates.join(', ')} WHERE id = ?`
    )
    stmt.run(...values)

    return true
  }

  /**
   * 设置默认配置
   */
  setDefault(id: string): boolean {
    const config = this.getById(id)
    if (!config) return false

    // 开启事务
    const transaction = this.db.transaction(() => {
      // 先清除其他默认配置
      this.db.prepare('UPDATE oss_configs SET is_default = 0').run()
      // 设置新的默认配置
      this.db.prepare('UPDATE oss_configs SET is_default = 1 WHERE id = ?').run(id)
    })

    transaction()
    return true
  }

  /**
   * 删除配置
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM oss_configs WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * 切换启用状态
   */
  toggleEnabled(id: string): boolean {
    const config = this.getById(id)
    if (!config) return false

    this.db.prepare('UPDATE oss_configs SET is_enabled = ? WHERE id = ?').run(
      config.isEnabled ? 0 : 1,
      id
    )
    return true
  }
}