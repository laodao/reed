/**
 * LW 角色 IP 库仓库（设定资产库 P0-2026-09-24）
 * @module database/repositories/lw-ip-character.repository
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { LwIpCharacterEntity } from '../entities/lw-ip-character.entity'
import { BaseRepository } from '../base-repository'
import type {
  IpCharacter,
  WorldStatus,
  CreateIpCharacterRequest,
  UpdateIpCharacterRequest,
} from '@shared/types/lw-library.types'

function parseJsonArray(v: string | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseJsonObject(v: string | null): Record<string, unknown> | null {
  if (!v) return null
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export class LwIpCharacterRepository extends BaseRepository<LwIpCharacterEntity, IpCharacter> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwIpCharacterEntity)
  }

  protected toDto(e: LwIpCharacterEntity): IpCharacter {
    return {
      id: e.id,
      name: e.name,
      aliases: parseJsonArray(e.aliases),
      worldId: e.worldId,
      gender: e.gender,
      age: e.age,
      race: e.race,
      occupation: e.occupation,
      appearance: e.appearance,
      portraitId: e.portraitId,
      personality: e.personality,
      motivation: e.motivation,
      flaw: e.flaw,
      background: e.background,
      valuesNotes: e.valuesNotes,
      talents: e.talents,
      abilities: e.abilities,
      signatureItems: e.signatureItems,
      characterArc: e.characterArc,
      catchphrases: parseJsonArray(e.catchphrases),
      fields: parseJsonObject(e.fields),
      tags: parseJsonArray(e.tags),
      status: e.status as WorldStatus,
      origin: parseJsonObject(e.origin),
      createdAt: Number(e.createdAt) || 0,
      updatedAt: Number(e.updatedAt) || 0,
    }
  }

  async listActive(): Promise<IpCharacter[]> {
    const rows = await this.scoped.find({
      where: { status: 'active' } as any,
      order: { updatedAt: 'DESC' },
    } as any)
    return this.toDtoList(rows)
  }

  async listByWorldId(worldId: string): Promise<IpCharacter[]> {
    const rows = await this.scoped.find({
      where: { worldId, status: 'active' } as any,
      order: { updatedAt: 'DESC' },
    } as any)
    return this.toDtoList(rows)
  }

  async getById(id: string): Promise<IpCharacter | null> {
    const row = await this.scoped.findOne({ id } as any)
    return row ? this.toDto(row) : null
  }

  async getByIds(ids: string[]): Promise<IpCharacter[]> {
    if (ids.length === 0) return []
    const rows = await this.repo
      .createQueryBuilder('c')
      .where('c.id IN (:...ids)', { ids })
      .getMany()
    return this.toDtoList(rows)
  }

  async create(data: CreateIpCharacterRequest): Promise<IpCharacter> {
    const now = Date.now()
    const entity = this.repo.create({
      id: `ipc_${randomUUID().slice(0, 12)}`,
      name: data.name,
      aliases: data.aliases && data.aliases.length > 0 ? JSON.stringify(data.aliases) : null,
      worldId: data.worldId ?? null,
      gender: data.gender ?? null,
      age: data.age ?? null,
      race: data.race ?? null,
      occupation: data.occupation ?? null,
      appearance: data.appearance ?? null,
      portraitId: data.portraitId ?? null,
      personality: data.personality ?? null,
      motivation: data.motivation ?? null,
      flaw: data.flaw ?? null,
      background: data.background ?? null,
      valuesNotes: data.valuesNotes ?? null,
      talents: data.talents ?? null,
      abilities: data.abilities ?? null,
      signatureItems: data.signatureItems ?? null,
      characterArc: data.characterArc ?? null,
      catchphrases:
        data.catchphrases && data.catchphrases.length > 0 ? JSON.stringify(data.catchphrases) : null,
      fields: data.fields ? JSON.stringify(data.fields) : null,
      tags: data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : null,
      status: 'active',
      origin: JSON.stringify({ type: 'manual' }),
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async updateRow(id: string, data: UpdateIpCharacterRequest): Promise<IpCharacter | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null
    const strFields = [
      'name', 'gender', 'age', 'race', 'occupation', 'appearance', 'portraitId',
      'personality', 'motivation', 'flaw', 'background', 'valuesNotes',
      'talents', 'abilities', 'signatureItems', 'characterArc',
    ] as const
    for (const f of strFields) {
      if (data[f] !== undefined) (existing as any)[f] = data[f]
    }
    if (data.worldId !== undefined) existing.worldId = data.worldId
    if (data.status !== undefined) existing.status = data.status
    if (data.aliases !== undefined) {
      existing.aliases = data.aliases.length > 0 ? JSON.stringify(data.aliases) : null
    }
    if (data.catchphrases !== undefined) {
      existing.catchphrases =
        data.catchphrases.length > 0 ? JSON.stringify(data.catchphrases) : null
    }
    if (data.fields !== undefined) {
      existing.fields = data.fields ? JSON.stringify(data.fields) : null
    }
    if (data.tags !== undefined) {
      existing.tags = data.tags.length > 0 ? JSON.stringify(data.tags) : null
    }
    existing.updatedAt = Date.now()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  /** 标记来源（AI 生成 / 项目沉淀）——create 默认 manual，这里覆写 */
  async markOrigin(id: string, origin: Record<string, unknown>): Promise<void> {
    await this.repo.update({ id } as any, { origin: JSON.stringify(origin), updatedAt: Date.now() })
  }

  async deleteRow(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }
}
