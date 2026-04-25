/**
 * 错误处理服务
 * @module services/error.service
 * @description 统一的错误处理和用户友好的错误提示
 */

import { BrowserWindow, dialog } from 'electron'

/**
 * 错误类型
 */
export enum ErrorType {
  NETWORK = 'network',           // 网络错误
  API = 'api',                   // API 错误
  VALIDATION = 'validation',     // 验证错误
  PERMISSION = 'permission',     // 权限错误
  FILE = 'file',                 // 文件错误
  DATABASE = 'database',         // 数据库错误
  RESOURCE = 'resource',         // 资源错误
  UNKNOWN = 'unknown'            // 未知错误
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * 应用错误
 */
export class AppError extends Error {
  type: ErrorType
  severity: ErrorSeverity
  code?: string
  details?: any
  recoverable: boolean
  userMessage: string

  constructor(options: {
    message: string
    type?: ErrorType
    severity?: ErrorSeverity
    code?: string
    details?: any
    recoverable?: boolean
    userMessage?: string
  }) {
    super(options.message)

    this.name = 'AppError'
    this.type = options.type || ErrorType.UNKNOWN
    this.severity = options.severity || ErrorSeverity.ERROR
    this.code = options.code
    this.details = options.details
    this.recoverable = options.recoverable ?? true
    this.userMessage = options.userMessage || this.getDefaultUserMessage()
  }

  /**
   * 获取默认用户友好消息
   */
  private getDefaultUserMessage(): string {
    switch (this.type) {
      case ErrorType.NETWORK:
        return '网络连接失败，请检查网络设置'
      case ErrorType.API:
        return '服务请求失败，请稍后重试'
      case ErrorType.VALIDATION:
        return '输入数据无效，请检查后重试'
      case ErrorType.PERMISSION:
        return '权限不足，无法执行此操作'
      case ErrorType.FILE:
        return '文件操作失败'
      case ErrorType.DATABASE:
        return '数据存储失败'
      case ErrorType.RESOURCE:
        return '资源不足，请稍后重试'
      default:
        return '操作失败，请稍后重试'
    }
  }
}

/**
 * 错误处理配置
 */
interface ErrorHandlerConfig {
  showDialog: boolean      // 是否显示对话框
  logToConsole: boolean    // 是否记录到控制台
  reportErrors: boolean    // 是否上报错误
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  showDialog: true,
  logToConsole: true,
  reportErrors: false
}

/**
 * 错误处理服务
 */
export class ErrorService {
  private static instance: ErrorService

  private config: ErrorHandlerConfig
  private window: BrowserWindow | null = null
  private errorHistory: Array<{
    error: Error
    timestamp: number
    handled: boolean
  }> = []

