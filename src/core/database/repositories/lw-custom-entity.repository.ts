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
  fields: Record<string, unknown> | null
  origin: { type: 'discussion' | 'manual' | 'extract'; cardId?: string; turns?: number[] } | null
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
      fields: this.parse<Record<string, unknown>>(e.fields),
      origin: this.parse<CustomEntityDto['origin']>(e.origin),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
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

  async createRow(projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: CustomEntityDto['origin']): Promise<CustomEntityDto> {
    const id = `bce_${Date.now()}_${randomUUID().slice(0, 6)}`
    await this.scoped.save(this.repo.create({
      id,
      projectId,
      kindKey,
      name,
      fields: fields ? JSON.stringify(fields) : null,
      origin: origin ? JSON.stringify(origin) : null,
    } as never) as never)
    const row = await this.scoped.findOne({ where: { id } } as any)
    return this.toDto(row!)
  }

  async updateRow(id: string, patch: { name?: string; fields?: Record<string, unknown> | null }): Promise<CustomEntityDto | null> {
    const row = await this.scoped.findOne({ where: { id } } as any)
    if (!row) return null
    if (patch.name !== undefined) row.name = patch.name
    if (patch.fields !== undefined) row.fields = patch.fields ? JSON.stringify(patch.fields) : null
    row.updatedAt = Date.now()
    await this.scoped.save(row)
    return this.toDto(row)
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }
}
