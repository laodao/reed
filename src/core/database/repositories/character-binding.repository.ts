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
      // P2 task 1 双源字段（spec §3.7）
      sourceType: e.sourceType,
      overrideName: e.overrideName,
      overrideDescription: e.overrideDescription,
      overrideAppearance: e.overrideAppearance,
      overrideOutfit: e.overrideOutfit,
      standaloneName: e.standaloneName,
      standaloneDescription: e.standaloneDescription,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async getByProjectId(projectId: string): Promise<CharacterBinding[]> {
    // P2 Task 6 后 lw_story_characters.portrait_id 已移除，
    // portrait_id 仅保留在 character_bindings 自身，不再 JOIN 同步
    const entities = await this.scoped.find({ where: { projectId } as any })
    return entities.map(e => this.toDto(e))
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
