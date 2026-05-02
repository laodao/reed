/**
 * episode-production · 角色资产绑定 · IPC handler
 * @module electron/ipc/handlers/episode-production/asset/character-asset.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：角色绑定管理 + 上传模式实体管理（get/update/delete-uploaded-entity、is-binding-from-longwriting）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { CharacterBinding } from '@shared/types/story-to-video.types'
import { UploadedEntityService } from '@core/modules/episode-production/auto-binding/uploaded-entity.service'

export function registerCharacterAssetHandlers(): void {
  // ==================== 角色绑定 ====================
  ipcBridge.handle('ep:get-character-bindings', handleGetCharacterBindings)
  ipcBridge.handle('ep:bind-character', handleBindCharacter)
  ipcBridge.handle('ep:update-character-binding', handleUpdateCharacterBinding)
  ipcBridge.handle('ep:delete-character-binding', handleDeleteCharacterBinding)

  // ==================== 上传模式实体管理 ====================
  ipcBridge.handle('ep:get-uploaded-entity', handleGetUploadedEntity)
  ipcBridge.handle('ep:update-uploaded-entity', handleUpdateUploadedEntity)
  ipcBridge.handle('ep:delete-uploaded-entity', handleDeleteUploadedEntity)
  ipcBridge.handle('ep:is-binding-from-longwriting', handleIsBindingFromLongWriting)
}

// ==================== 角色绑定处理器 ====================

async function handleGetCharacterBindings(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const bindings = await db.characterBindings.getByProjectId(projectId)
    return { success: true, data: bindings }
  } catch (error: any) {
    return { success: false, error: error.message || '获取角色绑定失败' }
  }
}

async function handleBindCharacter(
  _event: any,
  projectId: string,
  longWritingCharacterId: string,
  portraitId: string | undefined,
  voiceConfig: CharacterBinding['voiceConfig'],
  generateConfig?: CharacterBinding['generateConfig']
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 检查是否已存在绑定
    const existing = await db.characterBindings.getByLongWritingCharacterId(
      projectId,
      longWritingCharacterId
    )

    if (existing) {
      // 更新现有绑定
      const updated = await db.characterBindings.update(existing.id, {
        portraitId,
        voiceConfig,
        generateConfig
      })
      return { success: true, data: updated }
    }

    // 创建新绑定
    const binding = await db.characterBindings.create({
      projectId,
      longWritingCharacterId,
      portraitId,
      voiceConfig,
      generateConfig
    })

    return { success: true, data: binding }
  } catch (error: any) {
    return { success: false, error: error.message || '绑定角色失败' }
  }
}

async function handleUpdateCharacterBinding(
  _event: any,
  bindingId: string,
  data: {
    portraitId?: string | null
    voiceConfig?: CharacterBinding['voiceConfig']
    generateConfig?: CharacterBinding['generateConfig'] | null
  }
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const binding = await db.characterBindings.update(bindingId, data)
    if (!binding) {
      return { success: false, error: '绑定不存在' }
    }

    return { success: true, data: binding }
  } catch (error: any) {
    return { success: false, error: error.message || '更新角色绑定失败' }
  }
}

async function handleDeleteCharacterBinding(
  _event: any,
  bindingId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.characterBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除角色绑定失败' }
  }
}

// ==================== 上传模式实体管理处理器 ====================

/**
 * 获取上传模式的实体详情
 */
async function handleGetUploadedEntity(
  _event: any,
  entityId: string,
  entityType: 'character' | 'location' | 'item'
): Promise<IpcResponse> {
  try {
    const entity = await UploadedEntityService.getUploadedEntity(entityId, entityType)
    if (!entity) {
      return { success: false, error: '实体不存在' }
    }
    return { success: true, data: entity }
  } catch (error: any) {
    console.error('[handleGetUploadedEntity] 错误:', error)
    return { success: false, error: error.message || '获取实体失败' }
  }
}

/**
 * 更新上传模式的实体
 */
async function handleUpdateUploadedEntity(
  _event: any,
  entityId: string,
  entityType: 'character' | 'location' | 'item',
  data: any
): Promise<IpcResponse> {
  try {
    console.log('[handleUpdateUploadedEntity] 更新实体:', { entityId, entityType, data })
    const entity = await UploadedEntityService.updateUploadedEntity(entityId, entityType, data)
    if (!entity) {
      return { success: false, error: '更新失败，实体不存在或不是上传模式' }
    }
    return { success: true, data: entity }
  } catch (error: any) {
    console.error('[handleUpdateUploadedEntity] 错误:', error)
    return { success: false, error: error.message || '更新实体失败' }
  }
}

/**
 * 删除上传模式的实体
 */
async function handleDeleteUploadedEntity(
  _event: any,
  entityId: string,
  entityType: 'character' | 'location' | 'item',
  projectId: string
): Promise<IpcResponse> {
  try {
    console.log('[handleDeleteUploadedEntity] 删除实体:', { entityId, entityType, projectId })
    const success = await UploadedEntityService.deleteUploadedEntity(entityId, entityType, projectId)
    if (!success) {
      return { success: false, error: '删除失败，实体不存在或不是上传模式' }
    }
    return { success: true, data: { deleted: true } }
  } catch (error: any) {
    console.error('[handleDeleteUploadedEntity] 错误:', error)
    return { success: false, error: error.message || '删除实体失败' }
  }
}

/**
 * 判断绑定是否来源于长文项目
 */
async function handleIsBindingFromLongWriting(
  _event: any,
  binding: {
    longWritingCharacterId?: string
    longWritingLocationId?: string
    longWritingItemId?: string
  }
): Promise<IpcResponse> {
  try {
    const isFromLongWriting = await UploadedEntityService.isBindingFromLongWriting(binding)
    return { success: true, data: { isFromLongWriting } }
  } catch (error: any) {
    console.error('[handleIsBindingFromLongWriting] 错误:', error)
    return { success: false, error: error.message || '判断绑定来源失败' }
  }
}
