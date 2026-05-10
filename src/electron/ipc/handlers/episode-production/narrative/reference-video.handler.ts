/**
 * episode-production · 参考视频解析 IPC handler
 * @module electron/ipc/handlers/episode-production/narrative/reference-video.handler
 *
 * spec 2026-05-09 ep-redesign §3.2 D5 · P-22
 *
 * IPC：
 *   - ep:reference-video:analyze         上传视频路径 → 启动解析（同步返回结果；本期短视频 ≤ 3 min）
 *   - ep:reference-video:list            列我的解析记录
 *   - ep:reference-video:get             单个查询
 *   - ep:reference-video:delete          删 DB + temp 目录
 *
 * import-to-episode（用 ParsedShot[] 创建 storyboards）留 follow-up — 需要 episode-script 上下文 +
 * scene 关联，独立工作量。
 */

import path from 'path'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getCurrentUserId } from '@core/context/user-context'
import type { IpcResponse } from '@shared/types/ipc.types'
import { ReferenceVideoAnalysisService } from '@core/modules/episode-production/reference-video/analysis.service'

export function registerReferenceVideoHandlers(): void {
  ipcBridge.handle('ep:reference-video:analyze', handleAnalyze)
  ipcBridge.handle('ep:reference-video:list', handleList)
  ipcBridge.handle('ep:reference-video:get', handleGet)
  ipcBridge.handle('ep:reference-video:delete', handleDelete)
}

function tempDir(): string {
  return getPathProvider().getTempPath()
}

async function handleAnalyze(
  _event: any,
  input: { videoPath: string; sceneThreshold?: number },
): Promise<IpcResponse> {
  try {
    if (!input?.videoPath) {
      return { success: false, error: '参数不完整：videoPath 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new ReferenceVideoAnalysisService(db.dataSource)
    const data = await svc.analyze({
      videoPath: input.videoPath,
      tempDir: tempDir(),
      userId: getCurrentUserId(),
      sceneThreshold: input.sceneThreshold,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleList(): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new ReferenceVideoAnalysisService(db.dataSource)
    const data = await svc.listByUser(getCurrentUserId())
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleGet(_event: any, input: { id: string }): Promise<IpcResponse> {
  try {
    if (!input?.id) return { success: false, error: '参数不完整：id 必填' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new ReferenceVideoAnalysisService(db.dataSource)
    const data = await svc.getById(input.id)
    if (!data) return { success: false, error: '解析记录不存在' }
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleDelete(_event: any, input: { id: string }): Promise<IpcResponse> {
  try {
    if (!input?.id) return { success: false, error: '参数不完整：id 必填' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new ReferenceVideoAnalysisService(db.dataSource)
    await svc.delete(input.id, tempDir())
    return { success: true, data: { deleted: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
