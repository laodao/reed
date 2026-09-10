/**
 * 领域学习掌握度审计仓库（dl_mastery_log，design-v3 §9）
 * @module database/repositories/dl-mastery-log.repository
 *
 * 追加写日志（无更新/删除语义）：mastery 每次变更记一行，触发源
 * lesson_ack/self_test/qna/expire/manual/split。由 learning-graph 服务写入。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlMasteryLogEntity } from '../entities/domain-learning/dl-mastery-log.entity'
import { BaseRepository } from '../base-repository'

/** dl_mastery_log 行 DTO */
export interface DlMasteryLogRow {
  id: string
  userId: string | null
  projectId: string
  conceptId: string
  fromMastery: string
  toMastery: string
  trigger: string
  at: Date | null
}

type LogWhere = FindOptionsWhere<DlMasteryLogEntity>

export class DlMasteryLogRepository extends BaseRepository<DlMasteryLogEntity, DlMasteryLogRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlMasteryLogEntity)
  }

  async append(input: {
    id: string
    projectId: string
    conceptId: string
    fromMastery: string
    toMastery: string
    trigger: string
    /** 审计时间（测试/回填可注入；缺省当前时刻） */
    at?: Date | null
  }): Promise<DlMasteryLogRow> {
    const e = new DlMasteryLogEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.conceptId = input.conceptId
    e.fromMastery = input.fromMastery
    e.toMastery = input.toMastery
    e.trigger = input.trigger
    e.at = input.at ?? new Date()
    await this.scoped.insert(e)
    return this.toDto(e)
  }

  /** 某概念全部变更轨迹（升序） */
  async listByConcept(projectId: string, conceptId: string): Promise<DlMasteryLogRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, conceptId } as LogWhere,
      order: { at: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 某项目全部掌握度日志（复习到期/统计用；个人规模全量内存遍历） */
  async listByProject(projectId: string): Promise<DlMasteryLogRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as LogWhere,
      order: { at: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  async countByConcept(projectId: string, conceptId: string): Promise<number> {
    return this.scoped.count({ projectId, conceptId } as LogWhere)
  }

  protected toDto(e: DlMasteryLogEntity): DlMasteryLogRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      conceptId: e.conceptId,
      fromMastery: e.fromMastery,
      toMastery: e.toMastery,
      trigger: e.trigger,
      at: e.at,
    }
  }
}
