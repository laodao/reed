/**
 * 任务队列服务
 * @module services/task-queue.service
 * @description 管理后台任务的执行队列，支持并发控制、优先级、重试
 */

import { BrowserWindow } from 'electron'

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

/**
 * 任务定义
 */
export interface Task<T = any> {
  id: string
  type: string
  priority: TaskPriority
  status: TaskStatus
  data: any
  result?: T
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  retries: number
  maxRetries: number
  progress: number
}

/**
 * 任务执行器
 */
export type TaskExecutor<T = any> = (
  task: Task<T>,
  onProgress?: (progress: number) => void
) => Promise<T>

/**
 * 队列配置
 */
export interface QueueConfig {
  maxConcurrent: number      // 最大并发数
  retryDelay: number         // 重试延迟（毫秒）
  taskTimeout: number        // 任务超时（毫秒）
}

/**
 * 默认队列配置
 */
const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrent: 3,
  retryDelay: 2000,
  taskTimeout: 300000 // 5 分钟
}

/**
 * 任务队列服务
 */
export class TaskQueueService {
  private static instance: TaskQueueService

  private queues: Map<string, Task[]> = new Map()
  private executors: Map<string, TaskExecutor> = new Map()
  private runningTasks: Map<string, Task> = new Map()
  private config: QueueConfig
  private taskIdCounter: number = 0
  private window: BrowserWindow | null = null

