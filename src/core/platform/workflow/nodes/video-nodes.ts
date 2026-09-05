/**
 * 视频节点（脚本→视频工作流）
 * @module core/platform/workflow/nodes/video-nodes
 * @description
 *  - video-gen：AI 视频生成（文生视频 / 图生视频），复用 video-generation.service；
 *    异步任务监听 video:generation-event 等完成后返回 videoPath。
 *  - video-compose：ffmpeg 合成（图/视频段 → 按时长拼接 + 烧录字幕 + 配音 + BGM）。
 *    节点 handler 运行于主进程（非 vm 沙箱），可调用 ffmpeg（@ffmpeg-installer）。
 */

import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { getPathProvider } from '@core/interfaces/path.interface'
import { resolveAssetPath } from '@core/utils/asset-path'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { VideoGenerationService } from '@core/platform/episode-production/render/video/video-generation.service'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

/** 主进程 ffmpeg 可执行路径（@ffmpeg-installer 缓存了与平台匹配的二进制） */
function ffmpegBin(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const inst = require('@ffmpeg-installer/ffmpeg') as { path?: string }
    return inst.path || 'ffmpeg'
  } catch {
    return 'ffmpeg'
  }
}

/** 同步执行 ffmpeg（失败抛错） */
function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegBin()
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    proc.stderr.on('data', d => (err += d.toString()))
    proc.on('error', e => reject(new Error('ffmpeg 启动失败: ' + e.message)))
    proc.on('close', code => {
      if (code === 0) resolve(err)
      else reject(new Error('ffmpeg 失败(exit ' + code + '): ' + err.slice(-600)))
    })
  })
}

