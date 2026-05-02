/**
 * dialogue-synthesis.service
 * @module modules/episode-production/render/audio/dialogue-synthesis.service
 * @description 对白 TTS 合成服务。
 *              拆自原 story-to-video-resource.service.ts 的 generateDialogueAudio 方法。
 */

import * as path from 'path'
import * as fs from 'fs'
import { VoiceService } from '@core/services/voice.service'
import type { CharacterBinding } from '@shared/types/story-to-video.types'
import type { TTSRequest } from '@shared/types/voice.types'

/**
 * 对白 TTS 合成服务
 */
export class DialogueSynthesisService {
  private static instance: DialogueSynthesisService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): DialogueSynthesisService {
    if (!DialogueSynthesisService.instance) {
      DialogueSynthesisService.instance = new DialogueSynthesisService()
    }
    return DialogueSynthesisService.instance
  }

  /**
   * 生成对话音频
   */
  async generateDialogueAudio(    text: string,
    characterId: string,
    characterBindings: CharacterBinding[],
    outputDir: string
  ): Promise<string | null> {
    if (!text || !text.trim()) {
      return null
    }

    try {
      // 查找角色绑定
      const binding = characterBindings.find(
        b => b.longWritingCharacterId === characterId
      )

      // 构建语音配置
      const voiceId = binding?.voiceConfig?.voiceId || 'Cherry'
      const speed = binding?.voiceConfig?.speed || 1.0
      const pitch = binding?.voiceConfig?.pitch || 0

      // 构建 TTS 请求
      const ttsRequest: TTSRequest = {
        text: text.trim(),
        voiceId,
        speed,
        pitch,
        language: 'zh'
      }

      // 调用 VoiceService 生成语音
      const response = await VoiceService.generateSpeech(ttsRequest)

      if (!response.success || !response.data?.audioPath) {
        console.error('[StoryToVideoResource] 生成对话音频失败:', response.error)
        return null
      }

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // 复制音频文件到项目目录
      const sourcePath = response.data.audioPath
      const fileName = `dialogue_${characterId}_${Date.now()}.wav`
      const outputPath = path.join(outputDir, fileName)

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, outputPath)
        console.log('[StoryToVideoResource] 对话音频已保存:', outputPath)
        return outputPath
      }

      return null
    } catch (error) {
      console.error('生成对话音频失败:', error)
      return null
    }
  }
}
