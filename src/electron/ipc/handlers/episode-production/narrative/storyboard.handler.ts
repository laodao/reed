/**
 * episode-production · 分镜管理 · IPC handler
 * @module electron/ipc/handlers/episode-production/narrative/storyboard.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：分镜管理（list/get/update-storyboard）、AI分镜生成（generate-storyboard、generate-storyboards）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getBrowserWindowFromEvent } from '../../_platform'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { Storyboard } from '@shared/types/story-to-video.types'
import { StoryToVideoAIService } from '@core/services/story-to-video-ai.service'
import { StoryboardService } from '@core/modules/episode-production/narrative/services/storyboard.service'

export function registerStoryboardHandlers(): void {
  // ==================== 分镜管理 ====================
  ipcBridge.handle('ep:list-storyboards', handleListStoryboards)
  ipcBridge.handle('ep:get-storyboard', handleGetStoryboard)
  ipcBridge.handle('ep:update-storyboard', handleUpdateStoryboard)

  // ==================== AI 生成（分镜） ====================
  ipcBridge.handle('ep:generate-storyboard', handleGenerateStoryboard)
  ipcBridge.handle('ep:generate-storyboards', handleGenerateStoryboards)

  // ==================== FU5-A9-L2 · 分镜背景 ref 图（panorama_snapshot 绑入分镜） ==
  ipcBridge.handle('ep:storyboard:set-background-ref', handleSetBackgroundRef)
  ipcBridge.handle('ep:storyboard:get-background-ref', handleGetBackgroundRef)
}

// ==================== FU5-A9-L2 background ref handlers ====================

function getStoryboardSvc(): StoryboardService {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) throw new Error('数据库未初始化')
  return new StoryboardService(db.dataSource)
}

async function handleSetBackgroundRef(
  _event: any,
  storyboardId: string,
  imageId: string | null,
): Promise<IpcResponse> {
  try {
    if (!storyboardId) return { success: false, error: 'storyboardId 不能为空' }
    await getStoryboardSvc().setBackgroundRefImage(storyboardId, imageId)
    return { success: true, data: { storyboardId, imageId } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '绑定背景 ref 失败' }
  }
}

async function handleGetBackgroundRef(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    const imageId = await getStoryboardSvc().getBackgroundRefImageId(storyboardId)
    return { success: true, data: { storyboardId, imageId } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '读取背景 ref 失败' }
  }
}

// ==================== 分镜管理处理器 ====================

async function handleListStoryboards(
  _event: any,
  sceneScriptId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    const storyboards = await db.storyboards.getBySceneScriptId(sceneScriptId)
    return { success: true, data: storyboards }
  } catch (error: any) {
    return { success: false, error: error.message || '获取分镜列表失败' }
  }
}

async function handleGetStoryboard(
  _event: any,
  storyboardId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    const storyboard = await db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    return { success: true, data: storyboard }
  } catch (error: any) {
    return { success: false, error: error.message || '获取分镜失败' }
  }
}

async function handleUpdateStoryboard(
  _event: any,
  storyboardId: string,
  data: Partial<Storyboard>
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    const storyboard = await db.storyboards.update(storyboardId, data)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    return { success: true, data: storyboard }
  } catch (error: any) {
    return { success: false, error: error.message || '更新分镜失败' }
  }
}

// ==================== AI 生成处理器（分镜） ====================

async function handleGenerateStoryboard(
  event: any,
  sceneId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取窗口用于发送进度事件
    const window = getBrowserWindowFromEvent(event)

    // 调用 AI 生成分镜（使用逐个生成模式）
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.generateStoryboardsIncremental(
      scene,
      providerConfigId,
      modelId,
      (shotNumber, total, storyboard) => {
        // 发送进度事件
        if (window) {
          window.webContents.send('ep:storyboard-progress', {
            sceneId,
            shotNumber,
            total,
            storyboard: storyboard || null
          })
        }
      }
    )

    // 创建分镜记录
    const storyboardRecords: Storyboard[] = []
    for (const sb of result.storyboards) {
      // 调试日志
      console.log(`[Handler] 分镜 ${sb.shotNumber} dialogueIds:`, sb.dialogueIds)

      const storyboard = await db.storyboards.create({
        sceneScriptId: sceneId,
        shotNumber: sb.shotNumber,
        shotType: sb.shotType,
        cameraAngle: sb.cameraAngle,
        cameraMovement: sb.cameraMovement,
        movementDuration: sb.movementDuration,
        frameDescription: sb.frameDescription,
        subject: sb.subject,
        composition: sb.composition,
        characters: sb.characters,
        narrationId: sb.narrationId,
        dialogueIds: sb.dialogueIds,
        actionIds: sb.actionIds,
        duration: sb.duration,
        transition: sb.transition
      })
      storyboardRecords.push(storyboard)
    }

    return { success: true, data: storyboardRecords }
  } catch (error: any) {
    return { success: false, error: error.message || '生成分镜失败' }
  }
}

async function handleGenerateStoryboards(
  event: any,
  scriptId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取所有场景
    const scenes = await db.sceneScripts.getByEpisodeScriptId(scriptId)
    if (scenes.length === 0) {
      return { success: false, error: '没有场景，请先生成场景' }
    }

    // 获取窗口用于发送进度事件
    const window = getBrowserWindowFromEvent(event)

    // 调用 AI 批量生成分镜（使用逐个分镜生成模式）
    const aiService = StoryToVideoAIService.getInstance()
    const results = await aiService.generateStoryboards(
      scenes,
      providerConfigId,
      modelId,
      (sceneIndex, total, shotProgress) => {
        // 发送进度事件
        if (window) {
          window.webContents.send('ep:storyboards-progress', {
            scriptId,
            sceneIndex,
            total,
            shotProgress: shotProgress || null
          })
        }
      }
    )

    // 创建分镜记录
    const allStoryboards: Storyboard[] = []
    for (const [sceneId, result] of results) {
      // 删除该场景的旧分镜
      await db.storyboards.deleteBySceneScriptId(sceneId)

      // 创建新分镜
      for (const sb of result.storyboards) {
        const storyboard = await db.storyboards.create({
          sceneScriptId: sceneId,
          shotNumber: sb.shotNumber,
          shotType: sb.shotType,
          cameraAngle: sb.cameraAngle,
          cameraMovement: sb.cameraMovement,
          movementDuration: sb.movementDuration,
          frameDescription: sb.frameDescription,
          subject: sb.subject,
          composition: sb.composition,
          characters: sb.characters,
          narrationId: sb.narrationId,
          dialogueIds: sb.dialogueIds,
          actionIds: sb.actionIds,
          duration: sb.duration,
          transition: sb.transition
        })
        allStoryboards.push(storyboard)
      }
    }

    return { success: true, data: allStoryboards }
  } catch (error: any) {
    return { success: false, error: error.message || '批量生成分镜失败' }
  }
}
