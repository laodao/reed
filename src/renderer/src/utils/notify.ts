/**
 * 通知弹窗助手
 * @module utils/notify
 * @description 收敛系统内所有右上角通知弹窗（ElNotification）的展示策略：
 *
 *  - **自动关闭**：默认 8 秒后自动消失。用户不点击也会收走，不再永久占屏。
 *    历史上多处写 `duration: 0`（永不关闭），用户漏点即长期滞留，本助手统一兜底。
 *  - **顶栏避让**：固定 offset=52，避开右上角 TabBar 的铃铛（高 40px）。
 *  - **语义入口**：info/success/warning/error/todo 各语义一个入口，新增通知直接复用，
 *    不会因遗忘 duration 而再次产生"永不关闭"的弹窗。
 *
 * 与通知中心（顶栏铃铛）的分工：
 *  - 弹窗 = 即时提醒，超时即走，不承担"可回看"职责；
 *  - 需要超时后仍可找回的待办类消息，由后端写 platform_events 落档，
 *    超时关闭后用户仍可在通知中心看到（见 notification.service）。
 */

import { ElNotification } from 'element-plus'

/** 默认自动关闭时长（毫秒）：用户不点击也自动消失 */
export const NOTIFY_AUTO_CLOSE_MS = 8000

/** 顶栏避让偏移：右上角铃铛高 40px，下移 52px 避免遮挡 */
export const NOTIFY_OFFSET_PX = 52

/** 通知语义类型（对应 Element Plus 的 type） */
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error'

/** 通知弹窗选项 */
export interface NotifyOptions {
  /** 标题 */
  title: string
  /** 正文 */
  message: string
  /** 语义类型，默认 info */
  type?: NotifyLevel
  /**
   * 自动关闭时长（毫秒）。省略时用 {@link NOTIFY_AUTO_CLOSE_MS}。
   * 传 0 视为误用（会永久占屏），将被拒绝并回落默认值。
   */
  duration?: number
  /** 点击回调（点击后由调用方决定是否 close + 跳转） */
  onClick?: () => void
}

/** ElNotification 返回的实例（可主动 close） */
export interface NotifyInstance {
  close: () => void
}

/**
 * 弹出通知（统一入口：自动关闭 + 顶栏避让）。
 *
 * @param options 通知选项
 * @returns Element Plus 通知实例
 */
export function notify(options: NotifyOptions): NotifyInstance {
  const { title, message, type = 'info', duration, onClick } = options

  // duration: 0 表示"永不关闭"，与"用户不点也要自动收走"的需求冲突。
  // 这里不静默接受，而是告警并回落默认值，避免新代码再次引入常驻弹窗。
  let finalDuration = duration ?? NOTIFY_AUTO_CLOSE_MS
  if (finalDuration === 0) {
    console.warn('[notify] duration: 0 会永久占屏，已回落为默认自动关闭时长', { title })
    finalDuration = NOTIFY_AUTO_CLOSE_MS
  }

  return ElNotification({
    title,
    message,
    type,
    duration: finalDuration,
    offset: NOTIFY_OFFSET_PX,
    ...(onClick ? { onClick } : {}),
  })
}

/** 普通信息通知 */
export function notifyInfo(options: Omit<NotifyOptions, 'type'>): NotifyInstance {
  return notify({ ...options, type: 'info' })
}

/** 成功通知 */
export function notifySuccess(options: Omit<NotifyOptions, 'type'>): NotifyInstance {
  return notify({ ...options, type: 'success' })
}

/** 警告通知 */
export function notifyWarning(options: Omit<NotifyOptions, 'type'>): NotifyInstance {
  return notify({ ...options, type: 'warning' })
}

/** 错误通知 */
export function notifyError(options: Omit<NotifyOptions, 'type'>): NotifyInstance {
  return notify({ ...options, type: 'error' })
}

/** 待办类通知选项：额外带跳转路由 */
export interface NotifyTodoOptions extends Omit<NotifyOptions, 'type'> {
  /** 点击直达的路由（省略则仅关闭） */
  route?: string
}

/**
 * 待办类通知（待审核、等待处理的产出等）。
 *
 * 同样自动关闭——用户不点击时超时收走，不永久占屏。
 * "不会因此找不到产物"由后端 platform_events 落档 + 通知中心回看保证，
 * 不靠让弹窗常驻来实现。
 *
 * @param options 通知选项 + 可选 route
 * @param onNavigate 点击且带 route 时的跳转实现（由调用方注入 router.push，便于测试）
 */
export function notifyTodo(
  options: NotifyTodoOptions,
  onNavigate?: (route: string) => void
): NotifyInstance {
  const { route, onClick, ...rest } = options
  let instance: NotifyInstance

  instance = notify({
    ...rest,
    type: 'warning',
    onClick: () => {
      instance.close()
      if (route && onNavigate) onNavigate(route)
      onClick?.()
    },
  })

  return instance
}