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

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { CharacterExtractionService } from '@core/modules/episode-production/reference-video/character-extraction.service'

export function registerCharacterExtractionHandlers(): void {
  ipcBridge.handle('ep:asset:character-extract:frames', handleExtractFrames)
  ipcBridge.handle('ep:asset:character-extract:cleanup', handleCleanup)
}

function tempDir(): string {
  return getPathProvider().getTempPath()
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
