/**
 * episode-production · 剧本与场景管理 · IPC handler
 * @module electron/ipc/handlers/episode-production/narrative/script.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：剧本管理（get/update-script）、场景管理（list/get/update-scene）、
 *       AI剧本生成（generate-script、generate-scenes）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { SceneScript } from '@shared/types/story-to-video.types'
import { StoryToVideoAIService } from '@core/services/story-to-video-ai.service'
import { buildAssetRosterForProject } from '@core/modules/episode-production/narrative/asset-roster-builder'

export function registerScriptHandlers(): void {
  // ==================== 剧本管理 ====================
  ipcBridge.handle('ep:get-script', handleGetScript)
  ipcBridge.handle('ep:update-script', handleUpdateScript)

  // ==================== 场景管理 ====================
  ipcBridge.handle('ep:list-scenes', handleListScenes)
  ipcBridge.handle('ep:get-scene', handleGetScene)
  ipcBridge.handle('ep:update-scene', handleUpdateScene)

  // ==================== AI 生成（剧本与场景） ====================
  ipcBridge.handle('ep:generate-script', handleGenerateScript)
  ipcBridge.handle('ep:generate-scenes', handleGenerateScenes)
}

// ==================== 剧本管理处理器 ====================

async function handleGetScript(
  _event: any,
  scriptId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
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
  _event: any,
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
    const db = getCoreDatabaseManager()
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
  _event: any,
  episodeScriptId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
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
  _event: any,
  sceneId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
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
  _event: any,
  sceneId: string,
  data: Partial<SceneScript>
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
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

// ==================== AI 生成处理器（剧本与场景） ====================

async function handleGenerateScript(
  _event: any,
  episodeId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
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

    // 根据来源类型获取章节内容（角色/地点/物品由 roster 统一从 binding 表读，不再走老 lw_character 列表）
    if (episode.sourceType === 'uploaded') {
      chapterContent = episode.uploadedContent || ''

      // 上传模式：仍然先识别角色，便于后续 ②资产 阶段用户绑定到 character_binding
      if (!episode.uploadedCharacters || episode.uploadedCharacters.length === 0) {
        const aiService = StoryToVideoAIService.getInstance()
        const identifiedChars = await aiService.identifyCharacters(
          chapterContent,
          providerConfigId,
          modelId
        )
        await db.videoEpisodes.update(episodeId, { uploadedCharacters: identifiedChars })
        episode.uploadedCharacters = identifiedChars
      }
    } else {
      // 关联章节模式：从长文项目中获取内容
      const outlineId = episode.outlineId
      if (!outlineId) {
        return { success: false, error: '剧集未关联大纲节点' }
      }

      if (project.longWritingProjectId) {
        const outline = await db.lwOutlines?.getById(outlineId)
        if (outline) {
          if (outline.nodeType === 'section') {
            const chapter = await db.lwChapters?.getByOutlineId(outlineId)
            if (chapter && chapter.content) chapterContent = chapter.content
          } else if (outline.nodeType === 'chapter') {
            const sections = (await db.lwOutlines?.getChildren(outlineId)) || []
            const contents: string[] = []
            for (const section of sections) {
              if (section.nodeType === 'section') {
                const chapter = await db.lwChapters?.getByOutlineId(section.id)
                if (chapter && chapter.content) {
                  contents.push(`【${section.name}】\n${chapter.content}`)
                }
              }
            }
            chapterContent = contents.join('\n\n')
          } else if (outline.nodeType === 'volume') {
            const chapters = (await db.lwOutlines?.getChildren(outlineId)) || []
            const contents: string[] = []
            for (const chapterNode of chapters) {
              const sections = (await db.lwOutlines?.getChildren(chapterNode.id)) || []
              for (const section of sections) {
                if (section.nodeType === 'section') {
                  const chapter = await db.lwChapters?.getByOutlineId(section.id)
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
    }

    // 构建资产花名册（spec §4.1 强约束 · P4-T4）：从 character/location/item_bindings 读项目级资产
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化（dataSource 不可用）' }
    }
    const roster = await buildAssetRosterForProject(db.dataSource, episode.projectId)

    // 调用 AI 生成剧本（完整剧本模式 + binding 引用强约束）
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.generateFullScript(
      chapterContent,
      roster,
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

    // 创建场景（含 P4-T1 加的 locationBindingId 强引用列）
    const sceneRecords: SceneScript[] = []
    for (const sceneData of result.scenes) {
      const sceneRecord = await db.sceneScripts.create({
        episodeScriptId: script.id,
        sceneNumber: sceneData.sceneNumber,
        location: sceneData.location,
        locationBindingId: sceneData.locationBindingId ?? null,
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
  _event: any,
  scriptId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
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
