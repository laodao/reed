/**
 * Electron 对话框提供者实现
 * @module electron/platform/electron-dialog
 * @description 使用 Electron dialog 实现 IDialogProvider 接口
 */

import { dialog, BrowserWindow } from 'electron'
import type { IDialogProvider, OpenDialogOptions, SaveDialogOptions, DialogResult } from '@core/interfaces/dialog.interface'

/**
 * Electron 对话框提供者实现
 * 使用 Electron 的 dialog API 显示文件选择对话框
 */
export class ElectronDialogProvider implements IDialogProvider {
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
   * 显示打开文件对话框
   * @param options - 对话框选项
   * @returns 选择的文件路径列表
   */
  async showOpenDialog(options: OpenDialogOptions): Promise<DialogResult> {
    const result = await dialog.showOpenDialog(this.window, {
      title: options.title,
      filters: options.filters,
      properties: options.properties as ('openFile' | 'openDirectory' | 'multiSelections')[]
    })

    return {
      canceled: result.canceled,
      filePaths: result.filePaths
    }
  }

  /**
   * 显示保存文件对话框
   * @param options - 对话框选项
   * @returns 选择的保存路径
   */
  async showSaveDialog(options: SaveDialogOptions): Promise<DialogResult> {
    const result = await dialog.showSaveDialog(this.window, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters
    })

    return {
      canceled: result.canceled,
      filePath: result.filePath
    }
  }
}
