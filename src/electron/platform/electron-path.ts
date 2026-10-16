/**
 * Electron 路径提供者实现
 * @module electron/platform/electron-path
 * @description 使用 Electron app.getPath 实现 IPathProvider 接口
 */

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { IPathProvider, SubDirectories } from '@core/interfaces/path.interface'

/**
 * Electron 路径提供者实现
 * 使用 Electron 的 app API 获取各类路径
 */
export class ElectronPathProvider implements IPathProvider {
  private customDataPath: string | null = null
  private subDirectories: SubDirectories = {
    database: 'database',
    images: 'images',
    voice: 'voice',
    translations: 'translations',
    knowledgeBase: 'knowledge-base',
    video: 'video',
    portrait: 'portrait',
    diary: 'diary',
    longwriting: 'longwriting',
    stv: 'stv'
  }

  /**
   * 获取用户数据目录
   * Electron 的 app.getPath('userData')
   */
  getUserDataPath(): string {
    return app.getPath('userData')
  }

  /**
   * 获取应用数据目录
   * Windows: %APPDATA%, macOS: ~/Library/Application Support
   */
  getAppDataPath(): string {
    return app.getPath('appData')
  }

  /**
   * 获取临时目录
   */
  getTempPath(): string {
    return app.getPath('temp')
  }

  /**
   * 获取数据存储路径
   * 优先使用自定义路径，否则使用用户数据目录
   */
  getDataPath(): string {
    if (this.customDataPath) {
      return this.customDataPath
    }
    return this.getUserDataPath()
  }

  /**
   * 设置数据存储路径
   * @param newPath - 新的数据路径
   */
  setDataPath(newPath: string): void {
    this.customDataPath = newPath
  }

  /**
   * 获取子目录路径配置
   */
  getSubDirectories(): SubDirectories {
    return { ...this.subDirectories }
  }

  /**
   * 获取特定子目录的完整路径
   * @param name - 子目录名称
   */
  getSubDirectoryPath(name: keyof SubDirectories): string {
    const basePath = this.getDataPath()
    const subDir = this.subDirectories[name]
    const fullPath = path.join(basePath, subDir)

    // 确保目录存在
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true })
    }

    return fullPath
  }
}
