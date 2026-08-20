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

  /** 分页列表（聚合 sessionCount；runCount 经 source_id 由前端二次查询或 V2 完善） */
  async listApps(params: { keyword?: string; page: number; pageSize: number }): Promise<{
    items: Array<AppRecord & { sessionCount: number }>
    total: number
  }> {
    const { items, total } = await this.apps.listApp(params)
    const withCount = await Promise.all(items.map(async app => ({
      ...app,
      sessionCount: await this.sessions.countByApp(app.id),
    })))
    return { items: withCount, total }
  }

  async getApp(id: string): Promise<AppRecord | null> {
    return this.apps.findById(id)
  }

  /** 编辑器"已发布为应用？"检测 / 同定义查询 */
  async getAppByDefinitionId(definitionId: string): Promise<AppRecord | null> {
    return this.apps.findBySource(APPLICATION_SOURCE_KINDS.workflow, definitionId)
  }

  /**
   * 从已发布工作流创建应用。
   * - 定义不存在 / 未发布 → 抛错
   * - 同定义已存在 → 幂等返回既有（一个工作流只允许一个应用）
   */
  async createFromWorkflow(
    definitionId: string,
    opts?: { name?: string; icon?: string }
  ): Promise<AppRecord> {
    const def = await this.definitions.getById(definitionId)
    if (!def) throw new Error('工作流不存在')
    if (def.publishedVersion <= 0) throw new Error('只有已发布的工作流才能创建应用')

    const existing = await this.apps.findBySource(APPLICATION_SOURCE_KINDS.workflow, definitionId)
    if (existing) return existing

    const app = await this.apps.create({
      name: opts?.name?.trim() || def.name,
      icon: opts?.icon ?? null,
      sourceKind: APPLICATION_SOURCE_KINDS.workflow,
      sourceId: definitionId,
      sourceVersion: def.publishedVersion,
    })
    logger.info(`[App] 应用创建：${app.name}（source=${definitionId} v${def.publishedVersion}）`)
    return app
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
      await this.messages.deleteByDialogId(s.id)
    }
    await this.sessions.deleteByApp(id)
    await this.apps.delete(id)
    logger.info(`[App] 应用删除：${id}（级联 ${sessions.length} 个会话）`)
  }
}