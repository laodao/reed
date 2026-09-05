/**
 * episode-production · 分镜内角色 · IPC handler
 * @module core/packs/episode-production/handlers/narrative/storyboard-character.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * 暴露 channel（spec §4.5.3 分镜内角色独立配置 · P5-T32）：
 *   - ep:list-storyboard-characters(storyboardId) → StoryboardCharacter[]
 *   - ep:save-storyboard-characters(storyboardId, list) → StoryboardCharacter[]
 *     全量替换语义：service 内 deleteByStoryboardId + createMany 事务
 *   - ep:clear-storyboard-characters(storyboardId) → void
 *     让该分镜回退到 scene 级配置（P5-T31 已实现的兜底路径）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  StoryboardCharacterService,
  type StoryboardCharacterInput,
} from '@core/modules/episode-production/narrative/services/storyboard-character.service'
import { ScriptBindingFixerService } from '@core/modules/episode-production/narrative/services/script-binding-fixer.service'

export function registerStoryboardCharacterHandlers(): void {
  ipcBridge.handle('ep:list-storyboard-characters', handleList)
  ipcBridge.handle('ep:save-storyboard-characters', handleSave)
  ipcBridge.handle('ep:clear-storyboard-characters', handleClear)
  // P5/P6-FU1 剧本 binding 修复
  ipcBridge.handle('ep:scan-script-bindings', handleScanBindings)
  ipcBridge.handle('ep:fix-script-bindings-by-name', handleFixByName)
  ipcBridge.handle('ep:create-missing-script-bindings', handleCreateMissing)
}

async function handleList(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    if (!storyboardId) {
      return { success: false, error: 'storyboardId 不能为空' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    const svc = new StoryboardCharacterService(db.dataSource)
    const data = await svc.listByStoryboard(storyboardId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '查询分镜内角色失败' }
  }
}

async function handleSave(
  _event: any,
  storyboardId: string,
  inputs: StoryboardCharacterInput[],
): Promise<IpcResponse> {
  try {
    if (!storyboardId) {
      return { success: false, error: 'storyboardId 不能为空' }
    }
    if (!Array.isArray(inputs)) {
      return { success: false, error: 'inputs 必须是数组' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    const svc = new StoryboardCharacterService(db.dataSource)
    const data = await svc.saveAll(storyboardId, inputs)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '保存分镜内角色失败' }
  }
}

async function handleClear(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    if (!storyboardId) {
      return { success: false, error: 'storyboardId 不能为空' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    const svc = new StoryboardCharacterService(db.dataSource)
    await svc.clearAll(storyboardId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '清空分镜内角色失败' }
  }
}

// ==================== P5/P6-FU1 剧本 binding 修复 ====================

async function handleScanBindings(
  _event: any,
  episodeScriptId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeScriptId) return { success: false, error: 'episodeScriptId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new ScriptBindingFixerService(db.dataSource)
    const data = await svc.scanUnbound(episodeScriptId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '扫描剧本绑定失败' }
  }
}

async function handleFixByName(
  _event: any,
  episodeScriptId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeScriptId) return { success: false, error: 'episodeScriptId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new ScriptBindingFixerService(db.dataSource)
    const data = await svc.fixByNameMatch(episodeScriptId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '按名匹配修复失败' }
  }
}

async function handleCreateMissing(
  _event: any,
  episodeScriptId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeScriptId) return { success: false, error: 'episodeScriptId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new ScriptBindingFixerService(db.dataSource)
    const data = await svc.createMissingBindings(episodeScriptId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '创建缺失角色失败' }
  }
}
