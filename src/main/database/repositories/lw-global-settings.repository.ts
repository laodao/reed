/**
 * 长文写作全局配置仓库
 * @module database/repositories/lw-global-settings.repository
 */

import Database from 'better-sqlite3'
import {
  LongWritingGlobalSettings,
  DEFAULT_STORY_TYPES,
  DEFAULT_STYLES,
  DEFAULT_TARGET_READERS,
  DEFAULT_ESTIMATED_LENGTHS,
  DEFAULT_SKILL_TYPES,
  DEFAULT_SKILL_LEVELS,
  DEFAULT_ITEM_TYPES,
  DEFAULT_ITEM_LEVELS
} from '../../../shared/types/longwriting.types'

/**
 * 全局配置仓库
 */
export class LwGlobalSettingsRepository {
  constructor(private db: Database.Database) {}

  /**
   * 获取全局配置（只有一条记录）
   */
  get(): LongWritingGlobalSettings | null {
    const stmt = this.db.prepare(`SELECT * FROM lw_global_settings LIMIT 1`)
    const row = stmt.get() as any
    return row ? this.mapToSettings(row) : null
  }

  /**
   * 获取或创建全局配置
   */
  getOrCreate(): LongWritingGlobalSettings {
    let settings = this.get()
    if (!settings) {
      settings = this.create()
    }
    return settings
  }

  /**
   * 创建默认配置
   */
  create(): LongWritingGlobalSettings {
    const id = 'global_settings'
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO lw_global_settings (
        id, story_types, styles, target_readers, estimated_lengths,
        skill_types, skill_levels, item_types, item_levels,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      JSON.stringify(DEFAULT_STORY_TYPES),
      JSON.stringify(DEFAULT_STYLES),
      JSON.stringify(DEFAULT_TARGET_READERS),
      JSON.stringify(DEFAULT_ESTIMATED_LENGTHS),
      JSON.stringify(DEFAULT_SKILL_TYPES),
      JSON.stringify(DEFAULT_SKILL_LEVELS),
      JSON.stringify(DEFAULT_ITEM_TYPES),
      JSON.stringify(DEFAULT_ITEM_LEVELS),
      now,
      now
    )

    return {
      id,
      storyTypes: DEFAULT_STORY_TYPES,
      styles: DEFAULT_STYLES,
      targetReaders: DEFAULT_TARGET_READERS,
      estimatedLengths: DEFAULT_ESTIMATED_LENGTHS,
      skillTypes: DEFAULT_SKILL_TYPES,
      skillLevels: DEFAULT_SKILL_LEVELS,
      itemTypes: DEFAULT_ITEM_TYPES,
      itemLevels: DEFAULT_ITEM_LEVELS,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 更新配置
   */
  update(data: Partial<LongWritingGlobalSettings>): LongWritingGlobalSettings | null {
    const settings = this.get()
    if (!settings) return this.create()

    const updates: string[] = []
    const values: any[] = []

    if (data.storyTypes !== undefined) {
      updates.push('story_types = ?')
      values.push(JSON.stringify(data.storyTypes))
    }
    if (data.styles !== undefined) {
      updates.push('styles = ?')
      values.push(JSON.stringify(data.styles))
    }
    if (data.targetReaders !== undefined) {
      updates.push('target_readers = ?')
      values.push(JSON.stringify(data.targetReaders))
    }
    if (data.estimatedLengths !== undefined) {
      updates.push('estimated_lengths = ?')
      values.push(JSON.stringify(data.estimatedLengths))
    }
    if (data.skillTypes !== undefined) {
      updates.push('skill_types = ?')
      values.push(JSON.stringify(data.skillTypes))
    }
    if (data.skillLevels !== undefined) {
      updates.push('skill_levels = ?')
      values.push(JSON.stringify(data.skillLevels))
    }
    if (data.itemTypes !== undefined) {
      updates.push('item_types = ?')
      values.push(JSON.stringify(data.itemTypes))
    }
    if (data.itemLevels !== undefined) {
      updates.push('item_levels = ?')
      values.push(JSON.stringify(data.itemLevels))
    }

    if (updates.length === 0) return settings

    updates.push('updated_at = ?')
    values.push(Date.now())
    values.push(settings.id)

    const stmt = this.db.prepare(`
      UPDATE lw_global_settings SET ${updates.join(', ')} WHERE id = ?
    `)
    stmt.run(...values)

    return this.get()
  }

  /**
   * 映射数据库行到对象
   */
  private mapToSettings(row: any): LongWritingGlobalSettings {
    return {
      id: row.id,
      storyTypes: this.parseJson(row.story_types, DEFAULT_STORY_TYPES),
      styles: this.parseJson(row.styles, DEFAULT_STYLES),
      targetReaders: this.parseJson(row.target_readers, DEFAULT_TARGET_READERS),
      estimatedLengths: this.parseJson(row.estimated_lengths, DEFAULT_ESTIMATED_LENGTHS),
      skillTypes: this.parseJson(row.skill_types, DEFAULT_SKILL_TYPES),
      skillLevels: this.parseJson(row.skill_levels, DEFAULT_SKILL_LEVELS),
      itemTypes: this.parseJson(row.item_types, DEFAULT_ITEM_TYPES),
      itemLevels: this.parseJson(row.item_levels, DEFAULT_ITEM_LEVELS),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 解析 JSON 字符串
   */
  private parseJson(jsonStr: string, defaultValue: string[]): string[] {
    try {
      if (!jsonStr) return defaultValue
      const parsed = JSON.parse(jsonStr)
      return Array.isArray(parsed) ? parsed : defaultValue
    } catch {
      return defaultValue
    }
  }
}