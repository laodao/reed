/**
 * Electron 路径提供者
 * @module electron/services/electron-path.provider
 * @description IPathProvider 的 Electron 实现，使用 app API + DataPathService 作为可定制数据根。
 */

import { app } from 'electron'
import * as path from 'path'
import type { AssetScheme, IPathProvider, SubDirectories } from '@core/interfaces/path.interface'
import { registerPathProvider } from '@core/interfaces/path.interface'
import { DataPathService } from './data-path.service'

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

export class ElectronPathProvider implements IPathProvider {
  private static instance: ElectronPathProvider

  private constructor(private readonly dataPathService: DataPathService) {}

  static getInstance(): ElectronPathProvider {
    if (!ElectronPathProvider.instance) {
      ElectronPathProvider.instance = new ElectronPathProvider(DataPathService.getInstance())
      registerPathProvider(() => ElectronPathProvider.instance)
    }
    return ElectronPathProvider.instance
  }

  getUserDataPath(): string {
    return app.getPath('userData')
  }

  getAppDataPath(): string {
    return app.getPath('appData')
  }

  getTempPath(): string {
    return app.getPath('temp')
  }

  getDataPath(): string {
    return this.dataPathService.getDataPath()
  }

  getSubDirectories(): SubDirectories {
    return { ...DEFAULT_SUB_DIRS }
  }

  getSubDirectoryPath(name: keyof SubDirectories): string {
    return path.join(this.getDataPath(), DEFAULT_SUB_DIRS[name])
  }

  /**
   * Electron 端把相对/绝对路径转为自定义 protocol URL，由 protocol handler 解析。
   * 已是 URL（含 'http://' / 'local-image://'）原样返回。
   */
  toAssetUrl(relOrAbsPath: string, scheme: AssetScheme = 'image'): string {
    if (!relOrAbsPath) return ''
    const normalized = relOrAbsPath.replace(/\\/g, '/')
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return normalized
    const protocol = `local-${scheme}`
    // POSIX 绝对路径或 Windows 盘符路径：三斜杠 protocol；相对路径：双斜杠
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
      return `${protocol}:///${normalized}`
    }
    return `${protocol}://${normalized}`
  }
}
