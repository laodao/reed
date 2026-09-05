/**
 * scene-audio.service
 * @module platform/episode-production/render/audio/scene-audio.service
 * @description 场景合成音频服务，组合旁白与对白的批量生成。
 *              拆自原 story-to-video-resource.service.ts 的 generateSceneAudio 方法。
 */

import type { SceneScript, CharacterBinding } from '@shared/types/story-to-video.types'
import { NarrationSynthesisService } from './narration-synthesis.service'
import { DialogueSynthesisService } from './dialogue-synthesis.service'

/**
 * 场景合成音频服务
 */
export class SceneAudioService {
  private static instance: SceneAudioService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): SceneAudioService {
    if (!SceneAudioService.instance) {
      SceneAudioService.instance = new SceneAudioService()
    }
    return SceneAudioService.instance
  }

  /**
   * 批量生成场景音频
   */
  async generateSceneAudio(    scene: SceneScript,
    characterBindings: CharacterBinding[],
    outputDir: string,
    onProgress?: (type: string, index: number, total: number) => void
  ): Promise<{
    narrationPath?: string
    dialoguePaths: Map<string, string>
  }> {
    const result: {
      narrationPath?: string
      dialoguePaths: Map<string, string>
    } = {
      dialoguePaths: new Map()
    }

    const narrationSvc = NarrationSynthesisService.getInstance()
    const dialogueSvc = DialogueSynthesisService.getInstance()

    // 生成旁白
    if (scene.narration) {
      if (onProgress) onProgress('narration', 0, 1)

      const narrationPath = await narrationSvc.generateNarrationAudio(
        scene.narration,
        { voiceId: 'Cherry', speed: 1.0, pitch: 0 },
        outputDir
      )

      if (narrationPath) {
        result.narrationPath = narrationPath
      }
    }

    // 生成对话
    for (let i = 0; i < scene.dialogues.length; i++) {
      const dialogue = scene.dialogues[i]
      if (onProgress) onProgress('dialogue', i, scene.dialogues.length)

      const dialoguePath = await dialogueSvc.generateDialogueAudio(
        dialogue.text,
        dialogue.characterId,
        characterBindings,
        outputDir
      )

      if (dialoguePath) {
        result.dialoguePaths.set(dialogue.id, dialoguePath)
      }

      // 添加延迟避免 API 限流
      if (i < scene.dialogues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return result
  }
}
