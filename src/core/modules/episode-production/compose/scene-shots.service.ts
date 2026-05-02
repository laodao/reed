/**
 * compose/scene-shots.service
 * @module modules/episode-production/compose/scene-shots.service
 * @description 场景内多分镜批量视频合成 + 进度事件发送。
 *              拆自原 video-synthesis.service.ts 的批量合成方法。
 */

import * as path from 'path'
import { getEventEmitter } from '@core/interfaces/event.interface'
import type { VideoSynthesisConfig } from './types'
import { PRESET_VIDEO_CONFIGS } from './types'
import type { Storyboard } from '@shared/types/story-to-video.types'
import { FfmpegAssemblerService } from './ffmpeg-assembler.service'
import { ShotVideoService } from './shot-video.service'

/**
 * 场景分镜批量合成服务：遍历场景内所有分镜并逐一合成视频，同时发送进度事件。
 * 依赖 ShotVideoService 进行单镜合成，依赖 FfmpegAssemblerService 获取输出目录。
 */
export class SceneShotsService {
  private static instance: SceneShotsService

  private readonly ffmpegAssembler = FfmpegAssemblerService.getInstance()
  private readonly shotVideo = ShotVideoService.getInstance()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): SceneShotsService {
    if (!SceneShotsService.instance) {
      SceneShotsService.instance = new SceneShotsService()
    }
    return SceneShotsService.instance
  }

  /**
   * 批量创建场景镜头视频
   */
  async createSceneShotVideos(
        storyboards: Storyboard[],
    projectId: string,
    sceneId: string,
    audioAssets: Map<string, string>,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard,
    onProgress?: (index: number, total: number) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const outputDir = this.ffmpegAssembler.getVideoOutputDir(projectId)

    for (let i = 0; i < storyboards.length; i++) {
      const storyboard = storyboards[i]

      if (onProgress) {
        onProgress(i, storyboards.length)
        // 通知前端进度
        // 注意：事件名 'stv:synthesis-progress' 待 task 8 整体 channel rename 时统一改为 'ep:' 前缀
        getEventEmitter().emit('stv:synthesis-progress', {
          sceneId,
          type: 'shot',
          index: i,
          total: storyboards.length,
          storyboardId: storyboard.id
        })
      }

      // 输出文件名
      const outputFileName = `shot_${storyboard.shotNumber}_${storyboard.id}.mp4`
      const outputPath = path.join(outputDir, outputFileName)

      // 查找对应的音频（旁白或对话）
      const audioPath = audioAssets.get(storyboard.id)

      try {
        const result = await this.shotVideo.createShotVideo(
          storyboard,
          outputPath,
          audioPath,
          config
        )

        if (result.success) {
          results.set(storyboard.id, outputPath)
        }
      } catch (error) {
        console.error(`创建镜头 ${storyboard.shotNumber} 视频失败:`, error)
      }

      // 添加延迟避免资源占用过高
      if (i < storyboards.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return results
  }
}
