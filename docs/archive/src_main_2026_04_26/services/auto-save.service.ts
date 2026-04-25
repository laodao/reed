/**
 * 自动保存服务
 * @module services/auto-save.service
 * @description 自动保存功能，支持定时保存和变更检测保存
 */

import { BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 保存状态
 */
export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'

/**
 * 可保存对象接口
 */
export interface Savable {
  id: string
  type: string
  getData: () => Promise<any> | any
  onSave?: () => void
  onError?: (error: Error) => void
}

/**
 * 自动保存配置
 */
interface AutoSaveConfig {
  interval: number        // 自动保存间隔（毫秒）
  debounceDelay: number   // 防抖延迟（毫秒）
  maxBackups: number      // 最大备份数
  backupDir: string       // 备份目录
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AutoSaveConfig = {
  interval: 60000,        // 1 分钟
  debounceDelay: 2000,    // 2 秒
  maxBackups: 10,
  backupDir: ''
}

/**
 * 保存记录
 */
interface SaveRecord {
  id: string
  type: string
  lastSaved: number
  lastModified: number
  saveCount: number
}

/**
 * 自动保存服务
 */
export class AutoSaveService {
  private static instance: AutoSaveService

  private config: AutoSaveConfig
  private savables: Map<string, Savable> = new Map()
  private records: Map<string, SaveRecord> = new Map()
  private dirtyFlags: Map<string, boolean> = new Map()
  private saveTimers: Map<string, NodeJS.Timeout> = new Map()
  private intervalTimer: NodeJS.Timeout | null = null
  private window: BrowserWindow | null = null
  private isRunning: boolean = false

  private constructor(config: Partial<AutoSaveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    if (!this.config.backupDir) {
      this.config.backupDir = path.join(app.getPath('userData'), 'backups')
    }

    // 确保备份目录存在
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true })
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<AutoSaveConfig>): AutoSaveService {
    if (!AutoSaveService.instance) {
      AutoSaveService.instance = new AutoSaveService(config)
    }
    return AutoSaveService.instance
  }

  /**
   * 设置窗口引用
   */
  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  /**
   * 启动自动保存
   */
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.intervalTimer = setInterval(() => {
      this.saveAllDirty()
    }, this.config.interval)

    console.log('[AutoSave] 服务已启动')
  }

  /**
   * 停止自动保存
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }

    // 清除所有定时器
    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer)
    }
    this.saveTimers.clear()

    console.log('[AutoSave] 服务已停止')
  }

  /**
   * 注册可保存对象
   */
  register(savable: Savable): void {
    this.savables.set(savable.id, savable)

    // 初始化记录
    if (!this.records.has(savable.id)) {
      this.records.set(savable.id, {
        id: savable.id,
        type: savable.type,
        lastSaved: 0,
        lastModified: Date.now(),
        saveCount: 0
      })
    }

    this.dirtyFlags.set(savable.id, true)
  }

  /**
   * 注销可保存对象
   */
  unregister(id: string): void {
    this.savables.delete(id)
    this.records.delete(id)
    this.dirtyFlags.delete(id)

    const timer = this.saveTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.saveTimers.delete(id)
    }
  }

  /**
   * 标记为已修改
   */
  markDirty(id: string): void {
    this.dirtyFlags.set(id, true)

    const record = this.records.get(id)
    if (record) {
      record.lastModified = Date.now()
    }

    // 防抖保存
    this.scheduleSave(id)

    // 通知前端
    this.notifyStatus(id, 'dirty')
  }

  /**
   * 手动保存
   */
  async save(id: string): Promise<boolean> {
    const savable = this.savables.get(id)
    if (!savable) return false

    return this.doSave(savable)
  }

  /**
   * 保存所有
   */
  async saveAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()

    for (const [id, savable] of this.savables) {
      results.set(id, await this.doSave(savable))
    }

    return results
  }

  /**
   * 保存所有有修改的
   */
  async saveAllDirty(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()

    for (const [id, isDirty] of this.dirtyFlags) {
      if (isDirty) {
        const savable = this.savables.get(id)
        if (savable) {
          results.set(id, await this.doSave(savable))
        }
      }
    }

    return results
  }

  /**
   * 获取保存状态
   */
  getStatus(id: string): SaveStatus {
    if (!this.savables.has(id)) return 'saved'
    return this.dirtyFlags.get(id) ? 'dirty' : 'saved'
  }

  /**
   * 获取备份列表
   */
  getBackups(id: string): Array<{ path: string; timestamp: number; size: number }> {
    const record = this.records.get(id)
    if (!record) return []

    const backupPattern = `${record.type}_${id}_`
    const backups: Array<{ path: string; timestamp: number; size: number }> = []

    try {
      const files = fs.readdirSync(this.config.backupDir)
      for (const file of files) {
        if (file.startsWith(backupPattern) && file.endsWith('.backup')) {
          const filePath = path.join(this.config.backupDir, file)
          const stats = fs.statSync(filePath)
          const timestamp = parseInt(file.split('_').pop()?.replace('.backup', '') || '0')

          backups.push({
            path: filePath,
            timestamp,
            size: stats.size
          })
        }
      }

      // 按时间倒序排列
      backups.sort((a, b) => b.timestamp - a.timestamp)
    } catch (error) {
      console.error('[AutoSave] 获取备份列表失败:', error)
    }

    return backups
  }

  /**
   * 恢复备份
   */
  async restoreBackup(id: string, backupPath: string): Promise<any> {
    if (!fs.existsSync(backupPath)) {
      throw new Error('备份文件不存在')
    }

    try {
      const data = fs.readFileSync(backupPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      throw new Error('恢复备份失败')
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 调度保存（防抖）
   */
  private scheduleSave(id: string): void {
    // 清除现有定时器
    const existingTimer = this.saveTimers.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // 设置新定时器
    const timer = setTimeout(() => {
      const savable = this.savables.get(id)
      if (savable && this.dirtyFlags.get(id)) {
        this.doSave(savable)
      }
      this.saveTimers.delete(id)
    }, this.config.debounceDelay)

    this.saveTimers.set(id, timer)
  }

  /**
   * 执行保存
   */
  private async doSave(savable: Savable): Promise<boolean> {
    const record = this.records.get(savable.id)
    if (!record) return false

    try {
      this.notifyStatus(savable.id, 'saving')

      // 获取数据
      const data = await savable.getData()

      // 创建备份
      await this.createBackup(savable.id, record.type, data)

      // 标记为已保存
      this.dirtyFlags.set(savable.id, false)
      record.lastSaved = Date.now()
      record.saveCount++

      // 回调
      if (savable.onSave) {
        savable.onSave()
      }

      this.notifyStatus(savable.id, 'saved')
      return true

    } catch (error: any) {
      console.error(`[AutoSave] 保存失败 (${savable.id}):`, error)

      if (savable.onError) {
        savable.onError(error)
      }

      this.notifyStatus(savable.id, 'error')
      return false
    }
  }

  /**
   * 创建备份
   */
  private async createBackup(id: string, type: string, data: any): Promise<void> {
    const timestamp = Date.now()
    const fileName = `${type}_${id}_${timestamp}.backup`
    const filePath = path.join(this.config.backupDir, fileName)

    // 写入备份文件
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')

    // 清理旧备份
    const backups = this.getBackups(id)
    while (backups.length > this.config.maxBackups) {
      const oldest = backups.pop()
      if (oldest) {
        try {
          fs.unlinkSync(oldest.path)
        } catch (error) {
          console.error('[AutoSave] 删除旧备份失败:', error)
        }
      }
    }
  }

  /**
   * 通知前端状态变化
   */
  private notifyStatus(id: string, status: SaveStatus): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('autosave:status', { id, status })
    }
  }
}