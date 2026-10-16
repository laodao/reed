/**
 * 领域学习文档型内容仓库（dl_doc，design-v3 §9）
 * @module database/repositories/dl-doc.repository
 *
 * 非排程单元：导读（intro）/分支总览（review）/手册（manual）。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlDocEntity } from '../entities/domain-learning/dl-doc.entity'
import { BaseRepository } from '../base-repository'
import { safeParseJsonArray } from '../json-column'

/** dl_doc 行 DTO（concept_ids JSON 已解析） */
export interface DlDocRow {
  id: string
  userId: string | null
  projectId: string
  docType: string
  title: string
  conceptIds: string[]
  contentMd: string | null
  createdAt: Date | null
  publishedAt: Date | null
}

export type DlDocPatch = Partial<{
  docType: string
  title: string
  conceptIds: string[]
  contentMd: string | null
  publishedAt: Date | null
}>

type DocWhere = FindOptionsWhere<DlDocEntity>

export class DlDocRepository extends BaseRepository<DlDocEntity, DlDocRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlDocEntity)
  }

  async create(input: {
    id: string
    projectId: string
    docType: string
    title: string
    conceptIds?: string[]
    contentMd?: string | null
  }): Promise<DlDocRow> {
    const now = new Date()
    const e = new DlDocEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.docType = input.docType
    e.title = input.title
    e.conceptIds = input.conceptIds ? JSON.stringify(input.conceptIds) : null
    e.contentMd = input.contentMd ?? null
    e.createdAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlDocRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 项目内某类型文档（如该领域导读只有一篇） */
  async listByProject(projectId: string): Promise<DlDocRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as DocWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 项目内某类型的最近一篇（同一 docType 通常只保留一篇最新） */
  async getLatestByType(projectId: string, docType: string): Promise<DlDocRow | null> {
    const rows = await this.scoped.find({
      where: { projectId, docType } as DocWhere,
      order: { createdAt: 'DESC' },
      take: 1,
    })
    return rows.length > 0 ? this.toDto(rows[0]) : null
  }

  async patch(id: string, patch: DlDocPatch): Promise<void> {
    const partial: Partial<DlDocEntity> = {}
    if (patch.docType !== undefined) partial.docType = patch.docType
    if (patch.title !== undefined) partial.title = patch.title
    if (patch.conceptIds !== undefined)
      partial.conceptIds = patch.conceptIds ? JSON.stringify(patch.conceptIds) : null
    if (patch.contentMd !== undefined) partial.contentMd = patch.contentMd
    if (patch.publishedAt !== undefined) partial.publishedAt = patch.publishedAt
    await this.scoped.update({ id }, partial)
  }

  async deleteById(id: string): Promise<number> {
    return this.scoped.delete({ id })
  }

  protected toDto(e: DlDocEntity): DlDocRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      docType: e.docType,
      title: e.title,
      // 复核修复 P2-1：原为裸 JSON.parse——concept_ids 脏数据会让 toDto 抛错、
      // 整条列表查询失败。改走统一安全解析（失败降级空数组并记日志）。
      conceptIds: safeParseJsonArray<string>(e.conceptIds, 'DlDocEntity#conceptIds'),
      contentMd: e.contentMd,
      createdAt: e.createdAt,
      publishedAt: e.publishedAt,
    }
  }
}
