/**
 * 信息搜集「结构化行」仓库（ic_rows，2026-10-07 设计落地）
 * @module database/repositories/ic-row.repository
 *
 * 存储模型（storage 专项 §2/§3）：row_json 全量权威，约定列（value/unit/period/
 * metric/dims）为归一化器派生的可计算投影。版本链（supersededBy 关旧开新）与
 * content_hash 去重是行级治理的核心——分域裁决：查重只在本项目内比较。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { IcRowEntity } from '../entities/info-collection/ic-row.entity'
import type { IcConfidence, IcRowStatus, IcRowMeasure } from '@shared/types/info-collection.types'
import { BaseRepository } from '../base-repository'

/** ic_rows 行 DTO（JSON 已解析；measure 为约定列投影） */
export interface IcRowItem {
  id: string
  userId: string | null
  projectId: string
  taskId: string
  sourceId: string | null
  schemaId: string
  requirementId: string | null
  /** 全量数据字段（唯一权威形态） */
  row: unknown
  /** measure 约定列投影（蓝图无 convention 的行全为 null） */
  measure: IcRowMeasure
  quote: string | null
  confidence: IcConfidence
  status: IcRowStatus
  supersededBy: string | null
  /** 派生行溯源（由哪几行算的；与 sourceId 至少一个） */
  derivedFrom: string[] | null
  contentHash: string | null
  needsReview: boolean
  /** 孤证标记：must 级 IR 仅一个独立源支撑 */
  singleSource: boolean
  /** 裁决备注（复核不一致原因 / 冲突归因结论） */
  reviewNote: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

type RowWhere = FindOptionsWhere<IcRowEntity>

export class IcRowRepository extends BaseRepository<IcRowEntity, IcRowItem> {
  constructor(dataSource: DataSource) {
    super(dataSource, IcRowEntity)
  }

  async create(input: {
    id: string
    projectId: string
    taskId: string
    schemaId: string
    row: unknown
    measure?: IcRowMeasure | null
    sourceId?: string | null
    requirementId?: string | null
    quote?: string | null
    confidence?: IcConfidence
    derivedFrom?: string[] | null
    contentHash?: string | null
    needsReview?: boolean
  }): Promise<IcRowItem> {
    const now = new Date()
    const m = input.measure ?? null
    const e = new IcRowEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.taskId = input.taskId
    e.sourceId = input.sourceId ?? null
    e.schemaId = input.schemaId
    e.requirementId = input.requirementId ?? null
    e.rowJson = JSON.stringify(input.row)
    e.value = m?.value ?? null
    e.unit = m?.unit ?? null
    e.period = m?.period ?? null
    e.metric = m?.metric ?? null
    e.dimsJson = m?.dims && Object.keys(m.dims).length > 0 ? JSON.stringify(m.dims) : null
    e.quote = input.quote ?? null
    e.confidence = input.confidence ?? 'high'
    e.status = 'draft'
    e.supersededBy = null
    e.derivedFromJson = input.derivedFrom?.length ? JSON.stringify(input.derivedFrom) : null
    e.contentHash = input.contentHash ?? null
    e.needsReview = input.needsReview ? 1 : 0
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<IcRowItem | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  async listByProject(
    projectId: string,
    filter?: { schemaId?: string; status?: IcRowStatus },
  ): Promise<IcRowItem[]> {
    const where: RowWhere = { projectId }
    if (filter?.schemaId) where.schemaId = filter.schemaId
    if (filter?.status) where.status = filter.status
    const rows = await this.scoped.find({ where, order: { createdAt: 'DESC' } })
    return this.toDtoList(rows)
  }

  async listBySource(sourceId: string): Promise<IcRowItem[]> {
    const rows = await this.scoped.find({ where: { sourceId }, order: { createdAt: 'ASC' } })
    return this.toDtoList(rows)
  }

  /** 分域查重：本项目同 schema 下同内容哈希的已有行（merged 判定） */
  async findByHash(projectId: string, schemaId: string, contentHash: string): Promise<IcRowItem | null> {
    const e = await this.scoped.findOne({ projectId, schemaId, contentHash } as RowWhere)
    return e ? this.toDto(e) : null
  }

  /** 批量确认（人审通过；不含派生行字段变更） */
  async confirmRows(ids: string[]): Promise<number> {
    let affected = 0
    for (const id of ids) {
      affected += await this.scoped.update({ id }, { status: 'confirmed', updatedAt: new Date() })
    }
    return affected
  }

  /** 关旧开新：旧行标 superseded 并指向新行（历史可回溯；不物理删） */
  async supersede(id: string, byRowId: string): Promise<void> {
    await this.scoped.update({ id }, { status: 'superseded', supersededBy: byRowId, updatedAt: new Date() })
  }

  async patch(
    id: string,
    partial: Partial<{
      row: unknown
      measure: IcRowMeasure | null
      quote: string | null
      confidence: IcConfidence
      status: IcRowStatus
      needsReview: boolean
      singleSource: boolean
      reviewNote: string | null
      contentHash: string | null
    }>,
  ): Promise<void> {
    const p: Partial<IcRowEntity> = { updatedAt: new Date() }
    if (partial.row !== undefined) p.rowJson = JSON.stringify(partial.row)
    if (partial.measure !== undefined) {
      const m = partial.measure
      p.value = m?.value ?? null
      p.unit = m?.unit ?? null
      p.period = m?.period ?? null
      p.metric = m?.metric ?? null
      p.dimsJson = m?.dims && Object.keys(m.dims).length > 0 ? JSON.stringify(m.dims) : null
    }
    if (partial.quote !== undefined) p.quote = partial.quote
    if (partial.confidence !== undefined) p.confidence = partial.confidence
    if (partial.status !== undefined) p.status = partial.status
    if (partial.needsReview !== undefined) p.needsReview = partial.needsReview ? 1 : 0
    if (partial.singleSource !== undefined) p.singleSource = partial.singleSource ? 1 : 0
    if (partial.reviewNote !== undefined) p.reviewNote = partial.reviewNote
    if (partial.contentHash !== undefined) p.contentHash = partial.contentHash
    await this.scoped.update({ id }, p)
  }

  protected toDto(e: IcRowEntity): IcRowItem {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      taskId: e.taskId,
      sourceId: e.sourceId,
      schemaId: e.schemaId,
      requirementId: e.requirementId,
      row: safeParse(e.rowJson),
      measure: {
        value: e.value,
        unit: e.unit,
        period: e.period,
        metric: e.metric,
        dims: safeParse<Record<string, unknown>>(e.dimsJson),
      },
      quote: e.quote,
      confidence: e.confidence as IcConfidence,
      status: e.status as IcRowStatus,
      supersededBy: e.supersededBy,
      derivedFrom: safeParse<string[]>(e.derivedFromJson),
      contentHash: e.contentHash,
      needsReview: e.needsReview === 1,
      singleSource: e.singleSource === 1,
      reviewNote: e.reviewNote,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
