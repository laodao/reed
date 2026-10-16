/**
 * 长文写作全局配置仓库
 * @module database/repositories/lw-global-settings.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              单行多 JSON 列存储；getOrCreate 保证应用全局只有一条记录。
 */

import type { DataSource } from 'typeorm'
import {
  LongWritingGlobalSettings,
  DEFAULT_STORY_TYPES,
  DEFAULT_STYLES,
  DEFAULT_TARGET_READERS,
  DEFAULT_ESTIMATED_LENGTHS,
  DEFAULT_SKILL_TYPES,
  DEFAULT_SKILL_LEVELS,
  DEFAULT_ITEM_TYPES,
  DEFAULT_ITEM_LEVELS,
} from '@shared/types/longwriting.types'
import { LwGlobalSettingsEntity } from '../entities/lw-global-settings.entity'
import { BaseRepository } from '../base-repository'

export class LwGlobalSettingsRepository extends BaseRepository<
  LwGlobalSettingsEntity,
  LongWritingGlobalSettings
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwGlobalSettingsEntity)
    // 共享配置类 Repository：所有用户共享数据，不做 user_id 过滤
    this.useRawRepo()
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwGlobalSettingsEntity): LongWritingGlobalSettings {
    return {
      id: e.id,
      storyTypes: ((e.storyTypes as string[] | null) ?? DEFAULT_STORY_TYPES),
      styles: ((e.styles as string[] | null) ?? DEFAULT_STYLES),
      targetReaders: ((e.targetReaders as string[] | null) ?? DEFAULT_TARGET_READERS),
      estimatedLengths: ((e.estimatedLengths as string[] | null) ?? DEFAULT_ESTIMATED_LENGTHS),
      skillTypes: ((e.skillTypes as string[] | null) ?? DEFAULT_SKILL_TYPES),
      skillLevels: ((e.skillLevels as string[] | null) ?? DEFAULT_SKILL_LEVELS),
      itemTypes: ((e.itemTypes as string[] | null) ?? DEFAULT_ITEM_TYPES),
      itemLevels: ((e.itemLevels as string[] | null) ?? DEFAULT_ITEM_LEVELS),
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async get(): Promise<LongWritingGlobalSettings | null> {
    const e = await this.repo.createQueryBuilder('s').limit(1).getOne()
    return e ? this.toDto(e) : null
  }

  async getOrCreate(): Promise<LongWritingGlobalSettings> {
    const existing = await this.get()
    if (existing) return existing
    return this.create()
  }

  async create(): Promise<LongWritingGlobalSettings> {
    const id = 'global_settings'
    const now = new Date()
    const entity = this.repo.create({
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
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(
    data: Partial<LongWritingGlobalSettings>,
  ): Promise<LongWritingGlobalSettings | null> {
    const settings = await this.get()
    if (!settings) return this.create()

    const existing = await this.repo.findOne({ where: { id: settings.id } as any })
    if (!existing) return null

    let changed = false
    if (data.storyTypes !== undefined) { existing.storyTypes = data.storyTypes; changed = true }
    if (data.styles !== undefined) { existing.styles = data.styles; changed = true }
    if (data.targetReaders !== undefined) { existing.targetReaders = data.targetReaders; changed = true }
    if (data.estimatedLengths !== undefined) { existing.estimatedLengths = data.estimatedLengths; changed = true }
    if (data.skillTypes !== undefined) { existing.skillTypes = data.skillTypes; changed = true }
    if (data.skillLevels !== undefined) { existing.skillLevels = data.skillLevels; changed = true }
    if (data.itemTypes !== undefined) { existing.itemTypes = data.itemTypes; changed = true }
    if (data.itemLevels !== undefined) { existing.itemLevels = data.itemLevels; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }
}
