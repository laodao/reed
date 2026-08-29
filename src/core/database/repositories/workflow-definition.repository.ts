/**
 * 工作流定义仓库
 * @module database/repositories/workflow-definition.repository
 *
 * 维护 workflow_definitions 表：草稿/发布双图、触发器、防失控设置、cron 调度状态。
 * JSON 列在 DTO 层做解析/序列化；损坏 JSON 容错降级（null/[]），不抛错。
 *
 * 多租户：继承 BaseRepository，user_id 自动注入（Web ALS / PC null）。
 *
 * ⚠️ 唯一跨租户例外：scanDueCronTriggers 用裸 repo 扫描全部用户的到期触发器
 *    （cron 调度器 tick 不在任何用户请求上下文内）。返回结果必须按 userId
 *    分组后逐用户 runWithUserAsync 再执行，否则 Web 端数据隔离失效。
 */

import type { DataSource, FindOptionsWhere, Repository } from 'typeorm'
import type {
  WorkflowExecutionSettings,
  WorkflowGraph,
  WorkflowTrigger,
} from '@shared/types/workflow.types'
import { WorkflowDefinitionEntity } from '../entities/workflow-definition.entity'
import { WorkflowDefinitionVersionEntity } from '../entities/workflow-definition-version.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'
import { createHash } from 'node:crypto'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('WorkflowDefinitionRepository')

/** 工作流定义 DTO（JSON 列已解析） */
export interface WorkflowDefinitionRecord {
  id: string
  /** 所有者（C3 分享运行需以所有者身份启动；列表页等场景忽略） */
  userId: string | null
  name: string
  description: string | null
  category: string | null
  draftGraph: WorkflowGraph | null
  publishedGraph: WorkflowGraph | null
  publishedVersion: number
  publishedAt: Date | null
  triggers: WorkflowTrigger[]
  settings: WorkflowExecutionSettings | null
  nextFireAt: Date | null
  lastFireAt: Date | null
  lastRunAt: Date | null
  shareToken: string | null
  /** 分享令牌 sha256 hash（新启用分享时存此列；历史明文在 shareToken 兼容） */
  shareTokenHash: string | null
  /** 内置工作流（全局共享，允许编辑；1=内置） */
  isBuiltin?: boolean
  /** 内置模板版本（0=用户已接管，迁移不再同步覆盖；>0=跟随内置模板） */
  templateVersion: number
  createdAt: Date | null
  updatedAt: Date | null
}

/** 创建入参 */
export interface CreateWorkflowDefinitionInput {
  name: string
  description?: string | null
  category?: string | null
  draftGraph?: WorkflowGraph | null
  triggers?: WorkflowTrigger[]
  settings?: WorkflowExecutionSettings | null
}

/** 更新入参（浅合并，未提供的字段不动） */
export interface UpdateWorkflowDefinitionInput {
  name?: string
  description?: string | null
  category?: string | null
  draftGraph?: WorkflowGraph | null
  /** 发布动作：发布图 + 版本号 + 触发器/设置快照（由 service 计算后传入） */
  publishedGraph?: WorkflowGraph | null
  publishedVersion?: number
  publishedAt?: Date | null
  triggers?: WorkflowTrigger[]
  settings?: WorkflowExecutionSettings | null
  nextFireAt?: Date | null
  lastFireAt?: Date | null
  lastRunAt?: Date | null
  /** C3 分享令牌（service 生成/清除；null = 停止分享）。⚠️ 新令牌存 shareTokenHash */
  shareToken?: string | null
  /** C3 分享令牌 sha256 hash（service 生成/清除；null = 停止分享） */
  shareTokenHash?: string | null
}

/** 到期 cron 触发器扫描结果（跨租户） */
export interface DueCronTriggerRow {
  id: string
  userId: string | null
  nextFireAt: Date
  lastFireAt: Date | null
  triggers: WorkflowTrigger[]
}

/** 定义列表排序字段（表头可切换；默认创建时间） */
export type WorkflowDefinitionSortBy = 'createdAt' | 'publishedAt' | 'lastRunAt'
export type WorkflowSortOrder = 'asc' | 'desc'

