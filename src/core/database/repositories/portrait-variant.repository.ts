/**
 * 立绘变体数据访问层
 * @module database/repositories/portrait-variant.repository
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import type { DataSource } from 'typeorm'
import type {
  PortraitVariant,
  PortraitVariantType,
  PortraitAngle,
  PortraitVariantInfo,
} from '@shared/types/portrait.types'
import { randomUUID } from 'crypto'
import { PortraitVariantEntity } from '../entities/portrait-variant.entity'
import { PortraitCharacterEntity } from '../entities/portrait-character.entity'
import { BaseRepository } from '../base-repository'

interface CreateVariantInput {
  characterId: string
  type: PortraitVariantType
  parentId?: string
  angle: PortraitAngle
  imagePath: string
  prompt: string
  config?: Record<string, unknown>
  variantInfo?: PortraitVariantInfo
}

export class PortraitVariantRepository extends BaseRepository<
  PortraitVariantEntity,
  PortraitVariant
> {
  constructor(dataSource: DataSource) {
    super(dataSource, PortraitVariantEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: PortraitVariantEntity): PortraitVariant {
    return {
      id: e.id,
      characterId: e.characterId,
      type: e.type as PortraitVariantType,
      parentId: e.parentId || undefined,
      angle: e.angle as PortraitAngle,
      imagePath: e.imagePath,
      prompt: e.prompt,
      config: (e.config as Record<string, unknown> | null) ?? {},
      variantInfo:
        e.variantInfo === null
          ? undefined
          : (e.variantInfo as PortraitVariantInfo | undefined),
      createdAt: this.toEpochMs(e.createdAt),
    }
  }

  async getByCharacterId(characterId: string): Promise<PortraitVariant[]> {
    return this.findManyByWhere({ characterId } as any, { createdAt: 'DESC' })
  }

  async getById(id: string): Promise<PortraitVariant | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByCharacterAndAngle(
    characterId: string,
    type: PortraitVariantType,
    angle: PortraitAngle,
  ): Promise<PortraitVariant | null> {
    return this.findOneByWhere({ characterId, type, angle } as any)
  }

  async create(data: CreateVariantInput): Promise<PortraitVariant> {
    const id = randomUUID()
    const now = new Date()
    const entity = this.repo.create({
      id,
      characterId: data.characterId,
      type: data.type,
      parentId: data.parentId ?? null,
      angle: data.angle,
      imagePath: data.imagePath,
      prompt: data.prompt,
      config: data.config ?? {},
      variantInfo: (data.variantInfo as Record<string, unknown> | undefined) ?? null,
      createdAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async createBatch(variants: CreateVariantInput[]): Promise<PortraitVariant[]> {
    const now = new Date()
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(PortraitVariantEntity)
      const result: PortraitVariant[] = []
      for (const data of variants) {
        const id = randomUUID()
        const saved = await repo.save(
          repo.create({
            id,
            characterId: data.characterId,
            type: data.type,
            parentId: data.parentId ?? null,
            angle: data.angle,
            imagePath: data.imagePath,
            prompt: data.prompt,
            config: data.config ?? {},
            variantInfo:
              (data.variantInfo as Record<string, unknown> | undefined) ?? null,
            createdAt: now,
          }),
        )
        result.push(this.toDto(saved))
      }
      return result
    })
  }

  async update(
    id: string,
    data: Partial<Omit<PortraitVariant, 'id' | 'characterId' | 'createdAt'>>,
  ): Promise<PortraitVariant | null> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return null

    if (data.imagePath !== undefined) existing.imagePath = data.imagePath
    if (data.prompt !== undefined) existing.prompt = data.prompt
    if (data.config !== undefined) {
      existing.config = data.config as Record<string, unknown>
    }
    if (data.variantInfo !== undefined) {
      existing.variantInfo = data.variantInfo as Record<string, unknown>
    }

    const saved = await this.repo.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id } as any)
  }

  async deleteByCharacterId(characterId: string): Promise<void> {
    await this.repo.delete({ characterId } as any)
  }

  async countByCharacterId(characterId: string): Promise<number> {
    return this.repo.count({ where: { characterId } as any })
  }

  async getBaseVariants(characterId: string): Promise<PortraitVariant[]> {
    const entities = await this.repo
      .createQueryBuilder('v')
      .where('v.character_id = :cid AND v.type = :t', { cid: characterId, t: 'base' })
      .orderBy('v.angle', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getFrontVariant(characterId: string): Promise<PortraitVariant | null> {
    return this.findOneByWhere({
      characterId,
      type: 'base',
      angle: 'front',
    } as any)
  }

  async getClothesVariants(characterId: string): Promise<PortraitVariant[]> {
    const entities = await this.repo
      .createQueryBuilder('v')
      .where('v.character_id = :cid AND v.type = :t AND v.angle = :a', {
        cid: characterId,
        t: 'clothes',
        a: 'front',
      })
      .orderBy('v.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getBackgroundVariants(characterId: string): Promise<PortraitVariant[]> {
    const entities = await this.repo
      .createQueryBuilder('v')
      .where('v.character_id = :cid AND v.type = :t AND v.angle = :a', {
        cid: characterId,
        t: 'background',
        a: 'front',
      })
      .orderBy('v.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  // ==================== 兼容旧 API（迁移期间保留）====================

  /** @deprecated 使用 getByCharacterId 替代 */
  async getByProjectId(projectId: string): Promise<PortraitVariant[]> {
    const entities = await this.repo
      .createQueryBuilder('v')
      .innerJoin(
        PortraitCharacterEntity,
        'c',
        'c.id = v.character_id',
      )
      .where('c.project_id = :pid', { pid: projectId })
      .orderBy('v.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  /** @deprecated 使用 deleteByCharacterId 替代 */
  async deleteByProjectId(projectId: string): Promise<void> {
    const characterIds = await this.dataSource
      .getRepository(PortraitCharacterEntity)
      .find({ where: { projectId } as any, select: ['id'] })
    if (characterIds.length === 0) return
    await this.repo
      .createQueryBuilder()
      .delete()
      .from(PortraitVariantEntity)
      .where('character_id IN (:...ids)', { ids: characterIds.map(c => c.id) })
      .execute()
  }

  /** @deprecated 使用 countByCharacterId 替代 */
  async countByProjectId(projectId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('v')
      .innerJoin(
        PortraitCharacterEntity,
        'c',
        'c.id = v.character_id',
      )
      .where('c.project_id = :pid', { pid: projectId })
      .getCount()
    return result
  }
}
