/**
 * 剧集制作 IPC 处理器
 * @module ipc/handlers/story-to-video
 * @description 处理剧集制作相关的 IPC 请求
 */

import { ipcMain, BrowserWindow, app } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { DatabaseManager } from '../../database/index'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  VideoProject,
  VideoProjectConfig,
  VideoEpisode,
  EpisodeScript,
  SceneScript,
  Storyboard,
  CharacterBinding
} from '@shared/types/story-to-video.types'
import { StoryToVideoAIService } from '@core/services/story-to-video-ai.service'
import { StoryToVideoResourceService, PRESET_STYLES } from '@core/services/story-to-video-resource.service'
import { VideoSynthesisService, PRESET_VIDEO_CONFIGS } from '@core/services/video-synthesis.service'
import { VideoService } from '@core/services/video.service'
import { SecureStorageService } from '../../services/secure-storage.service'
import { createVideoProvider } from '@core/video-providers'
import { EpisodeAutoBindingService } from '@core/services/episode-auto-binding.service'
import { UploadedEntityService } from '@core/services/uploaded-entity.service'
import type {
  UploadedCharacter,
  UploadedLocation,
  UploadedItem
} from '@shared/types/story-to-video.types'

/**
 * 将本地路径转换为 local-image URL
 */
function localPathToUrl(filePath: string): string {
  if (!filePath) return ''
  // 统一使用正斜杠
  const normalizedPath = filePath.replace(/\\/g, '/')
  return `local-image:///${normalizedPath}`
}

/**
 * 注册剧集制作相关 IPC 处理器
 */
export function registerStoryToVideoHandlers(): void {
  // ==================== 项目管理 ====================
  ipcMain.handle('stv:list-projects', handleListProjects)
  ipcMain.handle('stv:get-project', handleGetProject)
  ipcMain.handle('stv:create-project', handleCreateProject)
  ipcMain.handle('stv:update-project', handleUpdateProject)
  ipcMain.handle('stv:delete-project', handleDeleteProject)

  // ==================== 角色绑定 ====================
  ipcMain.handle('stv:get-character-bindings', handleGetCharacterBindings)
  ipcMain.handle('stv:bind-character', handleBindCharacter)
  ipcMain.handle('stv:update-character-binding', handleUpdateCharacterBinding)
  ipcMain.handle('stv:delete-character-binding', handleDeleteCharacterBinding)

  // ==================== 地点绑定 ====================
  ipcMain.handle('stv:get-location-bindings', handleGetLocationBindings)
  ipcMain.handle('stv:bind-location', handleBindLocation)
  ipcMain.handle('stv:update-location-binding', handleUpdateLocationBinding)
  ipcMain.handle('stv:delete-location-binding', handleDeleteLocationBinding)

  // ==================== 物品绑定 ====================
  ipcMain.handle('stv:get-item-bindings', handleGetItemBindings)
  ipcMain.handle('stv:bind-item', handleBindItem)
  ipcMain.handle('stv:update-item-binding', handleUpdateItemBinding)
  ipcMain.handle('stv:delete-item-binding', handleDeleteItemBinding)

  // ==================== 剧集管理 ====================
  ipcMain.handle('stv:list-episodes', handleListEpisodes)
  ipcMain.handle('stv:get-episode', handleGetEpisode)
  ipcMain.handle('stv:create-episode', handleCreateEpisode)
  ipcMain.handle('stv:update-episode', handleUpdateEpisode)
  ipcMain.handle('stv:delete-episode', handleDeleteEpisode)

  // ==================== 剧本管理 ====================
  ipcMain.handle('stv:get-script', handleGetScript)
  ipcMain.handle('stv:update-script', handleUpdateScript)

  // ==================== 场景管理 ====================
  ipcMain.handle('stv:list-scenes', handleListScenes)
  ipcMain.handle('stv:get-scene', handleGetScene)
  ipcMain.handle('stv:update-scene', handleUpdateScene)

  // ==================== 分镜管理 ====================
  ipcMain.handle('stv:list-storyboards', handleListStoryboards)
  ipcMain.handle('stv:get-storyboard', handleGetStoryboard)
  ipcMain.handle('stv:update-storyboard', handleUpdateStoryboard)

  // ==================== AI 生成 ====================
  ipcMain.handle('stv:generate-script', handleGenerateScript)
  ipcMain.handle('stv:generate-scenes', handleGenerateScenes)
  ipcMain.handle('stv:generate-storyboard', handleGenerateStoryboard)
  ipcMain.handle('stv:generate-storyboards', handleGenerateStoryboards)

  // ==================== 资源生成 ====================
  ipcMain.handle('stv:get-style-presets', handleGetStylePresets)
  ipcMain.handle('stv:generate-storyboard-image', handleGenerateStoryboardImage)
  ipcMain.handle('stv:generate-scene-images', handleGenerateSceneImages)
  ipcMain.handle('stv:generate-audio', handleGenerateAudio)

  // ==================== 视频合成 ====================
  ipcMain.handle('stv:get-video-presets', handleGetVideoPresets)
  ipcMain.handle('stv:synthesize-scene-video', handleSynthesizeSceneVideo)
  ipcMain.handle('stv:synthesize-storyboard-video', handleSynthesizeStoryboardVideo)
  ipcMain.handle('stv:export-video', handleExportVideo)

  // ==================== 上传模式实体管理 ====================
  ipcMain.handle('stv:get-uploaded-entity', handleGetUploadedEntity)
  ipcMain.handle('stv:update-uploaded-entity', handleUpdateUploadedEntity)
  ipcMain.handle('stv:delete-uploaded-entity', handleDeleteUploadedEntity)
  ipcMain.handle('stv:is-binding-from-longwriting', handleIsBindingFromLongWriting)
}