  private constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // 设置全局错误处理
    this.setupGlobalHandlers()
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<ErrorHandlerConfig>): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService(config)
    }
    return ErrorService.instance
  }

  /**
   * 设置窗口引用
   */
  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  /**
   * 处理错误
   */
  async handle(error: Error | AppError | unknown): Promise<void> {
    // 转换为 AppError
    const appError = this.toAppError(error)

    // 记录错误
    this.recordError(appError)

    // 记录到控制台
    if (this.config.logToConsole) {
      this.logError(appError)
    }

    // 显示用户提示
    if (this.config.showDialog) {
      await this.showErrorToUser(appError)
    }

    // 通知渲染进程
    this.notifyRenderer(appError)
  }

  /**
   * 显示错误给用户
   */
  private async showErrorToUser(error: AppError): Promise<void> {
    if (!this.window) return

    // 对于可恢复的错误，发送到渲染进程显示
    if (error.recoverable && error.severity !== ErrorSeverity.FATAL) {
      this.window.webContents.send('error:show', {
        type: error.type,
        severity: error.severity,
        message: error.userMessage,
        details: error.details,
        recoverable: error.recoverable
      })
      return
    }

    // 严重错误显示对话框
    const buttons = error.recoverable
      ? ['重试', '取消']
      : ['确定']

    const result = await dialog.showMessageBox(this.window, {
      type: error.severity === ErrorSeverity.FATAL ? 'error' : 'warning',
      title: this.getErrorTitle(error),
      message: error.userMessage,
      detail: error.recoverable ? '是否重试？' : undefined,
      buttons,
      defaultId: 0
    })

    if (result.response === 0 && error.recoverable) {
      // 用户选择重试
      this.window.webContents.send('error:retry', {
        code: error.code
      })
    }
  }

  /**
   * 获取错误标题
   */
  private getErrorTitle(error: AppError): string {
    switch (error.severity) {
      case ErrorSeverity.INFO:
        return '提示'
      case ErrorSeverity.WARNING:
        return '警告'
      case ErrorSeverity.ERROR:
        return '错误'
      case ErrorSeverity.FATAL:
        return '严重错误'
      default:
        return '错误'
    }
  }

  /**
   * 转换为 AppError
   */
  private toAppError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (error instanceof Error) {
      // 尝试识别错误类型
      const message = error.message.toLowerCase()

      if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
        return new AppError({
          message: error.message,
          type: ErrorType.NETWORK,
          details: error
        })
      }

      if (message.includes('permission') || message.includes('denied')) {
        return new AppError({
          message: error.message,
          type: ErrorType.PERMISSION,
          details: error
        })
      }

      if (message.includes('file') || message.includes('enoent')) {
        return new AppError({
          message: error.message,
          type: ErrorType.FILE,
          details: error
        })
      }

      return new AppError({
        message: error.message,
        details: error
      })
    }

    return new AppError({
      message: String(error)
    })
  }

  /**
   * 记录错误
   */
  private recordError(error: Error): void {
    this.errorHistory.push({
      error,
      timestamp: Date.now(),
      handled: true
    })

    // 限制历史记录数量
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift()
    }
  }

  /**
   * 记录到控制台
   */
  private logError(error: AppError): void {
    const logPrefix = `[ErrorService ${error.type}]`

    switch (error.severity) {
      case ErrorSeverity.INFO:
        console.info(logPrefix, error.message)
        break
      case ErrorSeverity.WARNING:
        console.warn(logPrefix, error.message, error.details)
        break
      case ErrorSeverity.ERROR:
      case ErrorSeverity.FATAL:
        console.error(logPrefix, error.message, error.stack, error.details)
        break
    }
  }

  /**
   * 通知渲染进程
   */
  private notifyRenderer(error: AppError): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('error:occurred', {
        type: error.type,
        severity: error.severity,
        message: error.userMessage,
        code: error.code,
        recoverable: error.recoverable
      })
    }
  }

  /**
   * 设置全局错误处理
   */
  private setupGlobalHandlers(): void {
    // 处理未捕获的 Promise 拒绝
    process.on('unhandledRejection', (reason) => {
      console.error('[Unhandled Rejection]', reason)
      this.handle(reason)
    })

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('[Uncaught Exception]', error)
      this.handle(error)
    })
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(): Array<{ error: Error; timestamp: number; handled: boolean }> {
    return [...this.errorHistory]
  }

  /**
   * 清除错误历史
   */
  clearHistory(): void {
    this.errorHistory = []
  }
}

// ==================== 便捷方法 ====================

/**
 * 创建 API 错误
 */
export function createApiError(message: string, code?: string, details?: any): AppError {
  return new AppError({
    message,
    type: ErrorType.API,
    code,
    details
  })
}

/**
 * 创建网络错误
 */
export function createNetworkError(message: string, details?: any): AppError {
  return new AppError({
    message,
    type: ErrorType.NETWORK,
    details
  })
}

/**
 * 创建验证错误
 */
export function createValidationError(message: string, details?: any): AppError {
  return new AppError({
    message,
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.WARNING,
    details
  })
}

/**
 * 创建文件错误
 */
export function createFileError(message: string, details?: any): AppError {
  return new AppError({
    message,
    type: ErrorType.FILE,
    details
  })
}