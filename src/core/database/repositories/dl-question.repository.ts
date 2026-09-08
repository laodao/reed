/**
 * 领域学习追问/未解问题仓库（dl_question，design-v3 §9）
 * @module database/repositories/dl-question.repository
 *
 * status：open（=未解队列）/ answered / escalated（研究中）/ resolved。
 * answer_source 记录回答来源，支撑先验确认与新研究方向两条链路。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlQuestionEntity } from '../entities/domain-learning/dl-question.entity'
import { BaseRepository } from '../base-repository'

/** dl_question 行 DTO */
export interface DlQuestionRow {
  id: string
  userId: string | null
  projectId: string
  conceptId: string | null
  question: string
  answerMd: string | null
  answerSource: string | null
  status: string
  createdAt: Date | null
  answeredAt: Date | null
}

export type DlQuestionPatch = Partial<{
  conceptId: string | null
  answerMd: string | null
  answerSource: string | null
  status: string
  answeredAt: Date | null
}>

type QuestionWhere = FindOptionsWhere<DlQuestionEntity>

export class DlQuestionRepository extends BaseRepository<DlQuestionEntity, DlQuestionRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlQuestionEntity)
  }

  async create(input: {
    id: string
    projectId: string
    conceptId?: string | null
    question: string
  }): Promise<DlQuestionRow> {
    const e = new DlQuestionEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.conceptId = input.conceptId ?? null
    e.question = input.question
    e.answerMd = null
    e.answerSource = null
    e.status = 'open'
    e.createdAt = new Date()
    await this.scoped.insert(e)
    return this.toDto(e)
  }

  async getById(id: string): Promise<DlQuestionRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 项目全部问题（新建在前） */
  async listByProject(projectId: string): Promise<DlQuestionRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as QuestionWhere,
      order: { createdAt: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  /** 未解队列（open，project 维度） */
  async listOpenByProject(projectId: string): Promise<DlQuestionRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, status: 'open' } as QuestionWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  async countOpenByProject(projectId: string): Promise<number> {
    return this.scoped.count({ projectId, status: 'open' } as QuestionWhere)
  }

  async patch(id: string, patch: DlQuestionPatch): Promise<void> {
    const partial: Partial<DlQuestionEntity> = {}
    if (patch.conceptId !== undefined) partial.conceptId = patch.conceptId
    if (patch.answerMd !== undefined) partial.answerMd = patch.answerMd
    if (patch.answerSource !== undefined) partial.answerSource = patch.answerSource
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.answeredAt !== undefined) partial.answeredAt = patch.answeredAt
    await this.scoped.update({ id }, partial)
  }

  protected toDto(e: DlQuestionEntity): DlQuestionRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      conceptId: e.conceptId,
      question: e.question,
      answerMd: e.answerMd,
      answerSource: e.answerSource,
      status: e.status,
      createdAt: e.createdAt,
      answeredAt: e.answeredAt,
    }
  }
}
