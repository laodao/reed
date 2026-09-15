/**
 * 知识点节点字段变更审计仓库（dl_concept_log，2026-09-15 版本管理 B4）
 * @module database/repositories/dl-concept-log.repository
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlConceptLogEntity } from '../entities/domain-learning/dl-concept-log.entity'
import { BaseRepository } from '../base-repository'

export interface DlConceptLogRow {
  id: string
  userId: string | null
  projectId: string
  conceptId: string
  field: string
  fromValue: string | null
  toValue: string | null
  trigger: string
  at: Date | null
}

type LogWhere = FindOptionsWhere<DlConceptLogEntity>

export class DlConceptLogRepository extends BaseRepository<DlConceptLogEntity, DlConceptLogRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlConceptLogEntity)
  }

  async create(input: {
    id: string
    projectId: string
    conceptId: string
    field: string
    fromValue?: string | null
    toValue?: string | null
    trigger: string
  }): Promise<DlConceptLogRow> {
    const e = new DlConceptLogEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.conceptId = input.conceptId
    e.field = input.field
    e.fromValue = input.fromValue ?? null
    e.toValue = input.toValue ?? null
    e.trigger = input.trigger
    e.at = new Date()
    await this.scoped.insert(e)
    return this.toDto(e)
  }

  /** 某概念的变更历史（按时间倒序） */
  async listByConcept(projectId: string, conceptId: string): Promise<DlConceptLogRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, conceptId } as LogWhere,
      order: { at: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  /** 某概念某字段的变更历史 */
  async listByField(projectId: string, conceptId: string, field: string): Promise<DlConceptLogRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, conceptId, field } as LogWhere,
      order: { at: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  protected toDto(e: DlConceptLogEntity): DlConceptLogRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      conceptId: e.conceptId,
      field: e.field,
      fromValue: e.fromValue,
      toValue: e.toValue,
      trigger: e.trigger,
      at: e.at,
    }
  }
}