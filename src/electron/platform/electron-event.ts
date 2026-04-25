/**
 * Electron 事件发射器实现
 * @module electron/platform/electron-event
 * @description 使用 Electron BrowserWindow 实现 IEventEmitter 接口
 */

import { BrowserWindow } from 'electron'
import type { IEventEmitter, ProgressEvent, StatusEvent } from '@core/interfaces/event.interface'

/**
 * Electron 事件发射器实现
 * 通过 BrowserWindow.webContents.send 向前端发送事件
 */
export class ElectronEventEmitter implements IEventEmitter {
  private window: BrowserWindow | null

  constructor(window: BrowserWindow | null) {
    this.window = window
  }

  /**
   * 设置目标窗口
   */
  setWindow(window: BrowserWindow | null): void {
    this.window = window
  }

  /**
   * 获取当前窗口
   */
  getWindow(): BrowserWindow | null {
    return this.window
  }

  /**
   * 发送事件到前端
   * @param channel - 事件通道名称
   * @param data - 事件数据
   */
  emit(channel: string, data: unknown): void {
    if (!this.window || this.window.isDestroyed()) {
      console.warn('[ElectronEventEmitter] 窗口不存在或已销毁，无法发送事件')
      return
    }

    try {
      this.window.webContents.send(channel, data)
    } catch (error) {
      console.error('[ElectronEventEmitter] 发送事件失败:', error)
    }
  }

  /**
   * 发送进度事件
   * @param channel - 事件通道名称
   * @param progress - 进度数据
   */
  emitProgress(channel: string, progress: ProgressEvent): void {
    this.emit(channel, {
      type: 'progress',
      ...progress
    })
  }

  /**
   * 发送状态事件
   * @param channel - 事件通道名称
   * @param status - 状态数据
   */
  emitStatus(channel: string, status: StatusEvent): void {
    this.emit(channel, {
      type: 'status',
      ...status
    })
  }
}
