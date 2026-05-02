/**
 * 物品形象绑定仓库
 * @module database/repositories/item-binding.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import { ItemBinding } from '@shared/types/story-to-video.types'
import { ItemBindingEntity } from '../entities/episode-production/item-binding.entity'
import { BaseRepository } from '../base-repository'

export interface CreateItemBindingRequest {
  projectId: string
  longWritingItemId: string
  itemName: string
  imagePaths?: string[]
  thumbnailPath?: string
  generateConfig?: ItemBinding['generateConfig']
  generateImages?: boolean
}

export interface UpdateItemBindingRequest {
  imagePaths?: string[]
  thumbnailPath?: string | null
  generateConfig?: ItemBinding['generateConfig'] | null
  generateImages?: boolean
}

export class ItemBindingRepository extends BaseRepository<
  ItemBindingEntity,
  ItemBinding
> {
  constructor(dataSource: DataSource) {
    super(dataSource, ItemBindingEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  private buildGenerateConfig(
    e: ItemBindingEntity,
  ): ItemBinding['generateConfig'] | undefined {
    if (e.baseDescription || e.styleReference || e.additionalPrompts) {
      return {
        baseDescription: e.baseDescription || '',
        styleReference: e.styleReference || undefined,
        additionalPrompts: e.additionalPrompts || undefined,
      }
    }
    if (e.generateConfig) {
      return e.generateConfig as ItemBinding['generateConfig']
    }
    return undefined
  }

  protected toDto(e: ItemBindingEntity): ItemBinding {
    return {
      id: e.id,
      projectId: e.projectId,
      longWritingItemId: e.longWritingItemId,
      itemName: e.itemName,
      imagePaths: ((e.imagePaths as string[] | null) ?? []) as string[],
      thumbnailPath: e.thumbnailPath || undefined,
      generateConfig: this.buildGenerateConfig(e),
      generateImages: e.generateImages === 1,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<ItemBinding[]> {
    return this.findManyByWhere({ projectId } as any)
  }

  async getById(id: string): Promise<ItemBinding | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByLongWritingItemId(
    projectId: string,
    longWritingItemId: string,
  ): Promise<ItemBinding | null> {
    return this.findOneByWhere({ projectId, longWritingItemId } as any)
  }

  async create(data: CreateItemBindingRequest): Promise<ItemBinding> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      longWritingItemId: data.longWritingItemId,
      itemName: data.itemName,
      imagePaths: data.imagePaths ?? [],
      thumbnailPath: data.thumbnailPath ?? null,
      generateConfig:
        (data.generateConfig as Record<string, unknown> | undefined) ?? null,
      baseDescription: data.generateConfig?.baseDescription ?? null,
      styleReference: data.generateConfig?.styleReference ?? null,
      additionalPrompts: data.generateConfig?.additionalPrompts ?? null,
      generateImages: data.generateImages ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateItemBindingRequest,
  ): Promise<ItemBinding | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.imagePaths !== undefined) { existing.imagePaths = data.imagePaths; changed = true }
    if (data.thumbnailPath !== undefined) {
      existing.thumbnailPath = data.thumbnailPath ?? null
      changed = true
    }
    if (data.generateConfig !== undefined) {
      existing.generateConfig =
        (data.generateConfig as Record<string, unknown> | null) ?? null
      existing.baseDescription = data.generateConfig?.baseDescription ?? null
      existing.styleReference = data.generateConfig?.styleReference ?? null
      existing.additionalPrompts = data.generateConfig?.additionalPrompts ?? null
      changed = true
    }
    if (data.generateImages !== undefined) {
      existing.generateImages = data.generateImages ? 1 : 0
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async addImage(id: string, imagePath: string): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false
    existing.imagePaths = [...((existing.imagePaths as string[] | null) ?? []), imagePath]
    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  private generateId(): string {
    return `ib_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