/** 图片可分辨率的类似宽高比目标：按 scale/crop 到目标尺寸 */
function coverFilter(outW: number, outH: number): string {
  return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`
}

/**
 * 解析可能带自定义协议的本地资源路径（local-file:// / local-video:// / local-image:// 等）。
 * 这些协议 URL 由 toAssetUrl 生成；这里去掉协议前缀后按 dataPath 拼接成真实绝对路径，
 * 便于 existsSync / ffmpeg 读取。若已是绝对路径或无协议则按 resolveAssetPath 处理。
 */
function resolveMediaPath(p: string): string {
  const trimmed = (p ?? '').trim()
  if (!trimmed) return trimmed
  // 去掉自定义协议前缀（local-*://...）
  const stripped = trimmed.replace(/^local-[a-z]+:\/\//i, '').replace(/^\//, '')
  // 去掉协议后仍可能是相对路径（如 voice/tts/x.wav）→ 拼 dataPath；绝对路径原样
  return resolveAssetPath(stripped)
}

const videoGenNode: WorkflowNodeHandler = {
  type: 'video-gen',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'videoPath', type: 'string', desc: '生成的视频本地路径' },
    { key: 'videoUrl', type: 'string', desc: '视频可访问 URL' },
    { key: 'taskId', type: 'string', desc: '异步生成任务 ID（同步模式为空）' },
  ],
  validateConfig(config) {
    const cfg = config as { providerConfigId?: string; model?: string; prompt?: string; image?: string }
    const errors: string[] = []
    if (!cfg.providerConfigId) errors.push('必须指定视频 Provider')
    if (!cfg.model) errors.push('必须指定视频模型')
    if (stringifyValue(cfg.prompt).trim() === '' && stringifyValue(cfg.image).trim() === '') {
      errors.push('需提供提示词(prompt)或输入图(image)')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      providerConfigId: string
      model: string
      prompt?: string
      negativePrompt?: string
      image?: string
      duration?: number
      width?: number
      height?: number
      aspectRatio?: string
      motion?: string
    }
    const rawImage = stringifyValue(cfg.image)
    let imageInput: string | undefined
    if (rawImage) {
      if (rawImage.startsWith('local-')) {
        // local-image://... → 解析为本地文件再转 base64（图生视频 provider 需要可访问图）
        const p = resolveAssetPath(rawImage.replace(/^local-[a-z]+:\/\//i, '').replace(/^\//, ''))
        imageInput = existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : rawImage
      } else if (existsSync(rawImage)) {
        imageInput = `data:image/png;base64,${readFileSync(rawImage).toString('base64')}`
      } else {
        imageInput = rawImage
      }
    }
    const resp = await VideoGenerationService.generateVideo({
      providerConfigId: cfg.providerConfigId,
      model: cfg.model,
      prompt: stringifyValue(cfg.prompt),
      negativePrompt: cfg.negativePrompt ? stringifyValue(cfg.negativePrompt) : undefined,
      image: imageInput,
      duration: cfg.duration,
      width: cfg.width,
      height: cfg.height,
      aspectRatio: cfg.aspectRatio,
      motion: cfg.motion,
      skipHistory: true,
    })
    if (!resp.success) return { status: 'failed', error: `视频生成失败: ${resp.error ?? '未知错误'}` }
    if (resp.video?.localPath) {
      return {
        status: 'succeeded',
        output: { videoPath: resp.video.localPath, videoUrl: ((resp.video as unknown as { url?: string }).url ?? ''), taskId: '' },
      }
    }
    const taskId = resp.taskId
    if (!taskId) return { status: 'failed', error: '未返回任务 ID 或视频结果' }
    // 异步：等待 generation-completed 事件
    const videoPath = await new Promise<string | null>(resolve => {
      let unsub: (() => void) | undefined
      try {
        unsub = getEventEmitter().tapEvents?.((channel, data) => {
          if (channel === 'video:generation-event') {
            const ev = data as { taskId?: string; type?: string; video?: { localPath?: string } }
            if (ev?.taskId === taskId && ev?.type === 'generation-completed' && ev?.video?.localPath) {
              unsub?.()
              resolve(ev.video.localPath as string)
            }
          }
        })
      } catch { /* tapEvents 缺失则等待后超时失败 */ }
      setTimeout(() => resolve(null), 12 * 60 * 1000)
    })
    if (!videoPath) return { status: 'failed', error: '视频生成等待超时（12 分钟）' }
    return { status: 'succeeded', output: { videoPath, videoUrl: '', taskId } }
  },
}

const videoComposeNode: WorkflowNodeHandler = {
  type: 'video-compose',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'videoPath', type: 'string', desc: '合成的视频本地路径' },
    { key: 'duration', type: 'number', desc: '成片时长（秒）' },
  ],
  validateConfig(config) {
    const cfg = config as { segments?: unknown; width?: number; height?: number }
    const errors: string[] = []
    if (!Array.isArray(cfg.segments) || cfg.segments.length === 0) errors.push('至少提供一个镜头段(segments)')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      segments: Array<{ source: string; kind: 'image' | 'video'; duration: number; caption?: string }>
      audioPath?: string
      bgmPath?: string
      width?: number
      height?: number
      outputName?: string
    }
    // 解析可能带 local-*:// 协议的本地路径（tts 返回 local-file://、vid1 返回文件路径）
    const segs = (cfg.segments ?? []).map(s => ({
      source: resolveMediaPath(stringifyValue(s.source)),
      kind: (stringifyValue(s.kind) === 'video' ? 'video' : 'image') as 'image' | 'video',
      duration: Number(s.duration) > 0 ? Number(s.duration) : 3,
      caption: stringifyValue(s.caption),
    }))
    for (const s of segs) if (!existsSync(s.source)) return { status: 'failed', error: `镜头段文件不存在: ${s.source}` }
    const audioPath = resolveMediaPath(cfg.audioPath ? stringifyValue(cfg.audioPath) : '')
    if (audioPath && !existsSync(audioPath)) return { status: 'failed', error: `音频文件不存在: ${audioPath}` }
    const bgmPath = resolveMediaPath(cfg.bgmPath ? stringifyValue(cfg.bgmPath) : '')
    if (bgmPath && !existsSync(bgmPath)) return { status: 'failed', error: `BGM 文件不存在: ${bgmPath}` }

    const width = cfg.width && cfg.width > 0 ? cfg.width : 1080
    const height = cfg.height && cfg.height > 0 ? cfg.height : 1920
    const dataPath = getPathProvider().getDataPath()
    const outDir = join(dataPath, 'videos')
    mkdirSync(outDir, { recursive: true })
    const name = (cfg.outputName ? stringifyValue(cfg.outputName) : 'video') + '_' + Date.now().toString(36)
    const tmpDir = join(outDir, name + '_parts')
    mkdirSync(tmpDir, { recursive: true })

    try {
      // 1) 逐段生成统一分辨率 mp4
      const partFiles: string[] = []
      let t = 0
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const part = join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp4`)
        const dur = Math.max(0.2, s.duration)
        const vf = s.kind === 'image'
          ? `${coverFilter(width, height)},fps=30`
          : `${coverFilter(width, height)},fps=30`
        await runFfmpeg([
          '-y',
          ...(s.kind === 'image' ? ['-loop', '1', '-i', s.source] : ['-i', s.source]),
          '-t', String(dur),
          '-vf', vf,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
          '-an', part,
        ])
        partFiles.push(part)
        t += dur
      }

      // 2) 烧录字幕（拼接段按时间轴生成 srt）
      const hasCaptions = segs.some(s => s.caption)
      let subtitleFilter = ''
      if (hasCaptions) {
        const srtPath = join(tmpDir, 'sub.srt')
        let srt = ''
        let cur = 0
        const fmt = (sec: number): string => {
          const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000)
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
        }
        segs.forEach((s, idx) => {
          const end = Math.min(t, cur + Math.max(0.2, s.duration))
          if (s.caption) { srt += `${idx + 1}\n${fmt(cur)} --> ${fmt(end)}\n${s.caption}\n\n` }
          cur = end
        })
        writeFileSync(srtPath, srt, 'utf-8')
        subtitleFilter = `,subtitles=${srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')}`
      }

      // 3) concat 拼接
      const concatList = join(tmpDir, 'list.txt')
      writeFileSync(concatList, partFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf-8')
      const concated = join(tmpDir, 'concat.mp4')
      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', concated])

      // 4) 成片：视频 + 字幕烧录 +（配音/BGM 混音或纯音轨）
      const final = join(outDir, name + '.mp4')
      if (audioPath || bgmPath) {
        // 视频链：烧字幕（若有字幕）；音频链：配音 +（可选）BGM 混音（BGM 压低避人声）
        const videoPart = hasCaptions ? `[0:v]${subtitleFilter.slice(1)}[v]` : `[0:v]null[v]`
        const audioPart = bgmPath
          ? `[1:a]volume=1.0[a1];[2:a]volume=0.16[a2];[a1][a2]amix=inputs=2:duration=first:normalize=0[a]`
          : `[1:a]anull[a]`
        await runFfmpeg([
          '-y', '-i', concated, '-i', audioPath, ...(bgmPath ? ['-i', bgmPath] : []),
          '-filter_complex', `${videoPart};${audioPart}`,
          '-map', '[v]', '-map', '[a]',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
          '-t', String(t), final,
        ])
      } else {
        await runFfmpeg([
          '-y', '-i', concated,
          ...(hasCaptions ? ['-vf', subtitleFilter.slice(1)] : []),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', final,
        ])
      }
      return { status: 'succeeded', output: { videoPath: final, duration: t } }
    } catch (e) {
      return { status: 'failed', error: '视频合成失败: ' + ((e as Error).message ?? String(e)) }
    } finally {
      try { rmSyncSafe(tmpDir) } catch { /* 清理失败忽略 */ }
    }
  },
}

function rmSyncSafe(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

export const VIDEO_NODE_HANDLERS = [videoGenNode, videoComposeNode]
