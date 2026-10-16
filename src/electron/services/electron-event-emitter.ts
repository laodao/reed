/**
 * Electron 事件发射器
 * @module electron/services/electron-event-emitter
 * @description IEventEmitter 的 Electron 广播实现，向所有非销毁窗口推送事件。
 *              若需向特定窗口推送，请直接调用 BrowserWindow.webContents.send。
 */

import { BrowserWindow } from 'electron'
import type {
  IEventEmitter,
  ProgressEvent,
  StatusEvent,
} from '@core/interfaces/event.interface'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { getCurrentUserId } from '@core/context/user-context'

export class ElectronBroadcastEventEmitter implements IEventEmitter {
  private static instance: ElectronBroadcastEventEmitter

  private constructor() {}

  static getInstance(): ElectronBroadcastEventEmitter {
    if (!ElectronBroadcastEventEmitter.instance) {
      ElectronBroadcastEventEmitter.instance = new ElectronBroadcastEventEmitter()
      registerEventEmitter(() => ElectronBroadcastEventEmitter.instance)
    }
    return ElectronBroadcastEventEmitter.instance
  }

  // 服务端 tap（与 web 端 WebSocketEventEmitter 同语义：emit 时先回调 taps）
  private taps = new Set<(channel: string, data: unknown, userId: string | null) => void>()

  tapEvents(cb: (channel: string, data: unknown, userId: string | null) => void): () => void {
    this.taps.add(cb)
    return () => { this.taps.delete(cb) }
  }

  emit(channel: string, data: unknown): void {
    if (this.taps.size > 0) {
      const uid = getCurrentUserId()
      for (const tap of this.taps) {
        try { tap(channel, data, uid) } catch { /* 单个 tap 异常不影响广播 */ }
      }
    }
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
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
