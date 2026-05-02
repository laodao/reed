/**
 * compose/audio-mix.service
 * @module modules/episode-production/compose/audio-mix.service
 * @description 场景多轨音频混音（旁白 + 对话 + 背景音乐）。
 *              拆自原 video-synthesis.service.ts 的音频合成方法。
 */

import * as fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import type { SynthesisResult } from './types'
import { FfmpegAssemblerService } from './ffmpeg-assembler.service'

/**
 * 音频混音服务：将旁白、对话、背景音乐混合为单轨场景音频。
 * 依赖 FfmpegAssemblerService 执行底层 ffmpeg 命令。
 */
export class AudioMixService {
  private static instance: AudioMixService

  private readonly ffmpegAssembler = FfmpegAssemblerService.getInstance()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): AudioMixService {
    if (!AudioMixService.instance) {
      AudioMixService.instance = new AudioMixService()
    }
    return AudioMixService.instance
  }

  /**
   * 合成场景音频（旁白 + 对话 + 背景音乐）
   */
  async mixSceneAudio(
    narrationPath?: string,
    dialoguePaths: string[] = [],
    backgroundMusicPath?: string,
    outputPath: string,
    totalDuration: number
  ): Promise<SynthesisResult> {
    try {
      const command = ffmpeg()

      // 添加音频输入
      const audioInputs: number[] = []

      if (narrationPath && fs.existsSync(narrationPath)) {
        command.input(narrationPath)
        audioInputs.push(audioInputs.length)
      }

      for (const dialoguePath of dialoguePaths) {
        if (fs.existsSync(dialoguePath)) {
          command.input(dialoguePath)
          audioInputs.push(audioInputs.length)
        }
      }

      if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
        command.input(backgroundMusicPath)
        command.inputOptions([`-stream_loop -1`]) // 循环背景音乐
        audioInputs.push(audioInputs.length)
      }

      if (audioInputs.length === 0) {
        return { success: false, error: '没有音频输入' }
      }

      // 构建 audio mix 滤镜
      const filterInputs = audioInputs.map(i => `[${i}:a]`).join('')
      const amixFilter = `${filterInputs}amix=inputs=${audioInputs.length}:duration=longest[aout]`

      command.complexFilter(amixFilter)
      command.outputOptions([`-t ${totalDuration}`])
      command.audioCodec('aac')
      command.audioBitrate('128k')
      command.output(outputPath)

      return await this.ffmpegAssembler.runFFmpegCommand(command)
    } catch (error: any) {
      console.error('[VideoSynthesis] 合成音频失败:', error)
      return { success: false, error: error.message || '合成音频失败' }
    }
  }
}