// ==================== 项目管理处理器 ====================

async function handleListProjects(
  _event: IpcMainInvokeEvent,
  longWritingProjectId?: string
): Promise<IpcResponse> {
  try {
    console.log('[StoryToVideoHandler] handleListProjects 被调用, longWritingProjectId:', longWritingProjectId)
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      console.error('[StoryToVideoHandler] videoProjects 仓库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    const projects = longWritingProjectId
      ? await db.videoProjects.getByLongWritingProjectId(longWritingProjectId)
      : await db.videoProjects.getAll()

    console.log('[StoryToVideoHandler] 查询到的项目数量:', projects.length)
    console.log('[StoryToVideoHandler] 项目列表:', JSON.stringify(projects, null, 2))

    return { success: true, data: projects }
  } catch (error: any) {
    console.error('[StoryToVideoHandler] 错误:', error)
    return { success: false, error: error.message || '获取项目列表失败' }
  }
}

async function handleGetProject(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = await db.videoProjects.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    return { success: true, data: project }
  } catch (error: any) {
    return { success: false, error: error.message || '获取项目失败' }
  }
}

async function handleCreateProject(
  _event: IpcMainInvokeEvent,
  name: string,
  longWritingProjectId: string | undefined,
  config: VideoProjectConfig
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = await db.videoProjects.create({
      name,
      longWritingProjectId: longWritingProjectId || undefined,  // 空字符串转为 undefined
      config
    })

    return { success: true, data: project }
  } catch (error: any) {
    return { success: false, error: error.message || '创建项目失败' }
  }
}

async function handleUpdateProject(
  _event: IpcMainInvokeEvent,
  projectId: string,
  data: { name?: string; status?: string; config?: VideoProjectConfig; longWritingProjectId?: string }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = await db.videoProjects.update(projectId, data)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    return { success: true, data: project }
  } catch (error: any) {
    return { success: false, error: error.message || '更新项目失败' }
  }
}

async function handleDeleteProject(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.videoProjects.delete(projectId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除项目失败' }
  }
}

// ==================== 角色绑定处理器 ====================

async function handleGetCharacterBindings(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
  projectId: string,
  longWritingCharacterId: string,
  portraitId: string | undefined,
  voiceConfig: CharacterBinding['voiceConfig'],
  generateConfig?: CharacterBinding['generateConfig']
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
  bindingId: string,
  data: {
    portraitId?: string | null
    voiceConfig?: CharacterBinding['voiceConfig']
    generateConfig?: CharacterBinding['generateConfig'] | null
  }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
  bindingId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.characterBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除角色绑定失败' }
  }
}

// ==================== 地点绑定处理器 ====================

async function handleGetLocationBindings(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const bindings = await db.locationBindings.getByProjectId(projectId)
    return { success: true, data: bindings }
  } catch (error: any) {
    return { success: false, error: error.message || '获取地点绑定列表失败' }
  }
}

async function handleBindLocation(
  _event: IpcMainInvokeEvent,
  projectId: string,
  longWritingLocationId: string,
  locationName: string,
  imagePaths?: string[],
  generateConfig?: any,
  generateImages?: boolean
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 检查是否已存在绑定
    const existing = await db.locationBindings.getByLongWritingLocationId(projectId, longWritingLocationId)

    if (existing) {
      // 更新现有绑定
      const updated = await db.locationBindings.update(existing.id, {
        imagePaths,
        generateConfig,
        generateImages
      })
      return { success: true, data: updated }
    }

    // 创建新绑定
    const binding = await db.locationBindings.create({
      projectId,
      longWritingLocationId,
      locationName,
      imagePaths,
      generateConfig,
      generateImages
    })
    return { success: true, data: binding }
  } catch (error: any) {
    return { success: false, error: error.message || '绑定地点失败' }
  }
}

async function handleUpdateLocationBinding(
  _event: IpcMainInvokeEvent,
  bindingId: string,
  data: { imagePaths?: string[]; thumbnailPath?: string | null; generateConfig?: any | null; generateImages?: boolean }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const updated = await db.locationBindings.update(bindingId, data)
    if (!updated) {
      return { success: false, error: '地点绑定不存在' }
    }
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message || '更新地点绑定失败' }
  }
}

async function handleDeleteLocationBinding(
  _event: IpcMainInvokeEvent,
  bindingId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.locationBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.locationBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除地点绑定失败' }
  }
}

