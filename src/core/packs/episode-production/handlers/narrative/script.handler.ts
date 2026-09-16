/**
 * episode-production · 剧本与场景管理 · IPC handler
 * @module core/packs/episode-production/handlers/narrative/script.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：剧本管理（get/update-script）、场景管理（list/get/update-scene）、
 *       AI剧本生成（generate-script、generate-scenes）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { IsNull } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { SceneScript } from '@shared/types/story-to-video.types'
import type {
  PrepareScriptAppendInput,
  ScriptAppendDraft,
} from '@shared/types/episode-production'
import type { UpdateEpisodeScriptRequest } from '@core/database/repositories/episode-script.repository'
import { StoryToVideoAIService } from '@core/packs/episode-production/services/story-to-video-ai.service'
import { buildAssetRosterForProject } from '@core/platform/episode-production/narrative/asset-roster-builder'
import { EpisodeScenePolisher } from '@core/platform/episode-production/narrative/ai/scene-polisher'
import { EpisodeScriptGenerator } from '@core/platform/episode-production/narrative/ai/script-generator'
import { SceneBindingWriter } from '@core/platform/episode-production/narrative/scene-binding-writer'
import {
  ScriptAppendService,
  type AppendScriptOptions,
} from '@core/platform/episode-production/narrative/services/script-append.service'
import { analyzeScriptToEpisodes } from '@core/platform/episode-production/narrative/services/script-splitter.service'

export function registerScriptHandlers(): void {
  // ==================== 剧本管理 ====================
  ipcBridge.handle('ep:get-script', handleGetScript)
  ipcBridge.handle('ep:update-script', handleUpdateScript)

  // ==================== 场景管理 ====================
  ipcBridge.handle('ep:list-scenes', handleListScenes)
  ipcBridge.handle('ep:get-scene', handleGetScene)
  ipcBridge.handle('ep:create-scene', handleCreateScene) // FU8-C3
  ipcBridge.handle('ep:update-scene', handleUpdateScene)
  ipcBridge.handle('ep:delete-scene', handleDeleteScene) // FU8-C3 删除

  // ==================== AI 生成（剧本与场景） ====================
  ipcBridge.handle('ep:generate-script', handleGenerateScript)
  ipcBridge.handle('ep:generate-scenes', handleGenerateScenes)

  // ==================== 追加剧本（已有剧本继续增加内容 · 增量不覆盖） ====================
  ipcBridge.handle('ep:prepare-script-append', handlePrepareScriptAppend)
  ipcBridge.handle('ep:append-script', handleAppendScript)

  // ==================== AI 润色（场景级 · spec 2026-05-08） ====================
  ipcBridge.handle('ep:polish-scene', handlePolishScene)

  // ==================== 剧本文本分析（粘贴导入拆集 · M1 首页） ====================
  ipcBridge.handle('ep:analyze-script-text', handleAnalyzeScriptText)
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
  data: UpdateEpisodeScriptRequest,
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

/*
 * FU8-C3 手动添加场景：
 *   user 在 ③ 剧本 stage 点"添加场景"输入 location/timeOfDay 等基础要素，
 *   后端补齐 sceneNumber（取已有最大值 +1）+ 默认空字段，落库返回完整 SceneScript。
 *   不覆盖现有 scenes，只追加。
 */
async function handleCreateScene(
  _event: any,
  episodeScriptId: string,
  partial: Partial<SceneScript>,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }
    const existing = await db.sceneScripts.getByEpisodeScriptId(episodeScriptId)
    const nextSceneNumber = existing.reduce(
      (max, s: SceneScript) => Math.max(max, s.sceneNumber ?? 0),
      0,
    ) + 1

    const created = await db.sceneScripts.create({
      episodeScriptId,
      sceneNumber: partial.sceneNumber ?? nextSceneNumber,
      location: partial.location ?? '未命名地点',
      locationBindingId: partial.locationBindingId ?? null,
      locationType: (partial.locationType ?? 'interior') as any,
      timeOfDay: (partial.timeOfDay ?? 'day') as any,
      weather: partial.weather as any,
      sceneDescription: partial.sceneDescription ?? '',
      mood: partial.mood ?? '',
      lighting: partial.lighting,
      characters: partial.characters ?? [],
      originalText: partial.originalText ?? '',
      narration: partial.narration ?? '',
      dialogues: partial.dialogues ?? [],
      actions: partial.actions ?? [],
    } as any)
    return { success: true, data: created }
  } catch (error: any) {
    return { success: false, error: error.message || '创建场景失败' }
  }
}

