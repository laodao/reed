/**
 * 领域学习关系边仓库（dl_relation，design-v3 §9）
 * @module database/repositories/dl-relation.repository
 *
 * 概念图的有向边。relation_type 分层见 dl-relation.entity；「前置依赖」边
 * (source→target) 驱动学习门控。三元唯一（project+source+target+type）由 DDL
 * 保证，同边人工确认/抽取按幂等 upsert。verified 由地图人审/关系确认置 1。
 */

import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { DlRelationEntity } from '../entities/domain-learning/dl-relation.entity'
import { BaseRepository } from '../base-repository'

/** dl_relation 行 DTO */
export interface DlRelationRow {
  id: string
  userId: string | null
  projectId: string
  sourceId: string
  targetId: string
  relationType: string
  evidence: string | null
  verified: boolean
  createdAt: Date | null
}

export type DlRelationPatch = Partial<{
  relationType: string
  evidence: string | null
  verified: boolean
}>

type RelationWhere = FindOptionsWhere<DlRelationEntity>

export class DlRelationRepository extends BaseRepository<DlRelationEntity, DlRelationRow> {
  constructor(dataSource: DataSource) {
    super(dataSource, DlRelationEntity)
  }

  /**
   * 创建边。同三元组已存在时：若 verified 升级（草案→确认）则更新证据/置 verified，
   * 否则视为重复（幂等返回已存在行）。
   */
  async create(input: {
    id: string
    projectId: string
    sourceId: string
    targetId: string
    relationType: string
    evidence?: string | null
    verified?: boolean
  }): Promise<DlRelationRow> {
    const existing = await this.scoped.findOne({
      projectId: input.projectId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      relationType: input.relationType,
    } as RelationWhere)
    if (existing) {
      const verified = input.verified ?? false
      if (verified && !existing.verified) {
        await this.patch(existing.id, { verified: true, evidence: input.evidence ?? existing.evidence })
      }
      return (await this.getById(existing.id))!
    }
    const now = new Date()
    const e = new DlRelationEntity()
    e.id = input.id
    e.userId = null // scoped.insert 注入
    e.projectId = input.projectId
    e.sourceId = input.sourceId
    e.targetId = input.targetId
    e.relationType = input.relationType
    e.evidence = input.evidence ?? null
    e.verified = input.verified ? 1 : 0
    e.createdAt = now
    await this.scoped.insert(e)
    return (await this.getById(input.id))!
  }

  async getById(id: string): Promise<DlRelationRow | null> {
    const e = await this.scoped.findOne({ id })
    return e ? this.toDto(e) : null
  }

  /** 项目全部边（图聚合；个人规模全量内存遍历） */
  async listByProject(projectId: string): Promise<DlRelationRow[]> {
    const rows = await this.scoped.find({
      where: { projectId } as RelationWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 某节点为起点的边（related 派生/门控用） */
  async listBySource(projectId: string, sourceId: string): Promise<DlRelationRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, sourceId } as RelationWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 某节点为终点的边 */
  async listByTarget(projectId: string, targetId: string): Promise<DlRelationRow[]> {
    const rows = await this.scoped.find({
      where: { projectId, targetId } as RelationWhere,
      order: { createdAt: 'ASC' },
    })
    return this.toDtoList(rows)
  }

  /** 前置依赖（target 依赖 source；source→target 边，relationType 固定值） */
  async listPrerequisites(projectId: string, conceptId: string): Promise<DlRelationRow[]> {
    const rows = await this.scoped.find({
      where: {
        projectId,
        targetId: conceptId,
        relationType: PREREQUISITE_TYPE,
      } as RelationWhere,
    })
    return this.toDtoList(rows)
  }

  async patch(id: string, patch: DlRelationPatch): Promise<void> {
    const partial: Partial<DlRelationEntity> = {}
    if (patch.relationType !== undefined) partial.relationType = patch.relationType
    if (patch.evidence !== undefined) partial.evidence = patch.evidence
    if (patch.verified !== undefined) partial.verified = patch.verified ? 1 : 0
    await this.scoped.update({ id }, partial)
  }

  async deleteById(id: string): Promise<number> {
    return this.scoped.delete({ id })
  }

  protected toDto(e: DlRelationEntity): DlRelationRow {
    return {
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      sourceId: e.sourceId,
      targetId: e.targetId,
      relationType: e.relationType,
      evidence: e.evidence,
      verified: e.verified === 1,
      createdAt: e.createdAt,
    }
  }
}

/** 前置依赖关系类型（source→target：学 target 前需掌握 source） */
export const PREREQUISITE_TYPE = 'prerequisite'
