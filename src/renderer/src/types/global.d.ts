/**
 * 全局类型声明
 * @module types/global
 */

import type { ElectronAPI } from '../../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
