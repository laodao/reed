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

  /**
   * 系统级扫描（声明式跨租户例外，纪律同 platform-event §4.4）：
   * 仅供 VoiceCloneJobScheduler 轮询**所有用户**的 training 任务——调度器
   * 运行在 boot/定时器上下文，无请求 ALS，scoped 查询会退化为 user_id IS NULL
   * 而永远扫不到任何用户的任务。调用方必须对每行以 runWithUserAsync(row.userId)
   * 重建租户上下文后再做 scoped 读写/事件广播。
   */
  async listTrainingJobsAllUsers(): Promise<Array<{ id: string; userId: string | null }>> {
    const rows = await this.repo.find({
      where: { status: 'training' } as any,
      select: { id: true, userId: true } as any,
    })
    return rows.map(r => ({ id: r.id, userId: r.userId ?? null }))
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
    const saved = await this.scoped.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<ClonedVoice>): Promise<void> {
    const existing = await this.scoped.findOne({ id } as any)
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
    await this.scoped.save(existing)
  }

  async delete(id: string): Promise<void> {
    await this.scoped.delete({ id } as any)
  }

  async count(): Promise<number> {
    return this.scoped.count()
  }
}