// ==================== 物品绑定处理器 ====================

async function handleGetItemBindings(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const bindings = await db.itemBindings.getByProjectId(projectId)
    return { success: true, data: bindings }
  } catch (error: any) {
    return { success: false, error: error.message || '获取物品绑定列表失败' }
  }
}

async function handleBindItem(
  _event: IpcMainInvokeEvent,
  projectId: string,
  longWritingItemId: string,
  itemName: string,
  imagePaths?: string[],
  generateConfig?: any,
  generateImages?: boolean
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 检查是否已存在绑定
    const existing = await db.itemBindings.getByLongWritingItemId(projectId, longWritingItemId)

    if (existing) {
      // 更新现有绑定
      const updated = await db.itemBindings.update(existing.id, {
        imagePaths,
        generateConfig,
        generateImages
      })
      return { success: true, data: updated }
    }

    // 创建新绑定
    const binding = await db.itemBindings.create({
      projectId,
      longWritingItemId,
      itemName,
      imagePaths,
      generateConfig,
      generateImages
    })
    return { success: true, data: binding }
  } catch (error: any) {
    return { success: false, error: error.message || '绑定物品失败' }
  }
}

async function handleUpdateItemBinding(
  _event: IpcMainInvokeEvent,
  bindingId: string,
  data: { imagePaths?: string[]; thumbnailPath?: string | null; generateConfig?: any | null; generateImages?: boolean }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const updated = await db.itemBindings.update(bindingId, data)
    if (!updated) {
      return { success: false, error: '物品绑定不存在' }
    }
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message || '更新物品绑定失败' }
  }
}

async function handleDeleteItemBinding(
  _event: IpcMainInvokeEvent,
  bindingId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.itemBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.itemBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除物品绑定失败' }
  }
}

// ==================== 剧集管理处理器 ====================

async function handleListEpisodes(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IpcResponse> {
  try {
    console.log('[StoryToVideoHandler] handleListEpisodes 被调用, projectId:', projectId)
    const db = DatabaseManager.getInstance()
    if (!db.videoEpisodes) {
      console.error('[StoryToVideoHandler] videoEpisodes 仓库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    const episodes = await db.videoEpisodes.getByProjectId(projectId)
    console.log('[StoryToVideoHandler] 查询到的剧集数量:', episodes.length)
    console.log('[StoryToVideoHandler] 剧集列表:', JSON.stringify(episodes, null, 2))
    return { success: true, data: episodes }
  } catch (error: any) {
    console.error('[StoryToVideoHandler] 错误:', error)
    return { success: false, error: error.message || '获取剧集列表失败' }
  }
}

async function handleGetEpisode(
  _event: IpcMainInvokeEvent,
  episodeId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
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
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
  episodeId: string,
  data: {
    title?: string
    status?: string
    duration?: number
    scriptId?: string
  }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const episode = await db.videoEpisodes.update(episodeId, data)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    return { success: true, data: episode }
  } catch (error: any) {
    return { success: false, error: error.message || '更新剧集失败' }
  }
}

async function handleDeleteEpisode(
  _event: IpcMainInvokeEvent,
  episodeId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const success = await db.videoEpisodes.delete(episodeId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除剧集失败' }
  }
}

// ==================== 剧本管理处理器 ====================

async function handleGetScript(
  _event: IpcMainInvokeEvent,
  scriptId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.episodeScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    const script = await db.episodeScripts.getById(scriptId)
    if (!script) {
      return { success: false, error: '剧本不存在' }
    }

    return { success: true, data: script }
  } catch (error: any) {
    return { success: false, error: error.message || '获取剧本失败' }
  }
}

async function handleUpdateScript(
  _event: IpcMainInvokeEvent,
  scriptId: string,
  data: {
    synopsis?: string
    scriptContent?: string // 完整剧本正文
    scriptFormat?: string // 剧本格式类型
    scenes?: SceneScript[]
    totalDuration?: number
    characterAppearances?: string[]
    status?: string
  }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.episodeScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    const script = await db.episodeScripts.update(scriptId, data)
    if (!script) {
      return { success: false, error: '剧本不存在' }
    }

    return { success: true, data: script }
  } catch (error: any) {
    return { success: false, error: error.message || '更新剧本失败' }
  }
}

// ==================== 场景管理处理器 ====================

async function handleListScenes(
  _event: IpcMainInvokeEvent,
  episodeScriptId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    const scenes = await db.sceneScripts.getByEpisodeScriptId(episodeScriptId)
    return { success: true, data: scenes }
  } catch (error: any) {
    return { success: false, error: error.message || '获取场景列表失败' }
  }
}

async function handleGetScene(
  _event: IpcMainInvokeEvent,
  sceneId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    return { success: true, data: scene }
  } catch (error: any) {
    return { success: false, error: error.message || '获取场景失败' }
  }
}

async function handleUpdateScene(
  _event: IpcMainInvokeEvent,
  sceneId: string,
  data: Partial<SceneScript>
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    const scene = await db.sceneScripts.update(sceneId, data)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    return { success: true, data: scene }
  } catch (error: any) {
    return { success: false, error: error.message || '更新场景失败' }
  }
}

