/**
 * 故事素材仓库
 * @module database/repositories/lw-material.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import type {
  StoryMaterial,
  MaterialType,
  MaterialStatus,
} from '@shared/types/longwriting.types'
import { LwMaterialEntity } from '../entities/lw-material.entity'
import { BaseRepository } from '../base-repository'

export class LwMaterialRepository extends BaseRepository<LwMaterialEntity, StoryMaterial> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwMaterialEntity)
  }

  protected toDto(e: LwMaterialEntity): StoryMaterial {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      type: (e.type ?? '') as MaterialType,
      source: e.source ?? '',
      content: e.content ?? '',
      status: (e.status || 'pending') as MaterialStatus,
      errorMessage: e.errorMessage ?? '',
      retryCount: e.retryCount ?? 0,
      used: e.used === 1,
      createdAt: e.createdAt,
    }
  }

  async getByProjectId(projectId: string): Promise<StoryMaterial[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .where('m.project_id = :pid', { pid: projectId })
      .orderBy('m.created_at', 'DESC')
      .getMany()
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<StoryMaterial | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: {
    projectId: string
    name: string
    type: MaterialType
    source?: string
    content?: string
    status?: MaterialStatus
  }): Promise<StoryMaterial> {
    const id = `material_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const now = Date.now()
    await this.scoped.save({
        id,
        projectId: data.projectId,
        name: data.name,
        type: data.type,
        source: data.source ?? null,
        content: data.content ?? null,
        status: data.status || 'pending',
        retryCount: 0,
        used: 0,
        createdAt: now,
      })
    return {
      id,
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      source: data.source || '',
      content: data.content || '',
      status: data.status || 'pending',
      errorMessage: '',
      retryCount: 0,
      used: false,
      createdAt: now,
    }
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      type: MaterialType
      source: string
      content: string
      status: MaterialStatus
      errorMessage: string
      retryCount: number
      used: boolean
    }>,
  ): Promise<StoryMaterial | null> {
    const row = await this.scoped.findOne({ id } as any)
    if (!row) return null
    let changed = false
    if (data.name !== undefined) {
      row.name = data.name
      changed = true
    }
    if (data.type !== undefined) {
      row.type = data.type
      changed = true
    }
    if (data.source !== undefined) {
      row.source = data.source
      changed = true
    }
    if (data.content !== undefined) {
      row.content = data.content
      changed = true
    }
    if (data.status !== undefined) {
      row.status = data.status
      changed = true
    }
    if (data.errorMessage !== undefined) {
      row.errorMessage = data.errorMessage
      changed = true
    }
    if (data.retryCount !== undefined) {
      row.retryCount = data.retryCount
      changed = true
    }
    if (data.used !== undefined) {
      row.used = data.used ? 1 : 0
      changed = true
    }
    if (!changed) return this.toDto(row)
    const saved = await this.scoped.save(row)
    return this.toDto(saved)
  }

  async updateStatus(
    id: string,
    status: MaterialStatus,
    errorMessage?: string,
  ): Promise<boolean> {
    const affected = await this.scoped.update({ id } as any, {
      status,
      errorMessage: errorMessage ?? null,
    })
    return affected > 0
  }

  async incrementRetryCount(id: string): Promise<number> {
    await this.scoped
      .qb('m')
      .update()
      .set({ retryCount: () => 'retry_count + 1' })
      .where('m.id = :id', { id })
      .execute()
    const row = await this.scoped.findOne({ id } as any)
    return row?.retryCount ?? 0
  }

  async markAsUsed(id: string): Promise<boolean> {
    const affected = await this.scoped.update({ id } as any, { used: 1 })
    return affected > 0
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }
}
