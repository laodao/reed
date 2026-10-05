/**
 * 概念笔记仓库（dl_note，M4-UX1 #3/#6）
 * @module database/repositories/dl-note.repository
 *
 * 选区笔记(selection)与答疑收藏(qna)共用本表;source 区分来源,questionId 引用答疑
 * 问题。只读追加为主,提供按项目/概念/问题查询与删除。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlNoteEntity } from '../entities/domain-learning/dl-note.entity'
import { BaseRepository } from '../base-repository'
import type { DlNote, DlNoteSource } from '@shared/types/domain-learning.types'

/** dl_note 行 DTO（与 shared DlNote 对齐） */
export interface DlNoteRow {
  id: string
  userId: string | null
  projectId: string
  conceptId: string | null
  source: DlNoteSource
  anchorText: string | null
  anchorStart: number | null
  anchorEnd: number | null
  questionId: string | null
  contentMd: string
  createdAt: Date | null
}

export type DlNotePatch = Partial<{
  conceptId: string | null
  contentMd: string
}>

type NoteWhere = FindOptionsWhere<DlNoteEntity>

export class DlNoteRepository extends BaseRepository<DlNoteEntity, DlNoteRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlNoteEntity)
  }

  async create(input: {
    id: string
    projectId: string
    conceptId?: string | null
    source: DlNoteSource
    anchorText?: string | null
    anchorStart?: number | null
    anchorEnd?: number | null
    questionId?: string | null
    contentMd: string
  }): Promise<DlNoteRow> {
    // 幂等兜底（2026-09-09 复盘 + 库级唯一索引 uniq_dl_note_question）：
    // qna 收藏同问题已存在 → 返回既有行，不重复建（防双击竞态与并发双行）
    if (input.source === 'qna' && input.questionId) {
      const existing = await this.findByQuestion(input.projectId, input.questionId)
      if (existing) return existing
    }
    const e = new DlNoteEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.conceptId = input.conceptId ?? null
    e.source = input.source
    e.anchorText = input.anchorText ?? null
    e.anchorStart = input.anchorStart ?? null
    e.anchorEnd = input.anchorEnd ?? null
    e.questionId = input.questionId ?? null
    e.contentMd = input.contentMd
    e.createdAt = new Date()
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlNoteRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 某项目全部笔记（新→旧；个人规模全量内存即可） */
  async listByProject(projectId: string): Promise<DlNoteRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as NoteWhere,
      order: { createdAt: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  /** 某概念笔记（project+concept） */
  async listByConcept(projectId: string, conceptId: string): Promise<DlNoteRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, conceptId } as NoteWhere,
      order: { createdAt: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  /** 收藏回答去重判断（qna 来源同问题只存一条，收藏按钮变取消） */
  async findByQuestion(projectId: string, questionId: string): Promise<DlNoteRow | null> {
    const rows = await this.scoped.find({
      where: { projectId, questionId } as NoteWhere,
      order: { createdAt: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  async deleteById(id: string): Promise<number> {
    return this.scoped.delete({ id })
  }

  /** 删某概念的全部笔记（删除知识点时级联用） */
  async deleteByConcept(projectId: string, conceptId: string): Promise<number> {
    return this.scoped.delete({ projectId, conceptId } as NoteWhere)
  }

  async patch(id: string, patch: DlNotePatch): Promise<void> {
    const partial: Partial<DlNoteEntity> = {}
    if (patch.conceptId !== undefined) partial.conceptId = patch.conceptId
    if (patch.contentMd !== undefined) partial.contentMd = patch.contentMd
    if (Object.keys(partial).length > 0) await this.scoped.update({ id }, partial)
  }

  protected toDto(e: DlNoteEntity): DlNoteRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      conceptId: e.conceptId,
      source: e.source as DlNoteSource,
      anchorText: e.anchorText,
      anchorStart: e.anchorStart,
      anchorEnd: e.anchorEnd,
      questionId: e.questionId,
      contentMd: e.contentMd,
      createdAt: e.createdAt,
    }
  }
}

export function toDlNote(row: DlNoteRow): DlNote {
  return {
    id: row.id,
    projectId: row.projectId,
    conceptId: row.conceptId,
    source: row.source,
    anchorText: row.anchorText,
    anchorStart: row.anchorStart,
    anchorEnd: row.anchorEnd,
    questionId: row.questionId,
    contentMd: row.contentMd,
    createdAt: row.createdAt?.toISOString() ?? null,
  }
}
