/**
 * episode-production · 数字人池 IPC handler（spec 2026-05-09 ep-redesign §3.2 D3 · P-8）
 *
 * IPC：
 *   - ep:asset:preset:list                列所有内置数字人（global，不分用户）
 *   - ep:asset:preset:ensure-main-image   按需生成某 preset 的主图
 *   - ep:asset:preset:ensure-all-images   批量生成所有 preset 主图
 *   - ep:asset:preset:use-to-project      把内置形象引用到当前项目（创建用户自己的 binding）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getCurrentUserId } from '@core/context/user-context'
import type { IpcResponse } from '@shared/types/ipc.types'
import { PresetDigitalHumanService } from '@core/modules/episode-production/assets/services/preset-digital-human.service'
import { PresetImageSeederService } from '@core/modules/episode-production/assets/services/preset-image-seeder.service'

export function registerPresetDigitalHandlers(): void {
  ipcBridge.handle('ep:asset:preset:list', handleList)
  ipcBridge.handle('ep:asset:preset:ensure-main-image', handleEnsureMainImage)
  ipcBridge.handle('ep:asset:preset:ensure-all-images', handleEnsureAllImages)
  ipcBridge.handle('ep:asset:preset:use-to-project', handleUseToProject)
}

async function handleList(
  _event: any,
  input: { gender?: string } = {},
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new PresetDigitalHumanService(db.dataSource)
    const data = await svc.list({ gender: input.gender })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleEnsureMainImage(
  _event: any,
  input: { presetId: string },
): Promise<IpcResponse> {
  try {
    if (!input?.presetId) {
      return { success: false, error: '参数不完整：presetId 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new PresetImageSeederService(db.dataSource)
    const data = await svc.ensureMainImageFor(input.presetId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleEnsureAllImages(): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new PresetImageSeederService(db.dataSource)
    const data = await svc.ensureAllPresetImages()
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleUseToProject(
  _event: any,
  input: { presetId: string; targetProjectId: string; overrideName?: string },
): Promise<IpcResponse> {
  try {
    if (!input?.presetId || !input?.targetProjectId) {
      return { success: false, error: '参数不完整：presetId / targetProjectId 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new PresetDigitalHumanService(db.dataSource)
    const data = await svc.useToProject({
      presetId: input.presetId,
      targetProjectId: input.targetProjectId,
      userId: getCurrentUserId(),
      overrideName: input.overrideName,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
