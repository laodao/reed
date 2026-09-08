/**
 * 通知中心类型定义
 * @module types/notification.types
 * @description 通知中心（顶栏铃铛 + 历史列表 + 点击跳转）共享契约。
 *              历史数据源 = 平台事件表 platform_events（90 天保留，review 全量）；
 *              已读状态独立落表 user_notification_reads（用户要求后端持久化）。
 */

/**
 * 通知分类（决定图标与跳转目标）
 * - workflow_review  待审核 → 运行详情页
 * - workflow_run     运行终态（完成/失败/超时/取消）→ 运行详情页
 * - workflow_notify  运行内自定义通知 → 运行详情页
 * - domain           业务域完成事件（图片/翻译/语音/知识库…）→ 各功能页
 */
export type NoticeCategory = 'workflow_review' | 'workflow_run' | 'workflow_notify' | 'domain'

/** 通知条目（服务端翻译平台事件后返回；已读由 notification_reads 表决定） */
export interface NoticeItem {
  /** 平台事件 seq（幂等标识；已读标记按此落表） */
  seq: number
  /** 平台事件类型（workflow.run.* / kb:... / image:... 等原始名） */
  type: string
  category: NoticeCategory
  title: string
  message: string
  /** 所属运行（workflow 类通知有值；点击直达运行详情） */
  runId?: string
  /** 直接跳转路由（服务端算好，前端零逻辑） */
  route: string
  occurredAt: number
  read: boolean
}

/** 通知列表查询 */
export interface NoticeListQuery {
  page?: number
  pageSize?: number
  /** 未读优先（默认 true：未读排前、倒序时间） */
  unreadFirst?: boolean
}

/** 通知列表结果 */
export interface NoticeListResult {
  items: NoticeItem[]
  total: number
  unread: number
  hasMore: boolean
}

/** 已读标记结果 */
export interface NoticeReadResult {
  marked: number
  unread: number
}
