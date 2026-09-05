/**
 * 视频提取主体 IPC handler（spec 2026-05-09 ep-redesign §3.2 E1 · P-22 · Phase 5）
 *
 * IPC：
 *   - ep:asset:character-extract:frames    抽帧（同步返回 N 个候选帧路径）
 *   - ep:asset:character-extract:cleanup   清 session temp 目录
 *
 * "把选中帧落到 character_binding 主图 / view"由前端复用既有 ep:asset:upload-image 路径，
 * 不需新 IPC。
 */

import path from 'node:path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import type { IpcResponse } from '@shared/types/ipc.types'
import { CharacterExtractionService } from '@core/platform/episode-production/reference-video/character-extraction.service'

export function registerCharacterExtractionHandlers(): void {
  ipcBridge.handle('ep:asset:character-extract:frames', handleExtractFrames)
  ipcBridge.handle('ep:asset:character-extract:cleanup', handleCleanup)
  ipcBridge.handle('ep:asset:character-extract:import-frames', handleImportFrames)
}

function tempDir(): string {
  return getPathProvider().getTempPath()
}

function projectAssetRoot(): string {
  return path.join(getPathProvider().getUserDataPath(), 'asset-images')
}

async function handleExtractFrames(
  _event: any,
  input: { videoPath: string; frameCount?: number },
): Promise<IpcResponse> {
  try {
    if (!input?.videoPath) {
      return { success: false, error: '参数不完整：videoPath 必填' }
    }
    const svc = new CharacterExtractionService()
    const data = await svc.extractFrames({
      videoPath: input.videoPath,
      tempDir: tempDir(),
      frameCount: input.frameCount,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleCleanup(
  _event: any,
  input: { sessionId: string },
): Promise<IpcResponse> {
  try {
    if (!input?.sessionId) return { success: false, error: '参数不完整：sessionId 必填' }
    const svc = new CharacterExtractionService()
    await svc.cleanup(input.sessionId, tempDir())
    return { success: true, data: { cleaned: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleImportFrames(
  _event: any,
  input: {
    bindingId: string
    frames: Array<{ framePath: string; label: string }>
  },
): Promise<IpcResponse> {
  try {
    if (!input?.bindingId) return { success: false, error: '参数不完整：bindingId 必填' }
    if (!Array.isArray(input.frames) || input.frames.length === 0) {
      return { success: false, error: '参数不完整：frames 数组为空' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new CharacterExtractionService()
    const data = await svc.importFramesToAsset({
      ds: db.dataSource,
      bindingId: input.bindingId,
      frames: input.frames,
      projectAssetRoot: projectAssetRoot(),
      userId: getCurrentUserId(),
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
