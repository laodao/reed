/**
 * 通知中心服务（后端全链路业务核心）
 * @module core/platform/services/notification.service
 * @description 顶栏铃铛（未读）+ 历史通知列表 + 点击跳转。
 *              历史数据源 = 平台事件表 platform_events（90 天保留）；已读状态独立落表
 *              user_notification_reads（用户要求后端持久化，不用 localStorage）。
 *
 *              关键纪律：
 *              - 所有查询走 PlatformEventRepository / UserNotificationReadRepository 的
 *                scoped 入口，多租户按 ALS userId 隔离——通知只返回当前用户事件；
 *              - 平台事件 → NoticeItem 的翻译（中文标题/文案/跳转 route）集中在本服务，
 *                handler 只做薄适配不写业务；
 *              - 路由目标由前端路由表反查（knowledge-base、workflow、app 等包路由，见
 *                src/renderer/src/packs/ 下各包 index.ts 与各 case 的 route 常量），
 *                绝不产生空 route。
 */

import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import { UserNotificationReadRepository } from '@core/database/repositories/user-notification-read.repository'
import type { PlatformEventEntity } from '@core/database/entities/platform-event.entities'
import type {
  NoticeItem,
  NoticeListQuery,
  NoticeListResult,
  NoticeReadResult,
} from '@shared/types'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('NotificationService')

/** 通知类事件类型集合（与平台事件类型映射表一致，见 shared/types/workflow.types.ts + 领域事件） */
export const NOTICE_EVENT_TYPES: readonly string[] = [
  // 工作流运行：待审核 / 终态 / 运行内自定义通知
  'workflow.run.review-requested',
  'workflow.run.run-status',
  'workflow.run.notify',
  // 领域事件（完成/失败）
  'kb:document-completed',
  'kb:document-failed',
  'image:generation-completed',
  'translation:completed',
  'translation:failed',
  'voice:tts-completed',
  'voice:stt-completed',
  // 领域共学空间（M4-A P1-5：研究产出/失败、复习到期——用户回到铃铛即可见）
  'dl:card-ready',
  'dl:research-failed',
  'dl:review-due',
  // 知识大脑提取目标（弹窗超时关闭后的可回看保障：待审提议/同题重复/无产出）
  'kb:brain:goal-proposed',
  'kb:brain:goal-duplicate',
  'kb:brain:goal-empty',
]

/** run-status 中真正作为通知的终态（running/pending/waiting_review/interrupted/skipped 不产生通知） */
const RUN_TERMINAL_STATUS: Record<string, { title: string; message: string }> = {
  succeeded: { title: '运行成功', message: '运行 {runId} 已完成' },
  failed: { title: '运行失败', message: '运行 {runId} 执行失败' },
  timed_out: { title: '运行超时', message: '运行 {runId} 超过最长运行时长' },
  cancelled: { title: '运行已取消', message: '运行 {runId} 已取消' },
}

/** dl 通知标题（研究产出/失败、复习到期） */
const DL_NOTICE_TITLES: Record<string, string> = {
  'dl:card-ready': '研究产出讲义（待你查看/人审）',
  'dl:research-failed': '研究任务失败',
  'dl:review-due': '有概念到复习期',
}

export class NotificationService {
  private readonly eventRepo: PlatformEventRepository
  private readonly readRepo: UserNotificationReadRepository

  constructor(db: ICoreDatabaseManager) {
    if (!db.dataSource) {
      throw new Error('[NotificationService] 数据源未初始化')
    }
    if (!db.notificationReads) {
      throw new Error('[NotificationService] 通知已读仓库未初始化')
    }
    this.eventRepo = new PlatformEventRepository(db.dataSource)
    this.readRepo = db.notificationReads
  }

  // ─── 列表 ───────────────────────────────────────────────────────────────

  /**
   * 当前用户通知列表（按 seq 倒序分页）。unreadFirst=true 时未读排前（同组内仍倒序）。
   * read 布尔由已读表决定；total/unread/hasMore 均基于"可展示通知"（过滤掉非通知性事件）。
   */
  async list(query: NoticeListQuery = {}): Promise<NoticeListResult> {
    const page = Math.max(1, Math.trunc(query.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize ?? 20)))
    const unreadFirst = query.unreadFirst ?? true

    const readSet = await this.readRepo.readSeqSet()
    const events = await this.eventRepo.listAllNotices([...NOTICE_EVENT_TYPES])

    // 翻译为可通知条目（过滤非通知性 run-status），并按已读集合标记 read
    const notices: NoticeItem[] = []
    for (const e of events) {
      const item = this.toNotice(e)
      if (item) {
        item.read = readSet.has(item.seq)
        notices.push(item)
      }
    }

    const total = notices.length
    const unread = notices.reduce((acc, n) => (n.read ? acc : acc + 1), 0)

    // unreadFirst：未读在前；否则保持 seq 倒序（events 已是倒序）
    const ordered = unreadFirst
      ? [...notices.filter((n) => !n.read), ...notices.filter((n) => n.read)]
      : notices

