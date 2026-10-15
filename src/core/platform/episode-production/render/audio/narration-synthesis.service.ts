/**
 * narration-synthesis.service
 * @module platform/episode-production/render/audio/narration-synthesis.service
 * @description 旁白 TTS 合成服务。
 *              拆自原 story-to-video-resource.service.ts 的 generateNarrationAudio 方法。
 */

import * as path from 'path'
import * as fs from 'fs'
import { VoiceService } from '@core/platform/services/voice.service'
import type { TTSRequest } from '@shared/types/voice.types'

/**
 * 旁白 TTS 合成服务
 */
export class NarrationSynthesisService {
  private static instance: NarrationSynthesisService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): NarrationSynthesisService {
    if (!NarrationSynthesisService.instance) {
      NarrationSynthesisService.instance = new NarrationSynthesisService()
    }
    return NarrationSynthesisService.instance
  }

  /**
   * 生成旁白音频
   */
  async generateNarrationAudio(    text: string,
    voiceConfig: {
      voiceId: string
      speed?: number
      pitch?: number
    },
    outputDir: string
  ): Promise<string | null> {
    // 检查文本是否为空
    if (!text || !text.trim()) {
      return null
    }

    try {
      // 构建 TTS 请求
      const ttsRequest: TTSRequest = {
        text: text.trim(),
        voiceId: voiceConfig.voiceId || 'Cherry',
        speed: voiceConfig.speed || 1.0,
        pitch: voiceConfig.pitch || 0,
        language: 'zh'
      }

      // 调用 VoiceService 生成语音
      const response = await VoiceService.generateSpeech(ttsRequest)

      if (!response.success || !response.data?.audioPath) {
        console.error('[StoryToVideoResource] 生成旁白音频失败:', response.error)
        return null
      }

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // 复制音频文件到项目目录
      const sourcePath = response.data.audioPath
      const fileName = `narration_${Date.now()}.wav`
      const outputPath = path.join(outputDir, fileName)

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, outputPath)
        console.log('[StoryToVideoResource] 旁白音频已保存:', outputPath)
        return outputPath
      }

      return null
    } catch (error) {
      console.error('生成旁白音频失败:', error)
      return null
    }
  }
}
