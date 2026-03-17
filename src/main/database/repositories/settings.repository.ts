/**
 * 设置数据访问层
 * @module database/repositories/settings
 * @description 提供设置的数据库操作
 */

import { Database as SqlJsDatabase } from 'sql.js'
import type { ThemeMode, Language, FontSize } from '../../../shared/types'
import type { DatabaseManager } from '../index'

/**
 * 设置数据仓库
 */
export class SettingsRepository {
  private db: SqlJsDatabase
  private dbManager: DatabaseManager

  constructor(db: SqlJsDatabase, dbManager: DatabaseManager) {
    this.db = db
    this.dbManager = dbManager
  }

  /**
   * 获取设置值
   * @param key - 设置键名
   * @returns any | null - 设置值
   * @description 从数据库获取单个设置值
   */
  get(key: string): any | null {
    const result = this.db.exec('SELECT value FROM settings WHERE key = ?', [key])
    if (result.length > 0 && result[0].values.length > 0) {
      try {
        return JSON.parse(result[0].values[0][0] as string)
      } catch {
        return result[0].values[0][0]
      }
    }
    return null
  }

  /**
   * 设置值
   * @param key - 设置键名
   * @param value - 设置值
   * @returns void
   * @description 保存设置值到数据库
   */
  set(key: string, value: any): void {
    const jsonValue = JSON.stringify(value)
    this.db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
      [key, jsonValue]
    )
    this.dbManager.save()
  }

  /**
   * 获取所有设置
   * @returns Record<string, any> - 设置键值对
   */
  getAll(): Record<string, any> {
    const result = this.db.exec('SELECT key, value FROM settings')
    const settings: Record<string, any> = {}
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        try {
          settings[row[0] as string] = JSON.parse(row[1] as string)
        } catch {
          settings[row[0] as string] = row[1]
        }
      })
    }
    return settings
  }

  /**
   * 删除设置
   * @param key - 设置键名
   * @returns void
   */
  delete(key: string): void {
    this.db.run('DELETE FROM settings WHERE key = ?', [key])
    this.dbManager.save()
  }
}
