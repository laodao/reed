/**
 * episode-production · 剧集管理 · IPC handler
 * @module electron/ipc/handlers/episode-production/episode.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { UpdateVideoEpisodeData } from '@shared/types/episode-production'
import { StoryToVideoAIService } from '@core/services/story-to-video-ai.service'
import { EpisodeAutoBindingService } from '@core/modules/episode-production/auto-binding/episode-auto-binding.service'
import { UploadedEntityService } from '@core/modules/episode-production/auto-binding/uploaded-entity.service'

export function registerEpisodeHandlers(): void {
  // ==================== 剧集管理 ====================
  ipcBridge.handle('ep:list-episodes', handleListEpisodes)
  ipcBridge.handle('ep:get-episode', handleGetEpisode)
  ipcBridge.handle('ep:create-episode', handleCreateEpisode)
  ipcBridge.handle('ep:update-episode', handleUpdateEpisode)
  ipcBridge.handle('ep:delete-episode', handleDeleteEpisode)
  // FU4-1 ① 内容 stage AI 识别要素
  ipcBridge.handle('ep:identify-uploaded-entities', handleIdentifyEntities)
  // FU5-B2 ① 内容 stage 整理 / 取舍（覆写三数组）
  ipcBridge.handle('ep:update-uploaded-entities', handleUpdateUploadedEntities)
}

async function handleUpdateUploadedEntities(
  _event: any,
  episodeId: string,
  payload: {
    uploadedCharacters?: any[]
    uploadedLocations?: any[]
    uploadedItems?: any[]
  },
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) return { success: false, error: '数据库未初始化' }
    const episode = await db.videoEpisodes.update(episodeId, {
      uploadedCharacters: payload.uploadedCharacters as any,
      uploadedLocations: payload.uploadedLocations as any,
      uploadedItems: payload.uploadedItems as any,
    } as any)
    if (!episode) return { success: false, error: '剧集不存在' }
    return { success: true, data: episode }
  } catch (e: any) {
    console.error('[handleUpdateUploadedEntities] 异常:', e)
    return { success: false, error: e?.message ?? '更新识别要素失败' }
  }
}

// ==================== FU4-1 AI 识别要素 ====================

type IdentifyKind = 'character' | 'location' | 'item'
const ALL_KINDS: readonly IdentifyKind[] = ['character', 'location', 'item']

async function handleIdentifyEntities(
  _event: any,
  episodeId: string,
  providerConfigId?: string,
  modelId?: string,
  kinds?: IdentifyKind[],
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) return { success: false, error: '数据库未初始化' }
    const episode = await db.videoEpisodes.getById(episodeId)
    if (!episode) return { success: false, error: '剧集不存在' }
    if (episode.sourceType !== 'uploaded' || !episode.uploadedContent) {
      return {
        success: false,
        error: '仅 uploaded 模式 + 有长文内容时可识别',
      }
    }
    if (!providerConfigId || !modelId) {
      return {
        success: false,
        error: '请先在项目设置中配置剧本生成模型（用于 AI 识别）',
      }
    }

    const targetKinds: IdentifyKind[] =
      Array.isArray(kinds) && kinds.length > 0
        ? ALL_KINDS.filter((k) => kinds.includes(k))
        : [...ALL_KINDS]
    if (targetKinds.length === 0) {
      return { success: false, error: 'kinds 参数无有效类型' }
    }

    const aiService = StoryToVideoAIService.getInstance()
    // 选定类型并行识别（spec §0.4 IdentifyEntities）
    const want = (k: IdentifyKind): boolean => targetKinds.includes(k)
    const [characters, locations, items] = await Promise.all([
      want('character')
        ? aiService.identifyCharacters(episode.uploadedContent, providerConfigId, modelId)
        : Promise.resolve(null),
      want('location')
        ? aiService.identifyLocations(episode.uploadedContent, providerConfigId, modelId)
        : Promise.resolve(null),
      want('item')
        ? aiService.identifyItems(episode.uploadedContent, providerConfigId, modelId)
        : Promise.resolve(null),
    ])

    // 仅为本次重识别的 kind 创建/绑定资产，避免误创建未受影响 kind 的重复资产
    await UploadedEntityService.createAndBindUploadedEntities(
      episode.projectId,
      episode.id,
      characters ?? [],
      locations ?? [],
      items ?? [],
    )

    // 写回 episode.uploadedX：未识别的 kind 保留原值
    const patch: Record<string, any> = {}
    if (characters !== null) patch.uploadedCharacters = characters
    if (locations !== null) patch.uploadedLocations = locations
    if (items !== null) patch.uploadedItems = items
    await db.videoEpisodes.update(episodeId, patch)

    // 返回最新三类计数（未受影响的回填现有值）
    return {
      success: true,
      data: {
        characters:
          characters?.length ??
          (Array.isArray(episode.uploadedCharacters) ? episode.uploadedCharacters.length : 0),
        locations:
          locations?.length ??
          (Array.isArray(episode.uploadedLocations) ? episode.uploadedLocations.length : 0),
        items:
          items?.length ??
          (Array.isArray(episode.uploadedItems) ? episode.uploadedItems.length : 0),
        kinds: targetKinds,
      },
    }
  } catch (e: any) {
    console.error('[handleIdentifyEntities] 异常:', e)
    return { success: false, error: e?.message ?? 'AI 识别失败' }
  }
}

// ==================== 剧集管理处理器 ====================

async function handleListEpisodes(
  _event: any,
  projectId: string
): Promise<IpcResponse> {
  try {
    console.log('[EpisodeProductionHandler] handleListEpisodes 被调用, projectId:', projectId)
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      console.error('[EpisodeProductionHandler] videoEpisodes 仓库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    const episodes = await db.videoEpisodes.getByProjectId(projectId)
    console.log('[EpisodeProductionHandler] 查询到的剧集数量:', episodes.length)
    console.log('[EpisodeProductionHandler] 剧集列表:', JSON.stringify(episodes, null, 2))
    return { success: true, data: episodes }
  } catch (error: any) {
    console.error('[EpisodeProductionHandler] 错误:', error)
    return { success: false, error: error.message || '获取剧集列表失败' }
  }
}

async function handleGetEpisode(
  _event: any,
  episodeId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const episode = await db.videoEpisodes.getById(episodeId)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    return { success: true, data: episode }
  } catch (error: any) {
    return { success: false, error: error.message || '获取剧集失败' }
  }
}

async function handleCreateEpisode(
  _event: any,
  projectId: string,
  data: {
    sourceType: 'outline' | 'uploaded'
    outlineId?: string
    uploadedContent?: string
    episodeNumber: number
    title: string
    providerConfigId?: string
    modelId?: string
  }
): Promise<IpcResponse> {
  console.log('[handleCreateEpisode] 收到请求:', { projectId, data })
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    // 验证参数
    if (data.sourceType === 'outline') {
      if (!data.outlineId) {
        return { success: false, error: '关联章节模式必须提供大纲ID' }
      }
    } else if (data.sourceType === 'uploaded') {
      if (!data.uploadedContent) {
        return { success: false, error: '上传长文模式必须提供内容' }
      }
      // 字数验证
      const wordCount = data.uploadedContent.length
      if (wordCount < 500) {
        return { success: false, error: `字数不足，当前 ${wordCount} 字，最少需要 500 字` }
      }
      if (wordCount > 15000) {
        return { success: false, error: `字数超出限制，当前 ${wordCount} 字，最多允许 15000 字` }
      }
    }

    console.log('[handleCreateEpisode] 创建剧集...')
    const episode = await db.videoEpisodes.create({
      projectId,
      sourceType: data.sourceType,
      outlineId: data.outlineId,
      uploadedContent: data.uploadedContent,
      episodeNumber: data.episodeNumber,
      title: data.title
    })
    console.log('[handleCreateEpisode] 剧集创建成功:', episode.id)

    // 如果是关联章节模式，自动绑定实体
    console.log('[handleCreateEpisode] 检查是否需要自动绑定:', { sourceType: data.sourceType, outlineId: data.outlineId })
    if (data.sourceType === 'outline' && data.outlineId) {
      console.log('[handleCreateEpisode] 开始自动绑定...')
      const bindingResult = await EpisodeAutoBindingService.autoBindEntities(projectId, data.outlineId)
      console.log('[handleCreateEpisode] 自动绑定结果:', bindingResult)
    } else if (data.sourceType === 'uploaded' && data.uploadedContent) {
      // 上传模式：AI识别实体并创建绑定
      console.log('[handleCreateEpisode] 开始AI识别实体...')
      try {
        const aiService = StoryToVideoAIService.getInstance()

        // 识别角色、地点、物品
        const characters = await aiService.identifyCharacters(
          data.uploadedContent,
          data.providerConfigId,
          data.modelId
        )
        const locations = await aiService.identifyLocations(
          data.uploadedContent,
          data.providerConfigId,
          data.modelId
        )
        const items = await aiService.identifyItems(
          data.uploadedContent,
          data.providerConfigId,
          data.modelId
        )

        console.log('[handleCreateEpisode] AI识别完成:', {
          characters: characters.length,
          locations: locations.length,
          items: items.length
        })

        // 创建实体并绑定
        const entityResult = await UploadedEntityService.createAndBindUploadedEntities(
          projectId,
          episode.id,
          characters,
          locations,
          items
        )
        console.log('[handleCreateEpisode] 实体创建完成:', entityResult)

        // 更新剧集记录，保存识别的实体信息
        await db.videoEpisodes.update(episode.id, {
          uploadedCharacters: characters,
          uploadedLocations: locations,
          uploadedItems: items
        })
      } catch (aiError: any) {
        console.error('[handleCreateEpisode] AI识别失败:', aiError)
        // AI识别失败不影响剧集创建，只记录日志
      }
    } else {
      console.log('[handleCreateEpisode] 跳过自动绑定')
    }

    return { success: true, data: episode }
  } catch (error: any) {
    console.error('[handleCreateEpisode] 创建剧集失败:', error)
    return { success: false, error: error.message || '创建剧集失败' }
  }
}

async function handleUpdateEpisode(
  _event: any,
  episodeId: string,
  data: UpdateVideoEpisodeData,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    // uploaded 模式编辑原文：做基本校验（与 createEpisode 同口径，避免脏数据）
    if (typeof data.uploadedContent === 'string') {
      const wc = data.uploadedContent.length
      if (wc < 500) {
        return { success: false, error: `原文字数不足，当前 ${wc} 字，最少需要 500 字` }
      }
      if (wc > 15000) {
        return { success: false, error: `原文字数超出限制，当前 ${wc} 字，最多允许 15000 字` }
      }
    }

    const episode = await db.videoEpisodes.update(episodeId, data as any)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    return { success: true, data: episode }
  } catch (error: any) {
    return { success: false, error: error.message || '更新剧集失败' }
  }
}

async function handleDeleteEpisode(
  _event: any,
  episodeId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.videoEpisodes.delete(episodeId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除剧集失败' }
  }
}
