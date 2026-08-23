/**
 * 应用定义服务（片1）
 * @module core/modules/app/app-definition.service
 * @description 应用 = 发布单元（来源：已发布工作流）。提供创建（幂等）/渠道开关/
 *              分享令牌/启停/级联删除/列表聚合。会话渠道的运行时在 app-session.service（片2）。
 *
 * 铁律：唯一 service、字段同名直传（零映射）、分享令牌跨租户例外纪律
 * （getByShareToken 调用方须 runWithUserAsync(所有者 userId)）。
 */

import crypto from 'node:crypto'
import type { AppRecord } from '@shared/types/app.types'
import { APPLICATION_SOURCE_KINDS } from '@shared/types/app.types'
import type { AppRepository, UpdateAppInput } from '../../database/repositories/app.repository'
import type { AppSessionRepository } from '../../database/repositories/app-session.repository'
import type { WorkflowDefinitionRepository } from '../../database/repositories/workflow-definition.repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('AppDefinitionService')

export class AppDefinitionService {
  constructor(
    private readonly apps: AppRepository,
    private readonly sessions: AppSessionRepository,
    private readonly definitions: WorkflowDefinitionRepository,
    private readonly messages: { deleteByDialogId(dialogId: string): Promise<number> }
  ) {}

  /** 分页列表（聚合 sessionCount：一条 GROUP BY 替代逐条计数；keyword/category/pinned 筛选） */
  async listApps(params: { keyword?: string; category?: string; pinned?: boolean; page: number; pageSize: number }): Promise<{
    items: Array<AppRecord & { sessionCount: number }>
    total: number
  }> {
    const { items, total } = await this.apps.listApp(params)
    // 聚合失败整体降级为 0（单条 SQL，失败概率低；降级不整查崩溃并留痕）
    const counts = await this.sessions.countByAppIds(items.map(a => a.id)).catch(e => {
      logger.warn('[App] 会话计数聚合失败（按 0 展示）', e)
      return new Map<string, number>()
    })
    const withCount = items.map(app => ({ ...app, sessionCount: counts.get(app.id) ?? 0 }))
    return { items: withCount, total }
  }

  /** 分类计数（AppList 分类筛选 tabs；含全局内置） */
  async listAppCategories(): Promise<Array<{ category: string; count: number }>> {
    return this.apps.countByCategory()
  }

  /** 固定/取消固定到首页（内置应用同样允许——首页入口是用户个人行为） */
  async setPinned(id: string, pinned: boolean): Promise<AppRecord | null> {
    return this.apps.update(id, { pinned: pinned ? 1 : 0 })
  }

  /** 更新应用元信息（名称/图标/描述/分类/标签；内置应用除 pinned 外禁改由 repository 保证） */
  async updateMeta(
    id: string,
    patch: { name?: string; icon?: string | null; description?: string | null; category?: string | null; tags?: string[] }
  ): Promise<AppRecord | null> {
    const update: UpdateAppInput = {}
    if (patch.name !== undefined) update.name = patch.name
    if (patch.icon !== undefined) update.icon = patch.icon
    if (patch.description !== undefined) update.description = patch.description
    if (patch.category !== undefined) update.category = patch.category
    if (patch.tags !== undefined) update.tags = patch.tags
    return this.apps.update(id, update)
  }

  async getApp(id: string): Promise<AppRecord | null> {
    return this.apps.findById(id)
  }

  /** 编辑器"已发布为应用？"检测 / 同定义查询 */
  async getAppByDefinitionId(definitionId: string): Promise<AppRecord | null> {
    return this.apps.findBySource(APPLICATION_SOURCE_KINDS.workflow, definitionId)
  }

