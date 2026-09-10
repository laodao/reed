/**
 * 领域学习空间仓库（dl_project，design-v3 §9）
 * @module database/repositories/dl-project.repository
 *
 * 学习空间本体 CRUD。状态机语义（active/paused/archived）由 learning-project
 * 服务收口，本仓库只做行存取；全部走 scoped（ALS 租户过滤）。
 */

import { type DataSource } from 'typeorm'
import { DlProjectEntity } from '../entities/domain-learning/dl-project.entity'
import { BaseRepository } from '../base-repository'
import type { DlPaceSettings, DlReviewSettings } from '@shared/types/domain-learning.types'

/** dl_project 行 DTO（JSON 列已解析） */
export interface DlProjectRow {
  id: string
  userId: string | null
  name: string
  goal: string
  profileId: string | null
  /** 自定义画像（可空） */
  profile: Record<string, unknown> | null
  status: string
  description: string | null
  kbId: string | null
  /** 默认模型：{ providerConfigId?, modelId? }（可空） */
  defaultModel: Record<string, unknown> | null
  /** 周期推进配置（M2-C；可空 = 未配置，默认关闭） */
  pace: DlPaceSettings | null
  /** 间隔复习配置（M3-B；可空 = 未配置，默认关闭） */
  review: DlReviewSettings | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type DlProjectPatch = Partial<{
  name: string
  goal: string
  profileId: string | null
  profile: Record<string, unknown> | null
  status: string
  description: string | null
  kbId: string | null
  defaultModel: Record<string, unknown> | null
  pace: DlPaceSettings | null
  review: DlReviewSettings | null
}>

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function parsePace(json: string | null): DlPaceSettings | null {
  const raw = safeParse(json)
  if (!raw || typeof raw !== 'object') return null
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : false
  const intervalMin = typeof raw.intervalMin === 'number' && raw.intervalMin >= 1 ? raw.intervalMin : 30
  const autoResearchConcepts = typeof raw.autoResearchConcepts === 'boolean' ? raw.autoResearchConcepts : true
  const autoResolveOpenQuestions = typeof raw.autoResolveOpenQuestions === 'boolean' ? raw.autoResolveOpenQuestions : true
  return { enabled, intervalMin, autoResearchConcepts, autoResolveOpenQuestions }
}

function parseReview(json: string | null): DlReviewSettings | null {
  const raw = safeParse(json)
  if (!raw || typeof raw !== 'object') return null
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
    intervalMin: typeof raw.intervalMin === 'number' && raw.intervalMin >= 1 ? raw.intervalMin : 1440,
    limit: typeof raw.limit === 'number' && raw.limit >= 1 ? raw.limit : 10,
  }
}

export class DlProjectRepository extends BaseRepository<DlProjectEntity, DlProjectRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlProjectEntity)
  }

  async create(input: {
    id: string
    name: string
    goal: string
    profileId?: string | null
    profile?: Record<string, unknown> | null
    status?: string
    description?: string | null
    kbId?: string | null
    defaultModel?: Record<string, unknown> | null
    pace?: DlPaceSettings | null
    review?: DlReviewSettings | null
  }): Promise<DlProjectRow> {
    const now = new Date()
    const e = new DlProjectEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.name = input.name
    e.goal = input.goal
    e.profileId = input.profileId ?? null
    e.profileJson = input.profile ? JSON.stringify(input.profile) : null
    e.status = input.status ?? 'active'
    e.description = input.description ?? null
    e.kbId = input.kbId ?? null
    e.defaultModel = input.defaultModel ? JSON.stringify(input.defaultModel) : null
    e.paceSettings = input.pace ? JSON.stringify(input.pace) : null
    e.reviewSettings = input.review ? JSON.stringify(input.review) : null
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlProjectRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 列出当前用户全部空间（active 在前，按创建时间倒序） */
  async listAll(): Promise<DlProjectRow[]> {
    const rows = await this.scoped.find({
      order: { status: 'ASC', createdAt: 'DESC' },
    })
    return this.toDtoList(rows)
  }

  async patch(id: string, patch: DlProjectPatch): Promise<void> {
    const partial: Partial<DlProjectEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.goal !== undefined) partial.goal = patch.goal
    if (patch.profileId !== undefined) partial.profileId = patch.profileId
    if (patch.profile !== undefined)
      partial.profileJson = patch.profile ? JSON.stringify(patch.profile) : null
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.description !== undefined) partial.description = patch.description
    if (patch.kbId !== undefined) partial.kbId = patch.kbId
    if (patch.defaultModel !== undefined)
      partial.defaultModel = patch.defaultModel ? JSON.stringify(patch.defaultModel) : null
    if (patch.pace !== undefined)
      partial.paceSettings = patch.pace ? JSON.stringify(patch.pace) : null
    if (patch.review !== undefined)
      partial.reviewSettings = patch.review ? JSON.stringify(patch.review) : null
    await this.scoped.update({ id }, partial)
  }

  async deleteById(id: string): Promise<number> {
    return this.scoped.delete({ id })
  }

  protected toDto(e: DlProjectEntity): DlProjectRow {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      goal: e.goal,
      profileId: e.profileId,
      profile: safeParse(e.profileJson),
      status: e.status,
      description: e.description,
      kbId: e.kbId,
      defaultModel: safeParse(e.defaultModel),
      pace: parsePace(e.paceSettings),
      review: parseReview(e.reviewSettings),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }
}
