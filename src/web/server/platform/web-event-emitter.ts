/**
 * Web 端事件发射器（按用户路由 WebSocket）
 * @module web/server/platform/web-event-emitter
 * @description 实现 IEventEmitter；每个连接的 WebSocket 与其登录 userId 绑定，
 *              广播事件时仅推送给当前 ALS 上下文 userId 的所有连接。
 */

import type {
  IEventEmitter,
  ProgressEvent,
  StatusEvent,
} from '@core/interfaces/event.interface'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { getCurrentUserId } from '@core/context/user-context'

/**
 * 抽象 WebSocket 客户端接口（避免直接依赖 ws 库）
 */
export interface WsClient {
  userId: string
  send(data: string): void
  isAlive(): boolean
}

/**
 * 客户端注册表（按 userId 索引）。
 * Web Server 启动时实例化并 registerEventEmitter；连接 / 断开由 ws 模块维护。
 */
export class WebSocketEventEmitter implements IEventEmitter {
  private static instance: WebSocketEventEmitter | null = null
  private clientsByUser = new Map<string, Set<WsClient>>()

  private constructor() {}

  static getInstance(): WebSocketEventEmitter {
    if (!WebSocketEventEmitter.instance) {
      WebSocketEventEmitter.instance = new WebSocketEventEmitter()
      registerEventEmitter(() => WebSocketEventEmitter.instance!)
    }
    return WebSocketEventEmitter.instance
  }

  // ---- 客户端连接管理 ----

  attach(client: WsClient): void {
    let set = this.clientsByUser.get(client.userId)
    if (!set) {
      set = new Set()
      this.clientsByUser.set(client.userId, set)
    }
    set.add(client)
  }

  detach(client: WsClient): void {
    const set = this.clientsByUser.get(client.userId)
    if (set) {
      set.delete(client)
      if (set.size === 0) this.clientsByUser.delete(client.userId)
    }
  }

  // ---- 服务端事件 tap（本进程消费者：REST SSE 等） ----

  private taps = new Set<(channel: string, data: unknown, userId: string | null) => void>()

  /**
   * 注册服务端事件监听（本进程内）：每次 emit 都回调（含无 WS 客户端时），
   * 回调携带 emit 时刻的 ALS userId（供消费者做租户路由）。
   * 返回注销函数。回调抛错不影响其它 tap / WS 推送。
   */
  tapEvents(cb: (channel: string, data: unknown, userId: string | null) => void): () => void {
    this.taps.add(cb)
    return () => {
      this.taps.delete(cb)
    }
  }

  // ---- IEventEmitter ----

  emit(channel: string, data: unknown): void {
    const uid = getCurrentUserId()
    // 服务端 tap 先行（不依赖 WS 客户端在线与否）
    if (this.taps.size > 0) {
      for (const tap of this.taps) {
        try {
          tap(channel, data, uid)
        } catch {
          // 单个 tap 异常不影响其它消费者
        }
      }
    }
    if (!uid) return // 无用户上下文时不广播（防止串数据）
    const targets = this.clientsByUser.get(uid)
    if (!targets || targets.size === 0) return
    const payload = JSON.stringify({ channel, data })
    for (const client of targets) {
      if (client.isAlive()) {
        try {
          client.send(payload)
        } catch {
          // 单个客户端发送失败不影响其它人
        }
      }
    }
  }

  emitProgress(channel: string, progress: ProgressEvent): void {
    this.emit(channel, progress)
  }

  emitStatus(channel: string, status: StatusEvent): void {
    this.emit(channel, status)
  }
}