  private constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<QueueConfig>): TaskQueueService {
    if (!TaskQueueService.instance) {
      TaskQueueService.instance = new TaskQueueService(config)
    }
    return TaskQueueService.instance
  }

  /**
   * 设置窗口引用（用于发送事件）
   */
  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  /**
   * 注册任务执行器
   */
  registerExecutor(type: string, executor: TaskExecutor): void {
    this.executors.set(type, executor)
  }

  /**
   * 添加任务到队列
   */
  addTask<T = any>(
    queueName: string,
    type: string,
    data: any,
    options: {
      priority?: TaskPriority
      maxRetries?: number
    } = {}
  ): Task<T> {
    const queue = this.getOrCreateQueue(queueName)

    const task: Task<T> = {
      id: `${Date.now()}_${++this.taskIdCounter}`,
      type,
      priority: options.priority || 'normal',
      status: 'pending',
      data,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? 2,
      progress: 0
    }

    // 按优先级插入
    this.insertByPriority(queue, task)

    // 通知前端
    this.notifyTaskUpdate('task:added', task)

    // 尝试处理队列
    this.processQueue(queueName)

    return task
  }

  /**
   * 批量添加任务
   */
  addTasks<T = any>(
    queueName: string,
    type: string,
    items: any[],
    options: {
      priority?: TaskPriority
      maxRetries?: number
    } = {}
  ): Task<T>[] {
    const tasks: Task<T>[] = []

    for (const data of items) {
      const task = this.addTask<T>(queueName, type, data, options)
      tasks.push(task)
    }

    return tasks
  }

  /**
   * 取消任务
   */
  cancelTask(queueName: string, taskId: string): boolean {
    const queue = this.queues.get(queueName)
    if (!queue) return false

    const taskIndex = queue.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return false

    const task = queue[taskIndex]

    // 如果任务正在运行，标记为取消
    if (task.status === 'running') {
      task.status = 'cancelled'
      this.runningTasks.delete(taskId)
    } else {
      // 从队列中移除
      queue.splice(taskIndex, 1)
    }

    this.notifyTaskUpdate('task:cancelled', task)
    return true
  }

  /**
   * 取消队列中所有任务
   */
  cancelAll(queueName: string): number {
    const queue = this.queues.get(queueName)
    if (!queue) return 0

    let count = 0
    for (const task of queue) {
      if (task.status === 'pending') {
        task.status = 'cancelled'
        count++
      }
    }

    // 清除已取消的任务
    const newQueue = queue.filter(t => t.status !== 'cancelled')
    this.queues.set(queueName, newQueue)

    return count
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(queueName: string): {
    total: number
    pending: number
    running: number
    completed: number
    failed: number
  } {
    const queue = this.queues.get(queueName) || []
    const running = Array.from(this.runningTasks.values()).filter(
      t => queue.some(q => q.id === t.id)
    )

    return {
      total: queue.length + running.length,
      pending: queue.filter(t => t.status === 'pending').length,
      running: running.length,
      completed: queue.filter(t => t.status === 'completed').length,
      failed: queue.filter(t => t.status === 'failed').length
    }
  }

  /**
   * 获取任务
   */
  getTask(queueName: string, taskId: string): Task | undefined {
    const queue = this.queues.get(queueName)
    if (!queue) return undefined

    return queue.find(t => t.id === taskId) || this.runningTasks.get(taskId)
  }

  /**
   * 获取或创建队列
   */
  private getOrCreateQueue(queueName: string): Task[] {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, [])
    }
    return this.queues.get(queueName)!
  }

  /**
   * 按优先级插入任务
   */
  private insertByPriority(queue: Task[], task: Task): void {
    const priorityOrder: Record<TaskPriority, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3
    }

    const taskPriority = priorityOrder[task.priority]
    let insertIndex = queue.length

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === 'pending' && priorityOrder[queue[i].priority] > taskPriority) {
        insertIndex = i
        break
      }
    }

    queue.splice(insertIndex, 0, task)
  }

  /**
   * 处理队列
   */
  private async processQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName)
    if (!queue) return

    // 计算当前运行的任务数
    const runningCount = Array.from(this.runningTasks.values()).filter(
      t => queue.some(q => q.id === t.id)
    ).length

    // 如果已达到最大并发数，返回
    if (runningCount >= this.config.maxConcurrent) return

    // 获取下一个待处理的任务
    const nextTask = queue.find(t => t.status === 'pending')
    if (!nextTask) return

    // 标记为运行中
    nextTask.status = 'running'
    nextTask.startedAt = Date.now()
    this.runningTasks.set(nextTask.id, nextTask)
    this.notifyTaskUpdate('task:started', nextTask)

    // 获取执行器
    const executor = this.executors.get(nextTask.type)
    if (!executor) {
      nextTask.status = 'failed'
      nextTask.error = `未找到任务执行器: ${nextTask.type}`
      this.runningTasks.delete(nextTask.id)
      this.notifyTaskUpdate('task:failed', nextTask)
      this.processQueue(queueName)
      return
    }

    // 执行任务
    try {
      const result = await executor(nextTask, (progress) => {
        nextTask.progress = progress
        this.notifyTaskUpdate('task:progress', nextTask)
      })

      if (nextTask.status === 'cancelled') {
        return
      }

      nextTask.status = 'completed'
      nextTask.result = result
      nextTask.completedAt = Date.now()
      nextTask.progress = 100
      this.runningTasks.delete(nextTask.id)
      this.notifyTaskUpdate('task:completed', nextTask)

    } catch (error: any) {
      console.error(`[TaskQueue] 任务执行失败:`, error)

      if (nextTask.status === 'cancelled') {
        return
      }

      // 检查是否需要重试
      if (nextTask.retries < nextTask.maxRetries) {
        nextTask.retries++
        nextTask.status = 'pending'
        this.runningTasks.delete(nextTask.id)
        this.notifyTaskUpdate('task:retry', nextTask)

        // 延迟后重新处理
        setTimeout(() => this.processQueue(queueName), this.config.retryDelay)
        return
      }

      nextTask.status = 'failed'
      nextTask.error = error.message || '任务执行失败'
      nextTask.completedAt = Date.now()
      this.runningTasks.delete(nextTask.id)
      this.notifyTaskUpdate('task:failed', nextTask)
    }

    // 继续处理队列
    this.processQueue(queueName)
  }

  /**
   * 通知前端任务更新
   */
  private notifyTaskUpdate(event: string, task: Task): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(event, {
        id: task.id,
        type: task.type,
        status: task.status,
        progress: task.progress,
        error: task.error,
        result: task.result
      })
    }
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompleted(queueName: string): number {
    const queue = this.queues.get(queueName)
    if (!queue) return 0

    const before = queue.length
    const newQueue = queue.filter(t => t.status !== 'completed' && t.status !== 'failed')
    this.queues.set(queueName, newQueue)

    return before - newQueue.length
  }

  /**
   * 清理所有队列
   */
  cleanup(): void {
    // 取消所有运行中的任务
    for (const task of this.runningTasks.values()) {
      task.status = 'cancelled'
    }
    this.runningTasks.clear()

    // 清空所有队列
    this.queues.clear()
  }
}