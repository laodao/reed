/**
 * 应用仓库（片1）
 * @module core/database/repositories/app.repository
 * @description apps 表 CRUD + 分享令牌跨租户查询（唯一跨租户例外，
 *              与 workflow-definition.findByShareToken 同纪律：调用方 runWithUserAsync 包裹）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import type { AppRecord } from '@shared/types/app.types'
import { AppEntity } from '../entities/app.entity'
import { AppUserPrefsEntity } from '../entities/app-user-prefs.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import { createHash } from 'node:crypto'

export interface CreateAppInput {
  name: string
  icon?: string | null
  description?: string | null
  category?: string | null
  tags?: string[]
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
  category?: string | null
  tags?: string[]
  pinned?: number
  channelSession?: number
  channelShare?: number
  channelApi?: number
  shareToken?: string | null
  /** 分享令牌 sha256 hash（安全整改：新令牌不明文落库） */
  shareTokenHash?: string | null
  enabled?: number
  lastRunAt?: Date | null
  /** 来源工作流的发布版本快照（createFromWorkflow 版本演进时更新） */
  sourceVersion?: number | null
}

/** 应用列表查询参数 */
export interface ListAppParams {
  keyword?: string
  /** 分类筛选（空=全部） */
  category?: string
  /** pinned 筛选（undefined=全部；true=已固定；false=未固定） */
  pinned?: boolean
  page: number
  pageSize: number
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
      category: e.category,
      tags: parseTags(e.tags),
      pinned: e.pinned ?? 0,
      sourceKind: e.sourceKind,
      sourceId: e.sourceId,
      sourceVersion: e.sourceVersion,
      channelSession: e.channelSession,
      channelShare: e.channelShare,
      channelApi: e.channelApi,
      shareToken: e.shareToken,
      shareTokenHash: e.shareTokenHash,
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
    if (!e) return null
    const dto = this.toDto(e)
    // per-user pinned 归并（用户个人"固定到首页"）
    if (userId) {
      const pref = await this.dataSource
        .getRepository(AppUserPrefsEntity)
        .findOne({ where: { userId, appId: id } })
      if (pref?.pinned != null) dto.pinned = pref.pinned
    }
    return dto
  }

  /** 分页列表（创建时间降序——最新发布的在前；含全局内置；keyword/category/pinned 筛选） */
  async listApp(params: ListAppParams): Promise<{ items: AppRecord[]; total: number }> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .where(
        userId ? '(a.user_id = :userId OR a.is_builtin = 1)' : '(a.user_id IS NULL OR a.is_builtin = 1)',
        userId ? { userId } : {},
      )
      // 统一时间降序：创建时间倒序，内置应用时间戳按发布顺序错开（迁移保证），
      // id 仅作同时间稳定次级（消除随机顺序）
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'ASC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
    const kw = params.keyword?.trim()
    if (kw) {
      // 名称/描述/分类/标签 模糊匹配（标签为 JSON 数组文本，含该词即命中）
      qb.andWhere('(LOWER(a.name) LIKE LOWER(:kw) OR LOWER(a.description) LIKE LOWER(:kw) OR LOWER(a.category) LIKE LOWER(:kw) OR LOWER(a.tags) LIKE LOWER(:kw))', { kw: `%${kw}%` })
    }
    if (params.category) {
      qb.andWhere('a.category = :cat', { cat: params.category })
    }
    if (params.pinned !== undefined) {
      // per-user 归并：COALESCE(用户偏好.pinned, 全局行.pinned) = 1（相关子查询，避免 JOIN 影响分页）
      qb.andWhere(
        userId
          ? `COALESCE((SELECT p.pinned FROM app_user_prefs p WHERE p.app_id = a.id AND p.user_id = :prefUid), a.pinned) = :pin`
          : 'a.pinned = :pin',
        userId ? { prefUid: userId, pin: params.pinned ? 1 : 0 } : { pin: params.pinned ? 1 : 0 },
      )
    }
    const [rows, total] = await qb.getManyAndCount()
    const items = await this.mergeUserPrefs(rows, userId)
    return { items, total }
  }

  /** 分类计数（AppList 分类筛选 tabs / 首页分组；含全局内置） */
  async countByCategory(): Promise<Array<{ category: string; count: number }>> {
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where("a.category IS NOT NULL AND a.category <> ''")
    if (userId) {
      qb.andWhere('(a.user_id = :userId OR a.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(a.user_id IS NULL OR a.is_builtin = 1)')
    }
    qb.groupBy('a.category')
    const rows = await qb.getRawMany()
    return rows.map(r => ({ category: r.category as string, count: Number(r.count ?? 0) }))
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
      category: data.category ?? null,
      tags: data.tags?.length ? JSON.stringify(data.tags) : null,
      pinned: 0,
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
    // 内置应用（user_id=NULL 全局共享行）：只允许启停（enabled）与固定（pinned），
    // 其余字段禁改（全局共享，改影响所有用户）。⚠️ 必须用裸 repo.update——
    // scoped.update 会附加 user_id 条件，对 user_id=NULL 的内置行永远影响 0 行
    const existing = await this.findById(id)
    if (existing?.isBuiltin) {
      if (patch.enabled !== undefined || patch.pinned !== undefined) {
        const partial: Partial<AppEntity> = { updatedAt: new Date() }
        if (patch.enabled !== undefined) partial.enabled = patch.enabled
        if (patch.pinned !== undefined) partial.pinned = patch.pinned
        await this.repo.update({ id } as FindOptionsWhere<AppEntity>, partial)
      }
      return this.findById(id)
    }
    const partial: Partial<AppEntity> = { updatedAt: new Date() }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.icon !== undefined) partial.icon = patch.icon
    if (patch.description !== undefined) partial.description = patch.description
    if (patch.category !== undefined) partial.category = patch.category
    if (patch.tags !== undefined) partial.tags = patch.tags.length ? JSON.stringify(patch.tags) : null
    if (patch.pinned !== undefined) partial.pinned = patch.pinned
    if (patch.channelSession !== undefined) partial.channelSession = patch.channelSession
    if (patch.channelShare !== undefined) partial.channelShare = patch.channelShare
    if (patch.channelApi !== undefined) partial.channelApi = patch.channelApi
    if (patch.shareToken !== undefined) partial.shareToken = patch.shareToken
    if (patch.shareTokenHash !== undefined) partial.shareTokenHash = patch.shareTokenHash
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
   * 固定/取消固定到首页（per-user 偏好）：写 app_user_prefs，**不改全局共享行**——
   * 内置应用 user_id=NULL 是全局行，直接写 pinned 会跨用户污染（Web 多租户）。
   */
  async setUserPinned(userId: string, appId: string, pinned: boolean): Promise<void> {
    const repo = this.dataSource.getRepository(AppUserPrefsEntity)
    const now = new Date()
    const existing = await repo.findOne({ where: { userId, appId } })
    if (existing) {
      await repo.update({ userId, appId }, { pinned: pinned ? 1 : 0, updatedAt: now })
    } else {
      await repo.save(repo.create({
        userId,
        appId,
        pinned: pinned ? 1 : 0,
        enabled: 1,
        createdAt: now,
        updatedAt: now,
      }))
    }
  }

  /** 把当前用户的应用偏好合并进列表（有效 pinned = COALESCE(用户偏好, 全局行)） */
  private async mergeUserPrefs(rows: AppEntity[], userId: string | null): Promise<AppRecord[]> {
    const items = rows.map(e => this.toDto(e))
    if (!userId || items.length === 0) return items
    const prefs = await this.dataSource
      .getRepository(AppUserPrefsEntity)
      .createQueryBuilder('p')
      .where('p.user_id = :userId AND p.app_id IN (:...ids)', { userId, ids: items.map(i => i.id) })
      .getMany()
    const prefMap = new Map(prefs.map(p => [p.appId, p]))
    for (const item of items) {
      const pref = prefMap.get(item.id)
      if (pref && pref.pinned != null) item.pinned = pref.pinned
    }
    return items
  }

  /**
   * 按分享令牌查应用（跨租户，免登录分享页入口）。
   * 仅命中已启用且分享渠道开启的应用。
   * ⚠️ 跨租户例外：调用方拿到 userId 后必须 runWithUserAsync(该 userId)。
   */
  async findByShareToken(token: string): Promise<AppRecord | null> {
    // hash 优先（新令牌），明文兼容（历史存量令牌）
    const hash = createHash('sha256').update(token).digest('hex')
    const e = await this.repo
      .createQueryBuilder('a')
      .where('a.share_token_hash = :hash OR a.share_token = :token', { hash, token })
      .andWhere('a.enabled = 1')
      .andWhere('a.channel_share = 1')
      .getOne()
    return e ? this.toDto(e) : null
  }
}

/** 解析标签 JSON 数组列（缺省/非法 → []） */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}