  /**
   * 从已发布工作流创建应用（工作流编辑器"发布为应用"入口）。
   * - 定义不存在 / 未发布 → 抛错
   * - 同定义已存在 → 幂等返回既有（一个工作流只允许一个应用），
   *   工作流发布新版本后跟随更新 sourceVersion；再次发布应用时按配置更新渠道
   * - 发布配置：名称/图标/渠道开关（会话/分享/API）——发布即配置，无需事后进详情改
   */
  async createFromWorkflow(
    definitionId: string,
    opts?: {
      name?: string
      icon?: string
      category?: string
      tags?: string[]
      channelSession?: boolean
      channelShare?: boolean
      channelApi?: boolean
    }
  ): Promise<AppRecord> {
    const def = await this.definitions.getById(definitionId)
    if (!def) throw new Error('工作流不存在')
    if (def.publishedVersion <= 0) throw new Error('只有已发布的工作流才能创建应用')

    const channelPatch = {
      ...(opts?.channelSession !== undefined ? { channelSession: opts.channelSession } : {}),
      ...(opts?.channelShare !== undefined ? { channelShare: opts.channelShare } : {}),
      ...(opts?.channelApi !== undefined ? { channelApi: opts.channelApi } : {}),
    }
    const hasChannelConfig = Object.keys(channelPatch).length > 0

    const existing = await this.apps.findBySource(APPLICATION_SOURCE_KINDS.workflow, definitionId)
    if (existing) {
      // 版本演进：工作流发布了新版本 → 应用 sourceVersion 跟随更新（应用本体不变）
      let current = existing
      if (current.sourceVersion !== def.publishedVersion) {
        logger.info(`[App] 应用跟随工作流版本：${current.name} v${current.sourceVersion ?? 0} → v${def.publishedVersion}`)
        const updated = await this.apps.update(current.id, { sourceVersion: def.publishedVersion })
        if (updated) current = updated
      }
      // 再次发布应用：名称/图标/分类/标签/渠道按本次配置更新（发布配置即生效）
      const patch: Record<string, unknown> = {}
      if (opts?.name?.trim()) patch.name = opts.name.trim()
      if (opts?.icon !== undefined) patch.icon = opts.icon
      if (opts?.category !== undefined) patch.category = opts.category?.trim() || null
      if (opts?.tags !== undefined) patch.tags = opts.tags
      if (hasChannelConfig) {
        for (const [k, v] of Object.entries(channelPatch)) patch[k] = v ? 1 : 0
      }
      if (Object.keys(patch).length > 0) {
        logger.info(`[App] 应用发布配置更新：${current.id}`, patch)
        const updated = await this.apps.update(current.id, patch as UpdateAppInput)
        if (updated) return updated
      }
      return current
    }

    try {
      const app = await this.apps.create({
        name: opts?.name?.trim() || def.name,
        icon: opts?.icon ?? null,
        description: def.description ?? null,
        // 分类缺省继承工作流分类（发布时可覆盖）；标签发布时可选
        category: opts?.category?.trim() || def.category || null,
        tags: opts?.tags ?? [],
        sourceKind: APPLICATION_SOURCE_KINDS.workflow,
        sourceId: definitionId,
        sourceVersion: def.publishedVersion,
        channelSession: hasChannelConfig ? (channelPatch.channelSession ? 1 : 0) : undefined,
        channelShare: hasChannelConfig ? (channelPatch.channelShare ? 1 : 0) : undefined,
        channelApi: hasChannelConfig ? (channelPatch.channelApi ? 1 : 0) : undefined,
      })
      logger.info(`[App] 应用创建：${app.name}（source=${definitionId} v${def.publishedVersion}）`)
      return app
    } catch (e) {
      // 唯一索引兜底：并发下另有请求已建同定义应用 → 回退返回既有（幂等语义）；
      // 非冲突异常必须上抛——带日志避免静默吞
      const winner = await this.apps.findBySource(APPLICATION_SOURCE_KINDS.workflow, definitionId)
      if (winner) {
        logger.warn(`[App] 应用创建发现并发重复（source=${definitionId}），回退既有`)
        return winner
      }
      logger.error(`[App] 应用创建失败（source=${definitionId}）`, e)
      throw e
    }
  }

  /** 渠道开关（浅合并——只改传入字段） */
  async updateChannels(
    id: string,
    patch: { channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }
  ): Promise<AppRecord | null> {
    const update: UpdateAppInput = {}
    if (patch.channelSession !== undefined) update.channelSession = patch.channelSession ? 1 : 0
    if (patch.channelShare !== undefined) update.channelShare = patch.channelShare ? 1 : 0
    if (patch.channelApi !== undefined) update.channelApi = patch.channelApi ? 1 : 0
    return this.apps.update(id, update)
  }

  /** 启用分享：生成 256bit 令牌（幂等——已分享则原样返回） */
  async enableShare(id: string): Promise<AppRecord | null> {
    const app = await this.apps.findById(id)
    if (!app) return null
    if (app.shareToken) return app
    return this.apps.update(id, { shareToken: crypto.randomBytes(32).toString('hex') })
  }

  /** 停用分享：清令牌（历史链接即刻失效） */
  async disableShare(id: string): Promise<AppRecord | null> {
    return this.apps.update(id, { shareToken: null })
  }

  /** 应用启停 */
  async setEnabled(id: string, enabled: boolean): Promise<AppRecord | null> {
    return this.apps.update(id, { enabled: enabled ? 1 : 0 })
  }

  /**
   * 按分享令牌查应用（跨租户，免登录分享页/API 用）。
   * 仅命中已启用且分享渠道开启；调用方必须 runWithUserAsync(所有者 userId) 再执行业务。
   */
  async getByShareToken(token: string): Promise<AppRecord | null> {
    if (!token || !/^[0-9a-f]{16,128}$/i.test(token)) return null // 形态守卫
    return this.apps.findByShareToken(token)
  }

  /** 删除应用：级联删会话 + 各会话消息 */
  async deleteApp(id: string): Promise<void> {
    const sessions = await this.sessions.listByApp(id)
    for (const s of sessions) {
      try {
        await this.messages.deleteByDialogId(s.id)
      } catch (e) {
        // 消息清理失败不阻断会话/应用删除（数据孤儿可接受度低 → 记 error 留痕）
        logger.error(`[App] 删除会话 ${s.id} 的消息失败（级联继续）`, e)
      }
    }
    await this.sessions.deleteByApp(id)
    await this.apps.delete(id)
    logger.info(`[App] 应用删除：${id}（级联 ${sessions.length} 个会话）`)
  }
}