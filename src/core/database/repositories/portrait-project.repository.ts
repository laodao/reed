/**
 * 立绘项目数据访问层
 * @module database/repositories/portrait-project.repository
 * @description 提供立绘项目的数据库操作（项目作为容器，包含多个角色）。
 *              基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
 */

import type { DataSource } from 'typeorm'
import type {
  PortraitProject,
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest,
} from '@shared/types/portrait.types'
import { randomUUID } from 'crypto'
import { PortraitProjectEntity } from '../entities/portrait-project.entity'
import { BaseRepository } from '../base-repository'

export class PortraitProjectRepository extends BaseRepository<
  PortraitProjectEntity,
  PortraitProject
> {
  constructor(dataSource: DataSource) {
    super(dataSource, PortraitProjectEntity)
  }

  /**
   * Quirk：Entity createdAt/updatedAt 是 Date 类型，DTO 是 number（epoch ms）。
   * 历史数据可能是 Date 对象、ISO 字符串、epoch ms 数字 三种形式之一，统一转 number。
   */
  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: PortraitProjectEntity): PortraitProject {
    return {
      id: e.id,
      name: e.name,
      description: e.description || undefined,
      defaultProviderId: e.defaultProviderId || undefined,
      defaultModelId: e.defaultModelId || undefined,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getList(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ projects: PortraitProject[]; total: number }> {
    const offset = (page - 1) * pageSize
    const [entities, total] = await this.scoped.findAndCount({
      order: { createdAt: 'DESC' } as any,
      skip: offset,
      take: pageSize,
    })
    return { projects: this.toDtoList(entities), total }
  }

  async getById(id: string): Promise<PortraitProject | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }

  async create(
    request: CreatePortraitProjectRequest,
  ): Promise<PortraitProject> {
    const id = randomUUID()
    const now = new Date()
    const saved = await this.scoped.save({
      id,
      name: request.name,
      description: request.description ?? null,
      defaultProviderId: null,
      defaultModelId: null,
      createdAt: now,
      updatedAt: now,
    } as Partial<PortraitProjectEntity>)
    return this.toDto(saved)
  }

  async update(
    request: UpdatePortraitProjectRequest,
  ): Promise<PortraitProject | null> {
    const existing = await this.scoped.findOne({ id: request.id } as any)
    if (!existing) return null

    if (request.name !== undefined) existing.name = request.name
    if (request.description !== undefined) {
      existing.description = request.description || null
    }
    if (request.defaultProviderId !== undefined) {
      existing.defaultProviderId = request.defaultProviderId || null
    }
    if (request.defaultModelId !== undefined) {
      existing.defaultModelId = request.defaultModelId || null
    }
    existing.updatedAt = new Date()

    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<void> {
    await this.scoped.delete({ id } as any)
  }

  async count(): Promise<number> {
    return this.scoped.count()
  }
}