async function handleDeleteScene(
  _event: any,
  sceneId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }
    await db.sceneScripts.delete(sceneId)
    return { success: true, data: { id: sceneId } }
  } catch (error: any) {
    return { success: false, error: error.message || '删除场景失败' }
  }
}

/**
 * AI 场景级润色（spec 2026-05-08）。
 *
 * 流程：sceneId → 拉 SceneScript → 顺藤摸到 episode（获取故事背景上下文）→
 * 调 EpisodeScenePolisher.polishScene → 仅返回字段子集给前端，由用户在
 * SceneEditDialog 里对比 → 接受 → 保存（保存时再走 ep:update-scene 落库）。
 *
 * 故意不直接落库——保留用户"对比 / 拒绝"的回退能力。
 */
async function handlePolishScene(
  _event: any,
  sceneId: string,
  providerConfigId?: string,
  modelId?: string,
): Promise<IpcResponse> {
  try {
    if (!sceneId) return { success: false, error: 'sceneId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.episodeScripts || !db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) return { success: false, error: '场景不存在' }

    // 顺藤摸瓜：scene → episodeScript → episode（拉故事背景）
    const epScript = await db.episodeScripts.getById(scene.episodeScriptId)
    if (!epScript) return { success: false, error: '关联的剧本不存在' }
    const episode = await db.videoEpisodes.getById(epScript.episodeId)
    const ctx = {
      era: episode?.storyEra ?? null,
      region: episode?.storyRegion ?? null,
      extra: episode?.storyBackgroundExtra ?? null,
    }

    const result = await EpisodeScenePolisher.getInstance().polishScene(
      scene,
      ctx,
      providerConfigId,
      modelId,
    )

    return { success: true, data: result }
  } catch (error: any) {
    console.error('[handlePolishScene] 异常:', error)
    return { success: false, error: error?.message ?? '场景润色失败' }
  }
}

/**
 * 追加剧本 · 生成草稿（**不落库**）。
 *
 * 场景：剧本没写完就先开机制作了，后续要陆续往里加内容。
 * 与 ep:generate-script / ep:generate-scenes 的根本区别 —— 那两个是覆盖式
 * （会 deleteByEpisodeScriptId 删掉已有场次），这个只增量。
 *
 * 生成后先回前端让用户预览（新增几场、正文多少字），确认后再调 ep:append-script。
 */
async function handlePrepareScriptAppend(
  _event: any,
  scriptId: string,
  input: Omit<PrepareScriptAppendInput, 'scriptId'>,
): Promise<IpcResponse> {
  try {
    if (!scriptId) return { success: false, error: 'scriptId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    const service = new ScriptAppendService(db)
    const preview = await service.prepare({ ...input, scriptId })
    return { success: true, data: preview }
  } catch (error: any) {
    console.error('[handlePrepareScriptAppend] 异常:', error)
    return { success: false, error: error?.message ?? '生成追加内容失败' }
  }
}

/**
 * 追加剧本 · 落库（用户确认草稿后调用）。
 *
 * 只 append：已有场次及其分镜 / 关键帧 / 视频一概不动，新场次接在已有场次之后。
 */
async function handleAppendScript(
  _event: any,
  scriptId: string,
  draft: ScriptAppendDraft,
  options?: AppendScriptOptions,
): Promise<IpcResponse> {
  try {
    if (!scriptId) return { success: false, error: 'scriptId 不能为空' }
    if (!draft) return { success: false, error: '追加内容为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    const service = new ScriptAppendService(db)
    const result = await service.append(scriptId, draft, options ?? {})
    return { success: true, data: result }
  } catch (error: any) {
    console.error('[handleAppendScript] 异常:', error)
    return { success: false, error: error?.message ?? '追加剧本失败' }
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
            const contents: string[] = []
            // 一级 chapter 节点可直挂正文（无 section 子节点，长文模块 saveChapter
            // 按 outlineId 存储）；chapter 自身有正文时先读自身，再遍历 section 子节点
            const ownChapter = await db.lwChapters?.getByOutlineId(outlineId)
            if (ownChapter && ownChapter.content) {
              contents.push(`【${outline.name}】\n${ownChapter.content}`)
            }
            const sections = (await db.lwOutlines?.getChildren(outlineId)) || []
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

    // 复核修复 P1-6：删旧场景与建新场景并入同一事务——原实现先物理删光旧场景
    // 再另起事务重建，建新中途失败（LLM 脏数据等）旧场景不可恢复
    const userId = getCurrentUserId()
    const delScope = userId ? { userId } : { userId: IsNull() }
    const sceneRecords = await db.dataSource.transaction(async manager => {
      if (existingScript) {
        await manager
          .getRepository(SceneScriptEntity)
          .delete({ episodeScriptId: existingScript.id, ...delScope } as any)
      }
      return SceneBindingWriter.createScenesWithBindingsIn(manager, script.id, result.scenes)
    })

    // 更新剧集状态为 scripting（确保前端正确显示剧本内容）
    // 如果当前是 pending/asset_prep，生成剧本后应进入 scripting 阶段
    if (episode.status === 'pending' || episode.status === 'asset_prep') {
      await db.videoEpisodes.update(episode.id, { status: 'scripting' })
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
    if (!db.dataSource || !db.episodeScripts || !db.sceneScripts || !db.videoEpisodes) {
      return { success: false, error: '数据库未初始化' }
    }

    // 1. 获取剧本
    const script = await db.episodeScripts.getById(scriptId)
    if (!script) {
      return { success: false, error: '剧本不存在' }
    }

    // 2. 获取剧集信息（需要 projectId 构建资产花名册）
    const episode = await db.videoEpisodes.getById(script.episodeId)
    if (!episode) {
      return { success: false, error: '剧集不存在' }
    }

    // 2.5 模型回退：调用方未显式传 provider/model 时，用项目配置的剧本生成模型，
    //     避免静默落到宿主默认 provider（与 cogen 的 scriptModel 语义一致）
    if ((!providerConfigId || !modelId) && db.videoProjects) {
      const project = await db.videoProjects.getById(episode.projectId).catch(() => null)
      const sm = (project?.config as any)?.scriptModel
      if (sm?.providerConfigId && sm?.modelId) {
        providerConfigId = providerConfigId || sm.providerConfigId
        modelId = modelId || sm.modelId
      }
    }

    // 3. 构建资产花名册
    const roster = await buildAssetRosterForProject(db.dataSource, episode.projectId)

    // 4. 调用 AI 生成场景（带 binding 引用）
    const scriptGenerator = EpisodeScriptGenerator.getInstance()
    const generatedScenes = await scriptGenerator.generateScenesFromSynopsis(
      script.synopsis,
      roster,
      providerConfigId,
      modelId
    )

    // 5+6. 复核修复 P1-6：删旧场景与建新场景并入同一事务（同 generate-script）
    const userId = getCurrentUserId()
    const delScope = userId ? { userId } : { userId: IsNull() }
    const sceneRecords = await db.dataSource.transaction(async manager => {
      await manager
        .getRepository(SceneScriptEntity)
        .delete({ episodeScriptId: scriptId, ...delScope } as any)
      return SceneBindingWriter.createScenesWithBindingsIn(manager, scriptId, generatedScenes)
    })

    return { success: true, data: sceneRecords }
  } catch (error: any) {
    console.error('[handleGenerateScenes] 错误:', error)
    return { success: false, error: error.message || '拆分场景失败' }
  }
}

/**
 * M1 首页导入拆集（粘贴文本版）：
 * 调纯函数 analyzeScriptToEpisodes(text)（规则切分，零 AI），返回剧集候选列表。
 * 供「导入拆集」预览步使用；确认后由 batch-create-episodes 落库。
 */
async function handleAnalyzeScriptText(
  _event: any,
  text: string,
): Promise<IpcResponse> {
  try {
    if (!text || !text.trim()) {
      return { success: false, error: '剧本内容为空，无法分析' }
    }
    const analysis = analyzeScriptToEpisodes(text)
    if (!analysis.hasStructure || analysis.episodes.length === 0) {
      return {
        success: false,
        error: '未识别到章节结构，请在剧本中用「第X章 / Chapter N / # 标题」分隔每集',
      }
    }
    return {
      success: true,
      data: {
        hasStructure: analysis.hasStructure,
        structureType: analysis.structureType,
        episodes: analysis.episodes,
      },
    }
  } catch (e: any) {
    console.error('[handleAnalyzeScriptText] 异常:', e)
    return { success: false, error: e?.message ?? '分析剧本文本失败' }
  }
}
