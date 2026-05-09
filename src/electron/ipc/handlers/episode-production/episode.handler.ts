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

/**
 * 创建剧集。
 *
 * 设计：创建即返回，**不在创建阶段调 AI**。
 * - outline 模式：长文项目里的 binding 已存在，直接做无 AI 的关联绑定（autoBindEntities）。
 * - uploaded 模式：仅落库 uploadedContent；要素识别 / 剧本生成等 AI 工作由用户进入
 *   ① 内容 stage（StageContentScriptView，subState='pending'）后手动触发：
 *     - "AI 识别要素"  → ep:identify-uploaded-entities（handleIdentifyEntities）
 *     - "AI 生成剧本"  → ep:generate-script（依赖已识别的要素 roster）
 *
 * 这么设计的原因（顺手记一下，避免后续又被加回来）：
 * 1. 创建对话框拿不到 providerConfigId / modelId（项目级配置在 projectStore.scriptModel），
 *    历史在 createEpisode 里调 AI 实际是拿 undefined 调，必然失败，再被 try/catch 吞掉，
 *    用户白等 30s 还看不到失败原因。
 * 2. 要素识别和剧本生成有强耦合（剧本 prompt 把 roster 喂给 AI 输出 binding_id 引用）。
 *    把识别延后到内容 stage，用户能：单类型重识别、人工增删要素、确认后再生成剧本，
 *    避免"创建一次 = 一次性出全部要素"的不可控流程。
 */
async function handleCreateEpisode(
  _event: any,
  projectId: string,
  data: {
    sourceType: 'outline' | 'uploaded'
    outlineId?: string
    uploadedContent?: string
    episodeNumber: number
    title: string
    // ─── 故事背景（spec 2026-05-08）：创建时收集，后续在内容 stage 可改 ───
    storyEra?: string
    storyRegion?: string
    storyBackgroundExtra?: string
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
      // uploaded 模式：长文允许空（用户可在内容 stage 再粘贴）。
      // 一旦填了内容，仍校验字数中段（500-15000），保证 AI 识别要素时有足够上下文。
      if (data.uploadedContent && data.uploadedContent.length > 0) {
        const wordCount = data.uploadedContent.length
        if (wordCount < 500) {
          return { success: false, error: `字数不足，当前 ${wordCount} 字，最少需要 500 字` }
        }
        if (wordCount > 15000) {
          return { success: false, error: `字数超出限制，当前 ${wordCount} 字，最多允许 15000 字` }
        }
      }
    }

    console.log('[handleCreateEpisode] 创建剧集...')
    const episode = await db.videoEpisodes.create({
      projectId,
      sourceType: data.sourceType,
      outlineId: data.outlineId,
      uploadedContent: data.uploadedContent,
      episodeNumber: data.episodeNumber,
      title: data.title,
      storyEra: data.storyEra,
      storyRegion: data.storyRegion,
      storyBackgroundExtra: data.storyBackgroundExtra,
    })
    console.log('[handleCreateEpisode] 剧集创建成功:', episode.id)

    // outline 模式：长文项目里的 binding 已存在，直接做无 AI 的关联绑定。
    // uploaded 模式：在内容 stage 由用户手动触发 AI 识别（见上方 JSDoc）。
    if (data.sourceType === 'outline' && data.outlineId) {
      console.log('[handleCreateEpisode] outline 模式 → 自动绑定已有 binding...')
      const bindingResult = await EpisodeAutoBindingService.autoBindEntities(projectId, data.outlineId)
      console.log('[handleCreateEpisode] 自动绑定结果:', bindingResult)
    } else {
      console.log('[handleCreateEpisode] uploaded 模式 → 创建即返回，AI 识别延后到 ① 内容 stage')
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

    // uploaded 模式编辑原文：与 createEpisode 同口径——
    // 允许空（用户可清空原文）；填了内容则校验字数中段（500-15000，确保 AI 识别有足够上下文）
    if (typeof data.uploadedContent === 'string' && data.uploadedContent.length > 0) {
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
