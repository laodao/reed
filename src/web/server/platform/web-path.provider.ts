/**
 * Web 端路径提供者
 * @module web/server/platform/web-path-provider
 * @description 实现 IPathProvider，根据当前请求的 userId 隔离每个用户的数据目录。
 *              dataPath = <root>/users/<userId> ，未识别用户时回落到 <root>/users/_anonymous
 */

import * as path from 'path'
import type { AssetScheme, IPathProvider, SubDirectories } from '@core/interfaces/path.interface'
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

  /**
   * Web 端：相对路径 → /assets/<rel>（HTTP 路由按 cookie userId 隔离），
   * 已是 URL 原样返回，绝对路径丢弃 host 取相对部分。
   * scheme 参数在 Web 端忽略（image/video/file 都走 /assets）。
   */
  toAssetUrl(relOrAbsPath: string, _scheme: AssetScheme = 'image'): string {
    if (!relOrAbsPath) return ''
    const normalized = relOrAbsPath.replace(/\\/g, '/')
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
      // 已是 URL（含 local-image:// 等）：抽出 path 部分作为相对路径，
      // 因为 web 端无法加载 local-image:// 协议，需要转成 /assets。
      // local-image://images/... → images/...
      // local-image:///abs/path  → 绝对路径不在 Web 数据目录内，无法转，原样返回
      const protoMatch = normalized.match(/^local-(image|video|file):\/\/(\/?.+)$/i)
      if (protoMatch) {
        const remainder = protoMatch[2]
        // 三斜杠形式表示绝对路径，Web 端无法访问，直接返回原 URL（前端会显示加载失败）
        if (remainder.startsWith('/')) return normalized
        return '/assets/' + remainder.replace(/^\/+/, '')
      }
      // http(s) / data: 等其他 URL 原样返回
      return normalized
    }
    // 绝对路径在 Web 端没意义（不会暴露宿主文件系统给浏览器），原样返回
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
      return normalized
    }
    // 标准相对路径：/assets/<rel>
    return '/assets/' + normalized.replace(/^\/+/, '')
  }
}
