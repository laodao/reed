/**
 * 信息搜集「源记录」仓库（ic_sources，2026-10-07 设计落地）
 * @module database/repositories/ic-source.repository
 *
 * 过程心脏：一个 URL 一行。增量采集以 (projectId, urlNormalized) 查重跳过；
 * 审阅状态机 staged → confirmed/rejected/merged 由人审推进。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { IcSourceEntity } from '../entities/info-collection/ic-source.entity'
import type { IcFetchStatus, IcReviewStatus, IcSourceTier } from '@shared/types/info-collection.types'
import { BaseRepository } from '../base-repository'

/** ic_sources 行 DTO（irHits 已解析） */
export interface IcSourceRow {
  id: string
  userId: string | null
  projectId: string
  taskId: string
  url: string
  urlNormalized: string
  tier: IcSourceTier | null
  tierRationale: string | null
  isPrimary: boolean
  clusterId: string | null
  publishedAt: Date | null
  collectedAt: Date | null
  snapshotPath: string | null
  contentHash: string | null
  /** IcFingerprint JSON 字符串原样（结构由 shared 纯函数定义，此处不解析） */
  textFingerprint: string | null
  fetchStatus: IcFetchStatus
  reviewStatus: IcReviewStatus
  kbDocumentId: string | null
  irHits: string[]
  createdAt: Date | null
  updatedAt: Date | null
}

function safeParseStringArray(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

type SourceWhere = FindOptionsWhere<IcSourceEntity>

export class IcSourceRepository extends BaseRepository<IcSourceEntity, IcSourceRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, IcSourceEntity)
  }

  async create(input: {
    id: string
    projectId: string
    taskId: string
    url: string
    urlNormalized: string
    fetchStatus?: IcFetchStatus
    snapshotPath?: string | null
    contentHash?: string | null
    textFingerprint?: string | null
    publishedAt?: Date | null
    collectedAt?: Date | null
    irHits?: string[]
  }): Promise<IcSourceRow> {
    const now = new Date()
    const e = new IcSourceEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.taskId = input.taskId
    e.url = input.url
    e.urlNormalized = input.urlNormalized
    e.tier = null // 定级在阶段 3；未定级不允许入库（服务层守卫）
    e.tierRationale = null
    e.isPrimary = 0
    e.clusterId = null
    e.publishedAt = input.publishedAt ?? null
    e.collectedAt = input.collectedAt ?? now
    e.snapshotPath = input.snapshotPath ?? null
    e.contentHash = input.contentHash ?? null
    e.textFingerprint = input.textFingerprint ?? null
    e.fetchStatus = input.fetchStatus ?? 'ok'
    e.reviewStatus = 'staged'
    e.kbDocumentId = null
    e.irHitsJson = input.irHits?.length ? JSON.stringify(input.irHits) : null
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<IcSourceRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 增量采集查重：该项目下此规范化 URL 是否已采过 */
  async findByUrl(projectId: string, urlNormalized: string): Promise<IcSourceRow | null> {
    const e = await this.scoped.findOne({ projectId, urlNormalized } as SourceWhere)
    return e ? this.toDto(e) : null
  }

  async listByProject(
    projectId: string,
    filter?: { reviewStatus?: IcReviewStatus; fetchStatus?: IcFetchStatus },
  ): Promise<IcSourceRow[]> {
    const where: SourceWhere = { projectId }
    if (filter?.reviewStatus) where.reviewStatus = filter.reviewStatus
    if (filter?.fetchStatus) where.fetchStatus = filter.fetchStatus
    const rows = await this.scoped.find({ where, order: { collectedAt: 'DESC' } })
    return this.toDtoList(rows)
  }

  async listByTask(taskId: string): Promise<IcSourceRow[]> {
    const rows = await this.scoped.find({ where: { taskId }, order: { collectedAt: 'DESC' } })
    return this.toDtoList(rows)
  }

  async patch(
    id: string,
    partial: Partial<{
      tier: IcSourceTier | null
      tierRationale: string | null
      isPrimary: boolean
      clusterId: string | null
      fetchStatus: IcFetchStatus
      reviewStatus: IcReviewStatus
      kbDocumentId: string | null
      irHits: string[]
      snapshotPath: string | null
      contentHash: string | null
      textFingerprint: string | null
      publishedAt: Date | null
    }>,
  ): Promise<void> {
    const p: Partial<IcSourceEntity> = { updatedAt: new Date() }
    if (partial.tier !== undefined) p.tier = partial.tier
    if (partial.tierRationale !== undefined) p.tierRationale = partial.tierRationale
    if (partial.isPrimary !== undefined) p.isPrimary = partial.isPrimary ? 1 : 0
    if (partial.clusterId !== undefined) p.clusterId = partial.clusterId
    if (partial.fetchStatus !== undefined) p.fetchStatus = partial.fetchStatus
    if (partial.reviewStatus !== undefined) p.reviewStatus = partial.reviewStatus
    if (partial.kbDocumentId !== undefined) p.kbDocumentId = partial.kbDocumentId
    if (partial.irHits !== undefined) {
      p.irHitsJson = partial.irHits.length ? JSON.stringify(partial.irHits) : null
    }
    if (partial.snapshotPath !== undefined) p.snapshotPath = partial.snapshotPath
    if (partial.contentHash !== undefined) p.contentHash = partial.contentHash
    if (partial.textFingerprint !== undefined) p.textFingerprint = partial.textFingerprint
    if (partial.publishedAt !== undefined) p.publishedAt = partial.publishedAt
    await this.scoped.update({ id }, p)
  }

  protected toDto(e: IcSourceEntity): IcSourceRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      taskId: e.taskId,
      url: e.url,
      urlNormalized: e.urlNormalized,
      tier: (e.tier ?? null) as IcSourceTier | null,
      tierRationale: e.tierRationale,
      isPrimary: e.isPrimary === 1,
      clusterId: e.clusterId,
      publishedAt: e.publishedAt,
      collectedAt: e.collectedAt,
      snapshotPath: e.snapshotPath,
      contentHash: e.contentHash,
      textFingerprint: e.textFingerprint,
      fetchStatus: e.fetchStatus as IcFetchStatus,
      reviewStatus: e.reviewStatus as IcReviewStatus,
      kbDocumentId: e.kbDocumentId,
      irHits: safeParseStringArray(e.irHitsJson),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
