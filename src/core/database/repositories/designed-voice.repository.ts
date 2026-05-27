/**
 * 设计声音数据访问层
 * @module database/repositories/designed-voice
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有方法已从同步签名迁移为 Promise<T>。
 */

import type { DataSource } from 'typeorm'
import type {
  DesignedVoice,
  DesignedVoiceStatus,
} from '@shared/types/voice.types'
import { randomUUID } from 'crypto'
import { DesignedVoiceEntity } from '../entities/designed-voice.entity'
import { BaseRepository } from '../base-repository'

export class DesignedVoiceRepository extends BaseRepository<
  DesignedVoiceEntity,
  DesignedVoice
> {
  constructor(dataSource: DataSource) {
    super(dataSource, DesignedVoiceEntity)
  }

  protected toDto(e: DesignedVoiceEntity): DesignedVoice {
    return {
      id: e.id,
      name: e.name,
      voicePrompt: e.voicePrompt,
      status: e.status as DesignedVoiceStatus,
      voiceId: e.voiceId || undefined,
      targetModel: e.targetModel || undefined,
      prefix: e.prefix || undefined,
      previewAudioPath: e.previewAudioPath || undefined,
      providerId: e.providerId || undefined,
      errorMessage: e.errorMessage || undefined,
      createdAt: new Date(e.createdAt),
      updatedAt: e.updatedAt ? new Date(e.updatedAt) : undefined,
    }
  }

  async getAll(): Promise<DesignedVoice[]> {
    return this.findManyByWhere({} as any, { createdAt: 'DESC' })
  }

  async getByStatus(status: DesignedVoiceStatus): Promise<DesignedVoice[]> {
    return this.findManyByWhere({ status } as any, { createdAt: 'DESC' })
  }

  async getById(id: string): Promise<DesignedVoice | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByVoiceId(voiceId: string): Promise<DesignedVoice | null> {
    return this.findOneByWhere({ voiceId } as any)
  }

  async create(
    record: Omit<DesignedVoice, 'id' | 'createdAt'>,
  ): Promise<DesignedVoice> {
    const id = randomUUID()
    const nowIso = new Date().toISOString()
    const entity = this.repo.create({
      id,
      name: record.name,
      voicePrompt: record.voicePrompt,
      status: record.status,
      voiceId: record.voiceId ?? null,
      targetModel: record.targetModel ?? null,
      prefix: record.prefix ?? null,
      previewAudioPath: record.previewAudioPath ?? null,
      providerId: record.providerId ?? null,
      errorMessage: record.errorMessage ?? null,
      createdAt: nowIso,
      updatedAt: record.updatedAt?.toISOString() ?? null,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<DesignedVoice>): Promise<void> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return

    if (data.status !== undefined) existing.status = data.status
    if (data.voiceId !== undefined) existing.voiceId = data.voiceId ?? null
    if (data.targetModel !== undefined) existing.targetModel = data.targetModel ?? null
    if (data.previewAudioPath !== undefined) {
      existing.previewAudioPath = data.previewAudioPath ?? null
    }
    if (data.errorMessage !== undefined) {
      existing.errorMessage = data.errorMessage ?? null
    }
    existing.updatedAt = new Date().toISOString()
    await this.scoped.save(existing)
  }

  async delete(id: string): Promise<void> {
    await this.scoped.delete({ id } as any)
  }

  async count(): Promise<number> {
    return this.scoped.count()
  }
}