// ==================== 分镜管理处理器 ====================

async function handleListStoryboards(
  _event: IpcMainInvokeEvent,
  sceneScriptId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
  storyboardId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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
  _event: IpcMainInvokeEvent,
  storyboardId: string,
  data: Partial<Storyboard>
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
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

// ==================== AI 生成处理器 ====================

async function handleGenerateScript(
  _event: IpcMainInvokeEvent,
  episodeId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects || !db.videoEpisodes || !db.episodeScripts || !db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取剧集信息
    const episode = await db.videoEpisodes.getById(episodeId)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    // 获取项目信息
    const project = await db.videoProjects.getById(episode.projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    let chapterContent = ''
    let characters: Array<{ id: string; name: string; description?: string }> = []

    // 根据来源类型获取内容和角色
    if (episode.sourceType === 'uploaded') {
      // 上传长文模式：使用上传的内容
      chapterContent = episode.uploadedContent || ''

      // 如果还没有识别角色，先识别
      if (!episode.uploadedCharacters || episode.uploadedCharacters.length === 0) {
        const aiService = StoryToVideoAIService.getInstance()
        const identifiedChars = await aiService.identifyCharacters(
          chapterContent,
          providerConfigId,
          modelId
        )

        // 更新剧集的角色信息
        await db.videoEpisodes.update(episodeId, { uploadedCharacters: identifiedChars })
        episode.uploadedCharacters = identifiedChars
      }

      // 使用识别的角色
      characters = (episode.uploadedCharacters || []).map((char, index) => ({
        id: `uploaded_char_${index}`,
        name: char.name,
        description: char.description || ''
      }))
    } else {
      // 关联章节模式：从长文项目中获取内容
      const outlineId = episode.outlineId
      if (!outlineId) {
        return { success: false, error: '剧集未关联大纲节点' }
      }

      if (project.longWritingProjectId) {
        const outline = db.lwOutlines?.getById(outlineId)
        if (outline) {
          // 根据节点类型获取内容
          if (outline.nodeType === 'section') {
            // 节级别：直接获取内容
            const chapter = db.lwChapters?.getByOutlineId(outlineId)
            if (chapter && chapter.content) {
              chapterContent = chapter.content
            }
          } else if (outline.nodeType === 'chapter') {
            // 章级别：获取所有子节的内容
            const sections = db.lwOutlines?.getChildren(outlineId) || []
            const contents: string[] = []
            for (const section of sections) {
              if (section.nodeType === 'section') {
                const chapter = db.lwChapters?.getByOutlineId(section.id)
                if (chapter && chapter.content) {
                  contents.push(`【${section.name}】\n${chapter.content}`)
                }
              }
            }
            chapterContent = contents.join('\n\n')
          } else if (outline.nodeType === 'volume') {
            // 卷级别：获取所有章和节的内容
            const chapters = db.lwOutlines?.getChildren(outlineId) || []
            const contents: string[] = []
            for (const chapterNode of chapters) {
              const sections = db.lwOutlines?.getChildren(chapterNode.id) || []
              for (const section of sections) {
                if (section.nodeType === 'section') {
                  const chapter = db.lwChapters?.getByOutlineId(section.id)
                  if (chapter && chapter.content) {
                    contents.push(`【${chapterNode.name} - ${section.name}】\n${chapter.content}`)
                  }
                }
              }
            }
            chapterContent = contents.join('\n\n')
          }
        }
      }

      if (!chapterContent) {
        return { success: false, error: '未找到章节内容，请先在长文写作中完成章节内容' }
      }

      // 获取角色列表
      if (project.longWritingProjectId) {
        const chars = db.characters?.getByProjectId(project.longWritingProjectId) || []
        for (const char of chars) {
          characters.push({
            id: char.id,
            name: char.name,
            description: char.description || char.appearance
          })
        }
      }
    }

    // 调用 AI 生成剧本（完整剧本模式）
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.generateFullScript(
      chapterContent,
      characters,
      providerConfigId,
      modelId
    )

    // 创建或更新剧本
    const existingScript = await db.episodeScripts.getByEpisodeId(episode.id)

    let script: any
    if (existingScript) {
      // 更新现有剧本
      script = await db.episodeScripts.update(existingScript.id, {
        synopsis: result.synopsis,
        scriptContent: result.scriptContent,
        scriptFormat: 'standard',
        status: 'reviewing'
      })
    } else {
      // 创建新剧本
      script = await db.episodeScripts.create({
        projectId: episode.projectId,
        episodeId: episode.id,
        outlineId: episode.outlineId,
        synopsis: result.synopsis,
        scriptContent: result.scriptContent,
        scriptFormat: 'standard'
      })

      // 更新剧本状态
      script = await db.episodeScripts.update(script.id, { status: 'reviewing' })

      // 更新剧集的 scriptId
      await db.videoEpisodes.update(episode.id, { scriptId: script.id })
    }

    // 删除旧场景（如果有）
    if (existingScript) {
      await db.sceneScripts.deleteByEpisodeScriptId(existingScript.id)
    }

    // 创建场景
    const sceneRecords: SceneScript[] = []
    for (const sceneData of result.scenes) {
      const sceneRecord = await db.sceneScripts.create({
        episodeScriptId: script.id,
        sceneNumber: sceneData.sceneNumber,
        location: sceneData.location,
        locationType: sceneData.locationType,
        timeOfDay: sceneData.timeOfDay as any,
        weather: sceneData.weather as any,
        sceneDescription: sceneData.sceneDescription,
        mood: sceneData.mood,
        lighting: sceneData.lighting,
        characters: sceneData.characters,
        originalText: sceneData.originalText,
        narration: sceneData.narration,
        dialogues: sceneData.dialogues,
        actions: sceneData.actions
      })
      sceneRecords.push(sceneRecord)
    }

    return {
      success: true,
      data: {
        script,
        scenes: sceneRecords
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message || '生成剧本失败' }
  }
}

async function handleGenerateScenes(
  _event: IpcMainInvokeEvent,
  scriptId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.episodeScripts || !db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取剧本
    const script = await db.episodeScripts.getById(scriptId)
    if (!script) {
      return { success: false, error: '剧本不存在' }
    }

    // 获取章节内容
    let chapterContent = ''
    // 这里需要根据 outlineId 获取章节内容
    // 暂时使用 synopsis 作为内容
    chapterContent = script.synopsis

    // 调用 AI 拆分场景
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.splitScenes(chapterContent, providerConfigId, modelId)

    // 创建场景记录
    const sceneRecords: SceneScript[] = []
    for (const sceneData of result.scenes) {
      const sceneRecord = await db.sceneScripts.create({
        episodeScriptId: scriptId,
        sceneNumber: sceneData.sceneNumber,
        location: sceneData.location,
        locationType: sceneData.locationType,
        timeOfDay: sceneData.timeOfDay as any,
        weather: sceneData.weather as any,
        sceneDescription: sceneData.sceneDescription,
        mood: sceneData.mood,
        characters: sceneData.characters.map((name: string) => ({
          characterId: '',
          characterName: name
        })),
        originalText: sceneData.originalText,
        narration: sceneData.narration,
        dialogues: sceneData.dialogues.map((d: any, index: number) => ({
          id: `dlg_${index}`,
          characterId: '',
          characterName: d.character,
          text: d.text,
          emotion: d.emotion
        })),
        actions: []
      })
      sceneRecords.push(sceneRecord)
    }

    return { success: true, data: sceneRecords }
  } catch (error: any) {
    return { success: false, error: error.message || '拆分场景失败' }
  }
}

async function handleGenerateStoryboard(
  event: IpcMainInvokeEvent,
  sceneId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts || !db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取窗口用于发送进度事件
    const window = BrowserWindow.fromWebContents(event.sender)

    // 调用 AI 生成分镜（使用逐个生成模式）
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.generateStoryboardsIncremental(
      scene,
      providerConfigId,
      modelId,
      (shotNumber, total, storyboard) => {
        // 发送进度事件
        if (window) {
          window.webContents.send('stv:storyboard-progress', {
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
  event: IpcMainInvokeEvent,
  scriptId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts || !db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取所有场景
    const scenes = await db.sceneScripts.getByEpisodeScriptId(scriptId)
    if (scenes.length === 0) {
      return { success: false, error: '没有场景，请先生成场景' }
    }

    // 获取窗口用于发送进度事件
    const window = BrowserWindow.fromWebContents(event.sender)

    // 调用 AI 批量生成分镜（使用逐个分镜生成模式）
    const aiService = StoryToVideoAIService.getInstance()
    const results = await aiService.generateStoryboards(
      scenes,
      providerConfigId,
      modelId,
      (sceneIndex, total, shotProgress) => {
        // 发送进度事件
        if (window) {
          window.webContents.send('stv:storyboards-progress', {
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

// ==================== 资源生成处理器 ====================

async function handleGetStylePresets(): Promise<IpcResponse> {
  try {
    const presets = Object.keys(PRESET_STYLES).map(key => ({
      id: key,
      name: getStyleName(key),
      config: PRESET_STYLES[key]
    }))
    return { success: true, data: presets }
  } catch (error: any) {
    return { success: false, error: error.message || '获取风格预设失败' }
  }
}

function getStyleName(key: string): string {
  const names: Record<string, string> = {
    cinematic: '电影风格',
    anime: '动漫风格',
    realistic: '写实风格',
    fantasy: '奇幻风格',
    ancient_chinese: '古风仙侠'
  }
  return names[key] || key
}

async function handleGenerateStoryboardImage(
  event: IpcMainInvokeEvent,
  storyboardId: string,
  styleName: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    console.log('[handleGenerateStoryboardImage] 参数:', {
      storyboardId,
      styleName,
      providerConfigId,
      modelId
    })

    const db = DatabaseManager.getInstance()
    if (!db.storyboards || !db.sceneScripts || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取分镜
    const storyboard = await db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(storyboard.sceneScriptId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取角色绑定（需要从项目获取）
    const characterBindings: CharacterBinding[] = []
    const locationBindings: any[] = []
    // 通过 episodeScript -> episode -> project 获取
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          const charBindings = await db.characterBindings.getByProjectId(episode.projectId)
          characterBindings.push(...charBindings)

          // 获取地点绑定
          if (db.locationBindings) {
            const locBindings = await db.locationBindings.getByProjectId(episode.projectId)
            locationBindings.push(...locBindings)
          }
        }
      }
    }

    // 获取窗口
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 调用资源生成服务
    const resourceService = StoryToVideoResourceService.getInstance()
    const imageAsset = await resourceService.generateStoryboardImage(
      storyboard,
      scene,
      characterBindings,
      locationBindings,
      styleName,
      providerConfigId,
      modelId
    )

    if (imageAsset) {
      // 更新分镜的图片
      const updatedStoryboard = await db.storyboards.update(storyboardId, {
        frameImage: imageAsset,
        status: 'image_ready'
      })
      return { success: true, data: updatedStoryboard }
    }

    console.error('[handleGenerateStoryboardImage] 图像生成返回空结果')
    return { success: false, error: '生成图像失败，请检查模型配置是否正确' }
  } catch (error: any) {
    console.error('[handleGenerateStoryboardImage] 异常:', error)
    return { success: false, error: error.message || '生成分镜图像失败' }
  }
}

async function handleGenerateSceneImages(
  event: IpcMainInvokeEvent,
  sceneId: string,
  styleName: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.storyboards || !db.sceneScripts || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取分镜列表
    const storyboards = await db.storyboards.getBySceneScriptId(sceneId)
    if (storyboards.length === 0) {
      return { success: false, error: '该场景没有分镜' }
    }

    // 获取角色绑定和地点绑定
    const characterBindings: CharacterBinding[] = []
    const locationBindings: any[] = []
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          const charBindings = await db.characterBindings.getByProjectId(episode.projectId)
          characterBindings.push(...charBindings)

          // 获取地点绑定
          if (db.locationBindings) {
            const locBindings = await db.locationBindings.getByProjectId(episode.projectId)
            locationBindings.push(...locBindings)
          }
        }
      }
    }

    // 获取窗口
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 调用资源生成服务批量生成
    const resourceService = StoryToVideoResourceService.getInstance()
    const results = await resourceService.generateStoryboardImages(
      storyboards,
      scene,
      characterBindings,
      locationBindings,
      styleName,
      providerConfigId,
      modelId,
      (index, total) => {
        // 发送进度事件
        window.webContents.send('stv:image-progress', {
          sceneId,
          index,
          total
        })
      }
    )

    // 更新分镜记录
    const updatedStoryboards: Storyboard[] = []
    for (const [storyboardId, imageAsset] of results) {
      const updated = await db.storyboards.update(storyboardId, {
        frameImage: imageAsset,
        status: 'image_ready'
      })
      if (updated) {
        updatedStoryboards.push(updated)
      }
    }

    return { success: true, data: updatedStoryboards }
  } catch (error: any) {
    return { success: false, error: error.message || '批量生成场景图像失败' }
  }
}

async function handleGenerateAudio(
  event: IpcMainInvokeEvent,
  sceneId: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取窗口
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取角色绑定
    const characterBindings: CharacterBinding[] = []
    let projectId = ''
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          projectId = episode.projectId
          const bindings = await db.characterBindings.getByProjectId(projectId)
          characterBindings.push(...bindings)
        }
      }
    }

    // 获取项目资源目录
    const userDataPath = app.getPath('userData')
    const outputDir = path.join(userDataPath, 'story-to-video', projectId, 'audio')

    // 调用资源生成服务
    const resourceService = StoryToVideoResourceService.getInstance()
    const result = await resourceService.generateSceneAudio(
      scene,
      characterBindings,
      outputDir,
      (type, index, total) => {
        // 发送进度事件
        window.webContents.send('stv:audio-progress', {
          sceneId,
          type,
          index,
          total
        })
      }
    )

    // 更新数据库中的 dialogues，将音频资产信息写入
    if (result.dialoguePaths.size > 0 || result.narrationPath) {
      // 深拷贝 dialogues 避免修改原对象
      const updatedDialogues = JSON.parse(JSON.stringify(scene.dialogues))

      // 更新每个对话的 audioAsset
      for (const [dialogueId, audioPath] of result.dialoguePaths) {
        const dialogueIndex = updatedDialogues.findIndex((d: any) => d.id === dialogueId)
        if (dialogueIndex !== -1) {
          updatedDialogues[dialogueIndex].audioAsset = {
            id: `audio_${dialogueId}_${Date.now()}`,
            type: 'dialogue',
            text: updatedDialogues[dialogueIndex].text,
            audioPath: audioPath
          }
        }
      }

      // 更新场景的 dialogues 字段
      await db.sceneScripts.update(sceneId, { dialogues: updatedDialogues })
    }

    return {
      success: true,
      data: {
        narrationPath: result.narrationPath,
        dialogueCount: result.dialoguePaths.size
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message || '生成音频失败' }
  }
}

// ==================== 视频合成处理器 ====================

async function handleGetVideoPresets(): Promise<IpcResponse> {
  try {
    const presets = Object.keys(PRESET_VIDEO_CONFIGS).map(key => ({
      id: key,
      name: getVideoPresetName(key),
      config: PRESET_VIDEO_CONFIGS[key]
    }))
    return { success: true, data: presets }
  } catch (error: any) {
    return { success: false, error: error.message || '获取视频预设失败' }
  }
}

function getVideoPresetName(key: string): string {
  const names: Record<string, string> = {
    standard: '标准 (1080p 30fps)',
    high: '高清 (1080p 30fps 高码率)',
    low: '流畅 (720p 24fps)',
    vertical: '竖屏 (1080x1920)'
  }
  return names[key] || key
}

async function handleSynthesizeSceneVideo(
  event: IpcMainInvokeEvent,
  sceneId: string,
  quality: string = 'standard'
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.sceneScripts || !db.storyboards || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取窗口
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取分镜
    const storyboards = await db.storyboards.getBySceneScriptId(sceneId)
    if (storyboards.length === 0) {
      return { success: false, error: '场景没有分镜' }
    }

    // 检查分镜是否都有图片
    const missingImages = storyboards.filter(sb => !sb.frameImage)
    if (missingImages.length > 0) {
      return { success: false, error: `有 ${missingImages.length} 个分镜没有图片，请先生成图片` }
    }

    // 获取项目 ID
    let projectId = ''
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          projectId = episode.projectId
        }
      }
    }

    if (!projectId) {
      return { success: false, error: '无法获取项目信息' }
    }

    // 获取音频资产
    const userDataPath = app.getPath('userData')
    const audioDir = path.join(userDataPath, 'story-to-video', projectId, 'audio')
    const audioAssets = new Map<string, string>()

    // 收集音频文件
    if (fs.existsSync(audioDir)) {
      const audioFiles = fs.readdirSync(audioDir)
      for (const file of audioFiles) {
        if (file.endsWith('.wav') || file.endsWith('.mp3')) {
          // 根据文件名判断是旁白还是对话
          if (file.startsWith('narration')) {
            audioAssets.set('narration', path.join(audioDir, file))
          } else if (file.startsWith('dialogue')) {
            // 尝试从文件名提取分镜 ID
            // 文件名格式: dialogue_{characterId}_{timestamp}.wav
            // 暂时简单处理
            audioAssets.set(file, path.join(audioDir, file))
          }
        }
      }
    }

    // 获取视频配置
    const videoConfig = PRESET_VIDEO_CONFIGS[quality] || PRESET_VIDEO_CONFIGS.standard

    // 调用视频合成服务
    const synthesisService = VideoSynthesisService.getInstance()
    const result = await synthesisService.synthesizeSceneVideo(
      storyboards,
      scene,
      projectId,
      sceneId,
      audioAssets,
      videoConfig,
      (phase, progress) => {
        // 发送进度事件
        window.webContents.send('stv:synthesis-progress', {
          sceneId,
          phase,
          progress
        })
      }
    )

    if (result.success) {
      return {
        success: true,
        data: {
          outputPath: result.outputPath,
          duration: result.duration
        }
      }
    }

    return { success: false, error: result.error || '视频合成失败' }
  } catch (error: any) {
    return { success: false, error: error.message || '视频合成失败' }
  }
}

