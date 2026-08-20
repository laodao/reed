/**
 * 应用会话仓库（片1）
 * @module core/database/repositories/app-session.repository
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { AppSessionRecord } from '@shared/types/app.types'
import { APP_SESSION_STATUSES } from '@shared/types/app.types'
import { AppSessionEntity } from '../entities/app-session.entity'
import { BaseRepository } from '../base-repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('AppSessionRepository')

export interface CreateAppSessionInput {
  appId: string
  title: string
  status?: string
  lastRunId?: string | null
  lastStartInputs?: Record<string, unknown> | null
}

export interface UpdateAppSessionInput {
  title?: string
  status?: string
  lastRunId?: string | null
  lastStartInputs?: Record<string, unknown> | null
}

export class AppSessionRepository extends BaseRepository<AppSessionEntity, AppSessionRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, AppSessionEntity)
  }

  protected toDto(e: AppSessionEntity): AppSessionRecord {
    let lastStartInputs: Record<string, unknown> | null = null
    if (e.lastStartInputs) {
      try {
        const parsed = JSON.parse(e.lastStartInputs)
        if (parsed && typeof parsed === 'object') lastStartInputs = parsed
      } catch (err) {
        // 损坏数据降级 + 留痕（对齐 workflow-definition.safeParse 的 logger.warn 纪律）
        logger.warn(`[AppSessionRepository] last_start_inputs 解析失败（id=${e.id}），降级为 null`, err)
      }
    }
    return {
      id: e.id,
      userId: e.userId,
      appId: e.appId,
      title: e.title,
      status: e.status,
      lastRunId: e.lastRunId,
      lastStartInputs,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async findById(id: string): Promise<AppSessionRecord | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<AppSessionEntity>)
    return e ? this.toDto(e) : null
  }

  async listByApp(appId: string): Promise<AppSessionRecord[]> {
    const rows = await this.scoped.qb('s')
      .where('s.app_id = :appId', { appId })
      .orderBy('s.created_at', 'DESC')
      .getMany()
    return this.toDtoList(rows)
  }

  async countByApp(appId: string): Promise<number> {
    return this.scoped.count({ appId } as FindOptionsWhere<AppSessionEntity>)
  }

  async create(data: CreateAppSessionInput): Promise<AppSessionRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      appId: data.appId,
      title: data.title,
      status: data.status ?? APP_SESSION_STATUSES.idle,
      lastRunId: data.lastRunId ?? null,
      lastStartInputs: data.lastStartInputs ? JSON.stringify(data.lastStartInputs) : null,
      createdAt: now,
      updatedAt: now,
    } as Partial<AppSessionEntity>)
    return this.toDto(entity as AppSessionEntity)
  }

  async update(id: string, patch: UpdateAppSessionInput): Promise<AppSessionRecord | null> {
    const partial: Partial<AppSessionEntity> = { updatedAt: new Date() }
    if (patch.title !== undefined) partial.title = patch.title
    if (patch.status !== undefined) partial.status = patch.status
    if (patch.lastRunId !== undefined) partial.lastRunId = patch.lastRunId
    if (patch.lastStartInputs !== undefined) {
      partial.lastStartInputs = patch.lastStartInputs ? JSON.stringify(patch.lastStartInputs) : null
    }
    await this.scoped.update({ id } as FindOptionsWhere<AppSessionEntity>, partial)
    return this.findById(id)
  }

  async deleteByApp(appId: string): Promise<number> {
    const result = await this.scoped.delete({ appId } as FindOptionsWhere<AppSessionEntity>)
    return result.affected ?? 0
  }
}