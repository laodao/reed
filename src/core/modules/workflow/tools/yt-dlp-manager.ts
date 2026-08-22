/**
 * yt-dlp 二进制管理（P0 增强：多平台视频解析后端）
 * @module core/modules/workflow/tools/yt-dlp-manager
 * @description 管理 yt-dlp 独立可执行文件（官方 PyInstaller 打包，无需 Python 环境）：
 *  - 探测：数据目录 bin/yt-dlp(.exe)（或资源目录）
 *  - 下载：不存在时从 GitHub latest release 按平台拉取（惰性，首次使用时）
 *  - 状态：可用/不可用（下载失败不阻断——上层回退内置逻辑并给提示）
 *
 * 用户交互简化：只需填视频 URL；二进制获取全自动，失败才提示手动放置。
 */

import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('YtDlpManager')

/** 官方 release 下载地址（latest 重定向到最新版） */
const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/'

/** 各平台 release 文件名（官方约定） */
function releaseFileForPlatform(): string {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32') return 'yt-dlp.exe'
  if (platform === 'darwin') return arch === 'arm64' ? 'yt-dlp_macos' : 'yt-dlp_macos'
  return 'yt-dlp_linux'
}

/** 二进制文件名（本机） */
export function binaryFileName(): string {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
}

export class YtDlpManager {
  private static instance: YtDlpManager | null = null

  private constructor() {}

  static getInstance(): YtDlpManager {
    if (!YtDlpManager.instance) {
      YtDlpManager.instance = new YtDlpManager()
    }
    return YtDlpManager.instance
  }

  /** 二进制目录：数据目录/bin */
  private binDir(): string {
    return join(getPathProvider().getDataPath(), 'bin')
  }

  binaryPath(): string {
    return join(this.binDir(), binaryFileName())
  }

  isInstalled(): boolean {
    return existsSync(this.binaryPath())
  }

  /**
   * 确保二进制可用：已存在直接返回路径；否则尝试下载（幂等，并发防重）。
   * 返回 null 表示不可用（下载失败/网络不可用）。
   */
  async ensureBinary(): Promise<string | null> {
    const path = this.binaryPath()
    if (existsSync(path)) return path

    // 防并发重复下载（进程内简单互斥）
    if (this._downloading) {
      await this._downloading
      return existsSync(path) ? path : null
    }
    this._downloading = this.download()
    try {
      await this._downloading
    } finally {
      this._downloading = null
    }
    return existsSync(path) ? path : null
  }

  private _downloading: Promise<void> | null = null

  private async download(): Promise<void> {
    const dir = this.binDir()
    mkdirSync(dir, { recursive: true })
    const file = releaseFileForPlatform()
    const url = `${RELEASE_BASE}${file}`
    const target = this.binaryPath()
    logger.info('[yt-dlp] 开始下载二进制', { url })
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
        headers: { 'User-Agent': 'the-bot/2.0' },
      })
      if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      // 简易校验：最小体积（~10MB 级）+ 非 HTML 错误页
      if (buf.length < 1_000_000 || buf.slice(0, 5).toString().includes('<html')) {
        throw new Error(`下载内容异常（${buf.length} bytes）`)
      }
      const { writeFileSync, chmodSync } = await import('fs')
      writeFileSync(target, buf)
      if (process.platform !== 'win32') {
        try { chmodSync(target, 0o755) } catch { /* Windows 无此概念 */ }
      }
      logger.info('[yt-dlp] 二进制下载完成', { bytes: buf.length })
    } catch (e) {
      logger.error('[yt-dlp] 二进制下载失败（回退内置解析）', e)
      throw e
    }
  }

  /** 清理单例（测试用） */
  static resetForTest(): void {
    YtDlpManager.instance = null
  }

  /**
   * 用 yt-dlp 从 URL 提取音频（处理 cookies/referer/平台差异，内部完成下载+转码）。
   * @param url 视频 URL（YouTube/西瓜/微博等 yt-dlp 支持的站点）
   * @param outBase 输出基础路径（不含扩展名；yt-dlp 会生成 .wav）
   * @returns 生成的 wav 路径；不可用/失败返回 { error }
   */
  async extractAudioFromUrl(url: string, outBase: string): Promise<{ path: string } | { error: string }> {
    const bin = await this.ensureBinary()
    if (!bin) {
      return {
        error: '未找到 yt-dlp 且自动下载失败（可能网络不可用）。请手动下载 yt-dlp(.exe) 放入数据目录 bin/ 后重试，或使用本地视频文件。',
      }
    }

    // ffmpeg 位置：yt-dlp 转码音频需要 ffmpeg（项目内置）
    let ffmpegDir = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ffmpegDir = require('ffmpeg-static') ? require('path').dirname(require('ffmpeg-static')) : ''
    } catch {
      ffmpegDir = ''
    }

    const args = [
      '--no-playlist',          // 防误下整个播放列表
      '--no-progress', '--quiet', '--no-warnings',
      '--socket-timeout', '30',
      '-x',                     // 提取音频
      '--audio-format', 'wav',  // STT 需要 wav
      '--audio-quality', '0',
      '-o', `${outBase}.%(ext)s`,
    ]
    if (ffmpegDir) args.push('--ffmpeg-location', ffmpegDir)
    args.push(url)

    try {
      const { spawn } = await import('child_process')
      const stderr = await new Promise<string>((resolve, reject) => {
        const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
        let err = ''
        proc.stderr.on('data', (c) => { err += c.toString() })
        proc.on('error', reject)
        proc.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`yt-dlp exit ${code}: ${err.slice(-400)}`))))
      })
      void stderr
      // 输出文件名：outBase.wav（yt-dlp -x 转换后）
      const { existsSync } = await import('fs')
      if (existsSync(`${outBase}.wav`)) {
        logger.info('[yt-dlp] 音频提取完成', { url: url.slice(0, 80), out: `${outBase}.wav` })
        return { path: `${outBase}.wav` }
      }
      return { error: 'yt-dlp 执行完成但未生成音频文件' }
    } catch (e) {
      logger.error('[yt-dlp] 音频提取失败', e)
      const msg = e instanceof Error ? e.message : String(e)
      // 常见原因归类（给用户可操作的提示）
      if (/geo|unavailable/i.test(msg)) {
        return { error: `视频受地域/登录限制：${msg.slice(0, 200)}` }
      }
      return { error: `yt-dlp 提取失败：${msg.slice(0, 200)}` }
    }
  }
}
