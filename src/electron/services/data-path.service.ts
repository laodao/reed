/**
 * 数据路径管理服务
 * @module platform/services/data-path-service
 * @description 管理应用程序数据存储路径，支持自定义路径和数据迁移
 */

import { app, dialog, BrowserWindow, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as fsExtra from 'fs-extra'

/**
 * 数据路径配置接口
 */
export interface DataPathConfig {
  /** 数据路径 */
  dataPath: string
  /** 是否为默认路径 */
  isDefault: boolean
  /** 上次更新时间 */
  updatedAt?: string
}

/**
 * 数据迁移状态
 */
export interface MigrationStatus {
  /** 是否正在迁移 */
  migrating: boolean
  /** 当前步骤 */
  currentStep: string
  /** 进度百分比 */
  progress: number
  /** 错误信息 */
  error?: string
}

/**
 * 配置文件接口
 */
interface PathConfigFile {
  customDataPath: string | null
  updatedAt?: string
}

/**
 * 数据路径服务
 */
export class DataPathService {
  private static instance: DataPathService
  private customDataPath: string | null = null
  private migrationStatus: MigrationStatus = {
    migrating: false,
    currentStep: '',
    progress: 0
  }
  private configFilePath: string

  private constructor() {
    // 配置文件路径固定在 userData 目录下，不随自定义数据路径变化
    this.configFilePath = path.join(app.getPath('userData'), 'data-path-config.json')
  }

  /**
   * 获取单例实例
   */
  static getInstance(): DataPathService {
    if (!DataPathService.instance) {
      DataPathService.instance = new DataPathService()
    }
    return DataPathService.instance
  }

  /**
   * 初始化数据路径
   * 从配置文件中加载自定义路径
   */
  async initialize(): Promise<void> {
    try {
      // 从配置文件中读取自定义路径
      if (fs.existsSync(this.configFilePath)) {
        const configContent = fs.readFileSync(this.configFilePath, 'utf-8')
        const config: PathConfigFile = JSON.parse(configContent)
        if (config.customDataPath && fs.existsSync(config.customDataPath)) {
          this.customDataPath = config.customDataPath
          console.log('[DataPathService] 从配置文件加载自定义数据路径:', this.customDataPath)
        }
      }
    } catch (error) {
      console.error('[DataPathService] 初始化失败:', error)
    }
  }

  /**
   * 获取当前数据路径
   */
  getDataPath(): string {
    return this.customDataPath || app.getPath('userData')
  }

  /**
   * 获取默认数据路径
   */
  getDefaultDataPath(): string {
    return app.getPath('userData')
  }

  /**
   * 是否使用自定义路径
   */
  isCustomPath(): boolean {
    return this.customDataPath !== null
  }

  /**
   * 获取数据路径配置
   */
  async getConfig(): Promise<DataPathConfig> {
    return {
      dataPath: this.getDataPath(),
      isDefault: !this.isCustomPath(),
      updatedAt: this.customDataPath ? new Date().toISOString() : undefined
    }
  }

  /**
   * 获取各个子目录路径
   */
  getSubDirectories(): {
    database: string
    images: string
    voice: string
    translations: string
  } {
    const basePath = this.getDataPath()
    return {
      database: basePath,
      images: path.join(basePath, 'images'),
      voice: path.join(basePath, 'voice'),
      translations: path.join(basePath, 'translations')
    }
  }

  /**
   * 选择新的数据路径
   */
  async selectDataPath(window: BrowserWindow): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const result = await dialog.showOpenDialog(window, {
        title: '选择数据存储目录',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: '选择此目录'
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '未选择目录' }
      }

      const selectedPath = result.filePaths[0]

      // 检查目录是否可写
      try {
        const testFile = path.join(selectedPath, '.write_test')
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
      } catch {
        return { success: false, error: '所选目录不可写，请选择其他目录' }
      }

      return { success: true, path: selectedPath }
    } catch (error: any) {
      return { success: false, error: error.message || '选择目录失败' }
    }
  }

  /**
   * 设置新的数据路径
   */
  async setDataPath(newPath: string, migrate: boolean = true): Promise<{ success: boolean; error?: string }> {
    try {
      // 检查新路径是否与当前路径相同
      const currentPath = this.getDataPath()
      if (path.resolve(newPath) === path.resolve(currentPath)) {
        return { success: false, error: '新路径与当前路径相同' }
      }

      // 确保新路径存在
      if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true })
      }

      if (migrate) {
        // 执行数据迁移
        const migrateResult = await this.migrateData(newPath)
        if (!migrateResult.success) {
          return migrateResult
        }
      }

      // 保存新路径到配置文件
      const config: PathConfigFile = {
        customDataPath: newPath,
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2))

      this.customDataPath = newPath

      return { success: true }
    } catch (error: any) {
      console.error('[DataPathService] 设置数据路径失败:', error)
      return { success: false, error: error.message || '设置数据路径失败' }
    }
  }

  /**
   * 重置为默认路径
   */
  async resetToDefault(migrate: boolean = true): Promise<{ success: boolean; error?: string }> {
    const defaultPath = this.getDefaultDataPath()
    const currentPath = this.getDataPath()

    if (currentPath === defaultPath) {
      return { success: false, error: '当前已是默认路径' }
    }

    if (migrate) {
      const migrateResult = await this.migrateData(defaultPath)
      if (!migrateResult.success) {
        return migrateResult
      }
    }

    // 清除自定义路径配置
    if (fs.existsSync(this.configFilePath)) {
      fs.unlinkSync(this.configFilePath)
    }

    this.customDataPath = null

    return { success: true }
  }

  /**
   * 迁移数据到新路径
   */
  private async migrateData(targetPath: string): Promise<{ success: boolean; error?: string }> {
    const sourcePath = this.getDataPath()

    this.migrationStatus = {
      migrating: true,
      currentStep: '准备迁移',
      progress: 0
    }

    try {
      // 确保目标目录存在
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      // 需要迁移的目录列表
      const dirsToMigrate = [
        { name: 'images', weight: 30 },
        { name: 'voice', weight: 30 },
        { name: 'translations', weight: 10 }
      ]

      // 需要迁移的文件列表（根目录）
      const filesToMigrate = [
        { pattern: 'the_bot.db', weight: 10 },
        { pattern: 'the_bot.db-wal', weight: 5 },
        { pattern: 'the_bot.db-shm', weight: 5 },
        { pattern: 'secure_storage.key', weight: 10 }
      ]

      let totalProgress = 0
      const totalWeight = 100

      // 1. 迁移数据库文件
      this.migrationStatus.currentStep = '迁移数据库'
      for (const file of filesToMigrate) {
        const sourceFile = path.join(sourcePath, file.pattern)
        const targetFile = path.join(targetPath, file.pattern)

        if (fs.existsSync(sourceFile)) {
          await fsExtra.copy(sourceFile, targetFile, { overwrite: true })
        }
        totalProgress += file.weight
        this.migrationStatus.progress = totalProgress
      }

      // 2. 迁移子目录
      for (const dir of dirsToMigrate) {
        this.migrationStatus.currentStep = `迁移 ${dir.name} 目录`
        const sourceDir = path.join(sourcePath, dir.name)
        const targetDir = path.join(targetPath, dir.name)

        if (fs.existsSync(sourceDir)) {
          await fsExtra.copy(sourceDir, targetDir, { overwrite: true })
        }
        totalProgress += dir.weight
        this.migrationStatus.progress = totalProgress
      }

      this.migrationStatus.currentStep = '迁移完成'
      this.migrationStatus.progress = 100
      this.migrationStatus.migrating = false

      return { success: true }
    } catch (error: any) {
      console.error('[DataPathService] 数据迁移失败:', error)
      this.migrationStatus.migrating = false
      this.migrationStatus.error = error.message
      return { success: false, error: error.message || '数据迁移失败' }
    }
  }

  /**
   * 获取迁移状态
   */
  getMigrationStatus(): MigrationStatus {
    return { ...this.migrationStatus }
  }

  /**
   * 计算数据目录大小
   */
  async calculateDataSize(): Promise<{ total: number; details: Record<string, number> }> {
    const basePath = this.getDataPath()
    const details: Record<string, number> = {
      database: 0,
      images: 0,
      voice: 0,
      translations: 0,
      other: 0
    }

    const calcDirSize = (dirPath: string): number => {
      if (!fs.existsSync(dirPath)) return 0

      let size = 0
      const files = fs.readdirSync(dirPath)

      for (const file of files) {
        const filePath = path.join(dirPath, file)
        const stats = fs.statSync(filePath)

        if (stats.isDirectory()) {
          size += calcDirSize(filePath)
        } else {
          size += stats.size
        }
      }

      return size
    }

    // 计算各目录大小
    const subDirs = this.getSubDirectories()

    // 数据库文件
    const dbPath = path.join(basePath, 'the_bot.db')
    if (fs.existsSync(dbPath)) {
      details.database = fs.statSync(dbPath).size
      const walPath = dbPath + '-wal'
      const shmPath = dbPath + '-shm'
      if (fs.existsSync(walPath)) details.database += fs.statSync(walPath).size
      if (fs.existsSync(shmPath)) details.database += fs.statSync(shmPath).size
    }

    // 图片目录
    details.images = calcDirSize(subDirs.images)

    // 语音目录
    details.voice = calcDirSize(subDirs.voice)

    // 翻译目录
    details.translations = calcDirSize(subDirs.translations)

    // 总计
    const total = Object.values(details).reduce((sum, size) => sum + size, 0)

    return { total, details }
  }

  /**
   * 打开数据目录
   */
  async openDataFolder(): Promise<{ success: boolean; error?: string }> {
    try {
      const dataPath = this.getDataPath()

      if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true })
      }

      await shell.openPath(dataPath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || '打开目录失败' }
    }
  }

  /**
   * 格式化文件大小
   */
  static formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i]
  }
}