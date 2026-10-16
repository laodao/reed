/**
 * 通知中心 IPC 处理器
 * @module electron/ipc/handlers/notification.handler
 * @description 通知中心（顶栏铃铛 + 历史列表 + 点击跳转）的薄适配层，业务在
 *              core/platform/services/notification.service（架构铁律：handler 不写业务）。
 *              已读状态独立落表 user_notification_reads；历史数据源 = platform_events。
 *
 *              通道（与 src/preload/index.ts IPC_CHANNELS / channel-map 保持一致）：
 *              - notification:list          收 { page?, pageSize?, unreadFirst? } → NoticeListResult
 *              - notification:mark-read     收 { seqs: number[] } → NoticeReadResult
 *              - notification:mark-all-read 无参数 → NoticeReadResult
 *              - notification:unread-count  无参数 → number
 *
 *              双端：ipcBridge 同时注册到跨平台桥（Web 经 POST /api/ipc/<channel> 暴露，
 *              ipc-router 全局 requireAuth + runWithUserAsync 注入用户，多租户安全）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getNotificationService } from '@core/platform/services/notification.service'
import type { NoticeListQuery } from '@shared/types'
import type { IpcResponse } from '@shared/types/ipc.types'

/** 服务就绪守卫：取实例或抛可读错误（数据源/仓库未初始化） */
function notices() {
  const s = getNotificationService()
  if (!s) throw new Error('通知中心未就绪（数据源或已读仓库未初始化）')
  return s
}

export function registerNotificationHandlers(): void {
  // ---- 通知列表（分页 + 未读优先） ----
  ipcBridge.handle('notification:list', (_e, p?: NoticeListQuery) =>
    wrap(() => notices().list(p ?? {}))
  )

  // ---- 标记指定 seq 已读 ----
  ipcBridge.handle('notification:mark-read', (_e, p?: { seqs: number[] }) =>
    wrap(() => notices().markRead(p?.seqs ?? []))
  )

  // ---- 全部标记已读 ----
  ipcBridge.handle('notification:mark-all-read', () =>
    wrap(() => notices().markAllRead())
  )

  // ---- 未读计数（顶栏铃铛徽标） ----
  ipcBridge.handle('notification:unread-count', () => wrap(() => notices().unreadCount()))
}

/** 统一 IpcResponse 包装（与 workflow.handler 同惯例） */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
