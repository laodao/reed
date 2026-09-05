/**
 * episode-production · 语音资产 · IPC handler
 * @module core/packs/episode-production/handlers/asset/voice-asset.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * V2.5 资产域 channel（ep:asset:voice:* · 走 VoiceAssetService 声音库 + 角色绑定）
 *
 * 注：本 task 之前文件是占位（无 handler），现在补齐 5 个新 channel；不存在 V2 voice channel
 * （voice 之前都走 character 的 voiceConfig），所以无需保留兼容。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { VoiceAssetService } from '@core/platform/episode-production/assets/services/voice-asset.service'

/**
 * 注册语音资产相关 IPC 处理器
 */
export function registerVoiceAssetHandlers(): void {
  // ==================== V2.5 资产域：VoiceAssetService 包装 ====================
  ipcBridge.handle('ep:asset:voice:list', handleAssetVoiceList)
  ipcBridge.handle('ep:asset:voice:list-ready', handleAssetVoiceListReady)
  ipcBridge.handle('ep:asset:voice:get', handleAssetVoiceGet)
  ipcBridge.handle('ep:asset:voice:bind-to-character', handleAssetVoiceBindToCharacter)
  ipcBridge.handle('ep:asset:voice:list-characters', handleAssetVoiceListCharacters)
}

/** 取 DataSource；未初始化则抛错 */
function requireDataSource() {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) {
    throw new Error('数据库未初始化')
  }
  return db.dataSource
}

// ==================== V2.5 资产域处理器 ====================

async function handleAssetVoiceList(_event: any): Promise<IpcResponse> {
  try {
    const svc = new VoiceAssetService(requireDataSource())
    const data = await svc.listAvailableVoices()
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetVoiceListReady(_event: any): Promise<IpcResponse> {
  try {
    const svc = new VoiceAssetService(requireDataSource())
    const data = await svc.listReadyVoices()
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetVoiceGet(
  _event: any,
  voiceId: string,
): Promise<IpcResponse> {
  try {
    const svc = new VoiceAssetService(requireDataSource())
    const data = await svc.getVoiceById(voiceId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetVoiceBindToCharacter(
  _event: any,
  characterBindingId: string,
  voiceId: string | null,
): Promise<IpcResponse> {
  try {
    const svc = new VoiceAssetService(requireDataSource())
    await svc.bindToCharacter(characterBindingId, voiceId)
    return { success: true, data: { updated: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleAssetVoiceListCharacters(
  _event: any,
  voiceId: string,
): Promise<IpcResponse> {
  try {
    const svc = new VoiceAssetService(requireDataSource())
    const data = await svc.listCharactersByVoice(voiceId)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
