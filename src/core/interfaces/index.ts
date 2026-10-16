/**
 * 平台抽象接口导出
 * @module core/interfaces
 * @description 导出所有平台抽象接口
 */

export { ISecureStorage } from './storage.interface'
export { IEventEmitter, ProgressEvent, StatusEvent } from './event.interface'
export { IDatabaseConnector } from './database.interface'
export { IPathProvider, SubDirectories } from './path.interface'
export { IDialogProvider, FileFilter, OpenDialogOptions, SaveDialogOptions, DialogResult } from './dialog.interface'