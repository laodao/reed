/**
 * 日记条目数据访问层
 * @module database/repositories/diary-entry.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { IsNull, type DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type {
  DiaryEntry,
  DiaryEntryListItem,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
} from '@shared/types/diary.types'
import { DiaryEntryEntity } from '../entities/diary-entry.entity'
import { BaseRepository } from '../base-repository'

export class DiaryEntryRepository extends BaseRepository<
  DiaryEntryEntity,
  DiaryEntry
> {
  constructor(dataSource: DataSource) {
    super(dataSource, DiaryEntryEntity)
  }

  protected toDto(e: DiaryEntryEntity): DiaryEntry {
    return {
      id: e.id,
      folderId: e.folderId,
      title: e.title,
      content: e.content || undefined,
      filePath: e.filePath,
      wordCount: e.wordCount ?? 0,
      tags: (e.tags as string[] | null) ?? undefined,
      frontmatter: e.frontmatter || undefined,
      deletedAt: e.deletedAt ?? null,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt),
    }
  }

  private toListItem(e: DiaryEntryEntity): DiaryEntryListItem {
    const content = e.content || ''
    return {
      id: e.id,
      folderId: e.folderId,
      title: e.title,
      preview: content.slice(0, 200),
      wordCount: e.wordCount ?? 0,
      tags: (e.tags as string[] | null) ?? undefined,
      frontmatter: e.frontmatter || undefined,
      deletedAt: e.deletedAt ?? null,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt),
    }
  }

  async findByFolder(folderId: string): Promise<DiaryEntryListItem[]> {
    const entities = await this.scoped.find({
      where: { folderId, deletedAt: IsNull() } as any,
      order: { createdAt: 'DESC' } as any,
    })
    return entities.map(e => this.toListItem(e))
  }

  async findAll(limit?: number): Promise<DiaryEntryListItem[]> {
    const entities = await this.scoped.find({
      where: { deletedAt: IsNull() } as any,
      order: { createdAt: 'DESC' } as any,
      take: limit,
    })
    return entities.map(e => this.toListItem(e))
  }

  async findById(id: string): Promise<DiaryEntry | null> {
    return this.findOneByWhere({ id } as any)
  }

  async findByTitle(title: string): Promise<DiaryEntry | null> {
    return this.findOneByWhere({ title } as any)
  }

  async search(
    keyword: string,
    folderId?: string,
  ): Promise<DiaryEntryListItem[]> {
    const pattern = `%${keyword}%`
    const qb = this.scoped.qb('e')
    qb.where('e.deleted_at IS NULL')
    if (folderId) {
      qb.andWhere('e.folder_id = :fid', { fid: folderId })
    }
    qb.andWhere('(e.title LIKE :p OR e.content LIKE :p)', { p: pattern })
    qb.orderBy('e.created_at', 'DESC')
    const entities = await qb.getMany()
    return entities.map(e => this.toListItem(e))
  }

  /**
   * 按创建时间范围查询（日期区间 [from, to)，左闭右开，调用方负责把 to 取成次日零点）。
   * 日历视图 / 那年今日依赖；只返回未删除条目。
   */
  async findByDateRange(
    from: Date,
    to: Date,
    folderId?: string,
  ): Promise<DiaryEntryListItem[]> {
    const qb = this.scoped.qb('e')
    qb.where('e.deleted_at IS NULL')
    qb.andWhere('e.created_at >= :from', { from })
    qb.andWhere('e.created_at < :to', { to })
    if (folderId) {
      qb.andWhere('e.folder_id = :fid', { fid: folderId })
    }
    qb.orderBy('e.created_at', 'DESC')
    const entities = await qb.getMany()
    return entities.map(e => this.toListItem(e))
  }

  /** 回收站：所有软删除条目 */
  async findDeleted(): Promise<DiaryEntryListItem[]> {
    const qb = this.scoped.qb('e')
    qb.where('e.deleted_at IS NOT NULL')
    qb.orderBy('e.deleted_at', 'DESC')
    const entities = await qb.getMany()
    return entities.map(e => this.toListItem(e))
  }

  /**
   * 那年今日：历史同月同日（year < beforeYear）的条目。
   * 用 JS 按月/日过滤而非 SQL strftime/to_char——与前端 new Date() 的本地时区
   * 口径一致，且免掉 SQLite/PG 双方言表达式。个人日记量级下全表扫描无压力。
   */
  async findOnThisDay(month: number, day: number, beforeYear: number, limit = 3): Promise<DiaryEntryListItem[]> {
    const qb = this.scoped.qb('e')
    qb.where('e.deleted_at IS NULL')
    qb.orderBy('e.created_at', 'DESC')
    qb.take(2000)
    const entities = await qb.getMany()

    const targetMd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hits: DiaryEntryListItem[] = []
    for (const e of entities) {
      const d = e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)
      if (d.getFullYear() >= beforeYear) continue
      const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (md !== targetMd) continue
      hits.push(this.toListItem(e))
      if (hits.length >= limit) break
    }
    return hits
  }

  /** 软删除：置 deleted_at，文件保留原位（回收站可恢复） */
  async softDelete(id: string): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false
    existing.deletedAt = new Date()
    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  /** 从回收站恢复 */
  async restore(id: string): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false
    existing.deletedAt = null
    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  async create(
    request: CreateDiaryEntryRequest,
    filePath: string,
  ): Promise<DiaryEntry> {
    const id = randomUUID()
    const now = new Date()
    const title = request.title || this.generateDefaultTitle()
    const entity = this.repo.create({
      id,
      folderId: request.folderId,
      title,
      content: request.content ?? '',
      filePath,
      wordCount: 0,
      tags: null,
      frontmatter: null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    request: UpdateDiaryEntryRequest,
  ): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false

    let changed = false
    if (request.title !== undefined) {
      existing.title = request.title
      changed = true
    }
    if (request.content !== undefined) {
      existing.content = request.content
      existing.wordCount = this.countWords(request.content)
      changed = true
    }
    if (request.tags !== undefined) {
      existing.tags = request.tags
      changed = true
    }
    if (request.frontmatter !== undefined) {
      existing.frontmatter = request.frontmatter
      changed = true
    }

    if (!changed) return false

    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  async move(
    id: string,
    targetFolderId: string,
    newFilePath: string,
  ): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false
    existing.folderId = targetFolderId
    existing.filePath = newFilePath
    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async count(folderId?: string): Promise<number> {
    if (folderId) return this.scoped.count({ folderId } as any)
    return this.scoped.count()
  }

  private generateDefaultTitle(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private countWords(content: string): number {
    const text = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return text.length
  }
}
