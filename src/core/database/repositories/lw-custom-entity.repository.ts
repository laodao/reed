/**
 * LW 自定义设定实体仓库（P0-2026-09-09）
 * @module database/repositories/lw-custom-entity.repository
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwCustomEntityEntity } from '../entities/lw-custom-entity.entity'
import { BaseRepository } from '../base-repository'

export interface CustomEntityDto {
  id: string
  projectId: string
  kindKey: string
  name: string
  parentId: string | null
  fields: Record<string, unknown> | null
  origin: { type: 'discussion' | 'manual' | 'extract'; cardId?: string; turns?: number[]; libraryWorldId?: string; libraryEntryId?: string; libraryVersion?: number } | null
  createdAt: number
  updatedAt: number
}

export class LwCustomEntityRepository extends BaseRepository<LwCustomEntityEntity, CustomEntityDto> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwCustomEntityEntity)
  }

  private parse<T>(json: string | null): T | null {
    if (!json) return null
    try {
      return JSON.parse(json) as T
    } catch {
      return null
    }
  }

  protected toDto(e: LwCustomEntityEntity): CustomEntityDto {
    return {
      id: e.id,
      projectId: e.projectId,
      kindKey: e.kindKey,
      name: e.name,
      parentId: e.parentId,
      fields: this.parse<Record<string, unknown>>(e.fields),
      origin: this.parse<CustomEntityDto['origin']>(e.origin),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async getById(id: string): Promise<CustomEntityDto | null> {
    const row = await this.scoped.findOne({ id } as any)
    return row ? this.toDto(row) : null
  }

  async getByProjectId(projectId: string): Promise<CustomEntityDto[]> {
    const rows = await this.scoped
      .qb('e')
      .where('e.project_id = :pid', { pid: projectId })
      .orderBy('e.created_at', 'ASC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getByProjectAndKind(projectId: string, kindKey: string): Promise<CustomEntityDto[]> {
    const rows = await this.scoped.find({
      where: { projectId, kindKey },
      order: { createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async getByProject(projectId: string): Promise<CustomEntityDto[]> {
    const rows = await this.scoped.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    } as any)
    return this.toDtoList(rows)
  }

  async createRow(projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: CustomEntityDto['origin'], parentId?: string | null): Promise<CustomEntityDto> {
    const id = `bce_${Date.now()}_${randomUUID().slice(0, 6)}`
    await this.scoped.save(this.repo.create({
      id,
      projectId,
      kindKey,
      name,
      parentId: parentId ?? null,
      fields: fields ? JSON.stringify(fields) : null,
      origin: origin ? JSON.stringify(origin) : null,
    } as never) as never)
    const row = await this.scoped.findOne({ id } as any)
    return this.toDto(row!)
  }

  async updateRow(id: string, patch: { name?: string; fields?: Record<string, unknown> | null; parentId?: string | null }): Promise<CustomEntityDto | null> {
    const row = await this.scoped.findOne({ id } as any)
    if (!row) return null
    if (patch.name !== undefined) row.name = patch.name
    if (patch.parentId !== undefined) row.parentId = patch.parentId
    if (patch.fields !== undefined) row.fields = patch.fields ? JSON.stringify(patch.fields) : null
    row.updatedAt = Date.now()
    await this.scoped.save(row)
    return this.toDto(row)
  }

  /** 更新血缘 origin（库同步用；scoped 防越界 + 方言中立，替代裸 SQL UPDATE） */
  async updateOrigin(id: string, origin: Record<string, unknown>): Promise<boolean> {
    const row = await this.scoped.findOne({ id } as any)
    if (!row) return false
    await this.scoped.update({ id } as any, {
      origin: JSON.stringify(origin),
      updatedAt: Date.now(),
    } as any)
    return true
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  /** 项目删除级联清理（图谱/伏笔等伴生表无 FK，靠显式 purge） */
  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }
}
