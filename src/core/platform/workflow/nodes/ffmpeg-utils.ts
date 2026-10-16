/**
 * 节点级 ffmpeg 公共工具（播客合成 / 视频合成共用）
 * @module core/platform/workflow/nodes/ffmpeg-utils
 * @description 直接 spawn @ffmpeg-installer 的 ffmpeg 二进制（不走 fluent-ffmpeg、
 *              无 shell），以及本地媒体路径/时长探测等小工具。
 *              从 video-nodes.ts 抽出：videoComposeNode 与 podcastComposeNode 共用。
 */

import { spawn } from 'child_process'
import { rmSync } from 'fs'
import { resolveAssetPath } from '@core/utils/asset-path'

/** 主进程 ffmpeg 可执行路径（@ffmpeg-installer 缓存了与平台匹配的二进制） */
export function ffmpegBin(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const inst = require('@ffmpeg-installer/ffmpeg') as { path?: string }
    return inst.path || 'ffmpeg'
  } catch {
    return 'ffmpeg'
  }
}

/** 同步执行 ffmpeg（失败抛错），返回 stderr 全文（供探测/调试） */
export function runFfmpeg(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegBin()
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], ...(cwd ? { cwd } : {}) })
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
export function coverFilter(outW: number, outH: number): string {
  return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`
}

/** 解析 ffmpeg -i 输出，探测视频参数（分辨率/帧率/时长） */
export interface ProbedVideoInfo {
  width: number
  height: number
  fps: number
  durationSec: number
}
export function probeVideoInfo(bin: string, file: string): Promise<ProbedVideoInfo | null> {
  return new Promise<ProbedVideoInfo | null>(resolve => {
    const proc = spawn(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', d => (err += d.toString()))
    proc.on('close', () => {
      // 示例：  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 720x1280, 2849 kb/s, 24 fps
      // 示例：  Duration: 00:00:05.04, start: 0.000000, bitrate: 2887 kb/s
      const stream = err.match(/Video:.*?(\d{2,5})x(\d{2,5})[^,]*,\s*[\d.]+\s*(?:kb\/s|Mb\/s)?[^,]*,?\s*([\d.]+)\s*fps/)
      const dur = err.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
      if (!stream) return resolve(null)
      const width = Number(stream[1])
      const height = Number(stream[2])
      const fps = Number(stream[3]) || 30
      const durationSec = dur
        ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
        : 0
      resolve({ width, height, fps, durationSec })
    })
    proc.on('error', () => resolve(null))
  })
}

/** 解析 ffmpeg -i 输出探测音频时长（秒）；探测失败 → null */
export function probeAudioDurationSec(bin: string, file: string): Promise<number | null> {
  return new Promise<number | null>(resolve => {
    const proc = spawn(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', d => (err += d.toString()))
    proc.on('close', () => {
      const dur = err.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
      if (!dur) return resolve(null)
      const sec = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
      resolve(sec > 0 ? sec : null)
    })
    proc.on('error', () => resolve(null))
  })
}

/**
 * 解析可能带自定义协议的本地资源路径（local-file:// / local-video:// / local-image:// 等）。
 * 这些协议 URL 由 toAssetUrl 生成（dataPath 相对路径）；去协议前缀后按 dataPath 拼接成
 * 真实绝对路径，便于 existsSync / ffmpeg 读取。
 * 无协议的路径不做前缀剥离：POSIX 绝对路径（如 video-gen 落盘的 userDataPath 绝对路径）
 * 原样交 resolveAssetPath（绝对直接返回）；此前无条件剥 `/` 会把绝对路径二次拼 dataPath，
 * Linux/macOS 桌面端合成阶段必然"镜头段文件不存在"。
 */
export function resolveMediaPath(p: string): string {
  const trimmed = (p ?? '').trim()
  if (!trimmed) return trimmed
  if (!/^local-[a-z]+:\/\//i.test(trimmed)) return resolveAssetPath(trimmed)
  // 去掉自定义协议前缀（local-*://...）后仍可能是相对路径（如 voice/tts/x.wav）→ 拼 dataPath
  const stripped = trimmed.replace(/^local-[a-z]+:\/\//i, '').replace(/^\//, '')
  return resolveAssetPath(stripped)
}

/** 递归删除临时目录（清理失败忽略） */
export function rmSyncSafe(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
