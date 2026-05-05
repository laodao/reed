/**
 * fluent-ffmpeg runner + fs FileWriter（spec §6.2 · P6-T5 PC 端实现）
 * @module electron/ipc/handlers/episode-production/compose/episode-mp4-exporter.runner
 *
 * 给 EpisodeMp4ExporterService 提供运行时实现：
 *   - FluentFfmpegRunner：用 fluent-ffmpeg 真跑 ffmpeg，捕获 progress + duration
 *   - NodeFileWriter：fs.writeFileSync 写 SRT；getTempPath 走 path-provider 临时目录
 *
 * Web 端不该 import 此文件（需 fs / ffmpeg binary）；如要 Web 导出，需要 server-side
 * ffmpeg-static 实现，作为后续 follow-up。
 */

import { execFileSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import { getPathProvider } from '@core/interfaces/path.interface'
import type {
  FfmpegRunner,
  FileWriter,
} from '@core/modules/episode-production/compose/episode-mp4-exporter.service'

/**
 * 选 ffmpeg / ffprobe 路径：
 *   1. FFMPEG_PATH / FFPROBE_PATH 环境变量（最高优先，部署/测试覆盖）
 *   2. 系统 PATH 上的 ffmpeg / ffprobe（推荐：发行版打包 ≥ 4.3 支持 xfade 等新 filter）
 *   3. @ffmpeg-installer/ffmpeg 自带 binary（兜底；该 binary 是 2018 年 N-47683 nightly，
 *      不支持 xfade（4.3，2020 年才引入）等较新 filter，仅作 fallback）
 */
function resolveBinary(envVar: string, name: string, installerPath: string): string {
  const fromEnv = process.env[envVar]
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  try {
    // execFileSync 不走 shell，无注入风险（命令名是固定字符串）
    const out = execFileSync('which', [name], { encoding: 'utf8' }).trim()
    if (out && fs.existsSync(out)) return out
  } catch {
    // which 失败：name 不在 PATH 上
  }
  return installerPath
}

const RESOLVED_FFMPEG = resolveBinary('FFMPEG_PATH', 'ffmpeg', ffmpegPath.path)
const RESOLVED_FFPROBE = resolveBinary('FFPROBE_PATH', 'ffprobe', ffprobePath.path)
console.log('[FluentFfmpegRunner] using ffmpeg:', RESOLVED_FFMPEG)
console.log('[FluentFfmpegRunner] using ffprobe:', RESOLVED_FFPROBE)
ffmpeg.setFfmpegPath(RESOLVED_FFMPEG)
ffmpeg.setFfprobePath(RESOLVED_FFPROBE)

/** fluent-ffmpeg 实现：跑 ffmpeg + 解析输出时长 */
export class FluentFfmpegRunner implements FfmpegRunner {
  async run(args: {
    inputs: string[]
    filterComplex: string
    outputArgs: string[]
    outputPath: string
  }): Promise<{ outputPath: string; durationSec: number }> {
    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
      for (const inp of args.inputs) cmd.input(inp)
      cmd.complexFilter(args.filterComplex)
      cmd.outputOptions(args.outputArgs)
      cmd.output(args.outputPath)

      let lastDurationSec = 0
      let stderrTail = ''
      cmd.on('start', (commandLine: string) => {
        console.log('[FluentFfmpegRunner] command:', commandLine)
      })
      cmd.on('stderr', (line: string) => {
        // 累积最后 2k 字符的 stderr 用于失败诊断
        stderrTail = (stderrTail + '\n' + line).slice(-2000)
      })
      cmd.on('progress', (p: any) => {
        if (p?.timemark && typeof p.timemark === 'string') {
          lastDurationSec = parseTimemark(p.timemark)
        }
      })

      cmd.on('error', (err) => {
        console.error('[FluentFfmpegRunner] failed; stderr tail:\n', stderrTail)
        reject(new Error(`${err.message}\n--- ffmpeg stderr ---\n${stderrTail}`))
      })
      cmd.on('end', () => {
        // 通过 ffprobe 取最终 duration，比 progress 更精确
        ffmpeg.ffprobe(args.outputPath, (probeErr, data) => {
          if (probeErr || !data?.format?.duration) {
            resolve({ outputPath: args.outputPath, durationSec: lastDurationSec })
          } else {
            resolve({
              outputPath: args.outputPath,
              durationSec: Number(data.format.duration) || lastDurationSec,
            })
          }
        })
      })
      cmd.run()
    })
  }
}

/** fs 实现 + path-provider 临时目录 */
export class NodeFileWriter implements FileWriter {
  constructor(private readonly projectId: string = 'default') {}

  async writeText(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
  }

  getTempPath(suffix: string): string {
    const userDataPath = getPathProvider().getUserDataPath()
    const tempDir = path.join(userDataPath, 'episode-production', this.projectId, 'compose-temp')
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
    return path.join(tempDir, `subtitle_${Date.now()}${suffix}`)
  }
}

function parseTimemark(tm: string): number {
  // "00:00:05.20" → 5.2
  const m = tm.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}
