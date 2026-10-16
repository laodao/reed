/**
 * 长文写作向量索引记录仓库（步骤0 新增）
 * @module database/repositories/lw-vector-index.repository
 *
 * 维护 lw_vector_indices 表：chunkId ↔ 实体的映射 + contentHash（增量更新）+ preview。
 * 向量本体在 IVectorStore，本表只做"哪些入了库 + 怎么关联回实体 + 是否需重算"。
 *
 * 多租户：继承 BaseRepository，user_id 自动注入（Web ALS / PC null）。
 */

import { In, type DataSource } from 'typeorm'
import { LwVectorIndexEntity } from '../entities/lw-vector-index.entity'
import { BaseRepository } from '../base-repository'
import type { LwVectorEntityType } from '@shared/types/longwriting.types'

/** 向量索引记录 DTO */
export interface LwVectorIndexRecord {
  id: string
  projectId: string
  entityType: LwVectorEntityType
  entityId: string
  chapterNumber: number | null
  chunkId: string
  contentHash: string | null
  preview: string | null
  createdAt: number
  updatedAt: number
}

/** 创建向量索引记录的入参 */
export interface CreateLwVectorIndexInput {
  projectId: string
  entityType: LwVectorEntityType
  entityId: string
  chapterNumber?: number | null
  chunkId: string
  contentHash?: string | null
  preview?: string | null
}

export class LwVectorIndexRepository extends BaseRepository<
  LwVectorIndexEntity,
  LwVectorIndexRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwVectorIndexEntity)
  }

  protected toDto(e: LwVectorIndexEntity): LwVectorIndexRecord {
    return {
      id: e.id,
      projectId: e.projectId,
      entityType: e.entityType as LwVectorEntityType,
      entityId: e.entityId,
      chapterNumber: e.chapterNumber,
      chunkId: e.chunkId,
      contentHash: e.contentHash,
      preview: e.preview,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  /** 按实体查（一个实体可能多 chunk，如章节切片） */
  async getByEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<LwVectorIndexRecord[]> {
    const rows = await this.scoped.find({
      where: { projectId, entityType, entityId } as any,
    })
    return this.toDtoList(rows)
  }

  /** 按章节查（章节切片） */
  async getByChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<LwVectorIndexRecord[]> {
    const rows = await this.scoped.find({
      where: { projectId, chapterNumber } as any,
    })
    return this.toDtoList(rows)
  }

  /** 按项目查全部 */
  async getByProject(projectId: string): Promise<LwVectorIndexRecord[]> {
    const rows = await this.scoped.find({ where: { projectId } as any })
    return this.toDtoList(rows)
  }

  async create(data: CreateLwVectorIndexInput): Promise<LwVectorIndexRecord> {
    const id = this.generateId()
    const now = Date.now()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      entityType: data.entityType,
      entityId: data.entityId,
      chapterNumber: data.chapterNumber ?? null,
      chunkId: data.chunkId,
      contentHash: data.contentHash ?? null,
      preview: data.preview ?? null,
      createdAt: now,
      updatedAt: now,
    })
    await this.scoped.save(entity)
    return this.toDto(entity)
  }

  async batchCreate(
    dataList: CreateLwVectorIndexInput[],
  ): Promise<LwVectorIndexRecord[]> {
    if (dataList.length === 0) return []
    const now = Date.now()
    const entities = dataList.map(data => {
      const id = this.generateId()
      return this.repo.create({
        id,
        projectId: data.projectId,
        entityType: data.entityType,
        entityId: data.entityId,
        chapterNumber: data.chapterNumber ?? null,
        chunkId: data.chunkId,
        contentHash: data.contentHash ?? null,
        preview: data.preview ?? null,
        createdAt: now,
        updatedAt: now,
      })
    })
    await this.scoped.saveMany(entities)
    return this.toDtoList(entities)
  }

  /** 按 chunkId 列表删（删向量时级联本表），返回删除条数 */
  async deleteByChunkIds(chunkIds: string[]): Promise<number> {
    if (chunkIds.length === 0) return 0
    return this.scoped.delete({ chunkId: In(chunkIds) } as any)
  }

  /** 按实体删（实体重写时） */
  async deleteByEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<number> {
    return this.scoped.delete({
      projectId,
      entityType,
      entityId,
    } as any)
  }

  /** 按章节删（章节重写时） */
  async deleteByChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<number> {
    return this.scoped.delete({ projectId, chapterNumber } as any)
  }

  /** 按项目删（删项目时） */
  async deleteByProject(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  /**
   * 取某实体现有各 chunk 的 contentHash（增量更新判断）
   * @returns Map<chunkId, contentHash>
   */
  async getContentHashes(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<Map<string, string>> {
    const rows = await this.scoped.find({
      where: { projectId, entityType, entityId } as any,
      select: ['chunkId', 'contentHash'],
    })
    const map = new Map<string, string>()
    for (const r of rows) {
      if (r.contentHash) map.set(r.chunkId, r.contentHash)
    }
    return map
  }

  /** 按项目统计向量索引条数 */
  async countByProject(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }

  /**
   * 取某实体的全部 chunkId（删向量用）
   */
  async getChunkIdsByEntity(
    projectId: string,
    entityType: LwVectorEntityType,
    entityId: string,
  ): Promise<string[]> {
    const rows = await this.scoped.find({
      where: { projectId, entityType, entityId } as any,
      select: ['chunkId'],
    })
    return rows.map(r => r.chunkId)
  }

  private generateId(): string {
    return `lwvec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
