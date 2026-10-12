/**
 * 视频解析 ffmpeg helpers（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
 *
 * 主进程使用（ffmpeg-static 是 Node native；渲染端不能 import）。
 *
 * 提供：
 *   - getVideoMetadata：取视频时长 / 分辨率
 *   - detectShots：scene detection（select='gt(scene,N)' filter 抽 shot 边界）
 *   - extractFrame：从指定时间点抽一帧
 *   - extractAudio：抽音频流到 wav
 *
 * 安全：所有调用都用 child_process.spawn(file, args[]) 形式（不走 shell，无注入风险）。
 * videoPath 等参数虽来自用户上传，但作为 args 数组元素传递不会被 shell 解析。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { existsSync } from 'fs'
import { spawn as nodeSpawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

/**
 * ffmpeg 可执行文件：优先随包 ffmpeg-static 二进制；缺失时回退系统 PATH 的 ffmpeg
 * （打包/CI 未下载二进制时仍可用，spawn 数组参数无 shell 注入风险）。
 */
function resolveFfmpegBin(): string {
  if (ffmpegPath && existsSync(ffmpegPath)) return ffmpegPath
  return 'ffmpeg' // 系统 PATH（Windows scoop/choco 等均提供）
}

const FFMPEG_BIN: string = resolveFfmpegBin()

/**
 * ffmpeg 单次调用超时（秒）。默认 30 分钟，可用 EP_FFMPEG_TIMEOUT_SEC 覆盖
 * （与 compose/ffmpeg-assembler.service.ts 的 runFFmpegCommand 保持同一约定与默认值）。
 *
 * 复核修复 P1-1：此前本文件无任何超时/kill 保护——ffmpeg 挂死（损坏视频、卡住的
 * 网络流）会让 Promise 永不 settle、子进程永不退出（僵尸进程累积）。同仓库
 * ffmpeg-assembler 早已加了 timeout，这里属漏改。
 */
function ffmpegTimeoutMs(): number {
  const sec = Number(process.env.EP_FFMPEG_TIMEOUT_SEC) || 30 * 60
  return sec * 1000
}

/**
 * 跑 ffmpeg 命令（args 数组形式，不走 shell；无命令注入风险）。
 * stderr 收集（ffmpeg 大部分输出走 stderr）；reject on non-zero exit / 超时 / spawn 失败。
 * 超时到点强制 SIGKILL，并保证 resolve/reject 只触发一次、定时器必被清理。
 */
