/**
 * Electron 路径提供者
 * @module electron/services/electron-path.provider
 * @description IPathProvider 的 Electron 实现，使用 app API + DataPathService 作为可定制数据根。
 */

import { app } from 'electron'
import * as path from 'path'
import type { IPathProvider, SubDirectories } from '@core/interfaces/path.interface'
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
}
