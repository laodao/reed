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
import { randomUUID } from 'crypto'

export interface CreateSpaceInput {
  name: string
  goal: string
  tagline?: string
  description?: string
  profileId?: string | null
  profile?: Record<string, unknown> | null
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
