/**
 * 撤销/重做服务
 * @module platform/services/history.service
 * @description 管理编辑历史，支持撤销/重做
 */

/**
 * 历史记录项
 */
export interface HistoryEntry {
  id: string
  type: string
  description: string
  timestamp: number
  before: any    // 操作前的状态
  after: any     // 操作后的状态
  action?: () => Promise<void>   // 重做动作
  reverse?: () => Promise<void> // 撤销动作
}

/**
 * 历史服务配置
 */
interface HistoryConfig {
  maxSize: number        // 最大历史记录数
  autoSave: boolean      // 是否自动保存
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: HistoryConfig = {
  maxSize: 50,
  autoSave: true
}

/**
 * 历史服务
 */
export class HistoryService {
  private static instance: HistoryService

  private histories: Map<string, HistoryEntry[]> = new Map()
  private pointers: Map<string, number> = new Map()
  private config: HistoryConfig
  private idCounter: number = 0

  private constructor(config: Partial<HistoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<HistoryConfig>): HistoryService {
    if (!HistoryService.instance) {
      HistoryService.instance = new HistoryService(config)
    }
    return HistoryService.instance
  }

  /**
   * 记录操作
   */
  record(
    scope: string,
    type: string,
    description: string,
    before: any,
    after: any,
    actions?: { action?: () => Promise<void>; reverse?: () => Promise<void> }
  ): HistoryEntry {
    const history = this.getOrCreateHistory(scope)
    const pointer = this.pointers.get(scope) || 0

    // 清除当前位置之后的历史记录
    history.splice(pointer)

    // 创建新记录
    const entry: HistoryEntry = {
      id: `${Date.now()}_${++this.idCounter}`,
      type,
      description,
      timestamp: Date.now(),
      before,
      after,
      ...actions
    }

    // 添加到历史记录
    history.push(entry)

    // 限制历史记录数量
    if (history.length > this.config.maxSize) {
      history.shift()
    }

    // 更新指针
    this.pointers.set(scope, history.length)

    return entry
  }

  /**
   * 撤销
   */
  async undo(scope: string): Promise<HistoryEntry | null> {
    const history = this.histories.get(scope)
    if (!history || history.length === 0) return null

    let pointer = this.pointers.get(scope) || 0

    if (pointer <= 0) return null

    pointer--
    this.pointers.set(scope, pointer)

    const entry = history[pointer]

    // 执行撤销动作
    if (entry.reverse) {
      await entry.reverse()
    }

    return entry
  }

  /**
   * 重做
   */
  async redo(scope: string): Promise<HistoryEntry | null> {
    const history = this.histories.get(scope)
    if (!history || history.length === 0) return null

    let pointer = this.pointers.get(scope) || 0

    if (pointer >= history.length) return null

    const entry = history[pointer]

    // 执行重做动作
    if (entry.action) {
      await entry.action()
    }

    pointer++
    this.pointers.set(scope, pointer)

    return entry
  }

  /**
   * 是否可以撤销
   */
  canUndo(scope: string): boolean {
    const pointer = this.pointers.get(scope) || 0
    return pointer > 0
  }

  /**
   * 是否可以重做
   */
  canRedo(scope: string): boolean {
    const history = this.histories.get(scope)
    if (!history) return false

    const pointer = this.pointers.get(scope) || 0
    return pointer < history.length
  }

  /**
   * 获取历史记录
   */
  getHistory(scope: string): HistoryEntry[] {
    return this.histories.get(scope) || []
  }

  /**
   * 获取当前位置
   */
  getPointer(scope: string): number {
    return this.pointers.get(scope) || 0
  }

  /**
   * 清除历史记录
   */
  clear(scope: string): void {
    this.histories.delete(scope)
    this.pointers.delete(scope)
  }

  /**
   * 清除所有历史记录
   */
  clearAll(): void {
    this.histories.clear()
    this.pointers.clear()
  }

  /**
   * 获取历史记录摘要
   */
  getSummary(scope: string): {
    total: number
    pointer: number
    canUndo: boolean
    canRedo: boolean
    entries: Array<{ description: string; type: string; timestamp: number }>
  } {
    const history = this.histories.get(scope) || []
    const pointer = this.pointers.get(scope) || 0

    return {
      total: history.length,
      pointer,
      canUndo: pointer > 0,
      canRedo: pointer < history.length,
      entries: history.map(e => ({
        description: e.description,
        type: e.type,
        timestamp: e.timestamp
      }))
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 获取或创建历史记录
   */
  private getOrCreateHistory(scope: string): HistoryEntry[] {
    if (!this.histories.has(scope)) {
      this.histories.set(scope, [])
      this.pointers.set(scope, 0)
    }
    return this.histories.get(scope)!
  }
}

// ==================== 操作类型常量 ====================

export const HistoryActionTypes = {
  // 剧本相关
  SCRIPT_UPDATE: 'script:update',
  SCENE_ADD: 'scene:add',
  SCENE_DELETE: 'scene:delete',
  SCENE_UPDATE: 'scene:update',
  SCENE_REORDER: 'scene:reorder',

  // 分镜相关
  STORYBOARD_ADD: 'storyboard:add',
  STORYBOARD_DELETE: 'storyboard:delete',
  STORYBOARD_UPDATE: 'storyboard:update',
  STORYBOARD_REORDER: 'storyboard:reorder',

  // 角色绑定相关
  BINDING_ADD: 'binding:add',
  BINDING_DELETE: 'binding:delete',
  BINDING_UPDATE: 'binding:update',

  // 项目设置
  PROJECT_UPDATE: 'project:update'
} as const