function runFfmpeg(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = nodeSpawn(FFMPEG_BIN, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,  // 显式禁用 shell（args 数组不会被 shell 解析）
    })
    let stderr = ''
    let settled = false
    const timeoutMs = ffmpegTimeoutMs()

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // SIGKILL：ffmpeg 对 SIGTERM 在部分平台/状态下不响应，必须强杀
      try {
        proc.kill('SIGKILL')
      } catch {
        /* 进程可能已退出，忽略 */
      }
      reject(new Error(`ffmpeg 超时（${timeoutMs / 1000}s）已终止: ${args.slice(-3).join(' ')}`))
    }, timeoutMs)

    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    proc.on('error', (err) => done(() => reject(err)))
    proc.on('close', (code) => {
      done(() => {
        if (code === 0) resolve({ stderr })
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`))
      })
    })
  })
}

/** 解析视频 metadata（用 ffmpeg -i 让 stderr 输出 metadata；exit code 1 但 stderr 含信息）*/
export async function getVideoMetadata(
  videoPath: string,
  opts?: { headers?: Record<string, string> },
): Promise<{
  durationSec: number
  width: number
  height: number
}> {
  const args: string[] = []
  if (opts?.headers && Object.keys(opts.headers).length > 0) {
    const headerText = Object.entries(opts.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n')
    args.push('-headers', headerText)
  }
  args.push('-i', videoPath)

  // 复核修复 P1-1：ffmpeg -i 探测属「exit code 1 但 stderr 有信息」的正常路径，故不能
  // 复用 runFfmpeg（它会 reject）；但同样必须有超时 + error 兜底——此前只 await 'close'，
  // spawn 失败（二进制缺失/权限）时既不 reject 也不 resolve，会静默永久挂起。
  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = nodeSpawn(FFMPEG_BIN, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
    })
    let out = ''
    let settled = false
    const timeoutMs = ffmpegTimeoutMs()

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        proc.kill('SIGKILL')
      } catch {
        /* 已退出 */
      }
      reject(new Error(`ffmpeg 探测元数据超时（${timeoutMs / 1000}s）: ${videoPath}`))
    }, timeoutMs)

    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    proc.stderr.on('data', (chunk) => { out += chunk.toString() })
    proc.on('error', (err) => done(() => reject(err)))
    // exit code 非 0 是预期（-i 无输出文件），照常拿 stderr
    proc.on('close', () => done(() => resolve(out)))
  })

  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
  let durationSec = 0
  if (durMatch) {
    const [, h, m, s] = durMatch
    durationSec = Number(h) * 3600 + Number(m) * 60 + Number(s)
  }
  const dimMatch = stderr.match(/(\d{3,4})x(\d{3,4})/)
  const width = dimMatch ? Number(dimMatch[1]) : 0
  const height = dimMatch ? Number(dimMatch[2]) : 0

  return { durationSec, width, height }
}

/**
 * 用 select='gt(scene,N)' filter 检测镜头切换。
 *
 * @param videoPath 视频绝对路径
 * @param threshold scene change 阈值（0.3 较敏感；0.5 较保守）
 * @returns shot 边界 [(start, end), ...]；duration 不足 1s 的 shot 跳过
 */
export async function detectShots(
  videoPath: string,
  threshold = 0.3,
): Promise<Array<{ startSec: number; endSec: number; durationSec: number }>> {
  const { durationSec } = await getVideoMetadata(videoPath)
  if (durationSec <= 0) return []

  const args = [
    '-i', videoPath,
    '-filter:v', `select='gt(scene,${threshold})',showinfo`,
    '-f', 'null',
    '-',
  ]
  const { stderr } = await runFfmpeg(args)
  const sceneTimes: number[] = [0]  // 第一个 shot 从 0 开始
  const re = /pts_time:([\d.]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stderr)) !== null) {
    const t = Number(m[1])
    if (!Number.isNaN(t) && t > 0) sceneTimes.push(t)
  }
  sceneTimes.push(durationSec)

  const shots: Array<{ startSec: number; endSec: number; durationSec: number }> = []
  for (let i = 0; i < sceneTimes.length - 1; i++) {
    const start = sceneTimes[i]
    const end = sceneTimes[i + 1]
    const dur = end - start
    if (dur < 1) continue  // 太短的跳过（false positive）
    shots.push({ startSec: start, endSec: end, durationSec: dur })
  }
  return shots
}

/** 从指定时间抽一帧 → JPG */
export async function extractFrame(
  videoPath: string,
  timeSec: number,
  outPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await runFfmpeg([
    '-ss', String(timeSec),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '3',
    '-y', outPath,
  ])
}

/** 抽音频流到 wav（用于 STT；URL 输入时可用 headers 带 Referer/UA 防盗链） */
export async function extractAudio(
  videoPath: string,
  outPath: string,
  opts?: { headers?: Record<string, string> },
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  const args: string[] = []
  if (opts?.headers && Object.keys(opts.headers).length > 0) {
    // ffmpeg -headers 多行："Key: Value\r\n..."（一次传所有头）
    const headerText = Object.entries(opts.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n')
    args.push('-headers', headerText)
  }
  args.push('-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', '-y', outPath)
  await runFfmpeg(args)
}

/** 从音频文件截取片段（超长音频分段转写：按 startSec 起、durationSec 长切一段 16kHz wav） */
export async function extractAudioSegment(
  inputPath: string,
  outPath: string,
  startSec: number,
  durationSec: number,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await runFfmpeg([
    '-ss', String(startSec),
    '-i', inputPath,
    '-t', String(durationSec),
    '-vn', '-ar', '16000', '-ac', '1', '-y', outPath,
  ])
}
