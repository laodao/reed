/**
 * 知识大脑·复习日志仓库（kb_note_reviews 表）
 * @module database/repositories/kb-note-review.repository
 */
import type { DataSource, FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbNoteReviewEntity } from '../entities/kb-brain/kb-note-review.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbNoteReviewRecord {
  id: string
  userId: string | null
  noteId: string
  kbId: string
  rating: number
  scheduledDays: number | null
  elapsedDays: number | null
  reviewedAt: Date
}

export class KbNoteReviewRepository extends BaseRepository<KbNoteReviewEntity, KbNoteReviewRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbNoteReviewEntity)
  }

  protected toDto(e: KbNoteReviewEntity): KbNoteReviewRecord {
    return {
      id: e.id,
      userId: e.userId,
      noteId: e.noteId,
      kbId: e.kbId,
      rating: e.rating,
      scheduledDays: e.scheduledDays ?? null,
      elapsedDays: e.elapsedDays ?? null,
      reviewedAt: e.reviewedAt,
    }
  }

  /** 追加一条评分（FSRS 复算的原始记录；只增不改） */
  async append(input: {
    noteId: string
    kbId: string
    rating: number
    scheduledDays?: number | null
    elapsedDays?: number | null
    reviewedAt?: Date
  }): Promise<KbNoteReviewRecord> {
    const e = new KbNoteReviewEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.noteId = input.noteId
    e.kbId = input.kbId
    e.rating = input.rating
    e.scheduledDays = input.scheduledDays ?? null
    e.elapsedDays = input.elapsedDays ?? null
    e.reviewedAt = input.reviewedAt ?? new Date()
    await this.scoped.save(e)
    return this.toDto(e)
  }

  async findByNote(noteId: string): Promise<KbNoteReviewRecord[]> {
    const rows = await this.scoped.find({
      where: { noteId } as FindOptionsWhere<KbNoteReviewEntity>,
      order: { reviewedAt: 'ASC' } as never,
    })
    return this.toDtoList(rows)
  }

  async deleteByKnowledgeBaseId(kbId: string): Promise<void> {
    await this.scoped.delete({ kbId } as FindOptionsWhere<KbNoteReviewEntity>)
  }
}
