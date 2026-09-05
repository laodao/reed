/**
 * 媒体处理节点（视频/音频提取）
 * @module core/platform/workflow/nodes/media-nodes
 * @description video-extract-audio：视频/视频链接 → 16kHz 单声道 wav 音频（ffmpeg），
 *              输出 audioPath 供 stt 节点转写文案（视频文案提取工作流核心链路）。
 *
 *              输入支持三种来源（任一非空）：
 *              - videoPath：本地文件路径（file:// 前缀或绝对路径）
 *              - videoUrl：http(s) 视频链接——常规直链（mp4/webm/m3u8 等）ffmpeg 直接拉流；
 *                B站（bilibili.com/BVxxx）走公开 API 解析 DASH 音频直链（带 Referer 防盗链）；
 *                抖音风控无公开 API → 明确失败提示走"手动下载后本地导入"降级路径
 *
 *              复用 ffmpeg-helpers（spawn 数组参数，无 shell 注入风险）。
 */

import { existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { extractAudio, getVideoMetadata } from '../../episode-production/reference-video/ffmpeg-helpers'
import { resolveVideoSource } from '../tools/video-url-resolver'
import { getPathProvider } from '../../../interfaces/path.interface'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

const videoExtractAudioNode: WorkflowNodeHandler = {
  type: 'video-extract-audio',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'audioPath', type: 'string', desc: '提取的 wav 音频路径' },
    { key: 'videoName', type: 'string', desc: '原始视频文件名/标题' },
    { key: 'durationMs', type: 'number', desc: '视频时长毫秒（未知为 0）' },
  ],
  validateConfig(config) {
    const cfg = config as { videoPath?: string; videoUrl?: string }
    const path = stringifyValue(cfg.videoPath).trim()
    const url = stringifyValue(cfg.videoUrl).trim()
    if (!path && !url) return ['需要提供本地视频文件路径（videoPath）或视频链接（videoUrl）']
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { videoPath?: string; videoUrl?: string }
    const rawPath = stringifyValue(cfg.videoPath).trim().replace(/^file:\/\//, '')
    const rawUrl = stringifyValue(cfg.videoUrl).trim()

    // 输出目录：数据目录/workflow-media/<runId>（每次运行独立，防并发互踩）
    const dir = join(getPathProvider().getDataPath(), 'workflow-media', ctx.runId.replace(/[^\w.-]/g, '_'))
    mkdirSync(dir, { recursive: true })
    const safeBase = `${ctx.runId}_${ctx.nodeId}`.replace(/[^\w.-]/g, '_')
    const audioPath = join(dir, `${safeBase}.wav`)

    // ---- 分支 1：本地文件（videoPath 存在） ----
    if (rawPath) {
      if (!existsSync(rawPath)) throw new Error(`视频文件不存在：${rawPath}`)
      await extractAudio(rawPath, audioPath)
      const meta = await safeMetadata(rawPath)
      ctx.logger.info('已提取音频（本地文件）', { audioPath, durationMs: meta.durationMs })
      return { status: 'succeeded', output: { audioPath, videoName: basename(rawPath), durationMs: meta.durationMs } }
    }

    // ---- 分支 2：视频链接（videoUrl） ----
    if (rawUrl) {
      const source = await resolveVideoSource(rawUrl)
      if (source.error) {
        // 抖音/不支持：明确失败提示（不静默、不伪造成功）
        return { status: 'failed', error: source.error, retryable: false }
      }
      // 需要 yt-dlp 的平台（YouTube/西瓜/微博等）：yt-dlp 内部完成下载+转码
      if (source.kind === 'ytdlp') {
        const { YtDlpManager } = await import('../tools/yt-dlp-manager')
        const result = await YtDlpManager.getInstance().extractAudioFromUrl(source.url, audioPath.replace(/\.wav$/, ''))
        if ('error' in result) {
          return { status: 'failed', error: result.error, retryable: false }
        }
        ctx.logger.info('已提取音频（yt-dlp）', { name: source.name, audioPath: result.path })
        return { status: 'succeeded', output: { audioPath: result.path, videoName: source.name, durationMs: 0 } }
      }
      ctx.logger.info('解析视频来源', { kind: source.kind, name: source.name, url: source.url.slice(0, 120) })
      await extractAudio(source.url, audioPath, { headers: source.headers })
      const meta = await safeMetadata(source.url, source.headers)
      return {
        status: 'succeeded',
        output: { audioPath, videoName: source.name, durationMs: meta.durationMs },
      }
    }

    // validateConfig 已兜底，理论上不可达
    return { status: 'failed', error: '视频来源为空', retryable: false }
  },
}

/** 元数据（时长）可选——失败不阻断主流程；URL 场景带 headers 防 403 */
async function safeMetadata(
  target: string,
  headers?: Record<string, string>,
): Promise<{ durationMs: number }> {
  try {
    const meta = await getVideoMetadata(target)
    return { durationMs: Math.round(meta.durationSec * 1000) }
  } catch {
    return { durationMs: 0 }
  }
}

export const MEDIA_NODE_HANDLERS: WorkflowNodeHandler[] = [videoExtractAudioNode]
