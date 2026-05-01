/**
 * 立绘变体数据访问层
 * @module database/repositories/portrait-variant.repository
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
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
import { getCurrentUserId } from '@core/context/user-context'

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
    const es = await this.scoped.find({
      where: { characterId } as any,
      order: { createdAt: 'DESC' } as any,
    })
    return this.toDtoList(es)
  }

  async getById(id: string): Promise<PortraitVariant | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }

  async getByCharacterAndAngle(
    characterId: string,
    type: PortraitVariantType,
    angle: PortraitAngle,
  ): Promise<PortraitVariant | null> {
    const e = await this.scoped.findOne({ characterId, type, angle } as any)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateVariantInput): Promise<PortraitVariant> {
    const id = randomUUID()
    const now = new Date()
    const saved = await this.scoped.save({
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
    } as Partial<PortraitVariantEntity>)
    return this.toDto(saved)
  }

  async createBatch(variants: CreateVariantInput[]): Promise<PortraitVariant[]> {
    const now = new Date()
    const userId = getCurrentUserId()
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
            userId,  // 事务内手工注入 user_id
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
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    if (data.imagePath !== undefined) existing.imagePath = data.imagePath
    if (data.prompt !== undefined) existing.prompt = data.prompt
    if (data.config !== undefined) {
      existing.config = data.config as Record<string, unknown>
    }
    if (data.variantInfo !== undefined) {
      existing.variantInfo = data.variantInfo as Record<string, unknown>
    }

    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<void> {
    await this.scoped.delete({ id } as any)
  }

  async deleteByCharacterId(characterId: string): Promise<void> {
    await this.scoped.delete({ characterId } as any)
  }

  async countByCharacterId(characterId: string): Promise<number> {
    return this.scoped.count({ characterId } as any)
  }

  async getBaseVariants(characterId: string): Promise<PortraitVariant[]> {
    const entities = await this.scoped
      .qb('v')
      .andWhere('v.character_id = :cid AND v.type = :t', { cid: characterId, t: 'base' })
      .orderBy('v.angle', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getFrontVariant(characterId: string): Promise<PortraitVariant | null> {
    const e = await this.scoped.findOne({
      characterId,
      type: 'base',
      angle: 'front',
    } as any)
    return e ? this.toDto(e) : null
  }

  async getClothesVariants(characterId: string): Promise<PortraitVariant[]> {
    const entities = await this.scoped
      .qb('v')
      .andWhere('v.character_id = :cid AND v.type = :t AND v.angle = :a', {
        cid: characterId,
        t: 'clothes',
        a: 'front',
      })
      .orderBy('v.created_at', 'DESC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getBackgroundVariants(characterId: string): Promise<PortraitVariant[]> {
    const entities = await this.scoped
      .qb('v')
      .andWhere('v.character_id = :cid AND v.type = :t AND v.angle = :a', {
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
    // JOIN 查询：v 和 c 都按 user_id 限定（同一用户的 variant 才能 join 到同一用户的 character）
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('v')
      .innerJoin(PortraitCharacterEntity, 'c', 'c.id = v.character_id')
      .where('c.project_id = :pid', { pid: projectId })
      .orderBy('v.created_at', 'DESC')
    if (userId) {
      qb.andWhere('v.user_id = :uid AND c.user_id = :uid', { uid: userId })
    }
    return this.toDtoList(await qb.getMany())
  }

  /** @deprecated 使用 deleteByCharacterId 替代 */
  async deleteByProjectId(projectId: string): Promise<void> {
    // 先按 user_id 限定查 character ids，再删 variants
    const userId = getCurrentUserId()
    const charQb = this.dataSource
      .getRepository(PortraitCharacterEntity)
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .where('c.project_id = :pid', { pid: projectId })
    if (userId) charQb.andWhere('c.user_id = :uid', { uid: userId })
    const characterIds = await charQb.getRawMany<{ id: string }>()
    if (characterIds.length === 0) return

    const delQb = this.repo
      .createQueryBuilder()
      .delete()
      .from(PortraitVariantEntity)
      .where('character_id IN (:...ids)', { ids: characterIds.map(c => c.id) })
    if (userId) delQb.andWhere('user_id = :uid', { uid: userId })
    await delQb.execute()
  }

  /** @deprecated 使用 countByCharacterId 替代 */
  async countByProjectId(projectId: string): Promise<number> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('v')
      .innerJoin(PortraitCharacterEntity, 'c', 'c.id = v.character_id')
      .where('c.project_id = :pid', { pid: projectId })
    if (userId) {
      qb.andWhere('v.user_id = :uid AND c.user_id = :uid', { uid: userId })
    }
    return qb.getCount()
  }
}
