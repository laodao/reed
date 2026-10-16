/**
 * API密钥数据访问层
 * @module database/repositories/api-key
 * @description 提供API密钥的数据库操作，密钥以加密形式存储
 */

import Database from 'better-sqlite3'
import type { ApiKeyInfo } from '../../../shared/types'

/**
 * API密钥数据仓库
 */
export class ApiKeyRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 获取所有已配置的密钥
   * @returns Promise<Array<{ provider: string, hasEndpoint: boolean }>>
   */
  async getAll(): Promise<Array<{ provider: string; hasEndpoint: boolean }>> {
    const rows = this.db.prepare('SELECT provider, endpoint FROM api_keys').all() as { provider: string; endpoint: string | null }[]
    return rows.map(row => ({
      provider: row.provider,
      hasEndpoint: !!row.endpoint
    }))
  }

  /**
   * 保存密钥
   * @param provider - 提供商标识
   * @param encryptedKey - 加密后的密钥
   * @param endpoint - 自定义端点（可选）
   * @returns Promise<void>
   */
  async save(provider: string, encryptedKey: string, endpoint?: string): Promise<void> {
    this.db.prepare(
      `INSERT OR REPLACE INTO api_keys (provider, encrypted_key, endpoint, updated_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(provider, encryptedKey, endpoint || null)
  }

  /**
   * 获取密钥
   * @param provider - 提供商标识
   * @returns Promise<{ encryptedKey: string, endpoint?: string } | null>
   */
  async get(provider: string): Promise<{ encryptedKey: string; endpoint?: string } | null> {
    const row = this.db.prepare(
      'SELECT encrypted_key, endpoint FROM api_keys WHERE provider = ?'
    ).get(provider) as { encrypted_key: string; endpoint: string | null } | undefined

    if (row) {
      return {
        encryptedKey: row.encrypted_key,
        endpoint: row.endpoint || undefined
      }
    }
    return null
  }

  /**
   * 删除密钥
   * @param provider - 提供商标识
   * @returns Promise<void>
   */
  async delete(provider: string): Promise<void> {
    this.db.prepare('DELETE FROM api_keys WHERE provider = ?').run(provider)
  }

  /**
   * 检查密钥是否存在
   * @param provider - 提供商标识
   * @returns Promise<boolean>
   */
  async exists(provider: string): Promise<boolean> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM api_keys WHERE provider = ?'
    ).get(provider) as { count: number } | undefined
    return (row?.count || 0) > 0
  }
}