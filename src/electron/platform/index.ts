/**
 * Electron 平台实现
 * @module electron/platform
 * @description 导出所有 Electron 平台接口实现
 */

export { ElectronSecureStorage } from './electron-storage'
export { ElectronEventEmitter } from './electron-event'
export { ElectronPathProvider } from './electron-path'
export { ElectronDialogProvider } from './electron-dialog'

// 重新导出接口类型，方便使用
export type {
  ISecureStorage,
  ProgressEvent,
  StatusEvent
} from '@core/interfaces/event.interface'

export type {
  IEventEmitter
} from '@core/interfaces/event.interface'

export type {
  IPathProvider,
  SubDirectories
} from '@core/interfaces/path.interface'

export type {
  IDialogProvider,
  FileFilter,
  OpenDialogOptions,
  SaveDialogOptions,
  DialogResult
} from '@core/interfaces/dialog.interface'
