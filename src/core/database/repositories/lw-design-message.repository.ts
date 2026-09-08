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
import { getCurrentUserId } from '@core/context/user-context'

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
      metadata: e.metadata ?? undefined,
    }
  }

  async getByConversationId(conversationId: string): Promise<DesignMessage[]> {
    // 注意：用 scoped.find（自动合并 user_id 过滤），不能用裸 qb 的 .where()——
    // TypeORM 的 .where() 会覆盖 scoped.qb 内部注入的 andWhere(user_id)，导致跨用户泄露。
    const entities = await this.scoped.find({
      where: { conversationId } as any,
      order: { sortOrder: 'ASC' as const, timestamp: 'ASC' as const },
    })
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<DesignMessage | null> {
    return this.findOneByWhere({ id } as any)
  }

  async countByConversationId(conversationId: string): Promise<number> {
    return this.scoped.count({ conversationId } as any)
  }

  async add(
    conversationId: string,
    message: Omit<DesignMessage, 'timestamp'> & { timestamp?: number },
    opts?: { projectId?: string },
  ): Promise<DesignMessage> {
    const id = this.generateId()
    const now = Date.now()
    const timestamp = message.timestamp || now

    // 评审 #66：MAX(sort_order) 补 user_id 过滤（与同文件 scoped 读路径一致）——
    // 裸 qb 不带 user_id 时，不同租户的同名 conversation_id 会互相顶高 sort_order
    const userId = getCurrentUserId()
    const maxOrder = await this.repo
      .createQueryBuilder('m')
      .select('MAX(m.sort_order)', 'max')
      .where('m.conversation_id = :cid', { cid: conversationId })
      .andWhere(userId === null ? 'm.user_id IS NULL' : 'm.user_id = :uid', userId === null ? {} : { uid: userId })
      .getRawOne()
    const sortOrder = (Number(maxOrder?.max) || -1) + 1

    // FK 前置（M6.5 实测：lw_design_messages.conversation_id 外键指向本表，
    // ep-agent:/agent: 等工具化会话无父行时首条消息即 FK 失败）
    await this.ensureConversationRow(conversationId, opts?.projectId)

    try {
      await this.scoped.save({
        id,
        conversationId,
        role: message.role,
        content: message.content,
        timestamp,
        sortOrder,
        metadata: message.metadata ?? null,
      })
    } catch (e) {
      console.error('[DBG-lwdm] 消息落库失败:', e)
      throw e
    }
    return {
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp,
      metadata: message.metadata,
    }
  }

  async batchAdd(
    conversationId: string,
    messages: DesignMessage[],
  ): Promise<void> {
    if (messages.length === 0) return
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(LwDesignMessageEntity)
      // 事务内裸 repo 不会自动注入 user_id，手动注入（否则消息跨用户不可见/泄露）
      const userId = getCurrentUserId()
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
            metadata: msg.metadata ?? null,
            userId,
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
      const userId = getCurrentUserId()
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
            metadata: msg.metadata ?? null,
            userId,
          }),
        )
      }
    })
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    return this.scoped.delete({ conversationId } as any)
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

  /** 确保父会话行存在（INSERT OR IGNORE，SQLite/PG 双方言；工具化会话首条消息前置） */
  private async ensureConversationRow(conversationId: string, projectId?: string): Promise<void> {
    const repo = this.dataSource.getRepository(LwDesignConversationEntity)
    let exists = null
    try {
      exists = await repo.findOne({ where: { id: conversationId } as never })
    } catch (e) {
      console.error('[DBG-lwdm] 父行查询失败:', e)
      throw e
    }
    if (exists) return
    // project_id 无外键：从会话 id 尾段推导占位（ep-agent:<episodeId> 场景由调用方传真值），
    // 推导不出用 'agent'——仅作容器字段，不参与 LW 项目过滤
    const derived = conversationId.includes(':') ? conversationId.split(':').pop()! : 'agent'
    const now = new Date()
    try {
      await repo.insert({
        id: conversationId,
        projectId: projectId ?? derived,
        stage: 'agent',
        createdAt: now,
        updatedAt: now,
      } as never)
    } catch (e) {
      console.error('[DBG-lwdm] 父行插入失败:', e)
      throw e
    }
  }

  private generateId(): string {
    return `dm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
