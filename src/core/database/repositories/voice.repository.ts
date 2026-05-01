/**
 * 语音记录数据访问层
 * @module database/repositories/voice
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有方法已从同步签名迁移为 Promise<T>。
 */

import type { DataSource } from 'typeorm'
import type {
  VoiceRecord,
  VoiceHistoryQuery,
} from '@shared/types/voice.types'
import { randomUUID } from 'crypto'
import { VoiceRecordEntity } from '../entities/voice-record.entity'
import { BaseRepository } from '../base-repository'

export class VoiceRepository extends BaseRepository<
  VoiceRecordEntity,
  VoiceRecord
> {
  constructor(dataSource: DataSource) {
    super(dataSource, VoiceRecordEntity)
  }

  protected toDto(e: VoiceRecordEntity): VoiceRecord {
    return {
      id: e.id,
      type: e.type as VoiceRecord['type'],
      status: e.status as VoiceRecord['status'],
      inputText: e.inputText || undefined,
      outputAudioPath: e.outputAudioPath || undefined,
      voiceId: e.voiceId || undefined,
      voiceName: e.voiceName || undefined,
      language: e.language || undefined,
      speed: e.speed ?? undefined,
      pitch: e.pitch ?? undefined,
      volume: e.volume ?? undefined,
      emotion: e.emotion || undefined,
      style: e.style || undefined,
      duration: e.duration ?? undefined,
      inputAudioPath: e.inputAudioPath || undefined,
      outputText: e.outputText || undefined,
      providerId: e.providerId || undefined,
      modelId: e.modelId || undefined,
      favorite: e.favorite === 1,
      errorMessage: e.errorMessage || undefined,
      createdAt: new Date(e.createdAt),
    }
  }

  async getList(
    query: VoiceHistoryQuery,
  ): Promise<{ list: VoiceRecord[]; total: number }> {
    const { page, pageSize, type, favorite } = query
    const offset = (page - 1) * pageSize

    const qb = this.scoped.qb('v')
    if (type) qb.andWhere('v.type = :type', { type })
    if (favorite !== undefined) {
      qb.andWhere('v.favorite = :fav', { fav: favorite ? 1 : 0 })
    }
    qb.orderBy('v.created_at', 'DESC').skip(offset).take(pageSize)

    const [entities, total] = await qb.getManyAndCount()
    return { list: this.toDtoList(entities), total }
  }

  async getById(id: string): Promise<VoiceRecord | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(
    record: Omit<VoiceRecord, 'id' | 'createdAt'>,
  ): Promise<VoiceRecord> {
    const id = randomUUID()
    const nowIso = new Date().toISOString()
    const entity = this.repo.create({
      id,
      type: record.type,
      status: record.status,
      inputText: record.inputText ?? null,
      outputAudioPath: record.outputAudioPath ?? null,
      voiceId: record.voiceId ?? null,
      voiceName: record.voiceName ?? null,
      language: record.language ?? null,
      speed: record.speed ?? 1.0,
      pitch: record.pitch ?? 0,
      volume: record.volume ?? 1.0,
      emotion: record.emotion ?? null,
      style: record.style ?? null,
      duration: record.duration ?? null,
      inputAudioPath: record.inputAudioPath ?? null,
      outputText: record.outputText ?? null,
      providerId: record.providerId ?? null,
      modelId: record.modelId ?? null,
      favorite: record.favorite ? 1 : 0,
      errorMessage: record.errorMessage ?? null,
      createdAt: nowIso,
    })
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<VoiceRecord>): Promise<void> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return

    if (data.status !== undefined) existing.status = data.status
    if (data.outputAudioPath !== undefined) {
      existing.outputAudioPath = data.outputAudioPath ?? null
    }
    if (data.outputText !== undefined) existing.outputText = data.outputText ?? null
    if (data.duration !== undefined) existing.duration = data.duration ?? null
    if (data.favorite !== undefined) existing.favorite = data.favorite ? 1 : 0
    if (data.errorMessage !== undefined) {
      existing.errorMessage = data.errorMessage ?? null
    }
    await this.scoped.save(existing)
  }

  async delete(id: string): Promise<void> {
    await this.scoped.delete({ id } as any)
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const record = await this.getById(id)
    if (!record) {
      throw new Error('Voice record not found')
    }
    const newFavorite = !record.favorite
    await this.update(id, { favorite: newFavorite })
    return newFavorite
  }
}
