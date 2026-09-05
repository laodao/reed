/**
 * episode-production · 音频生成 · IPC handler
 * @module core/packs/episode-production/handlers/render/audio.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import * as path from 'path'
import { getBrowserWindowFromEvent } from '@electron/ipc/handlers/_platform'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { CharacterBinding } from '@shared/types/story-to-video.types'
import { StoryToVideoResourceService } from '@core/packs/episode-production/services/story-to-video-resource.service'
import { SceneAudioOrchestratorService } from '@core/modules/episode-production/render/audio/scene-audio-orchestrator.service'

export function registerAudioHandlers(): void {
  // ==================== 资源生成（音频） ====================
  ipcBridge.handle('ep:generate-audio', handleGenerateAudio)
  // P5-T14/T15 binding-aware 音频编排
  ipcBridge.handle('ep:generate-scene-audio-v3', handleGenerateSceneAudioV3)
}

/**
 * V3 binding-aware 场景音频生成。
 * 走 SceneAudioOrchestrator：dialogue.voiceId → binding.voiceId → fallback Cherry。
 */
async function handleGenerateSceneAudioV3(
  _event: any,
  sceneScriptId: string,
  opts?: { defaultNarratorVoiceId?: string; outputDir?: string },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    // 解析 outputDir：未传则走 path provider 默认
    let outputDir = opts?.outputDir
    if (!outputDir) {
      const userDataPath = getPathProvider().getUserDataPath()
      outputDir = path.join(
        userDataPath,
        'episode-production',
        'audio',
        sceneScriptId,
      )
    }

    const svc = new SceneAudioOrchestratorService(db.dataSource)
    const result = await svc.orchestrateScene({
      sceneScriptId,
      outputDir,
      defaultNarratorVoiceId: opts?.defaultNarratorVoiceId,
    })

    // dialoguePaths Map → object（IPC 序列化）
    const dialoguePathsObj: Record<string, string> = {}
    result.dialoguePaths.forEach((v, k) => {
      dialoguePathsObj[k] = v
    })

    return {
      success: true,
      data: {
        narrationPath: result.narrationPath,
        dialoguePaths: dialoguePathsObj,
        fallbackDialogueCount: result.fallbackDialogueCount,
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.message || '生成场景音频失败' }
  }
}

// ==================== 音频生成处理器 ====================

async function handleGenerateAudio(
  event: any,
  sceneId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取窗口
    const window = getBrowserWindowFromEvent(event)
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
    const userDataPath = getPathProvider().getUserDataPath()
    const outputDir = path.join(userDataPath, 'story-to-video', projectId, 'audio')

    // 调用资源生成服务
    const resourceService = StoryToVideoResourceService.getInstance()
    const result = await resourceService.generateSceneAudio(
      scene,
      characterBindings,
      outputDir,
      (type, index, total) => {
        // 发送进度事件
        window.webContents.send('ep:audio-progress', {
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
