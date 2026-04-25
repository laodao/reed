/**
 * 设置数据访问层
 * @module database/repositories/settings
 * @description 提供设置的数据库操作
 */

import Database from 'better-sqlite3'
import type { ThemeMode, Language, FontSize } from '@shared/types'

/**
 * 设置数据仓库
 */
export class SettingsRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 获取设置值
   * @param key - 设置键名
   * @returns any | null - 设置值
   * @description 从数据库获取单个设置值
   */
  get(key: string): any | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    if (row) {
      try {
        return JSON.parse(row.value)
      } catch {
        return row.value
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
    this.db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    ).run(key, jsonValue)
  }

  /**
   * 获取所有设置
   * @returns Record<string, any> - 设置键值对
   */
  getAll(): Record<string, any> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const settings: Record<string, any> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return settings
  }

  /**
   * 删除设置
   * @param key - 设置键名
   * @returns void
   */
  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}