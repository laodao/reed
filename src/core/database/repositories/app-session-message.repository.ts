/**
 * 应用会话消息仓库（独立消息表，隔离 AI 对话表）
 * @module core/database/repositories/app-session-message.repository
 * @description 应用会话消息落到独立表 app_session_messages，不再复用 messages/dialogs。
 *              DTO 映射为 shared Message（dialogId 用 sessionId 填充，前端无感知兼容）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { Message } from '@shared/types/message.types'
import { randomUUID } from 'crypto'
import { AppSessionMessageEntity } from '../entities/app-session-message.entity'
import { BaseRepository } from '../base-repository'

export interface CreateAppSessionMessageInput {
  sessionId: string
  role: string
  content: string
  metadata?: Record<string, unknown> | null
}

export class AppSessionMessageRepository extends BaseRepository<AppSessionMessageEntity, Message> {
  constructor(dataSource: DataSource) {
    super(dataSource, AppSessionMessageEntity)
  }

  private toDate(v: Date | number | string | null | undefined): Date {
    if (v instanceof Date) return v
    if (typeof v === 'number' || typeof v === 'string') return new Date(v)
    return new Date()
  }

  protected toDto(e: AppSessionMessageEntity): Message {
    let metadata: Record<string, unknown> | null = null
    if (e.metadata) {
      try {
        const parsed = JSON.parse(e.metadata)
        if (parsed && typeof parsed === 'object') metadata = parsed
      } catch {
        metadata = null
      }
    }
    return {
      id: e.id,
      dialogId: e.sessionId, // 前端兼容：消息归属会话
      role: e.role as Message['role'],
      content: e.content,
      metadata: metadata as Message['metadata'] | undefined,
      createdAt: this.toDate(e.createdAt),
    }
  }

  async getBySessionId(sessionId: string): Promise<Message[]> {
    const es = await this.scoped.find({
      where: { sessionId } as FindOptionsWhere<AppSessionMessageEntity>,
      // id 次级排序：SQLite datetime 秒级精度，startRun 连写的 user 气泡 + runStatus
      // 卡同秒时纯 createdAt 顺序不定（报告分组 16 🟡）
      order: { createdAt: 'ASC', id: 'ASC' } as any,
    })
    return this.toDtoList(es)
  }

  async create(input: CreateAppSessionMessageInput): Promise<Message> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: now,
    } as Partial<AppSessionMessageEntity>)
    return this.toDto(entity as AppSessionMessageEntity)
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const res = await this.scoped.delete({ sessionId } as FindOptionsWhere<AppSessionMessageEntity>)
    return res.affected ?? 0
  }
}
