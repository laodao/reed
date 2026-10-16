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
import { getCurrentUserId } from '@core/context/user-context'

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
        'l.target_title AS target_title',
        'l.link_text AS link_text',
        'e.title AS source_entry_title',
        'e.content AS source_content',
      ])
      .where('l.target_entry_id = :tid', { tid: targetEntryId })
      .getRawMany()

    return rows.map(row => ({
      sourceEntryId: row.source_entry_id,
      sourceEntryTitle: row.source_entry_title,
      linkText: row.link_text || undefined,
      context: extractLinkContext(row.source_content, row.target_title),
    }))
  }

  /**
   * 标题改名后同步引用标签：把指向该条目、仍显示旧标题的链接改成新标题
   * （[[old]] 的正文不重写，仅修链接表的显示快照）。
   */
  async updateTitleReferences(entryId: string, oldTitle: string, newTitle: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(DiaryLinkEntity)
      .set({ targetTitle: newTitle })
      .where('target_entry_id = :eid AND target_title = :oldTitle', { eid: entryId, oldTitle })
      .execute()
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
    // 多租户复核修复：事务内裸 repo.save 不走 scoped，必须显式注入 userId
    const userId = getCurrentUserId() ?? null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(DiaryLinkEntity)
      for (const link of links) {
        await repo.save(
          repo.create({
            id: randomUUID(),
            userId,
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

/**
 * 从源日记正文中截取 `[[目标标题` 出现处的上下文片段（约 ±40 字符）。
 * 找不到（正文已改写但链接表尚未重建）返回 undefined。
 */
function extractLinkContext(content: string | null | undefined, targetTitle: string): string | undefined {
  if (!content) return undefined
  const needle = `[[${targetTitle}`
  const idx = content.indexOf(needle)
  if (idx < 0) return undefined
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + needle.length + 40)
  const snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + snippet + (end < content.length ? '…' : '')
}
