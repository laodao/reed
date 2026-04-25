/**
 * 对话框提供者接口
 * @module core/interfaces/dialog
 * @description 平台无关的文件选择对话框抽象
 */

/**
 * 文件过滤器
 */
export interface FileFilter {
  name: string
  extensions: string[]
}

/**
 * 打开对话框选项
 */
export interface OpenDialogOptions {
  title?: string
  filters?: FileFilter[]
  properties: ('openFile' | 'openDirectory' | 'multiSelections')[]
}

/**
 * 保存对话框选项
 */
export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
}

/**
 * 对话框结果
 */
export interface DialogResult {
  canceled: boolean
  filePaths?: string[]
  filePath?: string
}

/**
 * 对话框提供者接口
 * 用于显示文件选择和保存对话框
 */
export interface IDialogProvider {
  /**
   * 显示打开文件对话框
   * @param options - 对话框选项
   * @returns 选择的文件路径列表
   */
  showOpenDialog(options: OpenDialogOptions): Promise<DialogResult>

  /**
   * 显示保存文件对话框
   * @param options - 对话框选项
   * @returns 选择的保存路径
   */
  showSaveDialog(options: SaveDialogOptions): Promise<DialogResult>
}