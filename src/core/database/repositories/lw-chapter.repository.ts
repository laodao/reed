/**
 * 长文写作章节仓库
 * @module database/repositories/lw-chapter.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              含 lw_chapter_versions 子表（最大 20 版本）。
 */

import { In, type DataSource } from 'typeorm'
import { StoryChapter, ChapterVersion } from '@shared/types/longwriting.types'
import { LwChapterEntity } from '../entities/lw-chapter.entity'
import { LwChapterVersionEntity } from '../entities/lw-chapter-version.entity'
import { BaseRepository } from '../base-repository'

const MAX_VERSIONS = 20

export class LwChapterRepository extends BaseRepository<
  LwChapterEntity,
  StoryChapter
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwChapterEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwChapterEntity): StoryChapter {
    return {
      id: e.id,
      outlineId: e.outlineId,
      content: e.content || '',
      wordCount: e.wordCount || 0,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  private mapToVersion(e: LwChapterVersionEntity): ChapterVersion {
    return {
      id: e.id,
      chapterId: e.chapterId,
      content: e.content,
      versionType: e.versionType as ChapterVersion['versionType'],
      wordCount: e.wordCount ?? 0,
      isLocked: e.isLocked === 1,
      versionNumber: e.versionNumber ?? 0,
      createdAt: this.toEpochMs(e.createdAt),
    }
  }

  async getByOutlineId(outlineId: string): Promise<StoryChapter | null> {
    return this.findOneByWhere({ outlineId } as any)
  }

  async getByOutlineIds(outlineIds: string[]): Promise<Map<string, StoryChapter>> {
    if (outlineIds.length === 0) return new Map()
    const entities = await this.scoped.find({
      where: { outlineId: In(outlineIds) } as any,
    })
    const result = new Map<string, StoryChapter>()
    for (const e of entities) {
      result.set(e.outlineId, this.toDto(e))
    }
    return result
  }

  async getById(id: string): Promise<StoryChapter | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(outlineId: string, content: string = ''): Promise<StoryChapter> {
    const id = this.generateId()
    const now = new Date()
    const wordCount = this.countWords(content)
    const entity = this.repo.create({
      id,
      outlineId,
      content,
      wordCount,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async updateContent(
    id: string,
    content: string,
  ): Promise<StoryChapter | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    existing.content = content
    existing.wordCount = this.countWords(content)
    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  // ==================== 版本管理 ====================

  /** chapter_versions 表的 scoped 入口（user_id 自动注入/过滤）。 */
  private get versions() {
    return this.scopedFor(LwChapterVersionEntity)
  }

  async getVersions(chapterId: string): Promise<ChapterVersion[]> {
    const entities = await this.versions.find({
      where: { chapterId } as any,
      order: { versionNumber: 'DESC' } as any,
    })
    return entities.map(e => this.mapToVersion(e))
  }

  async getVersion(id: string): Promise<ChapterVersion | null> {
    const e = await this.versions.findOne({ id } as any)
    return e ? this.mapToVersion(e) : null
  }

  async getLatestVersion(chapterId: string): Promise<ChapterVersion | null> {
    const e = await this.versions.findOne(
      { chapterId } as any,
      { order: { versionNumber: 'DESC' } as any },
    )
    return e ? this.mapToVersion(e) : null
  }

  async createVersion(
    chapterId: string,
    content: string,
    versionType: 'generated' | 'manual',
  ): Promise<ChapterVersion> {
    const id = this.generateVersionId()
    const now = new Date()
    const wordCount = this.countWords(content)
    const latest = await this.getLatestVersion(chapterId)
    const versionNumber = latest ? latest.versionNumber + 1 : 1

    const saved = await this.versions.save({
      id,
      chapterId,
      content,
      versionType,
      wordCount,
      isLocked: 0,
      versionNumber,
      createdAt: now,
    } as any)
    await this.cleanupOldVersions(chapterId)
    return this.mapToVersion(saved as LwChapterVersionEntity)
  }

  async lockVersion(id: string): Promise<boolean> {
    const affected = await this.versions.update({ id } as any, { isLocked: 1 } as any)
    return affected > 0
  }

  async unlockVersion(id: string): Promise<boolean> {
    const affected = await this.versions.update({ id } as any, { isLocked: 0 } as any)
    return affected > 0
  }

  async restoreVersion(
    chapterId: string,
    versionId: string,
  ): Promise<StoryChapter | null> {
    const version = await this.getVersion(versionId)
    if (!version || version.chapterId !== chapterId) return null
    const chapter = await this.updateContent(chapterId, version.content)
    if (!chapter) return null
    await this.createVersion(chapterId, version.content, 'manual')
    return chapter
  }

  async deleteVersion(id: string): Promise<boolean> {
    const version = await this.getVersion(id)
    if (!version || version.isLocked) return false
    const affected = await this.versions.delete({ id } as any)
    return affected > 0
  }

  /** 保留最新 MAX_VERSIONS 个未锁定版本 */
  private async cleanupOldVersions(chapterId: string): Promise<void> {
    const old = await this.versions.find({
      where: { chapterId, isLocked: 0 } as any,
      order: { versionNumber: 'DESC' } as any,
      skip: MAX_VERSIONS,
    })
    if (old.length === 0) return
    await this.versions.delete({ id: In(old.map(v => v.id)) } as any)
  }

  private countWords(content: string): number {
    if (!content) return 0
    const chineseChars = (content.match(/[一-龥]/g) || []).length
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length
    return chineseChars + englishWords
  }

  private generateId(): string {
    return `chapter_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  private generateVersionId(): string {
    return `ver_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
