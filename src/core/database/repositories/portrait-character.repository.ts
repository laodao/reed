/**
 * 立绘角色数据访问层
 * @module database/repositories/portrait-character.repository
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
 */

import type { DataSource } from 'typeorm'
import type {
  PortraitCharacter,
  CreatePortraitCharacterRequest,
  UpdatePortraitCharacterRequest,
  PortraitGender,
  PortraitRace,
  PortraitGenerateConfig,
} from '@shared/types/portrait.types'
import { randomUUID } from 'crypto'
import { PortraitCharacterEntity } from '../entities/portrait-character.entity'
import { BaseRepository } from '../base-repository'

const DEFAULT_CONFIG: PortraitGenerateConfig = {
  angles: ['front'],
  backgroundType: 'solid',
} as PortraitGenerateConfig

export class PortraitCharacterRepository extends BaseRepository<
  PortraitCharacterEntity,
  PortraitCharacter
> {
  constructor(dataSource: DataSource) {
    super(dataSource, PortraitCharacterEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: PortraitCharacterEntity): PortraitCharacter {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      gender: e.gender as PortraitGender,
      age: e.age,
      height: e.height,
      weight: e.weight,
      race: e.race as PortraitRace,
      description: e.description || undefined,
      prompt: e.prompt || undefined,
      referenceImages: (e.referenceImages as string[] | null) ?? [],
      providerId: e.providerId || undefined,
      modelId: e.modelId || undefined,
      config: (e.config as PortraitGenerateConfig | null) ?? DEFAULT_CONFIG,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<PortraitCharacter[]> {
    const entities = await this.scoped.find({
      where: { projectId } as any,
      order: { createdAt: 'DESC' } as any,
    })
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<PortraitCharacter | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }

  async create(
    request: CreatePortraitCharacterRequest,
  ): Promise<PortraitCharacter> {
    const id = randomUUID()
    const now = new Date()
    const config = { ...DEFAULT_CONFIG, ...(request.config ?? {}) } as PortraitGenerateConfig
    const saved = await this.scoped.save({
      id,
      projectId: request.projectId,
      name: request.name,
      gender: request.gender,
      age: request.age,
      height: request.height,
      weight: request.weight,
      race: request.race,
      description: request.description ?? null,
      prompt: request.prompt ?? null,
      referenceImages: request.referenceImages ?? [],
      providerId: request.providerId ?? null,
      modelId: request.modelId ?? null,
      config,
      createdAt: now,
      updatedAt: now,
    } as Partial<PortraitCharacterEntity>)
    return this.toDto(saved)
  }

  async update(
    request: UpdatePortraitCharacterRequest,
  ): Promise<PortraitCharacter | null> {
    const existing = await this.scoped.findOne({ id: request.id } as any)
    if (!existing) return null

    if (request.name !== undefined) existing.name = request.name
    if (request.gender !== undefined) existing.gender = request.gender
    if (request.age !== undefined) existing.age = request.age
    if (request.height !== undefined) existing.height = request.height
    if (request.weight !== undefined) existing.weight = request.weight
    if (request.race !== undefined) existing.race = request.race
    if (request.description !== undefined) {
      existing.description = request.description || null
    }
    if (request.prompt !== undefined) existing.prompt = request.prompt
    if (request.referenceImages !== undefined) {
      existing.referenceImages = request.referenceImages
    }
    if (request.providerId !== undefined) existing.providerId = request.providerId
    if (request.modelId !== undefined) existing.modelId = request.modelId
    if (request.config !== undefined) {
      const merged = {
        ...((existing.config as PortraitGenerateConfig | null) ?? DEFAULT_CONFIG),
        ...request.config,
      }
      existing.config = merged as Record<string, unknown>
    }
    existing.updatedAt = new Date()

    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<void> {
    await this.scoped.delete({ id } as any)
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.scoped.delete({ projectId } as any)
  }

  async countByProjectId(projectId: string): Promise<number> {
    return this.scoped.count({ projectId } as any)
  }
}
