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

ffmpeg.setFfmpegPath(ffmpegPath.path)
ffmpeg.setFfprobePath(ffprobePath.path)

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
      cmd.on('progress', (p: any) => {
        // p.timemark 形如 "00:00:05.20"
        if (p?.timemark && typeof p.timemark === 'string') {
          lastDurationSec = parseTimemark(p.timemark)
        }
      })

      cmd.on('error', (err) => reject(err))
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
