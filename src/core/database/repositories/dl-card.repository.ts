/**
 * 领域学习概念讲义仓库（dl_card，design-v3 §9 + content-template-design v4 §3）
 * @module database/repositories/dl-card.repository
 *
 * 一概念至多一篇当前版（create 前由服务层查 getCurrentByConcept 决定升版或新建）。
 * sections/works/evidence_sources 为 JSON 列，Entity 存 text、Row 已解析。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlCardEntity } from '../entities/domain-learning/dl-card.entity'
import { BaseRepository } from '../base-repository'

/** content-template-design v4 §3：区集元素 */
export interface DlCardSectionDto {
  key: string
  title?: string
  style?: string
  md: string
  folded?: boolean
}

/** content-template-design v4 §3：相关著作条目 */
export interface DlCardWorkDto {
  kind: string
  title: string
  authors?: string
  year?: string
  url?: string
  note?: string
}

/** content-template-design v4 §3：证据来源摘要 */
export interface DlCardEvidenceDto {
  kind: string
  title: string
  url?: string
  kbDocId?: string
  quote?: string
}

/** dl_card 行 DTO（JSON 列已解析） */
export interface DlCardRow {
  id: string
  userId: string | null
  projectId: string
  conceptId: string
  essenceType: string
  sections: DlCardSectionDto[]
  works: DlCardWorkDto[] | null
  contentMd: string | null
  evidenceSources: DlCardEvidenceDto[] | null
  version: number
  status: string
  createdAt: Date | null
  updatedAt: Date | null
}

export type DlCardPatch = Partial<{
  essenceType: string
  sections: DlCardSectionDto[]
  works: DlCardWorkDto[] | null
  contentMd: string | null
  evidenceSources: DlCardEvidenceDto[] | null
  status: string
}>

type CardWhere = FindOptionsWhere<DlCardEntity>

function safeParseArray<T>(json: string | null): T[] | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as unknown
    return Array.isArray(v) ? (v as T[]) : null
  } catch {
    return null
  }
}

export class DlCardRepository extends BaseRepository<DlCardEntity, DlCardRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlCardEntity)
  }

  async create(input: {
    id: string
    projectId: string
    conceptId: string
    essenceType: string
    sections: DlCardSectionDto[]
    works?: DlCardWorkDto[] | null
    contentMd?: string | null
    evidenceSources?: DlCardEvidenceDto[] | null
    version?: number
    status?: string
  }): Promise<DlCardRow> {
    const now = new Date()
    const e = new DlCardEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.conceptId = input.conceptId
    e.essenceType = input.essenceType
    e.sections = JSON.stringify(input.sections)
    e.works = input.works ? JSON.stringify(input.works) : null
    e.contentMd = input.contentMd ?? null
    e.evidenceSources = input.evidenceSources ? JSON.stringify(input.evidenceSources) : null
    e.version = input.version ?? 1
    e.status = input.status ?? 'draft'
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlCardRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 某概念当前（最新 version 的）卡片 */
  async getCurrentByConcept(projectId: string, conceptId: string): Promise<DlCardRow | null> {
    const rows = await this.scoped.find({
      where: { projectId, conceptId } as CardWhere,
      order: { version: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  /** 某概念全部版本（升序） */
  async listVersionsByConcept(projectId: string, conceptId: string): Promise<DlCardRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, conceptId } as CardWhere,
      order: { version: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  async patch(id: string, patch: DlCardPatch): Promise<void> {
    const partial: Partial<DlCardEntity> = { updatedAt: new Date() }
    if (patch.essenceType !== undefined) partial.essenceType = patch.essenceType
    if (patch.sections !== undefined) partial.sections = JSON.stringify(patch.sections)
    if (patch.works !== undefined)
      partial.works = patch.works ? JSON.stringify(patch.works) : null
    if (patch.contentMd !== undefined) partial.contentMd = patch.contentMd
    if (patch.evidenceSources !== undefined)
      partial.evidenceSources = patch.evidenceSources
        ? JSON.stringify(patch.evidenceSources)
        : null
    if (patch.status !== undefined) partial.status = patch.status
    await this.scoped.update({ id }, partial)
  }

  protected toDto(e: DlCardEntity): DlCardRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      conceptId: e.conceptId,
      essenceType: e.essenceType,
      sections: safeParseArray<DlCardSectionDto>(e.sections) ?? [],
      works: safeParseArray<DlCardWorkDto>(e.works),
      contentMd: e.contentMd,
      evidenceSources: safeParseArray<DlCardEvidenceDto>(e.evidenceSources),
      version: e.version,
      status: e.status,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
