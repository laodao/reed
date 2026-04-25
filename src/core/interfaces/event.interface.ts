/**
 * 事件发射器接口
 * @module core/interfaces/event
 * @description 平台无关的事件发送抽象
 */

/**
 * 进度事件数据
 */
export interface ProgressEvent {
  id: string
  progress: number
  estimatedSeconds?: number
}

/**
 * 状态事件数据
 */
export interface StatusEvent {
  id: string
  status: string
  count?: number
  error?: string
}

/**
 * 事件发射器接口
 * 用于向前端推送事件（如流式响应、进度更新）
 */
export interface IEventEmitter {
  /**
   * 发送事件到前端
   * @param channel - 事件通道名称
   * @param data - 事件数据
   */
  emit(channel: string, data: unknown): void

  /**
   * 发送进度事件
   * @param channel - 事件通道名称
   * @param progress - 进度数据
   */
  emitProgress(channel: string, progress: ProgressEvent): void

  /**
   * 发送状态事件
   * @param channel - 事件通道名称
   * @param status - 状态数据
   */
  emitStatus(channel: string, status: StatusEvent): void
}