/**
 * 处理合成单个分镜视频
 * 使用 AI 视频生成（图生视频）
 */
async function handleSynthesizeStoryboardVideo(
  event: IpcMainInvokeEvent,
  storyboardId: string,
  quality: string = 'standard'
): Promise<IpcResponse> {
  try {
    // 获取窗口
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const db = DatabaseManager.getInstance()

    // 获取分镜信息
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }
    const storyboard = await db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    // 检查分镜是否有画面
    if (!storyboard.frameImage) {
      return { success: false, error: '分镜没有画面，请先生成画面' }
    }

    // 获取场景信息以获取项目ID
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }
    const scene = await db.sceneScripts.getById(storyboard.sceneScriptId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取剧本信息以获取项目ID
    if (!db.episodeScripts) {
      return { success: false, error: '数据库未初始化' }
    }
    const script = await db.episodeScripts.getById(scene.episodeScriptId)
    if (!script) {
      return { success: false, error: '剧本不存在' }
    }
    const projectId = script.projectId

    // 获取项目配置
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }
    const project = await db.videoProjects.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    // 解析项目配置
    let projectConfig: VideoProjectConfig
    try {
      projectConfig = typeof project.config === 'string'
        ? JSON.parse(project.config)
        : project.config
    } catch {
      return { success: false, error: '项目配置解析失败' }
    }

    // 检查是否配置了视频模型
    if (!projectConfig.videoModel || !projectConfig.videoModel.providerConfigId) {
      return { success: false, error: '未配置视频生成模型，请在项目设置中选择视频模型' }
    }

    // 获取分镜图片路径
    const imagePath = storyboard.frameImage.filePath || storyboard.frameImage.url

    // 构建视频生成请求
    const videoRequest: any = {
      providerConfigId: projectConfig.videoModel.providerConfigId,
      model: projectConfig.videoModel.modelId,
      prompt: storyboard.frameDescription || `镜头 ${storyboard.shotNumber} 的动态画面`,
      duration: storyboard.duration || 5,
      aspectRatio: projectConfig.aspectRatio || '16:9'
    }

    // 如果有图片，传递给视频服务（百炼 Provider 会自动处理本地文件上传）
    if (imagePath) {
      videoRequest.image = imagePath
      console.log('[handleSynthesizeStoryboardVideo] 传递图片路径给视频服务:', imagePath.substring(0, 100))
    }

    console.log('[handleSynthesizeStoryboardVideo] 调用 AI 视频生成:', {
      storyboardId,
      model: videoRequest.model,
      duration: videoRequest.duration,
      hasImage: !!imagePath
    })

    // 获取 Provider 配置
    const providerConfig = await db.providerConfigs.getById(projectConfig.videoModel.providerConfigId)
    if (!providerConfig) {
      return { success: false, error: '视频模型配置不存在' }
    }

    // 解密 API 密钥
    const secureStorage = SecureStorageService.getInstance()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)

    // 确定 Provider 类型
    let providerType = providerConfig.templateId.replace('video-', '') as string
    if (providerType === 'bailian' || providerType === 'dashscope' || providerType === 'qwen') {
      providerType = 'bailian'
    }

    // 创建 Provider 实例
    const provider = createVideoProvider(providerType as any, {
      id: providerConfig.id,
      apiKey: decryptedApiKey,
      baseUrl: providerConfig.baseUrl,
      customHeaders: providerConfig.customHeaders,
      customParams: providerConfig.customParams
    })

    // 调用 AI 视频生成服务
    const result = await VideoService.generateVideo(videoRequest)

    if (result.success) {
      // 同步模式：直接返回了视频
      if (result.video?.localPath || result.video?.url) {
        const videoPath = result.video.localPath || result.video.url
        // 更新分镜的 videoPath
        await db.storyboards.update(storyboardId, { videoPath })

        return {
          success: true,
          data: {
            outputPath: videoPath,
            duration: result.video.duration || storyboard.duration
          }
        }
      }

      // 异步模式：等待任务完成
      if (result.taskId) {
        console.log('[handleSynthesizeStoryboardVideo] 异步任务已创建，等待完成:', result.taskId)

        // 等待任务完成（最多 5 分钟）
        const taskStatus = await VideoService.waitForTaskCompletion(provider, result.taskId, 5 * 60 * 1000)

        if (taskStatus.status === 'completed' && taskStatus.video?.url) {
          console.log('[handleSynthesizeStoryboardVideo] 视频生成成功，下载中...')

          // 下载视频到本地
          const savedPath = await VideoService['saveVideoFromUrl'](taskStatus.video.url, videoRequest.model || 'unknown')

          if (savedPath) {
            const localUrl = localPathToUrl(savedPath)
            console.log('[handleSynthesizeStoryboardVideo] 视频保存成功:', savedPath)
            // 更新分镜的 videoPath
            await db.storyboards.update(storyboardId, { videoPath: savedPath })

            return {
              success: true,
              data: {
                outputPath: localUrl,
                duration: taskStatus.video.duration || storyboard.duration
              }
            }
          } else {
            // 下载失败，返回远程 URL
            // 更新分镜的 videoPath
            await db.storyboards.update(storyboardId, { videoPath: taskStatus.video.url })

            return {
              success: true,
              data: {
                outputPath: taskStatus.video.url,
                duration: taskStatus.video.duration || storyboard.duration
              }
            }
          }
        } else {
          // 任务失败
          return { success: false, error: taskStatus.error || '视频生成失败' }
        }
      }
    }

    return { success: false, error: result.error || '视频生成失败' }
  } catch (error: any) {
    console.error('[handleSynthesizeStoryboardVideo] 错误:', error)
    return { success: false, error: error.message || '视频生成失败' }
  }
}

async function handleExportVideo(
  event: IpcMainInvokeEvent,
  sourcePath: string,
  outputPath: string,
  quality: string = 'standard'
): Promise<IpcResponse> {
  try {
    // 获取窗口
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 检查源文件是否存在
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源视频不存在' }
    }

    // 调用导出服务
    const synthesisService = VideoSynthesisService.getInstance()
    const result = await synthesisService.exportVideo(sourcePath, outputPath, 'mp4', quality)

    if (result.success) {
      return { success: true, data: { outputPath: result.outputPath } }
    }

    return { success: false, error: result.error || '导出视频失败' }
  } catch (error: any) {
    return { success: false, error: error.message || '导出视频失败' }
  }
}

// ==================== 上传模式实体管理处理器 ====================

/**
 * 获取上传模式的实体详情
 */
async function handleGetUploadedEntity(
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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
  _event: IpcMainInvokeEvent,
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