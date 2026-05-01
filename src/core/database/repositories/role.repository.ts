/**
 * 角色数据访问层
 * @module database/repositories/role
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
 *
 *              内置角色（isBuiltin=1）特殊处理：跨用户共享，user_id 为 NULL。
 *              所以 getAll/getById/delete 需要兼容"自己的或内置"两种条件。
 */

import type { DataSource } from 'typeorm'
import type {
  Role,
  CreateRoleRequest,
  UpdateRoleRequest,
  BuiltinRoleDefinition,
} from '@shared/types'
import { BUILTIN_ROLES } from '@shared/types'
import { randomUUID } from 'crypto'
import { RoleEntity } from '../entities/role.entity'
import { DialogEntity } from '../entities/dialog.entity'
import { MessageEntity } from '../entities/message.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export class RoleRepository extends BaseRepository<RoleEntity, Role> {
  constructor(dataSource: DataSource) {
    super(dataSource, RoleEntity)
  }

  private toDate(v: Date | number | string | null | undefined): Date {
    if (v instanceof Date) return v
    if (typeof v === 'number') return new Date(v)
    if (typeof v === 'string') return new Date(v)
    return new Date()
  }

  protected toDto(e: RoleEntity): Role {
    return {
      id: e.id,
      name: e.name,
      description: e.description || undefined,
      systemPrompt: e.systemPrompt || undefined,
      avatar: e.avatar || undefined,
      isBuiltin: e.isBuiltin === 1,
      defaultModelId: e.defaultModelId || undefined,
      defaultProviderConfigId: e.defaultProviderConfigId || undefined,
      autoResetModel: e.autoResetModel === null ? true : e.autoResetModel === 1,
      temperature: e.temperature ?? undefined,
      topP: e.topP ?? undefined,
      maxContextMessages: e.maxContextMessages ?? undefined,
      maxTokens: e.maxTokens ?? undefined,
      enableStream: e.enableStream === null ? true : e.enableStream === 1,
      customParams: (e.customParams as Record<string, unknown> | null) ?? undefined,
      knowledgeBaseIds: (e.knowledgeBaseIds as string[] | null) ?? undefined,
      knowledgeRetrieveCount: e.knowledgeRetrieveCount ?? undefined,
      knowledgeThreshold: e.knowledgeThreshold ?? undefined,
      createdAt: this.toDate(e.createdAt),
      updatedAt: this.toDate(e.updatedAt),
    }
  }

  async getAll(): Promise<Role[]> {
    // 列表 = 当前用户自己的 + 内置角色（user_id IS NULL）
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('r')
      .orderBy('r.is_builtin', 'DESC')
      .addOrderBy('r.created_at', 'ASC')
    if (userId) {
      qb.where('r.user_id = :userId OR r.is_builtin = 1', { userId })
    } else {
      qb.where('r.is_builtin = 1')
    }
    const entities = await qb.getMany()
    return this.toDtoList(entities)
  }

  async getById(id: string): Promise<Role | null> {
    // 内置角色或自己的角色都能查到
    const userId = getCurrentUserId()
    const qb = this.repo.createQueryBuilder('r').where('r.id = :id', { id })
    if (userId) {
      qb.andWhere('(r.user_id = :userId OR r.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('r.is_builtin = 1')
    }
    const e = await qb.getOne()
    return e ? this.toDto(e) : null
  }

  async create(request: CreateRoleRequest): Promise<Role> {
    const id = randomUUID()
    const now = new Date()
    const saved = await this.scoped.save({
      id,
      name: request.name,
      description: request.description ?? null,
      systemPrompt: request.systemPrompt ?? null,
      avatar: request.avatar ?? null,
      isBuiltin: 0,
      defaultModelId: request.defaultModelId ?? null,
      defaultProviderConfigId: request.defaultProviderConfigId ?? null,
      autoResetModel: request.autoResetModel === false ? 0 : 1,
      temperature: request.temperature ?? 0.7,
      topP: request.topP ?? 1.0,
      maxContextMessages: request.maxContextMessages ?? 20,
      maxTokens: request.maxTokens ?? 4096,
      enableStream: request.enableStream === false ? 0 : 1,
      customParams: request.customParams ?? null,
      knowledgeBaseIds: request.knowledgeBaseIds ?? null,
      knowledgeRetrieveCount: request.knowledgeRetrieveCount ?? 5,
      knowledgeThreshold: request.knowledgeThreshold ?? 0.5,
      createdAt: now,
      updatedAt: now,
    } as Partial<RoleEntity>)
    return this.toDto(saved)
  }

  /**
   * 创建内置角色（user_id 留空）。仅在系统初始化时由 PC/Web 引导逻辑调用。
   */
  async createBuiltin(definition: BuiltinRoleDefinition): Promise<Role> {
    const now = new Date()
    const entity = this.repo.create({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      systemPrompt: definition.systemPrompt,
      avatar: definition.avatar,
      isBuiltin: 1,
      defaultModelId: null,
      defaultProviderConfigId: null,
      autoResetModel: 1,
      temperature: 0.7,
      topP: 1.0,
      maxContextMessages: 20,
      maxTokens: 4096,
      enableStream: 1,
      customParams: null,
      knowledgeBaseIds: null,
      knowledgeRetrieveCount: 5,
      knowledgeThreshold: 0.5,
      createdAt: now,
      updatedAt: now,
      userId: null,  // 内置角色跨用户共享
    })
    const saved = await this.repo.save(entity)
    return this.toDto(saved)
  }

  async initBuiltinRoles(): Promise<void> {
    // 内置角色应当跨用户共享（user_id = NULL）。PC 端 ensureUserIdColumns 会把
    // 旧数据 user_id 全部回填为默认值，会误把内置角色也回填——这里启动时
    // 强制把 isBuiltin=1 的 user_id 重置回 NULL。
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ userId: null } as any)
      .where('is_builtin = 1 AND user_id IS NOT NULL')
      .execute()

    for (const definition of BUILTIN_ROLES) {
      // 用裸 repo 查（不能按当前 user_id 过滤，否则永远看不到内置）
      const existing = await this.repo.findOne({
        where: { id: definition.id, isBuiltin: 1 } as any,
      })
      if (!existing) {
        await this.createBuiltin(definition)
        console.log(`创建内置角色: ${definition.name}`)
      }
    }
  }

  async update(id: string, request: UpdateRoleRequest): Promise<void> {
    // 用 scoped 查找：自己的或内置角色（内置角色不允许改，前端应阻止）
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return
    if (existing.isBuiltin === 1) return  // 内置角色不允许修改

    if (request.name !== undefined) existing.name = request.name
    if (request.description !== undefined) existing.description = request.description
    if (request.systemPrompt !== undefined) existing.systemPrompt = request.systemPrompt
    if (request.avatar !== undefined) existing.avatar = request.avatar
    if (request.defaultModelId !== undefined) {
      existing.defaultModelId = request.defaultModelId || null
    }
    if (request.defaultProviderConfigId !== undefined) {
      existing.defaultProviderConfigId = request.defaultProviderConfigId || null
    }
    if (request.autoResetModel !== undefined) {
      existing.autoResetModel = request.autoResetModel ? 1 : 0
    }
    if (request.temperature !== undefined) existing.temperature = request.temperature
    if (request.topP !== undefined) existing.topP = request.topP
    if (request.maxContextMessages !== undefined) {
      existing.maxContextMessages = request.maxContextMessages
    }
    if (request.maxTokens !== undefined) existing.maxTokens = request.maxTokens
    if (request.enableStream !== undefined) {
      existing.enableStream = request.enableStream ? 1 : 0
    }
    if (request.customParams !== undefined) {
      existing.customParams = request.customParams ?? null
    }
    if (request.knowledgeBaseIds !== undefined) {
      existing.knowledgeBaseIds = request.knowledgeBaseIds ?? null
    }
    if (request.knowledgeRetrieveCount !== undefined) {
      existing.knowledgeRetrieveCount = request.knowledgeRetrieveCount
    }
    if (request.knowledgeThreshold !== undefined) {
      existing.knowledgeThreshold = request.knowledgeThreshold
    }
    existing.updatedAt = new Date()
    await this.scoped.save(existing)  // scoped.save 会重新注入 userId（防被改）
  }

  /**
   * 删除角色（仅限自定义角色）
   * 级联：删除关联对话及其所有 messages，全部按 user_id 限定。
   */
  async delete(
    id: string,
  ): Promise<{ deleted: boolean; dialogCount: number }> {
    const role = await this.getById(id)
    if (!role) return { deleted: false, dialogCount: 0 }
    if (role.isBuiltin) return { deleted: false, dialogCount: 0 }

    const userId = getCurrentUserId()
    return this.dataSource.transaction(async manager => {
      const dialogRepo = manager.getRepository(DialogEntity)
      const messageRepo = manager.getRepository(MessageEntity)

      const userScope = userId ? { userId } : {}
      const dialogs = await dialogRepo.find({
        where: { roleId: id, ...userScope } as any,
        select: ['id'],
      })
      const dialogCount = dialogs.length

      if (dialogCount > 0) {
        const dialogIds = dialogs.map(d => d.id)
        const delMsgQb = messageRepo
          .createQueryBuilder()
          .delete()
          .from(MessageEntity)
          .where('dialog_id IN (:...ids)', { ids: dialogIds })
        if (userId) delMsgQb.andWhere('user_id = :userId', { userId })
        await delMsgQb.execute()
        await dialogRepo.delete({ roleId: id, ...userScope } as any)
      }

      await manager.delete(RoleEntity, { id, ...userScope } as any)
      return { deleted: true, dialogCount }
    })
  }

  async getDialogCount(id: string): Promise<number> {
    const userId = getCurrentUserId()
    const userScope = userId ? { userId } : {}
    return this.dataSource.getRepository(DialogEntity).count({
      where: { roleId: id, ...userScope } as any,
    })
  }

  async incrementUseCount(_id: string): Promise<void> {
    // 暂未实现使用次数统计，行为与原实现一致
  }
}
