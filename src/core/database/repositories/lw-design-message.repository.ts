/**
 * 设计对话消息仓库
 * @module database/repositories/lw-design-message.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 *              第三范式：消息独立表存储，旧 lw_design_conversations.messages JSON 兼容迁移。
 */

import type { DataSource } from 'typeorm'
import { DesignMessage } from '@shared/types/longwriting.types'
import { LwDesignMessageEntity } from '../entities/lw-design-message.entity'
import { LwDesignConversationEntity } from '../entities/lw-design-conversation.entity'
import { BaseRepository } from '../base-repository'

export class LwDesignMessageRepository extends BaseRepository<
  LwDesignMessageEntity,
  DesignMessage
> {
  constructor(dataSource: DataSource) {
    super(dataSource, LwDesignMessageEntity)
  }

  protected toDto(e: LwDesignMessageEntity): DesignMessage {
    return {
      role: e.role as 'user' | 'assistant',
      content: e.content,
      timestamp: e.timestamp,
    }
  }

  async getByConversationId(conversationId: string): Promise<DesignMessage[]> {
    const entities = await this.repo
      .createQueryBuilder('m')
      .where('m.conversation_id = :cid', { cid: conversationId })
      .orderBy('m.sort_order', 'ASC')
      .addOrderBy('m.timestamp', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<DesignMessage | null> {
    return this.findOneByWhere({ id } as any)
  }

  async countByConversationId(conversationId: string): Promise<number> {
    return this.repo.count({ where: { conversationId } as any })
  }

  async add(
    conversationId: string,
    message: Omit<DesignMessage, 'timestamp'> & { timestamp?: number },
  ): Promise<DesignMessage> {
    const id = this.generateId()
    const now = Date.now()
    const timestamp = message.timestamp || now

    const maxOrder = await this.repo
      .createQueryBuilder('m')
      .select('MAX(m.sort_order)', 'max')
      .where('m.conversation_id = :cid', { cid: conversationId })
      .getRawOne()
    const sortOrder = (Number(maxOrder?.max) || -1) + 1

    await this.repo.save(
      this.repo.create({
        id,
        conversationId,
        role: message.role,
        content: message.content,
        timestamp,
        sortOrder,
      }),
    )
    return {
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp,
    }
  }

  async batchAdd(
    conversationId: string,
    messages: DesignMessage[],
  ): Promise<void> {
    if (messages.length === 0) return
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwDesignMessageEntity)
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        await repo.save(
          repo.create({
            id: this.generateId(),
            conversationId,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            sortOrder: i,
          }),
        )
      }
    })
  }

  async replaceAll(
    conversationId: string,
    messages: DesignMessage[],
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwDesignMessageEntity)
      await repo.delete({ conversationId } as any)
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        await repo.save(
          repo.create({
            id: this.generateId(),
            conversationId,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            sortOrder: i,
          }),
        )
      }
    })
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id } as any)
    return (result.affected ?? 0) > 0
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    const result = await this.repo.delete({ conversationId } as any)
    return result.affected ?? 0
  }

  async migrateFromJson(conversationId: string): Promise<number> {
    const conversationRepo = this.dataSource.getRepository(LwDesignConversationEntity)
    const conversation = await conversationRepo.findOne({
      where: { id: conversationId } as any,
    })
    if (!conversation?.messages) return 0

    let messages: DesignMessage[]
    try {
      messages = JSON.parse(conversation.messages)
    } catch {
      return 0
    }
    if (messages.length === 0) return 0

    await this.batchAdd(conversationId, messages)
    return messages.length
  }

  private generateId(): string {
    return `dm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