/** 排序字段 → 列名（白名单映射，防注入） */
export const WORKFLOW_DEF_SORT_COLUMN: Record<WorkflowDefinitionSortBy, string> = {
  createdAt: 'd.created_at',
  publishedAt: 'd.published_at',
  lastRunAt: 'd.last_run_at',
}

/** 工作流版本历史 DTO（JSON 列已解析） */
export interface WorkflowDefinitionVersionRecord {
  id: string
  definitionId: string
  /** 对应发布的版本号 */
  version: number
  name: string
  description: string | null
  category: string | null
  graph: WorkflowGraph
  triggers: WorkflowTrigger[]
  settings: WorkflowExecutionSettings | null
  note: string | null
  createdBy: string | null
  createdAt: Date | null
}

/** JSON 列安全解析（context 传实体定位信息，损坏可排查；损坏数据降级为 fallback 不抛错） */
function safeParse<T>(raw: string | null, fallback: T, context = ''): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    logger.warn(`[WorkflowDefinitionRepository] JSON 列解析失败（${context}），降级处理`)
    return fallback
  }
}

export class WorkflowDefinitionRepository extends BaseRepository<
  WorkflowDefinitionEntity,
  WorkflowDefinitionRecord
> {
  /** 版本历史表 repository（独立实体；版本按定义归属查询，不做行级 scope） */
  private readonly versionRepo: Repository<WorkflowDefinitionVersionEntity>

  constructor(dataSource: DataSource) {
    super(dataSource, WorkflowDefinitionEntity)
    this.versionRepo = dataSource.getRepository(WorkflowDefinitionVersionEntity)
  }

  protected toDto(e: WorkflowDefinitionEntity): WorkflowDefinitionRecord {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      description: e.description,
      category: e.category,
      draftGraph: safeParse<WorkflowGraph | null>(e.draftGraph, null, `id=${e.id}.draftGraph`),
      publishedGraph: safeParse<WorkflowGraph | null>(e.publishedGraph, null, `id=${e.id}.publishedGraph`),
      publishedVersion: e.publishedVersion,
      publishedAt: e.publishedAt,
      triggers: safeParse<WorkflowTrigger[]>(e.triggers, [], `id=${e.id}.triggers`),
      settings: safeParse<WorkflowExecutionSettings | null>(e.settings, null),
      nextFireAt: e.nextFireAt,
      lastFireAt: e.lastFireAt,
      lastRunAt: e.lastRunAt,
      shareToken: e.shareToken,
      shareTokenHash: e.shareTokenHash,
      isBuiltin: e.isBuiltin === 1,
      templateVersion: e.templateVersion ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async create(data: CreateWorkflowDefinitionInput): Promise<WorkflowDefinitionRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      name: data.name,
      description: data.description ?? null,
      category: data.category ?? null,
      draftGraph: data.draftGraph ? JSON.stringify(data.draftGraph) : null,
      publishedGraph: null,
      publishedVersion: 0,
      publishedAt: null,
      triggers: data.triggers ? JSON.stringify(data.triggers) : null,
      settings: data.settings ? JSON.stringify(data.settings) : null,
      nextFireAt: null,
      lastFireAt: null,
      lastRunAt: null,
      shareToken: null,
      createdAt: now,
      updatedAt: now,
    } as Partial<WorkflowDefinitionEntity>)
    return this.toDto(entity as WorkflowDefinitionEntity)
  }

  async getById(id: string): Promise<WorkflowDefinitionRecord | null> {
    // 自己的 + 内置（全局共享）
    const userId = getCurrentUserId()
    const qb = this.repo.createQueryBuilder('d').where('d.id = :id', { id })
    if (userId) {
      qb.andWhere('(d.user_id = :userId OR d.is_builtin = 1)', { userId })
    } else {
      qb.andWhere('(d.user_id IS NULL OR d.is_builtin = 1)')
    }
    const e = await qb.getOne()
    return e ? this.toDto(e) : null
  }

  /** 分页列表（默认创建时间降序；keyword 模糊匹配名称/描述；含全局内置）。
   *  sortBy 白名单映射列名（防注入），表头点击切换字段与方向。 */
  async list(params: {
    keyword?: string
    page: number
    pageSize: number
    sortBy?: WorkflowDefinitionSortBy
    sortOrder?: WorkflowSortOrder
  }): Promise<{ items: WorkflowDefinitionRecord[]; total: number }> {
    // 内置（is_builtin=1）全局共享 + 用户自有；userId 为 null 时兼容 IS NULL 旧数据
    const userId = getCurrentUserId()
    const qb = this.repo
      .createQueryBuilder('d')
      .where(
        userId ? '(d.user_id = :userId OR d.is_builtin = 1)' : '(d.user_id IS NULL OR d.is_builtin = 1)',
        userId ? { userId } : {},
      )
    const column = WORKFLOW_DEF_SORT_COLUMN[params.sortBy ?? 'createdAt']
    const order = params.sortOrder === 'asc' ? 'ASC' : 'DESC'
    qb.orderBy(column, order).addOrderBy('d.id', 'ASC')
    qb.skip((params.page - 1) * params.pageSize).take(params.pageSize)
    if (params.keyword) {
      // LOWER 双方言统一大小写不敏感（SQLite LIKE 本就不敏感，PG LIKE 敏感）
      qb.andWhere('(LOWER(d.name) LIKE LOWER(:kw) OR LOWER(d.description) LIKE LOWER(:kw))', {
        kw: `%${params.keyword}%`,
      })
    }
    const [rows, total] = await qb.getManyAndCount()
    return { items: this.toDtoList(rows), total }
  }

  async update(
    id: string,
    patch: UpdateWorkflowDefinitionInput
  ): Promise<WorkflowDefinitionRecord | null> {
    // 可见性检查（自己的或内置）；内置工作流允许修改（用户可编辑内置模板）
    const existing = await this.getById(id)
    if (!existing) return null
    const partial: Partial<WorkflowDefinitionEntity> = { updatedAt: new Date() }
    // 用户编辑图 / 发布 → 标记"已接管"内置模板（template_version=0），
    // create-builtin-apps 迁移不再把该定义重置回内置模板
    if (patch.draftGraph !== undefined || patch.publishedGraph !== undefined) {
      partial.templateVersion = 0
    }
    if (patch.name !== undefined) partial.name = patch.name
    if (patch.description !== undefined) partial.description = patch.description
    if (patch.category !== undefined) partial.category = patch.category
    if (patch.draftGraph !== undefined) {
      partial.draftGraph = patch.draftGraph ? JSON.stringify(patch.draftGraph) : null
    }
    if (patch.publishedGraph !== undefined) {
      partial.publishedGraph = patch.publishedGraph
        ? JSON.stringify(patch.publishedGraph)
        : null
    }
    if (patch.publishedVersion !== undefined) partial.publishedVersion = patch.publishedVersion
    if (patch.publishedAt !== undefined) partial.publishedAt = patch.publishedAt
    if (patch.triggers !== undefined) {
      partial.triggers = patch.triggers ? JSON.stringify(patch.triggers) : null
    }
    if (patch.settings !== undefined) {
      partial.settings = patch.settings ? JSON.stringify(patch.settings) : null
    }
    if (patch.nextFireAt !== undefined) partial.nextFireAt = patch.nextFireAt
    if (patch.lastFireAt !== undefined) partial.lastFireAt = patch.lastFireAt
    if (patch.lastRunAt !== undefined) partial.lastRunAt = patch.lastRunAt
    if (patch.shareToken !== undefined) partial.shareToken = patch.shareToken
    if (patch.shareTokenHash !== undefined) partial.shareTokenHash = patch.shareTokenHash

    // 内置行 user_id=NULL：scoped 更新在 Web 端附加 user_id 条件会命中 0 行 →
    // 用裸 repo.update（调用方已 getById 确认可见性，与 updateTriggersOnly 同纪律）
    await this.repo.update({ id } as FindOptionsWhere<WorkflowDefinitionEntity>, partial)
    return this.getById(id)
  }

  /**
   * 仅更新触发器与调度状态（应用详情页「配置定时」入口；内置定义同样允许——
   * 定时是全局调度配置，不触及其他字段，内置定义的图/名称等仍禁改）。
   * ⚠️ 内置行 user_id=NULL，scoped 更新附加 user_id 条件会命中 0 行 → 用裸 repo.update；
   *    调用方必须先经 getById 确认该定义对当前用户可见（自己的或内置）。
   */
  async updateTriggersOnly(
    id: string,
    patch: { triggers: WorkflowTrigger[]; nextFireAt?: Date | null; lastFireAt?: Date | null }
  ): Promise<WorkflowDefinitionRecord | null> {
    const existing = await this.getById(id)
    if (!existing) return null
    const partial: Partial<WorkflowDefinitionEntity> = {
      triggers: JSON.stringify(patch.triggers),
      updatedAt: new Date(),
    }
    if (patch.nextFireAt !== undefined) partial.nextFireAt = patch.nextFireAt
    if (patch.lastFireAt !== undefined) partial.lastFireAt = patch.lastFireAt
    await this.repo.update({ id } as FindOptionsWhere<WorkflowDefinitionEntity>, partial)
    return this.getById(id)
  }

  async delete(id: string): Promise<number> {
    // 内置工作流禁删（系统模板资产，允许编辑；复制为自有后可删副本）
    const existing = await this.getById(id)
    if (existing?.isBuiltin) return 0
    return this.scoped.delete({ id } as FindOptionsWhere<WorkflowDefinitionEntity>)
  }

  // ==================== 版本历史 ====================

  /** 创建版本快照（publish 成功后调用；version = 发布版本号） */
  async createVersion(
    data: {
      definitionId: string
      version: number
      name: string
      description: string | null
      category: string | null
      graph: WorkflowGraph
      triggers: WorkflowTrigger[]
      settings: WorkflowExecutionSettings | null
      note?: string
      createdBy: string | null
    }
  ): Promise<WorkflowDefinitionVersionRecord> {
    const entity = await this.versionRepo.save({
      id: this.generateVersionId(),
      definitionId: data.definitionId,
      version: data.version,
      name: data.name,
      description: data.description,
      category: data.category,
      graph: JSON.stringify(data.graph),
      triggers: data.triggers?.length ? JSON.stringify(data.triggers) : null,
      settings: data.settings ? JSON.stringify(data.settings) : null,
      note: data.note ?? null,
      createdBy: data.createdBy,
      createdAt: new Date(),
    } as Partial<WorkflowDefinitionVersionEntity>)
    return this.toVersionDto(entity as WorkflowDefinitionVersionEntity)
  }

  /** 版本列表（按版本号降序）；定义不可见（非本人/非内置）返回空 */
  async listVersions(definitionId: string): Promise<WorkflowDefinitionVersionRecord[]> {
    const def = await this.getById(definitionId)
    if (!def) return []
    const rows = await this.versionRepo.find({
      where: { definitionId },
      order: { version: 'DESC' },
    })
    return rows.map(e => this.toVersionDto(e))
  }

  /** 按版本记录 id 取快照（恢复用；调用方需确认定义可见性） */
  async getVersion(id: string): Promise<WorkflowDefinitionVersionRecord | null> {
    const e = await this.versionRepo.findOne({ where: { id } })
    return e ? this.toVersionDto(e) : null
  }

  private toVersionDto(e: WorkflowDefinitionVersionEntity): WorkflowDefinitionVersionRecord {
    return {
      id: e.id,
      definitionId: e.definitionId,
      version: e.version,
      name: e.name,
      description: e.description,
      category: e.category,
      graph: safeParse<WorkflowGraph>(e.graph, { version: 1, nodes: [], edges: [] }, `ver=${e.id}.graph`),
      triggers: safeParse<WorkflowTrigger[]>(e.triggers, [], `ver=${e.id}.triggers`),
      settings: safeParse<WorkflowExecutionSettings | null>(e.settings, null),
      note: e.note,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
    }
  }

  private generateVersionId(): string {
    return `wfver_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * 按分享令牌查定义（跨租户，C3 免登录页入口）。
   * 令牌本身是 256bit 随机串（不可枚举）；只返回已发布且已分享的行。
   *
   * ⚠️ 跨租户例外（与 scanDueCronTriggers 同纪律）：调用方拿到 userId 后必须
   * runWithUserAsync(该 userId) 再执行后续业务（以定义所有者身份运行）。
   */
  async findByShareToken(token: string): Promise<WorkflowDefinitionRecord | null> {
    // 评审 #74：只按 hash 查（sanitize-share-tokens 迁移已把存量明文回填为 hash 并清空明文列，
    // DB 中不再有明文令牌，明文兼容查找已无存在必要）
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const e = await this.repo
      .createQueryBuilder('d')
      .where('d.share_token_hash = :hash', { hash })
      .andWhere('d.published_version > 0')
      .getOne()
    return e ? this.toDto(e) : null
  }

  /**
   * 按 webhook 令牌查定义（跨租户，P0 片5：免签触发入口）。
   * 只命中已发布且 triggers 含该 token 的启用 webhook（JSON 过滤在 JS 层，避免方言分叉）。
   * ⚠️ 跨租户例外纪律同 findByShareToken：调用方必须 runWithUserAsync(所有者)。
   */
  async findByWebhookToken(token: string): Promise<WorkflowDefinitionRecord | null> {
    const rows = await this.repo
      .createQueryBuilder('d')
      .where('d.published_version > 0')
      .andWhere('d.triggers LIKE :tok', { tok: `%${token}%` })
      .getMany()
    for (const e of rows) {
      const triggers = safeParse<WorkflowTrigger[]>(e.triggers, [])
      if (triggers.some(t => t.type === 'webhook' && t.enabled && t.token === token)) {
        return this.toDto(e)
      }
    }
    return null
  }

  /**
   * 扫描到期的 cron 触发器（跨租户，供调度器 tick）。
   * 只命中已发布且 next_fire_at 到期的行；JSON 过滤在 JS 层做
   * （SQLite/PG 的 JSON 查询函数不同，避免方言分叉）。
   *
   * ⚠️ 返回行含所有用户——调用方必须按 userId 分组后 runWithUserAsync 执行。
   */
  async scanDueCronTriggers(now: Date): Promise<DueCronTriggerRow[]> {
    const rows = await this.repo
      .createQueryBuilder('d')
      .where('d.published_version > 0')
      .andWhere('d.next_fire_at IS NOT NULL')
      .andWhere('d.next_fire_at <= :now', { now })
      .getMany()
    return rows
      .map(e => ({
        id: e.id,
        userId: e.userId,
        nextFireAt: e.nextFireAt as Date,
        lastFireAt: e.lastFireAt,
        triggers: safeParse<WorkflowTrigger[]>(e.triggers, []),
      }))
      .filter(row => row.triggers.some(t => t.type === 'cron' && t.enabled))
  }

  /**
   * 扫描全部已发布且含启用事件触发器的定义（跨租户，供事件触发器索引构建）。
   * ⚠️ 返回行含所有用户——调用方必须按 userId 匹配事件上下文。
   */
  async scanEventTriggers(): Promise<
    Array<{ id: string; userId: string | null; triggers: WorkflowTrigger[] }>
  > {
    const rows = await this.repo
      .createQueryBuilder('d')
      .where('d.published_version > 0')
      .andWhere('d.triggers IS NOT NULL')
      .getMany()
    return rows
      .map(e => ({
        id: e.id,
        userId: e.userId,
        triggers: safeParse<WorkflowTrigger[]>(e.triggers, []),
      }))
      .filter(row => row.triggers.some(t => t.type === 'event' && t.enabled))
  }

  private generateId(): string {
    return `wfdef_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
