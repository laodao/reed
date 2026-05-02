/**
 * 角色形象绑定仓库
 * @module database/repositories/character-binding.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              规范化字段优先 + 旧 JSON 字段兼容；
 *              getByProjectId 用 LEFT JOIN 同步 lw_story_characters.portrait_id。
 */

import type { DataSource } from 'typeorm'
import {
  CharacterBinding,
} from '@shared/types/story-to-video.types'
import { CharacterBindingEntity } from '../entities/episode-production/character-binding.entity'
import { LwCharacterEntity } from '../entities/lw-character.entity'
import { BaseRepository } from '../base-repository'

export interface CreateCharacterBindingRequest {
  projectId: string
  longWritingCharacterId: string
  portraitId?: string
  generateConfig?: CharacterBinding['generateConfig']
  voiceConfig: CharacterBinding['voiceConfig']
}

export interface UpdateCharacterBindingRequest {
  portraitId?: string | null
  generateConfig?: CharacterBinding['generateConfig'] | null
  voiceConfig?: CharacterBinding['voiceConfig']
}

export class CharacterBindingRepository extends BaseRepository<
  CharacterBindingEntity,
  CharacterBinding
> {
  constructor(dataSource: DataSource) {
    super(dataSource, CharacterBindingEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  private buildVoiceConfig(e: CharacterBindingEntity): CharacterBinding['voiceConfig'] {
    if (e.voiceId || e.voiceSpeed != null || e.voicePitch != null) {
      return {
        voiceId: e.voiceId || '',
        speed: e.voiceSpeed ?? 1.0,
        pitch: e.voicePitch ?? 1.0,
      }
    }
    if (e.voiceConfig) {
      return e.voiceConfig as CharacterBinding['voiceConfig']
    }
    return { voiceId: '', speed: 1.0, pitch: 1.0 }
  }

  private buildGenerateConfig(
    e: CharacterBindingEntity,
  ): CharacterBinding['generateConfig'] | undefined {
    if (e.baseDescription || e.styleReference || e.additionalPrompts) {
      return {
        baseDescription: e.baseDescription || '',
        styleReference: e.styleReference || undefined,
        additionalPrompts: e.additionalPrompts || undefined,
      }
    }
    if (e.generateConfig) {
      return e.generateConfig as CharacterBinding['generateConfig']
    }
    return undefined
  }

  protected toDto(e: CharacterBindingEntity): CharacterBinding {
    return {
      id: e.id,
      projectId: e.projectId,
      longWritingCharacterId: e.longWritingCharacterId,
      portraitId: e.portraitId || undefined,
      generateConfig: this.buildGenerateConfig(e),
      voiceConfig: this.buildVoiceConfig(e),
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<CharacterBinding[]> {
    // LEFT JOIN lw_story_characters 同步 portrait_id（绑定为空时从长文角色取）
    // scoped.qb 已自动按 user_id 过滤 cb；c 的 user_id 由 ON 条件兼容自动匹配
    const qb = this.scoped
      .qb('cb')
      .leftJoin(LwCharacterEntity, 'c', 'cb.long_writing_character_id = c.id')
      .select('cb')
      .addSelect(
        'COALESCE(cb.portrait_id, c.portrait_id)',
        'cb_synced_portrait_id',
      )
      .andWhere('cb.project_id = :pid', { pid: projectId })
    const rows = await qb.getRawAndEntities()

    return rows.entities.map((entity, idx) => {
      const dto = this.toDto(entity)
      const syncedRaw = rows.raw[idx]?.cb_synced_portrait_id
      if (!dto.portraitId && syncedRaw) {
        dto.portraitId = syncedRaw
      }
      return dto
    })
  }

  async getById(id: string): Promise<CharacterBinding | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByLongWritingCharacterId(
    projectId: string,
    longWritingCharacterId: string,
  ): Promise<CharacterBinding | null> {
    return this.findOneByWhere(
      { projectId, longWritingCharacterId } as any,
    )
  }

  async create(
    data: CreateCharacterBindingRequest,
  ): Promise<CharacterBinding> {
    const id = this.generateId()
    const now = new Date()
    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      longWritingCharacterId: data.longWritingCharacterId,
      portraitId: data.portraitId ?? null,
      generateConfig:
        (data.generateConfig as Record<string, unknown> | undefined) ?? null,
      voiceConfig: data.voiceConfig as Record<string, unknown>,
      voiceId: data.voiceConfig?.voiceId ?? null,
      voiceSpeed: data.voiceConfig?.speed ?? 1.0,
      voicePitch: data.voiceConfig?.pitch ?? 1.0,
      baseDescription: data.generateConfig?.baseDescription ?? null,
      styleReference: data.generateConfig?.styleReference ?? null,
      additionalPrompts: data.generateConfig?.additionalPrompts ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateCharacterBindingRequest,
  ): Promise<CharacterBinding | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.portraitId !== undefined) {
      existing.portraitId = data.portraitId || null
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
    if (data.voiceConfig !== undefined) {
      existing.voiceConfig = data.voiceConfig as Record<string, unknown>
      existing.voiceId = data.voiceConfig?.voiceId ?? null
      existing.voiceSpeed = data.voiceConfig?.speed ?? 1.0
      existing.voicePitch = data.voiceConfig?.pitch ?? 1.0
      changed = true
    }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    return this.scoped.delete({ projectId } as any)
  }

  private generateId(): string {
    return `cb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
