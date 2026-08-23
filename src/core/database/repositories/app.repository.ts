/**
 * 应用仓库（片1）
 * @module core/database/repositories/app.repository
 * @description apps 表 CRUD + 分享令牌跨租户查询（唯一跨租户例外，
 *              与 workflow-definition.findByShareToken 同纪律：调用方 runWithUserAsync 包裹）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { AppRecord } from '@shared/types/app.types'
import { AppEntity } from '../entities/app.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface CreateAppInput {
  name: string
  icon?: string | null
  description?: string | null
  sourceKind: string
  sourceId: string
  sourceVersion?: number | null
  channelSession?: number
  channelShare?: number
  channelApi?: number
}

export interface UpdateAppInput {
  name?: string
  icon?: string | null
  description?: string | null
  channelSession?: number
  channelShare?: number
  channelApi?: number
  shareToken?: string | null
  enabled?: number
  lastRunAt?: Date | null
  /** 来源工作流的发布版本快照（createFromWorkflow 版本演进时更新） */
  sourceVersion?: number | null
}

export class AppRepository extends BaseRepository<AppEntity, AppRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, AppEntity)
  }

  private generateId(): string {
    return `app_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: AppEntity): AppRecord {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      icon: e.icon,
      description: e.description,
      sourceKind: e.sourceKind,
      sourceId: e.sourceId,
      sourceVersion: e.sourceVersion,
      channelSession: e.channelSession,
      channelShare: e.channelShare,
      channelApi: e.channelApi,
      shareToken: e.shareToken,
      enabled: e.enabled,
      isBuiltin: e.isBuiltin === 1,
      lastRunAt: e.lastRunAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async findById(id: string): Promise<AppRecord | null> {
    // 自己的 + 内置（全局共享）
    const userId = getCurrentUserId()
    const qb = this.repo.createQueryBuilder('a').where('a.id = :id', { id })
    if (userId) {
      qb.andWhere('(a.user_id = :userId OR a.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(a.user_id IS NULL OR a.is_builtin = 1)')
    }
    const e = await qb.getOne()
    return e ? this.toDto(e) : null
  }

  /** 分页列表（内置应用置顶 + 更新时间倒序；keyword 模糊名称/描述；含全局内置） */
  async listApp(params: { keyword?: string; page: number; pageSize: number }): Promise<{ items: AppRecord[]; total: number }> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .where(
        userId ? '(a.user_id = :userId OR a.is_builtin = 1)' : '(a.user_id IS NULL OR a.is_builtin = 1)',
        userId ? { userId } : {},
      )
      // 内置应用（官方开箱即用能力）优先展示；内置之间 updated_at 同批插入无区分，
      // 用 id 稳定排序（消除随机顺序）；用户应用按最近更新倒序
      .orderBy('a.is_builtin', 'DESC')
      .addOrderBy('a.updated_at', 'DESC')
      .addOrderBy('a.id', 'ASC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
    if (params.keyword?.trim()) {
      qb.andWhere('(LOWER(a.name) LIKE LOWER(:kw) OR LOWER(a.description) LIKE LOWER(:kw))', { kw: `%${params.keyword.trim()}%` })
    }
    const [rows, total] = await qb.getManyAndCount()
    return { items: this.toDtoList(rows), total }
  }

  /** 同源（来源类型+来源 id）查询——createFromWorkflow 幂等判定用 */
  async findBySource(sourceKind: string, sourceId: string): Promise<AppRecord | null> {
    const e = await this.scoped.findOne({ sourceKind, sourceId } as FindOptionsWhere<AppEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateAppInput): Promise<AppRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      userId: null, // BaseRepository 注入 user_id（scoped.save 走内部逻辑）
      name: data.name,
      icon: data.icon ?? null,
      description: data.description ?? null,
      sourceKind: data.sourceKind,
      sourceId: data.sourceId,
      sourceVersion: data.sourceVersion ?? null,
      channelSession: data.channelSession ?? 1,
      channelShare: data.channelShare ?? 0,
      channelApi: data.channelApi ?? 1,
      shareToken: null,
      enabled: 1,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    } as Partial<AppEntity>)
    return this.toDto(entity as AppEntity)
  }

  async update(id: string, patch: UpdateAppInput): Promise<AppRecord | null> {
    // 内置应用：只允许启停（enabled），其余字段禁改（全局共享，改影响所有用户）
    const existing = await this.findById(id)
    if (existing?.isBuiltin) {
      if (patch.enabled !== undefined) {
        await this.scoped.update({ id } as FindOptionsWhere<AppEntity>, { enabled: patch.enabled, updatedAt: new Date() } as Partial<AppEntity>)
      }
      return this.findById(id)
    }
    const partial: Partial<AppEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.icon !== undefined) partial.icon = patch.icon
    if (patch.description !== undefined) partial.description = patch.description
    if (patch.channelSession !== undefined) partial.channelSession = patch.channelSession
    if (patch.channelShare !== undefined) partial.channelShare = patch.channelShare
    if (patch.channelApi !== undefined) partial.channelApi = patch.channelApi
    if (patch.shareToken !== undefined) partial.shareToken = patch.shareToken
    if (patch.enabled !== undefined) partial.enabled = patch.enabled
    if (patch.lastRunAt !== undefined) partial.lastRunAt = patch.lastRunAt
    if (patch.sourceVersion !== undefined) partial.sourceVersion = patch.sourceVersion

    await this.scoped.update({ id } as FindOptionsWhere<AppEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    // 内置应用禁删（复制为自有后可删副本）
    const existing = await this.findById(id)
    if (existing?.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<AppEntity>)
  }

  /**
   * 按分享令牌查应用（跨租户，免登录分享页入口）。
   * 仅命中已启用且分享渠道开启的应用。
   * ⚠️ 跨租户例外：调用方拿到 userId 后必须 runWithUserAsync(该 userId)。
   */
  async findByShareToken(token: string): Promise<AppRecord | null> {
    const e = await this.repo
      .createQueryBuilder('a')
      .where('a.share_token = :token', { token })
      .andWhere('a.enabled = 1')
      .andWhere('a.channel_share = 1')
      .getOne()
    return e ? this.toDto(e) : null
  }
}