    const start = (page - 1) * pageSize
    const items = ordered.slice(start, start + pageSize)
    return { items, total, unread, hasMore: start + pageSize < total }
  }

  // ─── 已读标记 ───────────────────────────────────────────────────────────

  /** 标记一组 seq 已读（当前用户），返回本次新增已读数 + 未读余量 */
  async markRead(seqs: number[]): Promise<NoticeReadResult> {
    const marked = await this.readRepo.markRead(seqs)
    const unread = await this.unreadCount()
    return { marked, unread }
  }

  /** 全部标记已读（当前用户），返回新增已读数 + 未读余量（应为 0） */
  async markAllRead(): Promise<NoticeReadResult> {
    // 取当前用户全部通知事件 → 只对"可展示通知"（过滤非通知性 run-status）标记已读
    const events = await this.eventRepo.listAllNotices([...NOTICE_EVENT_TYPES])
    const seqs: number[] = []
    for (const e of events) {
      if (this.toNotice(e)) seqs.push(Number(e.seq))
    }
    const marked = await this.readRepo.markRead(seqs)
    const unread = await this.unreadCount()
    return { marked, unread }
  }

  // ─── 未读数 ─────────────────────────────────────────────────────────────

  /**
   * 运行相关通知批量已读（"自动消失"）：当某运行的审核被处理（approve/reject/取消）后调用，
   * 把该运行名下所有通知事件标记已读 → 铃铛未读回落、待审核条目不再置顶显示。
   * @returns 已标记条数
   */
  async resolveRunNotices(runId: string): Promise<number> {
    if (!runId) return 0
    const events = await this.eventRepo.listAllNotices([...NOTICE_EVENT_TYPES])
    const seqs: number[] = []
    for (const e of events) {
      const payload = this.parsePayload(e)
      const evRun = str(payload.runId ?? e.aggregateId)
      if (evRun === runId) seqs.push(Number(e.seq))
    }
    if (seqs.length === 0) return 0
    await this.readRepo.markRead(seqs)
    return seqs.length
  }

  /** 当前用户未读通知数（顶栏铃铛徽标） */
  async unreadCount(): Promise<number> {
    const readSet = await this.readRepo.readSeqSet()
    const events = await this.eventRepo.listAllNotices([...NOTICE_EVENT_TYPES])
    let unread = 0
    for (const e of events) {
      const item = this.toNotice(e)
      if (item && !readSet.has(item.seq)) unread++
    }
    return unread
  }

  // ─── 平台事件 → NoticeItem 翻译 ──────────────────────────────────────────

  /** 事件实体 → 通知条目；不可作为通知的事件返回 null（如 run-status 非终态） */
  private toNotice(e: PlatformEventEntity): NoticeItem | null {
    const payload = this.parsePayload(e)
    const seq = Number(e.seq)
    const occurredAt = toMs(e.occurredAt)
    const type = e.type

    switch (type) {
      case 'workflow.run.review-requested': {
        const runId = str(payload.runId ?? e.aggregateId)
        const nodeName = str(payload.nodeName) || '未知节点'
        return {
          seq,
          type,
          category: 'workflow_review',
          title: '待审核',
          message: `运行 ${runId} 在「${nodeName}」等待审核`,
          runId,
          route: `/workflow/review/${runId}`,
          occurredAt,
          read: false,
        }
      }

      case 'workflow.run.run-status': {
        const status = str(payload.status)
        const runStatus = RUN_TERMINAL_STATUS[status]
        if (!runStatus) return null // 非终态不产生通知
        const runId = str(payload.runId ?? e.aggregateId)
        const errorSuffix = payload.error ? `：${payload.error}` : ''
        return {
          seq,
          type,
          category: 'workflow_run',
          title: runStatus.title,
          message: substitute(runStatus.message, runId) + errorSuffix,
          runId,
          route: `/workflow/run/${runId}`,
          occurredAt,
          read: false,
        }
      }

      case 'workflow.run.notify': {
        const runId = str(payload.runId ?? e.aggregateId)
        return {
          seq,
          type,
          category: 'workflow_notify',
          title: str(payload.title) || '运行通知',
          message: str(payload.message) || '运行状态更新',
          runId,
          route: `/workflow/run/${runId}`,
          occurredAt,
          read: false,
        }
      }

      case 'kb:document-completed':
        return this.domainNotice(e, payload, seq, occurredAt, '知识库文档入库完成', '/knowledge-base')
      case 'kb:document-failed':
        return this.domainNotice(e, payload, seq, occurredAt, '知识库文档入库失败', '/knowledge-base')
      case 'image:generation-completed':
        return this.domainNotice(e, payload, seq, occurredAt, '图像生成完成', '/image')
      case 'translation:completed':
        return this.domainNotice(e, payload, seq, occurredAt, '翻译完成', '/translate')
      case 'translation:failed':
        return this.domainNotice(e, payload, seq, occurredAt, '翻译失败', '/translate')
      case 'voice:tts-completed':
        return this.domainNotice(e, payload, seq, occurredAt, '语音合成完成', '/voice/tts')
      case 'voice:stt-completed':
        return this.domainNotice(e, payload, seq, occurredAt, '语音识别完成', '/voice/stt')

      case 'dl:card-ready':
      case 'dl:research-failed':
      case 'dl:review-due': {
        const title = DL_NOTICE_TITLES[type] ?? '领域学习'
        const spaceId = str(payload.spaceId ?? e.aggregateId)
        const name = str(payload.conceptName) || str(payload.spaceName) || ''
        return {
          seq,
          type,
          category: 'domain',
          title,
          message: `${title}${name ? `（${name}）` : ''}`,
          route: `/domain-learning/${spaceId}`,
          occurredAt,
          read: false,
        }
      }

      case 'kb:brain:goal-proposed':
        return this.kbBrainNotice(payload, seq, occurredAt, {
          title: '知识提炼完成（待审提议）',
          type: 'kb:brain:goal-proposed',
        })
      case 'kb:brain:goal-duplicate':
        return this.kbBrainNotice(payload, seq, occurredAt, {
          title: '知识提炼：已有同题经验卡',
          type: 'kb:brain:goal-duplicate',
        })
      case 'kb:brain:goal-empty':
        return this.kbBrainNotice(payload, seq, occurredAt, {
          title: '知识提炼完成但没有产出',
          type: 'kb:brain:goal-empty',
        })

      default:
        return null
    }
  }

  /**
   * 知识大脑提取目标事件 → 通知条目。
   * 弹窗超时自动关闭后，用户仍可在通知中心回看、点击直达知识库大脑面板，
   * 避免出现"关了弹窗就找不到产物"的情况。
   */
  private kbBrainNotice(
    payload: Record<string, unknown>,
    seq: number,
    occurredAt: number,
    meta: { title: string; type: string }
  ): NoticeItem {
    const goalName = str(payload.goalName) || '提取目标'
    const fragments = num(payload.fragments)
    const cards = num(payload.cards)

    const detail =
      meta.type === 'kb:brain:goal-proposed'
        ? `「${goalName}」生成 ${cards ?? 0} 张经验卡（素材 ${fragments ?? 0} 条），已放入「待审提议」——点击查看并批准入库`
        : meta.type === 'kb:brain:goal-duplicate'
          ? `「${goalName}」已有同题经验卡，未重复生成——点击查看已有卡`
          : `「${goalName}」收集素材 ${fragments ?? 0} 条，未达到成卡条件——点击进入知识大脑处理`

    return {
      seq,
      type: meta.type,
      category: 'domain',
      title: meta.title,
      message: detail,
      // 知识库页当前只注册 /knowledge-base 且不消费路由参数，故不拼接 kbId query
      // （避免看似定位实际无效的假功能）；kbId 已存在事件载荷中，后续接入库级定位时再启用
      route: '/knowledge-base',
      occurredAt,
      read: false,
    }
  }

  /**
   * 领域完成/失败事件 → 通知条目（category='domain'）。
   * message 尽可能带上业务标识（documentId/taskId/translationId/recordId），无则用通用文案。
   * route 取对应模块列表页（前端路由反查结果：/knowledge-base /image /translate /voice/tts /voice/stt）。
   */
  private domainNotice(
    e: PlatformEventEntity,
    payload: Record<string, unknown>,
    seq: number,
    occurredAt: number,
    title: string,
    route: string
  ): NoticeItem {
    const idField =
      str(payload.documentId) ||
      str(payload.taskId) ||
      str(payload.translationId) ||
      str(payload.recordId) ||
      str(payload.id)
    const suffix = idField ? `（${idField}）` : ''
    return {
      seq,
      type: e.type,
      category: 'domain',
      title,
      message: `${title}${suffix}`,
      route,
      occurredAt,
      read: false,
    }
  }

  /** payload_json 安全解析，失败降级空对象 */
  private parsePayload(e: PlatformEventEntity): Record<string, unknown> {
    if (!e.payloadJson) return {}
    try {
      const parsed = JSON.parse(e.payloadJson)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      logger.warn(`[NotificationService] payload 解析失败（seq=${e.seq}），按空载荷处理`)
      return {}
    }
  }
}

// ─── 单例（IPC 处理器取用；数据源/仓库未就绪返回 null，处理器据此报可读错误） ──────────────

let singleton: NotificationService | null = null

export function getNotificationService(): NotificationService | null {
  if (singleton) return singleton
  const db = getCoreDatabaseManager()
  if (!db.dataSource || !db.notificationReads) return null
  singleton = new NotificationService(db)
  return singleton
}

/** 关停单例（应用退出/测试用） */
export function resetNotificationService(): void {
  singleton = null
}

// ─── 纯函数工具（无副作用，便于单测） ─────────────────────────────────────────

function toMs(d: Date | string | number | null | undefined): number {
  if (d == null) return 0
  if (d instanceof Date) return d.getTime()
  return new Date(d).getTime()
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** 数值安全转换：非有限数返回 null（用于可选计数，避免 0 与"未提供"混淆） */
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 把模板串中的 {runId} 替换为实际值 */
function substitute(template: string, runId: string): string {
  return template.replace('{runId}', runId)
}
