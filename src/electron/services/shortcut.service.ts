/**
 * 快捷键服务
 * @module platform/services/shortcut.service
 * @description 管理应用级快捷键
 */

import { globalShortcut, BrowserWindow, app } from 'electron'

/**
 * 快捷键定义
 */
export interface ShortcutDefinition {
  id: string
  accelerator: string       // 快捷键组合，如 'CommandOrControl+S'
  description: string       // 描述
  action: () => void        // 执行动作
  enabled?: boolean         // 是否启用
  scope?: 'global' | 'local' // 作用域
}

/**
 * 快捷键服务
 */
export class ShortcutService {
  private static instance: ShortcutService

  private shortcuts: Map<string, ShortcutDefinition> = new Map()
  private window: BrowserWindow | null = null
  private isRegistered: boolean = false

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ShortcutService {
    if (!ShortcutService.instance) {
      ShortcutService.instance = new ShortcutService()
    }
    return ShortcutService.instance
  }

  /**
   * 设置窗口引用
   */
  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  /**
   * 注册快捷键
   */
  register(definition: ShortcutDefinition): boolean {
    if (this.shortcuts.has(definition.id)) {
      console.warn(`[Shortcut] 快捷键已存在: ${definition.id}`)
      return false
    }

    this.shortcuts.set(definition.id, {
      ...definition,
      enabled: definition.enabled ?? true
    })

    // 如果已经启动，立即注册
    if (this.isRegistered && definition.enabled !== false) {
      this.registerAccelerator(definition)
    }

    return true
  }

  /**
   * 批量注册快捷键
   */
  registerAll(definitions: ShortcutDefinition[]): void {
    for (const def of definitions) {
      this.register(def)
    }
  }

  /**
   * 注销快捷键
   */
  unregister(id: string): boolean {
    const definition = this.shortcuts.get(id)
    if (!definition) return false

    try {
      globalShortcut.unregister(definition.accelerator)
    } catch (error) {
      // 忽略注销错误
    }

    this.shortcuts.delete(id)
    return true
  }

  /**
   * 启用/禁用快捷键
   */
  setEnabled(id: string, enabled: boolean): void {
    const definition = this.shortcuts.get(id)
    if (!definition) return

    definition.enabled = enabled

    if (this.isRegistered) {
      if (enabled) {
        this.registerAccelerator(definition)
      } else {
        try {
          globalShortcut.unregister(definition.accelerator)
        } catch (error) {
          // 忽略
        }
      }
    }
  }

  /**
   * 启动服务（注册所有快捷键）
   */
  start(): void {
    if (this.isRegistered) return

    // 注册所有启用的快捷键
    for (const definition of this.shortcuts.values()) {
      if (definition.enabled !== false) {
        this.registerAccelerator(definition)
      }
    }

    this.isRegistered = true
    console.log(`[Shortcut] 服务已启动，已注册 ${this.shortcuts.size} 个快捷键`)
  }

  /**
   * 停止服务（注销所有快捷键）
   */
  stop(): void {
    if (!this.isRegistered) return

    globalShortcut.unregisterAll()
    this.isRegistered = false
    console.log('[Shortcut] 服务已停止')
  }

  /**
   * 获取所有快捷键定义
   */
  getAll(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values())
  }

  /**
   * 获取快捷键描述列表（用于显示给用户）
   */
  getShortcutList(): Array<{ id: string; accelerator: string; description: string }> {
    return Array.from(this.shortcuts.values()).map(def => ({
      id: def.id,
      accelerator: this.formatAccelerator(def.accelerator),
      description: def.description
    }))
  }

  /**
   * 注册单个加速器
   */
  private registerAccelerator(definition: ShortcutDefinition): void {
    try {
      globalShortcut.register(definition.accelerator, () => {
        // 发送事件到渲染进程或执行动作
        if (definition.scope === 'local' && this.window) {
          this.window.webContents.send('shortcut:triggered', definition.id)
        } else {
          definition.action()
        }
      })
    } catch (error: any) {
      console.error(`[Shortcut] 注册失败 (${definition.accelerator}):`, error.message)
    }
  }

  /**
   * 格式化快捷键显示
   */
  private formatAccelerator(accelerator: string): string {
    return accelerator
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/CmdOrCtrl/g, 'Ctrl')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, 'Ctrl')
      .replace(/Shift/g, '⇧')
      .replace(/Alt/g, 'Alt')
      .replace(/\+/g, ' + ')
  }
}

// ==================== 预定义快捷键 ====================

/**
 * 剧集编辑器快捷键定义
 */
export const STORY_TO_VIDEO_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'stv.save',
    accelerator: 'CommandOrControl+S',
    description: '保存当前项目',
    action: () => {},
    scope: 'local'
  },
  {
    id: 'stv.undo',
    accelerator: 'CommandOrControl+Z',
    description: '撤销',
    action: () => {},
    scope: 'local'
  },
  {
    id: 'stv.redo',
    accelerator: 'CommandOrControl+Shift+Z',
    description: '重做',
    action: () => {},
    scope: 'local'
  },
  {
    id: 'stv.generate-script',
    accelerator: 'CommandOrControl+G',
    description: '生成剧本',
    action: () => {},
    scope: 'local'
  },
  {
    id: 'stv.generate-images',
    accelerator: 'CommandOrControl+Shift+G',
    description: '生成画面',
    action: () => {},
    scope: 'local'
  },
  {
    id: 'stv.preview',
    accelerator: 'CommandOrControl+P',
    description: '预览视频',
    action: () => {},
    scope: 'local'
  },
  {
    id: 'stv.export',
    accelerator: 'CommandOrControl+E',
    description: '导出视频',
    action: () => {},
    scope: 'local'
  }
]