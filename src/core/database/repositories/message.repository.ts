/**
 * 消息数据访问层
 * @module database/repositories/message
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
 */

import type { DataSource } from 'typeorm'
import type {
  Message,
  MessageRole,
  Attachment,
  MessageMetadata,
} from '@shared/types'
import { randomUUID } from 'crypto'
import { MessageEntity } from '../entities/message.entity'
import { DialogEntity } from '../entities/dialog.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export class MessageRepository extends BaseRepository<MessageEntity, Message> {
  constructor(dataSource: DataSource) {
    super(dataSource, MessageEntity)
  }

  private toDate(v: Date | number | string | null | undefined): Date {
    if (v instanceof Date) return v
    if (typeof v === 'number' || typeof v === 'string') return new Date(v)
    return new Date()
  }

  protected toDto(e: MessageEntity): Message {
    return {
      id: e.id,
      dialogId: e.dialogId,
      role: e.role as MessageRole,
      content: e.content,
      modelId: e.modelId || undefined,
      tokensUsed: e.tokensUsed ?? undefined,
      attachments:
        (e.attachments as Attachment[] | null) ?? undefined,
      metadata:
        (e.metadata as MessageMetadata | null) ?? undefined,
      createdAt: this.toDate(e.createdAt),
    }
  }

  async getByDialogId(dialogId: string): Promise<Message[]> {
    const es = await this.scoped.find({
      where: { dialogId } as any,
      order: { createdAt: 'ASC' } as any,
    })
    return this.toDtoList(es)
  }

  async create(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    const userId = getCurrentUserId()
    return this.dataSource.transaction(async manager => {
      const id = randomUUID()
      const now = new Date()
      const msgRepo = manager.getRepository(MessageEntity)
      const dialogRepo = manager.getRepository(DialogEntity)

      const saved = await msgRepo.save(
        msgRepo.create({
          id,
          dialogId: message.dialogId,
          role: message.role,
          content: message.content,
          modelId: message.modelId ?? null,
          tokensUsed: message.tokensUsed ?? null,
          attachments: (message.attachments as unknown[] | undefined) ?? null,
          metadata:
            (message.metadata as Record<string, unknown> | undefined) ?? null,
          createdAt: now,
          userId,  // 多租户隔离：写入时打上当前用户
        }),
      )

      // 同步更新对话计数与时间（按 user_id 限定）
      const dialogScope = userId ? { userId } : {}
      await dialogRepo.increment(
        { id: message.dialogId, ...dialogScope } as any,
        'messageCount',
        1,
      )
      await dialogRepo.update(
        { id: message.dialogId, ...dialogScope } as any,
        { updatedAt: now },
      )

      return this.toDto(saved)
    })
  }

  async getRecent(dialogId: string, limit: number): Promise<Message[]> {
    const entities = await this.scoped.find({
      where: { dialogId } as any,
      order: { createdAt: 'DESC' } as any,
      take: limit,
    })
    return this.toDtoList(entities.reverse())
  }

  async count(dialogId: string): Promise<number> {
    return this.scoped.count({ dialogId } as any)
  }

  async deleteByDialogId(dialogId: string): Promise<void> {
    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const userScope = userId ? { userId } : {}
      await manager.delete(MessageEntity, { dialogId, ...userScope })
      await manager.update(
        DialogEntity,
        { id: dialogId, ...userScope } as any,
        { messageCount: 0 },
      )
    })
  }

  async delete(id: string): Promise<void> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return

    const userId = getCurrentUserId()
    await this.dataSource.transaction(async manager => {
      const userScope = userId ? { userId } : {}
      await manager.delete(MessageEntity, { id, ...userScope })
      await manager.decrement(
        DialogEntity,
        { id: existing.dialogId, ...userScope } as any,
        'messageCount',
        1,
      )
      await manager.update(
        DialogEntity,
        { id: existing.dialogId, ...userScope } as any,
        { updatedAt: new Date() },
      )
    })
  }

  async updateContent(id: string, content: string): Promise<void> {
    await this.scoped.update({ id } as any, { content } as Partial<MessageEntity>)
  }

  async updateMetadata(id: string, metadata: MessageMetadata): Promise<void> {
    await this.scoped.update(
      { id } as any,
      { metadata: metadata as Record<string, unknown> } as Partial<MessageEntity>,
    )
  }

  async updateTokensUsed(id: string, tokensUsed: number): Promise<void> {
    await this.scoped.update({ id } as any, { tokensUsed } as Partial<MessageEntity>)
  }

  async getById(id: string): Promise<Message | null> {
    const e = await this.scoped.findOne({ id } as any)
    return e ? this.toDto(e) : null
  }
}
