/**
 * 对话数据访问层
 * @module database/repositories/dialog
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 */

import type { DataSource } from 'typeorm'
import type {
  Dialog,
  ContextConfig,
  DialogWebSearchConfig,
} from '@shared/types'
import { randomUUID } from 'crypto'
import { DialogEntity } from '../entities/dialog.entity'
import { MessageEntity } from '../entities/message.entity'
import { BaseRepository } from '../base-repository'

export class DialogRepository extends BaseRepository<DialogEntity, Dialog> {
  constructor(dataSource: DataSource) {
    super(dataSource, DialogEntity)
  }

  private toDate(v: Date | number | string | null | undefined): Date {
    if (v instanceof Date) return v
    if (typeof v === 'number' || typeof v === 'string') return new Date(v)
    return new Date()
  }

  protected toDto(e: DialogEntity): Dialog {
    return {
      id: e.id,
      title: e.title,
      modelId: e.modelId,
      providerConfigId: e.providerConfigId || undefined,
      // 兼容处理：'default-assistant' 等同于 null（默认助手）
      roleId:
        e.roleId && e.roleId !== 'default-assistant' ? e.roleId : null,
      systemPrompt: e.systemPrompt || undefined,
      contextConfig:
        (e.contextConfig as ContextConfig | null) ?? undefined,
      knowledgeBaseIds: (e.knowledgeBaseIds as string[] | null) ?? undefined,
      webSearchConfig:
        (e.webSearchConfig as DialogWebSearchConfig | null) ?? undefined,
      createdAt: this.toDate(e.createdAt),
      updatedAt: this.toDate(e.updatedAt),
      messageCount: e.messageCount ?? 0,
    }
  }

  async getAll(): Promise<Dialog[]> {
    const entities = await this.repo.find({
      order: { updatedAt: 'DESC' } as any,
    })
    return this.toDtoList(entities)
  }

  async getByRoleId(roleId: string | null): Promise<Dialog[]> {
    const qb = this.repo.createQueryBuilder('d')
    if (roleId) {
      qb.where('d.role_id = :roleId', { roleId })
    } else {
      // 默认助手：兼容旧数据 role_id IS NULL 或 = 'default-assistant'
      qb.where("d.role_id IS NULL OR d.role_id = 'default-assistant'")
    }
    qb.orderBy('d.updated_at', 'DESC')
    return this.toDtoList(await qb.getMany())
  }

  async getById(id: string): Promise<Dialog | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(
    dialog: Omit<Dialog, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>,
  ): Promise<Dialog> {
    const id = randomUUID()
    const now = new Date()
    const entity = this.repo.create({
      id,
      title: dialog.title,
      modelId: dialog.modelId,
      providerConfigId: dialog.providerConfigId ?? null,
      roleId: dialog.roleId ?? null,
      systemPrompt: dialog.systemPrompt ?? null,
      contextConfig: (dialog.contextConfig as Record<string, unknown> | null) ?? null,
      knowledgeBaseIds: dialog.knowledgeBaseIds ?? null,
      webSearchConfig:
        (dialog.webSearchConfig as Record<string, unknown> | null) ?? null,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async update(id: string, data: Partial<Dialog>): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } as any })
    if (!existing) return

    if (data.title !== undefined) existing.title = data.title
    if (data.systemPrompt !== undefined) {
      existing.systemPrompt = data.systemPrompt ?? null
    }
    if (data.contextConfig !== undefined) {
      existing.contextConfig =
        (data.contextConfig as Record<string, unknown> | null) ?? null
    }
    if (data.modelId !== undefined) existing.modelId = data.modelId
    if (data.providerConfigId !== undefined) {
      existing.providerConfigId = data.providerConfigId || null
    }
    if (data.knowledgeBaseIds !== undefined) {
      existing.knowledgeBaseIds = data.knowledgeBaseIds ?? null
    }
    if (data.webSearchConfig !== undefined) {
      existing.webSearchConfig =
        (data.webSearchConfig as Record<string, unknown> | null) ?? null
    }
    existing.updatedAt = new Date()
    await this.repo.save(existing)
  }

  /**
   * 删除对话 + 关联 messages（应用层级联，与原实现一致）。
   */
  async delete(id: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      await manager.delete(MessageEntity, { dialogId: id })
      await manager.delete(DialogEntity, { id })
    })
  }

  async updateMessageCount(id: string, count: number): Promise<void> {
    await this.repo.update({ id } as any, {
      messageCount: count,
      updatedAt: new Date(),
    })
  }

  async touch(id: string): Promise<void> {
    await this.repo.update({ id } as any, { updatedAt: new Date() })
  }
}
