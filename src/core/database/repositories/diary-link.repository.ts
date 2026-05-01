/**
 * 日记链接数据访问层
 * @module database/repositories/diary-link.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { IsNull, type DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type {
  DiaryLink,
  BacklinkInfo,
} from '@shared/types/diary.types'
import { DiaryLinkEntity } from '../entities/diary-link.entity'
import { DiaryEntryEntity } from '../entities/diary-entry.entity'
import { BaseRepository } from '../base-repository'

export class DiaryLinkRepository extends BaseRepository<
  DiaryLinkEntity,
  DiaryLink
> {
  constructor(dataSource: DataSource) {
    super(dataSource, DiaryLinkEntity)
  }

  protected toDto(e: DiaryLinkEntity): DiaryLink {
    return {
      id: e.id,
      sourceEntryId: e.sourceEntryId,
      targetEntryId: e.targetEntryId || undefined,
      targetTitle: e.targetTitle,
      linkText: e.linkText || undefined,
      anchor: e.anchor || undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
    }
  }

  async findOutgoingLinks(sourceEntryId: string): Promise<DiaryLink[]> {
    return this.findManyByWhere({ sourceEntryId } as any)
  }

  async findIncomingLinks(targetEntryId: string): Promise<BacklinkInfo[]> {
    const rows = await this.repo
      .createQueryBuilder('l')
      .innerJoin(DiaryEntryEntity, 'e', 'l.source_entry_id = e.id')
      .select([
        'l.id AS l_id',
        'l.source_entry_id AS source_entry_id',
        'l.link_text AS link_text',
        'e.title AS source_entry_title',
      ])
      .where('l.target_entry_id = :tid', { tid: targetEntryId })
      .getRawMany()

    return rows.map(row => ({
      sourceEntryId: row.source_entry_id,
      sourceEntryTitle: row.source_entry_title,
      linkText: row.link_text || undefined,
      context: undefined,
    }))
  }

  async findUnresolvedLinks(sourceEntryId: string): Promise<DiaryLink[]> {
    const entities = await this.scoped.find({
      where: { sourceEntryId, targetEntryId: IsNull() } as any,
    })
    return this.toDtoList(entities)
  }

  async create(
    sourceEntryId: string,
    targetTitle: string,
    options?: { targetEntryId?: string; linkText?: string; anchor?: string },
  ): Promise<DiaryLink> {
    const id = randomUUID()
    const entity = this.repo.create({
      id,
      sourceEntryId,
      targetEntryId: options?.targetEntryId ?? null,
      targetTitle,
      linkText: options?.linkText ?? null,
      anchor: options?.anchor ?? null,
      createdAt: new Date(),
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async createMany(
    links: Array<{
      sourceEntryId: string
      targetTitle: string
      targetEntryId?: string
      linkText?: string
      anchor?: string
    }>,
  ): Promise<void> {
    if (links.length === 0) return
    const now = new Date()
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(DiaryLinkEntity)
      for (const link of links) {
        await repo.save(
          repo.create({
            id: randomUUID(),
            sourceEntryId: link.sourceEntryId,
            targetEntryId: link.targetEntryId ?? null,
            targetTitle: link.targetTitle,
            linkText: link.linkText ?? null,
            anchor: link.anchor ?? null,
            createdAt: now,
          }),
        )
      }
    })
  }

  async deleteBySource(sourceEntryId: string): Promise<void> {
    await this.scoped.delete({ sourceEntryId } as any)
  }

  async updateTarget(targetTitle: string, targetEntryId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(DiaryLinkEntity)
      .set({ targetEntryId })
      .where('target_title = :title AND target_entry_id IS NULL', { title: targetTitle })
      .execute()
  }
}
