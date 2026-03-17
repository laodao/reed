/**
 * API密钥数据访问层
 * @module database/repositories/api-key
 * @description 提供API密钥的数据库操作，密钥以加密形式存储
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { ApiKeyInfo } from '../../../shared/types'
import type { DatabaseManager } from '../index'

/**
 * API密钥数据仓库
 */
export class ApiKeyRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
  }

  /**
   * 获取所有已配置的密钥
   * @returns Promise<Array<{ provider: string, hasEndpoint: boolean }>>
   */
  async getAll(): Promise<Array<{ provider: string; hasEndpoint: boolean }>> {
    const result = this.db.exec('SELECT provider, endpoint FROM api_keys')
    const keys: Array<{ provider: string; hasEndpoint: boolean }> = []
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        keys.push({
          provider: row[0] as string,
          hasEndpoint: !!row[1]
        })
      })
    }
    return keys
  }

  /**
   * 保存密钥
   * @param provider - 提供商标识
   * @param encryptedKey - 加密后的密钥
   * @param endpoint - 自定义端点（可选）
   * @returns Promise<void>
   */
  async save(provider: string, encryptedKey: string, endpoint?: string): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO api_keys (provider, encrypted_key, endpoint, updated_at)
       VALUES (?, ?, ?, datetime("now"))`,
      [provider, encryptedKey, endpoint || null]
    )
    this.dbManager.save()
  }

  /**
   * 获取密钥
   * @param provider - 提供商标识
   * @returns Promise<{ encryptedKey: string, endpoint?: string } | null>
   */
  async get(provider: string): Promise<{ encryptedKey: string; endpoint?: string } | null> {
    const result = this.db.exec(
      'SELECT encrypted_key, endpoint FROM api_keys WHERE provider = ?',
      [provider]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0]
      return {
        encryptedKey: row[0] as string,
        endpoint: (row[1] as string) || undefined
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
    this.db.run('DELETE FROM api_keys WHERE provider = ?', [provider])
    this.dbManager.save()
  }

  /**
   * 检查密钥是否存在
   * @param provider - 提供商标识
   * @returns Promise<boolean>
   */
  async exists(provider: string): Promise<boolean> {
    const result = this.db.exec(
      'SELECT COUNT(*) as count FROM api_keys WHERE provider = ?',
      [provider]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      return (result[0].values[0][0] as number) > 0
    }
    return false
  }
}
