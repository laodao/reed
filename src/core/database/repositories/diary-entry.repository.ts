/**
 * 日记条目数据访问层
 * @module database/repositories/diary-entry.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { Like, type DataSource } from 'typeorm'
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
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt),
    }
  }

  async findByFolder(folderId: string): Promise<DiaryEntryListItem[]> {
    const entities = await this.scoped.find({
      where: { folderId } as any,
      order: { createdAt: 'DESC' } as any,
    })
    return entities.map(e => this.toListItem(e))
  }

  async findAll(limit?: number): Promise<DiaryEntryListItem[]> {
    const entities = await this.scoped.find({
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
    if (folderId) {
      qb.where('e.folder_id = :fid', { fid: folderId })
      qb.andWhere('(e.title LIKE :p OR e.content LIKE :p)', { p: pattern })
    } else {
      qb.where('(e.title LIKE :p OR e.content LIKE :p)', { p: pattern })
    }
    qb.orderBy('e.created_at', 'DESC')
    const entities = await qb.getMany()
    return entities.map(e => this.toListItem(e))
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
