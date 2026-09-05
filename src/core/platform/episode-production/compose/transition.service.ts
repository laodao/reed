/**
 * compose/transition.service
 * @module platform/episode-production/compose/transition.service
 * @description 多镜头视频转场合并 + xfade filter graph 构建。
 *              拆自原 video-synthesis.service.ts 的转场相关方法。
 */

import ffmpeg from 'fluent-ffmpeg'
import type {
  SynthesisResult,
  VideoSynthesisConfig,
  TransitionConfig,
  TransitionType
} from './types'
import { PRESET_VIDEO_CONFIGS } from './types'
import { FfmpegAssemblerService } from './ffmpeg-assembler.service'

/**
 * 转场合并服务：负责多视频片段按转场配置合并。
 * 依赖 FfmpegAssemblerService 执行底层 ffmpeg 命令。
 */
export class TransitionService {
  private static instance: TransitionService

  private readonly ffmpegAssembler = FfmpegAssemblerService.getInstance()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): TransitionService {
    if (!TransitionService.instance) {
      TransitionService.instance = new TransitionService()
    }
    return TransitionService.instance
  }

  /**
   * 合并多个视频片段（带转场效果）
   */
  async mergeVideosWithTransitions(
    videoPaths: string[],
    transitions: TransitionConfig[],
    outputPath: string,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard
  ): Promise<SynthesisResult> {
    try {
      if (videoPaths.length === 0) {
        return { success: false, error: '没有视频片段' }
      }

      // 如果只有一个视频，直接处理
      if (videoPaths.length === 1) {
        return await this.processSingleVideo(
          videoPaths[0],
          outputPath,
          config
        )
      }

      // 使用 xfade 滤镜进行转场
      const command = ffmpeg()

      // 添加所有视频输入
      for (const videoPath of videoPaths) {
        command.input(videoPath)
      }

      // 构建 xfade 滤镜链
      const filterComplex = this.buildXfadeFilterComplex(
        videoPaths.length,
        transitions,
        config
      )

      command.complexFilter(filterComplex)

      // 输出配置
      command
        .videoCodec('libx264')
        .audioCodec('aac')
        .output(outputPath)
        .outputOptions([
          `-preset ${config.preset}`,
          `-crf ${config.crf}`
        ])

      return await this.ffmpegAssembler.runFFmpegCommand(command)
    } catch (error: any) {
      console.error('[VideoSynthesis] 合并视频失败:', error)
      return { success: false, error: error.message || '合并视频失败' }
    }
  }

  /**
   * 构建 xfade 滤镜链
   */
  private buildXfadeFilterComplex(
    videoCount: number,
    transitions: TransitionConfig[],
    config: VideoSynthesisConfig
  ): string {
    const filters: string[] = []

    // 简化版本：使用 concat 滤镜
    // xfade 需要精确的时间计算，复杂场景使用 concat

    if (transitions.length === 0 || transitions.every(t => t.type === 'none')) {
      // 无转场，直接拼接
      const inputs = Array.from({ length: videoCount }, (_, i) => `[${i}:v][${i}:a]`).join('')
      filters.push(`${inputs}concat=n=${videoCount}:v=1:a=1[outv][outa]`)
    } else {
      // 带转场效果
      // 使用简单的 fade 转场
      for (let i = 0; i < videoCount; i++) {
        const transition = transitions[i] || { type: 'none' as TransitionType, duration: 0 }

        if (i === 0) {
          // 第一个视频，添加 fadein
          if (transition.type === 'fadein' || transition.type === 'fade') {
            filters.push(`[${i}:v]fade=t=in:st=0:d=${transition.duration}[v${i}]`)
            filters.push(`[${i}:a]afade=t=in:st=0:d=${transition.duration}[a${i}]`)
          } else {
            filters.push(`[${i}:v]null[v${i}]`)
            filters.push(`[${i}:a]anull[a${i}]`)
          }
        } else if (i === videoCount - 1) {
          // 最后一个视频，添加 fadeout
          if (transition.type === 'fadeout' || transition.type === 'fade') {
            // 需要先获取视频时长
            filters.push(`[${i}:v]fade=t=out:st=${transition.offset || 0}:d=${transition.duration}[v${i}]`)
            filters.push(`[${i}:a]afade=t=out:st=${transition.offset || 0}:d=${transition.duration}[a${i}]`)
          } else {
            filters.push(`[${i}:v]null[v${i}]`)
            filters.push(`[${i}:a]anull[a${i}]`)
          }
        } else {
          filters.push(`[${i}:v]null[v${i}]`)
          filters.push(`[${i}:a]anull[a${i}]`)
        }
      }

      // 拼接所有处理后的视频
      const inputs = Array.from({ length: videoCount }, (_, i) => `[v${i}][a${i}]`).join('')
      filters.push(`${inputs}concat=n=${videoCount}:v=1:a=1[outv][outa]`)
    }

    return filters.join(';')
  }

  /**
   * 处理单个视频（重编码）
   */
  private async processSingleVideo(
    inputPath: string,
    outputPath: string,
    config: VideoSynthesisConfig
  ): Promise<SynthesisResult> {
    const command = ffmpeg(inputPath)

    command
      .videoCodec('libx264')
      .videoBitrate(config.videoBitrate)
      .audioCodec('aac')
      .audioBitrate(config.audioBitrate)
      .outputOptions([
        `-crf ${config.crf}`,
        `-pix_fmt yuv420p`,
        `-preset ${config.preset}`
      ])
      .output(outputPath)

    return await this.ffmpegAssembler.runFFmpegCommand(command)
  }
}
