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

  emit(channel: string, data: unknown): void {
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
