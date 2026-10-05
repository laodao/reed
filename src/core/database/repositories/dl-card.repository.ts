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
import type { DlCardSection, DlWorkRef, DlEvidenceRef, DlCardVerification, DlLessonSpec } from '@shared/types/domain-learning.types'

/** content-template-design v4 §3：区集元素（契约同 shared DlCardSection） */
export type DlCardSectionDto = DlCardSection

/** content-template-design v4 §3：相关著作条目（契约同 shared DlWorkRef） */
export type DlCardWorkDto = DlWorkRef

/** content-template-design v4 §3：证据来源摘要（契约同 shared DlEvidenceRef） */
export type DlCardEvidenceDto = DlEvidenceRef

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
  /** 讲义设计规格（DlLessonSpec；2026-09-14；可空=老卡或未走规格流程） */
  spec: DlLessonSpec | null
  version: number
  status: string
  /** 内部核验记录（M4-UX2；可空=未核验） */
  verification: DlCardVerification | null
  /** 修订说明（人类可读；2026-09-15 版本管理 P1-1） */
  revisionNote: string | null
  /** 变更来源：agent | restore | template | manual */
  changeSource: string | null
  /** 结构化变更清单 JSON（对接技能 learning-lesson-updater 输出） */
  changed: Array<{ key?: string; kind?: string; reason?: string; evidence?: string }> | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type DlCardPatch = Partial<{
  essenceType: string
  sections: DlCardSectionDto[]
  works: DlCardWorkDto[] | null
  contentMd: string | null
  evidenceSources: DlCardEvidenceDto[] | null
  /** 讲义设计规格（2026-09-14）：写 null 清空 */
  spec: DlLessonSpec | null
  status: string
  verification: DlCardVerification | null
  revisionNote: string | null
  changeSource: string | null
  changed: Array<{ key?: string; kind?: string; reason?: string; evidence?: string }> | null
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

/** JSON **对象**列解析（spec；坏数据回落 null，不抛） */
function safeParseObject<T>(json: string | null): T | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null
  } catch {
    return null
  }
}

const VERIFY_STATUSES = ['unverified', 'verifying', 'verified', 'needs_review'] as const

function parseVerification(json: string | null): DlCardVerification | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Record<string, unknown>
    if (!v || typeof v !== 'object') return null
    const issues = Array.isArray(v.issues)
      ? (v.issues as DlCardVerification['issues']).filter((i) => i && typeof i === 'object' && i.verdict)
      : []
    const status = VERIFY_STATUSES.includes(v.status as (typeof VERIFY_STATUSES)[number]) ? (v.status as DlCardVerification['status']) : 'unverified'
    return {
      status,
      issues,
      checkedAt: typeof v.checkedAt === 'string' ? v.checkedAt : null,
      note: typeof v.note === 'string' ? v.note : null,
    }
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
    /** 讲义设计规格（已确认的 DlLessonSpec；未走规格流程时留空） */
    spec?: DlLessonSpec | null
    version?: number
    status?: string
    verification?: DlCardVerification | null
    revisionNote?: string | null
    changeSource?: string | null
    changed?: Array<{ key?: string; kind?: string; reason?: string; evidence?: string }> | null
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
    e.spec = input.spec ? JSON.stringify(input.spec) : null
    e.version = input.version ?? 1
    e.status = input.status ?? 'draft'
    e.verification = input.verification ? JSON.stringify(input.verification) : null
    e.revisionNote = input.revisionNote ?? null
    e.changeSource = input.changeSource ?? null
    e.changedJson = input.changed ? JSON.stringify(input.changed) : null
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

  /** 某项目全部卡片（统计/导出用；个人规模全量内存遍历） */
  async listByProject(projectId: string): Promise<DlCardRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as CardWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 删某概念的全部讲义（含全部历史版本；删除知识点时级联用） */
  async deleteByConcept(projectId: string, conceptId: string): Promise<number> {
    return this.scoped.delete({ projectId, conceptId } as CardWhere)
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
    if (patch.spec !== undefined) partial.spec = patch.spec ? JSON.stringify(patch.spec) : null
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.verification !== undefined)
      partial.verification = patch.verification ? JSON.stringify(patch.verification) : null
    if (patch.revisionNote !== undefined) partial.revisionNote = patch.revisionNote ?? null
    if (patch.changeSource !== undefined) partial.changeSource = patch.changeSource ?? null
    if (patch.changed !== undefined)
      partial.changedJson = patch.changed ? JSON.stringify(patch.changed) : null
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
      spec: safeParseObject<DlLessonSpec>(e.spec),
      version: e.version,
      status: e.status,
      verification: parseVerification(e.verification),
      revisionNote: e.revisionNote,
      changeSource: e.changeSource,
      changed: safeParseArray<{ key?: string; kind?: string; reason?: string; evidence?: string }>(e.changedJson),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
