/**
 * 领域学习空间（项目）服务
 * @module packs/domain-learning/services/learning-project.service
 *
 * 学习空间本体：建空间（自动挂根 group 目录）、列表、获取、状态切换、删除。
 * 纯 CRUD + 树根初始化；地图内容（concepts/relations）由地图人审环节填充。
 * 全部走 dl 仓储（ALS 租户过滤）。
 */

import type { DlProjectRepository, DlProjectRow } from '@core/database/repositories/dl-project.repository'
import type { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import type { DlPaceSettings, DlReviewSettings } from '@shared/types/domain-learning.types'
import { normalizeDlReviewSettings } from '../rules/learning-review.rules'
import { normalizePaceSettings } from './dl-pace-scheduler.service'
import { randomUUID } from 'crypto'

export interface CreateSpaceInput {
  name: string
  goal: string
  tagline?: string
  description?: string
  profileId?: string | null
  profile?: Record<string, unknown> | null
  /** 绑定的项目知识库 id（M4-B：研究/核验按此 kbId 检索） */
  kbId?: string | null
}

export interface SpaceSummaryRow {
  id: string
  name: string
  goal: string
  tagline: string
  profileId: string | null
  status: string
  createdAt: Date | null
}

export class LearningProjectService {
  constructor(
    private readonly projects: DlProjectRepository,
    private readonly concepts: DlConceptRepository,
  ) {}

  /** 建空间：dl_project + 领域根 group（树根，parent_id=null，node_type=group） */
  async createSpace(input: CreateSpaceInput): Promise<string> {
    const projectId = randomUUID()
    // 同级根目录唯一性由仓储 existsSiblingName 兜底（DDL UNIQUE 对 parent NULL 不生效）
    await this.projects.create({
      id: projectId,
      name: input.name,
      goal: input.goal,
      profileId: input.profileId,
      profile: input.profile,
      kbId: input.kbId ?? null,
      description: input.description,
    })
    await this.concepts.create({
      id: randomUUID(),
      projectId,
      nodeType: 'group',
      name: `${input.name}·领域根`,
      definitionShort: input.tagline ?? null,
    })
    return projectId
  }

  async getSpace(id: string): Promise<DlProjectRow | null> {
    return this.projects.getById(id)
  }

  /** 空间存在/属主校验(仓储走 ALS,getById 已按租户过滤;跨租户=null) */
  async ensureOwned(id: string): Promise<DlProjectRow> {
    const row = await this.projects.getById(id)
    if (!row) throw new Error('空间不存在或无权访问')
    return row
  }

  /** 改画像(预设 id + 自定义 JSON;校验空间存在) */
  async setProfile(id: string, profileId: string | null | undefined, profile: Record<string, unknown> | null | undefined): Promise<void> {
    await this.ensureOwned(id)
    await this.projects.patch(id, { profileId: profileId ?? null, profile: profile ?? null })
  }

  /** 绑定/改绑项目知识库（M4-B；null = 解除绑定） */
  async setKb(id: string, kbId: string | null | undefined): Promise<string | null> {
    await this.ensureOwned(id)
    const next = kbId?.trim() || null
    await this.projects.patch(id, { kbId: next })
    return next
  }

  /** 自动推进配置(读写均校验空间,归一化兜底) */
  async getPaceSettings(id: string): Promise<DlPaceSettings> {
    const row = await this.ensureOwned(id)
    return normalizePaceSettings(row.pace)
  }

  async setPaceSettings(id: string, pace: DlPaceSettings): Promise<DlPaceSettings> {
    const saved = normalizePaceSettings(pace)
    await this.ensureOwned(id)
    await this.projects.patch(id, { pace: saved })
    return saved
  }

  /** 间隔复习配置(读写均校验空间,归一化兜底) */
  async getReviewSettings(id: string): Promise<DlReviewSettings> {
    const row = await this.ensureOwned(id)
    return normalizeDlReviewSettings(row.review)
  }

  async setReviewSettings(id: string, review: DlReviewSettings): Promise<DlReviewSettings> {
    const saved = normalizeDlReviewSettings(review)
    await this.ensureOwned(id)
    await this.projects.patch(id, { review: saved })
    return saved
  }

  async listSpaces(): Promise<SpaceSummaryRow[]> {
    const rows = await this.projects.listAll()
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      goal: r.goal,
      tagline: r.description ?? '',
      profileId: r.profileId,
      status: r.status,
      createdAt: r.createdAt,
    }))
  }

  async setStatus(id: string, status: 'active' | 'paused' | 'archived'): Promise<void> {
    await this.projects.patch(id, { status })
  }

  /** 归档级联（预留：M1 仅切状态，概念/边数据保留） */
  async archive(id: string): Promise<void> {
    await this.projects.patch(id, { status: 'archived' })
  }
}
