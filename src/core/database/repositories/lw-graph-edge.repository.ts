/**
 * 长文写作图谱关系边仓库
 * @module database/repositories/lw-graph-edge.repository
 * @description 基于 TypeORM 实现，全部读写走 this.scoped.*（user_id 多租户隔离）。
 *              边带时间线有效期：valid_from_chapter / valid_until_chapter。
 */

import type { DataSource } from 'typeorm'
import { In } from 'typeorm'
import type {
  GraphEdge,
  GraphEntityType,
  CreateGraphEdgeRequest,
  UpdateGraphEdgeRequest,
} from '@shared/types/longwriting.types'
import { LwGraphEdgeEntity } from '../entities/lw-graph-edge.entity'
import { BaseRepository } from '../base-repository'
import { randomUUID } from 'crypto'

export class LwGraphEdgeRepository extends BaseRepository<LwGraphEdgeEntity, GraphEdge> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwGraphEdgeEntity)
  }

  protected toDto(e: LwGraphEdgeEntity): GraphEdge {
    return {
      id: e.id,
      projectId: e.projectId,
      sourceType: e.sourceType as GraphEntityType,
      sourceId: e.sourceId,
      targetType: e.targetType as GraphEntityType,
      targetId: e.targetId,
      relationType: e.relationType,
      label: e.label ?? undefined,
      validFromChapter: e.validFromChapter ?? undefined,
      validUntilChapter: e.validUntilChapter ?? undefined,
      description: e.description ?? undefined,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getByProjectId(projectId: string): Promise<GraphEdge[]> {
    const rows = await this.scoped.find({
      where: { projectId } as any,
      order: { createdAt: 'ASC' as const },
    })
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<GraphEdge | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }

  /** 某实体的全部关系边（含已失效，供时间线展示） */
  async getByEntity(projectId: string, entityType: GraphEntityType, entityId: string): Promise<GraphEdge[]> {
    const rows = await this.scoped.find({
      where: [
        { projectId, sourceType: entityType, sourceId: entityId },
        { projectId, targetType: entityType, targetId: entityId },
      ] as any,
      order: { createdAt: 'ASC' as const },
    })
    return this.toDtoList(rows)
  }

  /**
   * 某实体在指定章节"生效"的边：valid_from <= N AND (valid_until IS NULL OR valid_until >= N)
   */
  async getActiveEdgesAtChapter(
    projectId: string,
    entityId: string,
    chapterNumber: number,
  ): Promise<GraphEdge[]> {
    const qb = this.scoped.qb('e')
    qb.where('e.project_id = :pid', { pid: projectId })
      .andWhere('(e.source_id = :eid OR e.target_id = :eid)', { eid: entityId })
      .andWhere('(e.valid_from_chapter IS NULL OR e.valid_from_chapter <= :cn)', { cn: chapterNumber })
      .andWhere('(e.valid_until_chapter IS NULL OR e.valid_until_chapter >= :cn)', { cn: chapterNumber })
      .orderBy('e.created_at', 'ASC')
    return this.toDtoList(await qb.getMany())
  }

  async create(data: CreateGraphEdgeRequest): Promise<GraphEdge> {
    const id = randomUUID()
    const now = Date.now()
    const saved = await this.scoped.save({
      id,
      projectId: data.projectId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      targetType: data.targetType,
      targetId: data.targetId,
      relationType: data.relationType,
      label: data.label ?? null,
      validFromChapter: data.validFromChapter ?? null,
      validUntilChapter: data.validUntilChapter ?? null,
      description: data.description ?? null,
      createdAt: now,
      updatedAt: now,
    } as Partial<LwGraphEdgeEntity>)
    return this.toDto(saved)
  }

  async batchCreate(dataList: CreateGraphEdgeRequest[]): Promise<GraphEdge[]> {
    if (dataList.length === 0) return []
    const results: GraphEdge[] = []
    for (const data of dataList) {
      results.push(await this.create(data))
    }
    return results
  }

  async update(id: string, data: UpdateGraphEdgeRequest): Promise<GraphEdge | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    if (data.relationType !== undefined) existing.relationType = data.relationType
    if (data.label !== undefined) existing.label = data.label ?? null
    if (data.validFromChapter !== undefined) existing.validFromChapter = data.validFromChapter ?? null
    if (data.validUntilChapter !== undefined) existing.validUntilChapter = data.validUntilChapter ?? null
    if (data.description !== undefined) existing.description = data.description ?? null

    existing.updatedAt = Date.now()
    await this.scoped.save(existing)
    return this.toDto(existing)
  }

  /**
   * 关停关系：写 valid_until_chapter（关系变化不改边，旧边标失效）
   */
  async endRelation(id: string, chapterNumber: number): Promise<GraphEdge | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    existing.validUntilChapter = chapterNumber
    existing.updatedAt = Date.now()
    await this.scoped.save(existing)
    return this.toDto(existing)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  /** 实体删除时级联清理其边（应用层调用） */
  async deleteByEntity(projectId: string, entityType: GraphEntityType, entityId: string): Promise<number> {
    const affected = await this.scoped.delete({
      projectId,
      sourceType: entityType,
      sourceId: entityId,
    } as any)
    const affected2 = await this.scoped.delete({
      projectId,
      targetType: entityType,
      targetId: entityId,
    } as any)
    return affected + affected2
  }

  /** 按事件 id 批量删除边（章节图谱重跑 = 重建时清理指向旧事件的边） */
  async deleteBySourceEventIds(projectId: string, eventIds: string[]): Promise<number> {
    if (!eventIds.length) return 0
    return this.scoped.delete({
      projectId,
      sourceId: In(eventIds),
    } as any)
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  async countByProjectId(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }
}
