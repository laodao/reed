/**
 * 地点形象绑定仓库
 * @module database/repositories/location-binding.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import type { DataSource } from 'typeorm'
import {
  LocationBinding,
  TimeOfDay,
  WeatherType,
} from '@shared/types/story-to-video.types'
import { LocationBindingEntity } from '../entities/location-binding.entity'
import { BaseRepository } from '../base-repository'

export interface CreateLocationBindingRequest {
  projectId: string
  longWritingLocationId: string
  locationName: string
  imagePaths?: string[]
  thumbnailPath?: string
  generateConfig?: LocationBinding['generateConfig']
  generateImages?: boolean
}

export interface UpdateLocationBindingRequest {
  imagePaths?: string[]
  thumbnailPath?: string | null
  generateConfig?: LocationBinding['generateConfig'] | null
  generateImages?: boolean
}

export class LocationBindingRepository extends BaseRepository<
  LocationBindingEntity,
  LocationBinding
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LocationBindingEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  private buildGenerateConfig(
    e: LocationBindingEntity,
  ): LocationBinding['generateConfig'] | undefined {
    if (e.baseDescription || e.styleReference || e.additionalPrompts) {
      return {
        baseDescription: e.baseDescription || '',
        styleReference: e.styleReference || undefined,
        additionalPrompts: e.additionalPrompts || undefined,
        timeOfDay: (e.timeOfDay as TimeOfDay | null) ?? undefined,
        weather: (e.weather as WeatherType | null) ?? undefined,
      }
    }
    if (e.generateConfig) {
      return e.generateConfig as LocationBinding['generateConfig']
    }
    return undefined
  }

  protected toDto(e: LocationBindingEntity): LocationBinding {
    return {
      id: e.id,
      projectId: e.projectId,
      longWritingLocationId: e.longWritingLocationId,
      locationName: e.locationName,
      imagePaths: ((e.imagePaths as string[] | null) ?? []) as string[],
      thumbnailPath: e.thumbnailPath || undefined,
      generateConfig: this.buildGenerateConfig(e),
      generateImages: e.generateImages === 1,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<LocationBinding[]> {
    return this.findManyByWhere({ projectId } as any)
  }

  async getById(id: string): Promise<LocationBinding | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByLongWritingLocationId(
    projectId: string,
    longWritingLocationId: string,
  ): Promise<LocationBinding | null> {
    return this.findOneByWhere({
      projectId,
      longWritingLocationId,
    } as any)
  }

  async create(data: CreateLocationBindingRequest): Promise<LocationBinding> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      longWritingLocationId: data.longWritingLocationId,
      locationName: data.locationName,
      imagePaths: data.imagePaths ?? [],
      thumbnailPath: data.thumbnailPath ?? null,
      generateConfig:
        (data.generateConfig as Record<string, unknown> | undefined) ?? null,
      baseDescription: data.generateConfig?.baseDescription ?? null,
      styleReference: data.generateConfig?.styleReference ?? null,
      additionalPrompts: data.generateConfig?.additionalPrompts ?? null,
      timeOfDay: data.generateConfig?.timeOfDay ?? null,
      weather: data.generateConfig?.weather ?? null,
      generateImages: data.generateImages ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateLocationBindingRequest,
  ): Promise<LocationBinding | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
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
      existing.timeOfDay = data.generateConfig?.timeOfDay ?? null
      existing.weather = data.generateConfig?.weather ?? null
      changed = true
    }
    if (data.generateImages !== undefined) {
      existing.generateImages = data.generateImages ? 1 : 0
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async addImage(id: string, imagePath: string): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return false
    existing.imagePaths = [...((existing.imagePaths as string[] | null) ?? []), imagePath]
    existing.updatedAt = new Date()
    await this.repo.save(existing)
    return true
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const result = await this.repo.delete({ projectId } as any)
    return result.affected ?? 0
  }

  private generateId(): string {
    return `lb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
