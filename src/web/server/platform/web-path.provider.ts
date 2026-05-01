/**
 * Web 端路径提供者
 * @module web/server/platform/web-path-provider
 * @description 实现 IPathProvider，根据当前请求的 userId 隔离每个用户的数据目录。
 *              dataPath = <root>/users/<userId> ，未识别用户时回落到 <root>/users/_anonymous
 */

import * as path from 'path'
import type { IPathProvider, SubDirectories } from '@core/interfaces/path.interface'
import { registerPathProvider } from '@core/interfaces/path.interface'
import { getCurrentUserId } from '@core/context/user-context'

const DEFAULT_SUB_DIRS: SubDirectories = {
  database: 'database',
  images: 'images',
  voice: 'voice',
  translations: 'translations',
  knowledgeBase: 'knowledge-base',
  video: 'video',
  portrait: 'portrait',
  diary: 'diary',
  longwriting: 'longwriting',
  stv: 'stv',
}

export interface WebPathConfig {
  /**
   * Web 服务的根数据目录（环境变量 DATA_ROOT 或默认 './data'）
   */
  rootDataPath: string
}

export class WebPathProvider implements IPathProvider {
  private static instance: WebPathProvider | null = null
  private rootDataPath: string

  private constructor(rootDataPath: string) {
    this.rootDataPath = rootDataPath
  }

  static getInstance(config?: WebPathConfig): WebPathProvider {
    if (!WebPathProvider.instance) {
      if (!config) {
        throw new Error('[WebPathProvider] 首次调用必须传入 config')
      }
      WebPathProvider.instance = new WebPathProvider(config.rootDataPath)
      registerPathProvider(() => WebPathProvider.instance!)
    }
    return WebPathProvider.instance
  }

  /**
   * Web 端"用户数据目录" = rootDataPath/users/<userId>
   */
  getUserDataPath(): string {
    const uid = getCurrentUserId() || '_anonymous'
    return path.join(this.rootDataPath, 'users', uid)
  }

  /**
   * Web 端没有 OS appData 概念，统一映射到 rootDataPath
   */
  getAppDataPath(): string {
    return this.rootDataPath
  }

  getTempPath(): string {
    return path.join(this.rootDataPath, 'tmp')
  }

  /**
   * 数据存储路径 = 用户数据目录（每个用户隔离）
   */
  getDataPath(): string {
    return this.getUserDataPath()
  }

  getSubDirectories(): SubDirectories {
    return { ...DEFAULT_SUB_DIRS }
  }

  getSubDirectoryPath(name: keyof SubDirectories): string {
    return path.join(this.getDataPath(), DEFAULT_SUB_DIRS[name])
  }
}
