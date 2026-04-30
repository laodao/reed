/**
 * 消息数据访问层
 * @module database/repositories/message
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
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
    return this.findManyByWhere({ dialogId } as any, { createdAt: 'ASC' })
  }

  async create(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
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
        }),
      )

      // 同步更新对话计数与时间
      await dialogRepo.increment({ id: message.dialogId } as any, 'messageCount', 1)
      await dialogRepo.update({ id: message.dialogId } as any, { updatedAt: now })

      return this.toDto(saved)
    })
  }

  async getRecent(dialogId: string, limit: number): Promise<Message[]> {
    const entities = await this.repo.find({
      where: { dialogId } as any,
      order: { createdAt: 'DESC' } as any,
      take: limit,
    })
    return this.toDtoList(entities.reverse())
  }

  async count(dialogId: string): Promise<number> {
    return this.repo.count({ where: { dialogId } as any })
  }

  async deleteByDialogId(dialogId: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      await manager.delete(MessageEntity, { dialogId })
      await manager.update(DialogEntity, { id: dialogId } as any, {
        messageCount: 0,
      })
    })
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return

    await this.dataSource.transaction(async manager => {
      await manager.delete(MessageEntity, { id })
      await manager.decrement(DialogEntity, { id: existing.dialogId } as any, 'messageCount', 1)
      await manager.update(DialogEntity, { id: existing.dialogId } as any, {
        updatedAt: new Date(),
      })
    })
  }

  async updateContent(id: string, content: string): Promise<void> {
    await this.repo.update({ id } as any, { content })
  }

  async updateMetadata(id: string, metadata: MessageMetadata): Promise<void> {
    await this.repo.update({ id } as any, {
      metadata: metadata as Record<string, unknown>,
    })
  }

  async updateTokensUsed(id: string, tokensUsed: number): Promise<void> {
    await this.repo.update({ id } as any, { tokensUsed })
  }

  async getById(id: string): Promise<Message | null> {
    return this.findOneByWhere({ id } as any)
  }
}
