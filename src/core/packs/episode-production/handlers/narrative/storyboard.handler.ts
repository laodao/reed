/**
 * episode-production · 分镜管理 · IPC handler
 * @module core/packs/episode-production/handlers/narrative/storyboard.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：分镜管理（list/get/update-storyboard）、AI分镜生成（generate-storyboard、generate-storyboards）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getBrowserWindowFromEvent } from '@electron/ipc/handlers/_platform'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { Storyboard } from '@shared/types/story-to-video.types'
import { StoryToVideoAIService } from '@core/packs/episode-production/services/story-to-video-ai.service'
import { StoryboardService, normalizeShotNumbers } from '@core/modules/episode-production/narrative/services/storyboard.service'

export function registerStoryboardHandlers(): void {
  // ==================== 分镜管理 ====================
  ipcBridge.handle('ep:list-storyboards', handleListStoryboards)
  ipcBridge.handle('ep:get-storyboard', handleGetStoryboard)
  ipcBridge.handle('ep:update-storyboard', handleUpdateStoryboard)
  ipcBridge.handle('ep:reorder-storyboards', handleReorderStoryboards)
  ipcBridge.handle('ep:delete-storyboard', handleDeleteStoryboard)

  // ==================== AI 生成（分镜） ====================
  ipcBridge.handle('ep:generate-storyboard', handleGenerateStoryboard)
  ipcBridge.handle('ep:generate-storyboards', handleGenerateStoryboards)
  // spec 2026-05-27：单分镜 AI 填充
  ipcBridge.handle('ep:fill-storyboard', handleFillStoryboard)

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

async function handleReorderStoryboards(
  _event: any,
  sceneScriptId: string,
  orderedIds: string[],
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }
    await db.storyboards.reorderInScene(sceneScriptId, orderedIds)
    return { success: true, data: { reordered: orderedIds.length } }
  } catch (error: any) {
    return { success: false, error: error.message || '调序失败' }
  }
}

/*
 * 删除单个分镜：级联清理 keyframes + storyboard_characters，再删 storyboard 本身，
 * 最后把场景内剩余分镜按当前 shotNumber 升序重排为 1..N（避免出现 1,3,4 这种缝隙）。
 *
 * 注：repo 之间没有共享 transaction，与既有 generate-storyboards 流程
 *（先 deleteBySceneScriptId 再批量 create）的事务粒度一致；中途失败会留下
 * 已删的子表数据，但不会出现"分镜还在但 keyframe 不齐"的更严重不一致。
 */
async function handleDeleteStoryboard(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    if (!storyboardId) return { success: false, error: 'storyboardId 不能为空' }

    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    const target = await db.storyboards.getById(storyboardId)
    if (!target) {
      return { success: false, error: '分镜不存在' }
    }

    // 级联清理子表（FK 未配 cascade，需手工删）
    if (db.storyboardKeyframes) {
      await db.storyboardKeyframes.deleteByStoryboard(storyboardId)
    }
    if (db.storyboardCharacters) {
      await db.storyboardCharacters.deleteByStoryboardId(storyboardId)
    }

    /*
     * 不依赖 repo.delete() 的 boolean —— 部分 typeorm 驱动（PG 某些版本）
     * 不可靠地填充 result.affected，导致已成功 DELETE 但返回 false。
     * 这里调完后用 getById 复查：拿不到 → 判定删除成功。
     */
    await db.storyboards.delete(storyboardId)
    const stillExists = await db.storyboards.getById(storyboardId)
    if (stillExists) {
      console.error(
        `[handleDeleteStoryboard] 分镜 ${storyboardId} 删除后仍存在（可能 user_id scope 不匹配）`,
      )
      return { success: false, error: '删除分镜失败：DB 未真正删除（user_id scope 可能不匹配）' }
    }

    // 重排剩余分镜，让 shotNumber 重新连续 1..N
    const remaining = await db.storyboards.getBySceneScriptId(target.sceneScriptId)
    if (remaining.length > 0) {
      await db.storyboards.reorderInScene(
        target.sceneScriptId,
        remaining.map((sb) => sb.id),
      )
    }

    return {
      success: true,
      data: {
        deletedId: storyboardId,
        sceneScriptId: target.sceneScriptId,
        remaining: remaining.length,
      },
    }
  } catch (error: any) {
    console.error('[handleDeleteStoryboard] 异常：', error)
    return {
      success: false,
      error: error?.message ? `删除分镜失败：${error.message}` : '删除分镜失败（未知异常）',
    }
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

    // 创建分镜记录（shotNumber 按 AI 返回顺序强制重排为 1..N，AI 返回可能跳号）
    const storyboardRecords: Storyboard[] = []
    for (const sb of normalizeShotNumbers(result.storyboards)) {
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

      // 创建新分镜（shotNumber 按 AI 返回顺序强制重排为 1..N，AI 返回可能跳号）
      for (const sb of normalizeShotNumbers(result.storyboards)) {
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

/**
 * spec 2026-05-28：单分镜 AI 填充（扩展版）
 * 调 AI 推荐所有镜头参数，一键填充所有空白字段
 * 覆盖：镜头核心参数 + metadata参数 + 转场参数 + 关键帧数
 */
async function handleFillStoryboard(
  _event: any,
  storyboardId: string,
  fillInput: {
    shotNumber: number
    sceneContext: string
    location?: string
    timeOfDay?: string
    mood?: string
    existingFields: {
      shotType?: string | null
      cameraAngle?: string | null
      cameraMovement?: string | null
      duration?: number | null
      frameDescription?: string | null
      // 扩展字段（2026-05-28）
      lensFocalMm?: number | null
      aperture?: string | null
      cameraStyle?: string | null
      lighting?: string | null
      transitionType?: string | null
      transitionDuration?: number | null
      transitionDirection?: string | null
      keyframeCount?: number | null
    }
  },
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  console.log('[handleFillStoryboard] 收到IPC调用')
  console.log('[handleFillStoryboard] fillInput:', JSON.stringify(fillInput).substring(0, 500))
  console.log('[handleFillStoryboard] providerConfigId:', providerConfigId)
  console.log('[handleFillStoryboard] modelId:', modelId)
  try {
    // 调 storyboard-generator 的 fill 方法
    console.log('[handleFillStoryboard] 开始调用EpisodeStoryboardGenerator...')
    const { EpisodeStoryboardGenerator } = await import('@core/modules/episode-production/narrative/ai/storyboard-generator')
    const result = await EpisodeStoryboardGenerator.getInstance().fillStoryboardFields(
      fillInput,
      providerConfigId,
      modelId
    )
    console.log('[handleFillStoryboard] AI返回结果:', JSON.stringify(result))
    return { success: true, data: result }
  } catch (error: any) {
    console.log('[handleFillStoryboard] 错误:', error.message)
    return { success: false, error: error.message || 'AI 填充失败' }
  }
}
