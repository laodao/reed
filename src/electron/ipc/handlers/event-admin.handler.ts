/**
 * 平台事件管理面 IPC 处理器（10-event-system §5.3 / §8）
 * @module electron/ipc/handlers/event-admin.handler
 * @description EventAdmin（死信队列收口 / 消费者水位）的薄适配层，业务在
 *              core/services/event-system/event-admin.service（架构铁律：handler 不写业务）。
 *
 *              鉴权（§8"管理面仅注册到鉴权 IPC/REST"）：
 *              - Web：ipcBridge 同时注册到跨平台桥，经 POST /api/ipc/<channel> 暴露，
 *                ipc-router 全局 requireAuth（ipc-router.ts:20），天然过鉴权；
 *              - Electron：ipcMain 通道与既有全部 handler 同级（单用户桌面信任模型），
 *                管理面通道统一 'event-admin:' 前缀，便于 pack 守卫/审计归口。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getEventAdmin } from '@core/services/event-system/event-admin.service'
import type { IpcResponse } from '@shared/types/ipc.types'

/** 管理面就绪守卫：取实例或抛可读错误（boot 早期/总线未启动） */
function admin() {
  const a = getEventAdmin()
  if (!a) throw new Error('事件系统未就绪（数据源未初始化）')
  return a
}

export function registerEventAdminHandlers(): void {
  // ---- 死信列表（可按消费者/状态过滤） ----
  ipcBridge.handle(
    'event-admin:list-dead-letters',
    (_e, p?: { consumerName?: string; status?: 'pending' | 'requeued' | 'discarded' }) =>
      wrap(() => admin().listDeadLetters(p ?? {}))
  )

  // ---- 死信重投递（在库回拨游标 / 已归档重放入库，§5.3） ----
  ipcBridge.handle('event-admin:requeue-dead-letter', (_e, p: { id: string }) =>
    wrap(async () => {
      await admin().requeue(p.id)
      return { requeued: true }
    })
  )

  // ---- 死信丢弃 ----
  ipcBridge.handle('event-admin:discard-dead-letter', (_e, p: { id: string }) =>
    wrap(async () => {
      await admin().discard(p.id)
      return { discarded: true }
    })
  )

  // ---- 消费者水位（含 lag / 重试中标记） ----
  ipcBridge.handle('event-admin:consumer-stats', () => wrap(() => admin().consumerStats()))
}

/** 统一 IpcResponse 包装（与 workflow.handler 同惯例） */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
