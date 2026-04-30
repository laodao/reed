/**
 * 复刻声音数据访问层
 * @module database/repositories/cloned-voice
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有方法已从同步签名迁移为 Promise<T>。
 */

import type { DataSource } from 'typeorm'
import type {
  ClonedVoice,
  ClonedVoiceStatus,
} from '@shared/types/voice.types'
import { randomUUID } from 'crypto'
import { ClonedVoiceEntity } from '../entities/cloned-voice.entity'
import { BaseRepository } from '../base-repository'

export class ClonedVoiceRepository extends BaseRepository<
  ClonedVoiceEntity,
  ClonedVoice
> {
  constructor(dataSource: DataSource) {
    super(dataSource, ClonedVoiceEntity)
  }

  protected toDto(e: ClonedVoiceEntity): ClonedVoice {
    return {
      id: e.id,
      name: e.name,
      status: e.status as ClonedVoiceStatus,
      sampleAudioPath: e.sampleAudioPath || undefined,
      sampleDuration: e.sampleDuration ?? undefined,
      voiceId: e.voiceId || undefined,
      previewAudioPath: e.previewAudioPath || undefined,
      providerId: e.providerId || undefined,
      errorMessage: e.errorMessage || undefined,
      createdAt: new Date(e.createdAt),
      updatedAt: e.updatedAt ? new Date(e.updatedAt) : undefined,
    }
  }

  async getAll(): Promise<ClonedVoice[]> {
    return this.findManyByWhere({} as any, { createdAt: 'DESC' })
  }

  async getByStatus(status: ClonedVoiceStatus): Promise<ClonedVoice[]> {
    return this.findManyByWhere({ status } as any, { createdAt: 'DESC' })
  }

  async getById(id: string): Promise<ClonedVoice | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getByVoiceId(voiceId: string): Promise<ClonedVoice | null> {
    return this.findOneByWhere({ voiceId } as any)
  }

  async create(
    record: Omit<ClonedVoice, 'id' | 'createdAt'>,
  ): Promise<ClonedVoice> {
    const id = randomUUID()
    const nowIso = new Date().toISOString()
    const entity = this.repo.create({
      id,
      name: record.name,
      status: record.status,
      sampleAudioPath: record.sampleAudioPath ?? null,
      sampleDuration: record.sampleDuration ?? null,
      voiceId: record.voiceId ?? null,
      previewAudioPath: record.previewAudioPath ?? null,
      providerId: record.providerId ?? null,
      errorMessage: record.errorMessage ?? null,
      createdAt: nowIso,
      updatedAt: record.updatedAt?.toISOString() ?? null,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<ClonedVoice>): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return

    if (data.status !== undefined) existing.status = data.status
    if (data.voiceId !== undefined) existing.voiceId = data.voiceId ?? null
    if (data.previewAudioPath !== undefined) {
      existing.previewAudioPath = data.previewAudioPath ?? null
    }
    if (data.errorMessage !== undefined) {
      existing.errorMessage = data.errorMessage ?? null
    }
    existing.updatedAt = new Date().toISOString()
    await this.repo.save(existing)
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id } as any)
  }

  async count(): Promise<number> {
    return this.repo.count()
  }
}
