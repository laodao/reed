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
import type { IpcResponse } from '../../../shared/types/ipc.types'
import {
  VideoProject,
  VideoProjectConfig,
  VideoEpisode,
  EpisodeScript,
  SceneScript,
  Storyboard,
  CharacterBinding
} from '../../../shared/types/story-to-video.types'
import { StoryToVideoAIService } from '../../services/story-to-video-ai.service'
import { StoryToVideoResourceService, PRESET_STYLES } from '../../services/story-to-video-resource.service'
import { VideoSynthesisService, PRESET_VIDEO_CONFIGS } from '../../services/video-synthesis.service'

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
  ipcMain.handle('stv:export-video', handleExportVideo)
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
      ? db.videoProjects.getByLongWritingProjectId(longWritingProjectId)
      : db.videoProjects.getAll()

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

    const project = db.videoProjects.getById(projectId)
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
  longWritingProjectId: string,
  config: VideoProjectConfig
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = db.videoProjects.create({
      name,
      longWritingProjectId,
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
  data: { name?: string; status?: string; config?: VideoProjectConfig }
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    const project = db.videoProjects.update(projectId, data)
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

    const success = db.videoProjects.delete(projectId)
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

    const bindings = db.characterBindings.getByProjectId(projectId)
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
    const existing = db.characterBindings.getByLongWritingCharacterId(
      projectId,
      longWritingCharacterId
    )

    if (existing) {
      // 更新现有绑定
      const updated = db.characterBindings.update(existing.id, {
        portraitId,
        voiceConfig,
        generateConfig
      })
      return { success: true, data: updated }
    }

    // 创建新绑定
    const binding = db.characterBindings.create({
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

    const binding = db.characterBindings.update(bindingId, data)
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

    const success = db.characterBindings.delete(bindingId)
    return { success, data: { deleted: success } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除角色绑定失败' }
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

    const episodes = db.videoEpisodes.getByProjectId(projectId)
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

    const episode = db.videoEpisodes.getById(episodeId)
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
  outlineId: string,
  episodeNumber: number,
  title: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const episode = db.videoEpisodes.create({
      projectId,
      outlineId,
      episodeNumber,
      title
    })

    return { success: true, data: episode }
  } catch (error: any) {
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

    const episode = db.videoEpisodes.update(episodeId, data)
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

    const success = db.videoEpisodes.delete(episodeId)
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

    const script = db.episodeScripts.getById(scriptId)
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

    const script = db.episodeScripts.update(scriptId, data)
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

    const scenes = db.sceneScripts.getByEpisodeScriptId(episodeScriptId)
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

    const scene = db.sceneScripts.getById(sceneId)
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

    const scene = db.sceneScripts.update(sceneId, data)
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

    const storyboards = db.storyboards.getBySceneScriptId(sceneScriptId)
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

    const storyboard = db.storyboards.getById(storyboardId)
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

    const storyboard = db.storyboards.update(storyboardId, data)
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
  projectId: string,
  outlineId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = DatabaseManager.getInstance()
    if (!db.videoProjects || !db.videoEpisodes || !db.episodeScripts || !db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取项目信息
    const project = db.videoProjects.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    // 获取章节内容
    let chapterContent = ''
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
    const characters: Array<{ id: string; name: string; description?: string }> = []
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

    // 调用 AI 生成剧本（完整剧本模式）
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.generateFullScript(
      chapterContent,
      characters,
      providerConfigId,
      modelId
    )

    // 查找关联的剧集
    const episode = db.videoEpisodes.getByOutlineId(projectId, outlineId)
    if (!episode) {
      return { success: false, error: '未找到关联的剧集，请先在剧集列表中选择或创建剧集' }
    }

    // 创建或更新剧本
    const existingScript = db.episodeScripts.getByEpisodeId(episode.id)

    let script: any
    if (existingScript) {
      // 更新现有剧本
      script = db.episodeScripts.update(existingScript.id, {
        synopsis: result.synopsis,
        scriptContent: result.scriptContent,
        scriptFormat: 'standard',
        status: 'reviewing'
      })
    } else {
      // 创建新剧本
      script = db.episodeScripts.create({
        projectId,
        episodeId: episode.id,
        outlineId,
        synopsis: result.synopsis,
        scriptContent: result.scriptContent,
        scriptFormat: 'standard'
      })

      // 更新剧本状态
      script = db.episodeScripts.update(script.id, { status: 'reviewing' })

      // 更新剧集的 scriptId
      db.videoEpisodes.update(episode.id, { scriptId: script.id })
    }

    // 删除旧场景（如果有）
    if (existingScript) {
      db.sceneScripts.deleteByEpisodeScriptId(existingScript.id)
    }

    // 创建场景
    const sceneRecords: SceneScript[] = []
    for (const sceneData of result.scenes) {
      const sceneRecord = db.sceneScripts.create({
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
    const script = db.episodeScripts.getById(scriptId)
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
      const sceneRecord = db.sceneScripts.create({
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
    const scene = db.sceneScripts.getById(sceneId)
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
      const storyboard = db.storyboards.create({
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
    const scenes = db.sceneScripts.getByEpisodeScriptId(scriptId)
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
      db.storyboards.deleteBySceneScriptId(sceneId)

      // 创建新分镜
      for (const sb of result.storyboards) {
        const storyboard = db.storyboards.create({
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
    const storyboard = db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    // 获取场景
    const scene = db.sceneScripts.getById(storyboard.sceneScriptId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取角色绑定（需要从项目获取）
    const characterBindings: CharacterBinding[] = []
    // 通过 episodeScript -> episode -> project 获取
    if (db.episodeScripts) {
      const script = db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          const bindings = db.characterBindings.getByProjectId(episode.projectId)
          characterBindings.push(...bindings)
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
      window,
      storyboard,
      scene,
      characterBindings,
      styleName,
      providerConfigId,
      modelId
    )

    if (imageAsset) {
      // 更新分镜的图片
      const updatedStoryboard = db.storyboards.update(storyboardId, {
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
    const scene = db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取分镜列表
    const storyboards = db.storyboards.getBySceneScriptId(sceneId)
    if (storyboards.length === 0) {
      return { success: false, error: '该场景没有分镜' }
    }

    // 获取角色绑定
    const characterBindings: CharacterBinding[] = []
    if (db.episodeScripts) {
      const script = db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          const bindings = db.characterBindings.getByProjectId(episode.projectId)
          characterBindings.push(...bindings)
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
      window,
      storyboards,
      scene,
      characterBindings,
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
      const updated = db.storyboards.update(storyboardId, {
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
    const scene = db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取角色绑定
    const characterBindings: CharacterBinding[] = []
    let projectId = ''
    if (db.episodeScripts) {
      const script = db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          projectId = episode.projectId
          const bindings = db.characterBindings.getByProjectId(projectId)
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
      window,
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
    const scene = db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取分镜
    const storyboards = db.storyboards.getBySceneScriptId(sceneId)
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
      const script = db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = db.videoEpisodes.getById(script.episodeId)
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
      window,
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