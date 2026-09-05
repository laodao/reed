/**
 * episode-production · 故事板预览（thumbnails）IPC handler
 * @module core/packs/episode-production/handlers/narrative/storyboard-thumbnail.handler
 *
 * spec 2026-05-09 ep-redesign §3.2 B7 · P-18：剧本→分镜过渡的"先挑骨架再细化"路径。
 *
 * IPC：
 *   - ep:storyboard:generate-thumbnails  → 一张大图 → sharp 切片 9 张
 *   - ep:storyboard:create-from-thumbnails → 用户挑选骨架 → 创建 storyboards 行
 *   - ep:storyboard:cleanup-thumbnails → 用户取消时清理 temp 目录
 *
 * 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import path from 'path'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { StoryboardThumbnailGeneratorService } from '@core/modules/episode-production/narrative/ai/storyboard-thumbnail-generator'
import { createGalleryImageGenerator } from '@core/modules/episode-production/assets/services/image-provider-adapter'
import { ImportFromParsedShotsService } from '@core/modules/episode-production/narrative/import-from-parsed-shots.service'

export function registerStoryboardThumbnailHandlers(): void {
  ipcBridge.handle('ep:storyboard:generate-thumbnails', handleGenerate)
  ipcBridge.handle('ep:storyboard:cleanup-thumbnails', handleCleanup)
  ipcBridge.handle('ep:storyboard:create-from-thumbnails', handleCreateFromThumbnails)
}

async function handleGenerate(
  _event: any,
  input: {
    episodeScriptId: string
    count?: 9 | 16 | 25
    storySynopsis: string
    styleAnchors?: string[]
  },
): Promise<IpcResponse> {
  try {
    if (!input?.episodeScriptId || !input?.storySynopsis?.trim()) {
      return { success: false, error: '参数不完整：episodeScriptId / storySynopsis 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')

    const tempBase = path.join(getPathProvider().getTempPath(), 'ep-thumbnails')
    const svc = new StoryboardThumbnailGeneratorService(
      tempBase,
      createGalleryImageGenerator(),
    )
    const data = await svc.generate({
      episodeScriptId: input.episodeScriptId,
      count: input.count ?? 9,
      storySynopsis: input.storySynopsis,
      styleAnchors: input.styleAnchors,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleCreateFromThumbnails(
  _event: any,
  input: {
    sceneScriptId: string
    thumbnails: Array<{ gridIndex: number; description?: string }>
  },
): Promise<IpcResponse> {
  try {
    if (!input?.sceneScriptId) {
      return { success: false, error: '参数不完整：sceneScriptId 必填' }
    }
    if (!Array.isArray(input.thumbnails) || input.thumbnails.length === 0) {
      return { success: false, error: '参数不完整：thumbnails 非空数组' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new ImportFromParsedShotsService(db.dataSource)
    const data = await svc.importThumbnails({
      sceneScriptId: input.sceneScriptId,
      thumbnails: input.thumbnails,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleCleanup(
  _event: any,
  input: { sessionDir: string },
): Promise<IpcResponse> {
  try {
    if (!input?.sessionDir) {
      return { success: false, error: '参数不完整：sessionDir 必填' }
    }
    // 安全检查：sessionDir 必须在 temp/ep-thumbnails/ 下（防止误删）
    const tempBase = path.join(getPathProvider().getTempPath(), 'ep-thumbnails')
    if (!input.sessionDir.startsWith(tempBase)) {
      return { success: false, error: 'sessionDir 不在合法 temp 目录下' }
    }
    const svc = new StoryboardThumbnailGeneratorService(
      tempBase,
      createGalleryImageGenerator(),  // cleanup 不调 imageGen，但构造需要传
    )
    await svc.cleanup(input.sessionDir)
    return { success: true, data: { cleaned: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
