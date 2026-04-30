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

/**
 * 全局 EventEmitter 访问器：core 服务通过此访问器获取实例。
 * 各运行环境（electron/web）需在初始化时调用 registerEventEmitter 注册具体实现。
 *
 * 注：广播式事件发射（向所有窗口/连接推送）使用此默认访问器；
 * 若需要精确指定单一窗口/连接，应继续通过参数传入 IEventEmitter 实例。
 */
export type EventEmitterAccessor = () => IEventEmitter

let _eventEmitterAccessor: EventEmitterAccessor | null = null

export function registerEventEmitter(accessor: EventEmitterAccessor): void {
  _eventEmitterAccessor = accessor
}

export function getEventEmitter(): IEventEmitter {
  if (!_eventEmitterAccessor) {
    throw new Error(
      '[IEventEmitter] 未注册访问器：请在运行环境初始化时调用 registerEventEmitter()',
    )
  }
  return _eventEmitterAccessor()
}