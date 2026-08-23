/**
 * 资产磁盘存储服务
 * @module core/modules/assets/asset-storage
 * @description 资产文件的落盘/读取/删除。资产根目录 = dataPath/assets/<大类>/<yyyyMM>/<文件>，
 *              DB 只存相对 dataPath 的相对路径（随数据路径迁移安全）。
 *
 *              内容来源四种形态统一收敛到 saveFileFromSource：
 *              - data: URI          → base64 解码落盘
 *              - local-*:// 协议 URL → 剥协议解析为本地文件后复制
 *              - http(s)://         → fetch 下载落盘
 *              - 其余                → 视为本地路径（绝对或相对 dataPath）复制
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { resolveAssetPath } from '@core/utils/asset-path'
import { ASSET_CATEGORIES, type AssetCategory } from '@shared/types/asset.types'

/** 常见扩展名 → MIME（探测不到时兜底 application/octet-stream） */
const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg',
  m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/opus',
  mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', flv: 'video/x-flv',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  zip: 'application/zip', html: 'text/html',
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus']
const VIDEO_EXTS = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv']
const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
const TEXT_EXTS = ['txt', 'md', 'csv', 'html']
const JSON_EXTS = ['json']

export interface SavedFileInfo {
  /** 相对 dataPath 的存储路径（写库用） */
  storagePath: string
  sizeBytes: number
  mimeType: string
  /** 附加元数据（宽高等探测结果） */
  metadata: Record<string, unknown>
}

export class AssetStorageService {
  /** 资产根目录：dataPath/assets */
  getAssetsDir(): string {
    return path.join(getPathProvider().getDataPath(), 'assets')
  }

  /** 把相对路径解析为资产绝对路径（读文件/打开目录用） */
  resolveStoredPath(relOrAbs: string): string {
    return resolveAssetPath(relOrAbs)
  }

  /** 按文件名扩展名自动探测大类（保存节点未显式指定时用） */
  deriveCategoryFromName(fileName: string): AssetCategory {
    const ext = extOf(fileName).toLowerCase()
    if (IMAGE_EXTS.includes(ext)) return ASSET_CATEGORIES.image
    if (AUDIO_EXTS.includes(ext)) return ASSET_CATEGORIES.audio
    if (VIDEO_EXTS.includes(ext)) return ASSET_CATEGORIES.video
    if (DOC_EXTS.includes(ext)) return ASSET_CATEGORIES.document
    if (TEXT_EXTS.includes(ext)) return ASSET_CATEGORIES.text
    if (JSON_EXTS.includes(ext)) return ASSET_CATEGORIES.json
    return ASSET_CATEGORIES.other
  }

  /**
   * 把"内容来源"落盘为资产文件（四种形态统一入口）。
   * @param source 本地路径 / http(s) URL / data: URI / local-*:// URL
   * @param category 目标大类（决定子目录）
   * @param name 期望文件名（缺省从 source 推断）
   */
  async saveFileFromSource(source: string, category: AssetCategory, name?: string): Promise<SavedFileInfo> {
    const trimmed = source.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      return this.downloadFromUrl(trimmed, category, name)
    }
    return this.saveLocalContent(trimmed, category, name)
  }

  /** 远程 URL 下载落盘 */
  async downloadFromUrl(url: string, category: AssetCategory, name?: string): Promise<SavedFileInfo> {
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`下载失败: HTTP ${resp.status}`)
    }
    const buffer = Buffer.from(await resp.arrayBuffer())
    const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || undefined
    return this.writeBuffer(buffer, category, name, mimeType)
  }

  /** 删除资产对应的磁盘文件（文件型；缺失不抛错） */
  deleteStoredFile(storagePath: string | null | undefined): void {
    if (!storagePath) return
    try {
      const abs = this.resolveStoredPath(storagePath)
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    } catch (e) {
      // 文件删除失败不阻断资产记录删除（孤儿文件由磁盘清理兜底）
      console.warn('[AssetStorage] 删除资产文件失败（忽略）:', storagePath, e)
    }
  }

  /** 读取文件型资产文本内容（md/html/txt/json 等；文件缺失/读取失败返回空串） */
  readStoredText(storagePath: string | null | undefined): string {
    if (!storagePath) return ''
    try {
      const abs = this.resolveStoredPath(storagePath)
      if (!fs.existsSync(abs)) return ''
      return fs.readFileSync(abs, 'utf-8')
    } catch {
      return ''
    }
  }

  /** 本地内容落盘：data: URI / local-*:// URL / 本地路径 */
  private async saveLocalContent(source: string, category: AssetCategory, name?: string): Promise<SavedFileInfo> {
    const buffer = this.readLocalSourceBuffer(source)
    return this.writeBuffer(buffer, category, name)
  }

  /** 把 Buffer 写入资产目录（文件名/去重/探测统一在这里） */
  private async writeBuffer(buffer: Buffer, category: AssetCategory, name?: string, headerMime?: string): Promise<SavedFileInfo> {
    const sourceName = name?.trim() || 'asset'
    const ext = extOf(sourceName)
    const safeBase = sanitizeFileName(ext ? sourceName.slice(0, sourceName.length - ext.length - 1) : sourceName)
    const safeName = ext ? `${safeBase}.${ext}` : safeBase

    const now = new Date()
    const yyyyMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const dir = path.join(this.getAssetsDir(), category, yyyyMM)
    fs.mkdirSync(dir, { recursive: true })

    const targetPath = dedupePath(path.join(dir, safeName))
    fs.writeFileSync(targetPath, buffer)

    const mimeType = headerMime ?? EXT_MIME[ext] ?? detectMimeFromBuffer(buffer) ?? 'application/octet-stream'
    const metadata = await this.probeMetadata(targetPath, ext)
    return {
      storagePath: toRelativeForDb(targetPath),
      sizeBytes: buffer.length,
      mimeType,
      metadata,
    }
  }

  /** 读取本地内容来源为 Buffer（data URI 解码 / 协议 URL 解析 / 本地路径读取） */
  private readLocalSourceBuffer(source: string): Buffer {
    if (source.startsWith('data:')) {
      const comma = source.indexOf(',')
      if (comma < 0) throw new Error('无效的 data URI（缺少逗号分隔）')
      return Buffer.from(source.slice(comma + 1), 'base64')
    }
    if (/^local-(image|file|video):\/\//i.test(source)) {
      return fs.readFileSync(this.resolveStoredPath(stripLocalScheme(source)))
    }
    // 本地路径（绝对 / 相对 dataPath）
    return fs.readFileSync(resolveAssetPath(source))
  }

  /** 图片元数据探测（sharp；失败静默返回空） */
  private async probeMetadata(filePath: string, ext: string): Promise<Record<string, unknown>> {
    if (!IMAGE_EXTS.includes(ext)) return {}
    try {
      const sharp = (await import('sharp')).default
      const meta = await sharp(filePath).metadata()
      const out: Record<string, unknown> = {}
      if (meta.width) out.width = meta.width
      if (meta.height) out.height = meta.height
      if (meta.format) out.format = meta.format
      return out
    } catch {
      return {}
    }
  }
}

// ==================== 工具函数 ====================

/** 提取扩展名（小写，无点） */
function extOf(fileNameOrUrl: string): string {
  const cleaned = fileNameOrUrl.split(/[?#]/)[0]
  const dot = cleaned.lastIndexOf('.')
  if (dot < 0) return ''
  const ext = cleaned.slice(dot + 1)
  return /^[a-zA-Z0-9]{1,10}$/.test(ext) ? ext.toLowerCase() : ''
}

/** 文件名净化：去掉路径分隔与非法字符，限制长度 */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 120) || 'asset'
}

/** 重名去重：追加 -1/-2... 序号 */
function dedupePath(targetPath: string): string {
  if (!fs.existsSync(targetPath)) return targetPath
  const dir = path.dirname(targetPath)
  const ext = path.extname(targetPath)
  const base = path.basename(targetPath, ext)
  let i = 1
  let candidate = path.join(dir, `${base}-${i}${ext}`)
  while (fs.existsSync(candidate)) {
    i += 1
    candidate = path.join(dir, `${base}-${i}${ext}`)
  }
  return candidate
}

/** 绝对路径 → 相对 dataPath（写库前调用） */
function toRelativeForDb(absPath: string): string {
  const dataPath = getPathProvider().getDataPath()
  const rel = path.relative(dataPath, absPath).replace(/\\/g, '/')
  return rel.startsWith('..') ? absPath.replace(/\\/g, '/') : rel
}

/** 剥 local-*:// 协议前缀，还原本地路径（双斜杠相对形态 / 三斜杠绝对形态） */
function stripLocalScheme(url: string): string {
  const withoutScheme = url.replace(/^local-[a-z]+:\/\//i, '')
  if (withoutScheme.startsWith('/')) {
    // 三斜杠形态：协议后是绝对路径（/C:/... 或 /home/...）
    return withoutScheme.replace(/^\/([A-Za-z]:)/, '$1')
  }
  return withoutScheme
}

/** 从二进制嗅探常见 MIME（图片/音频/视频魔数） */
function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.toString('ascii', 0, 4) === 'RIFF') {
    const kind = buffer.toString('ascii', 8, 12)
    if (kind === 'WAVE') return 'audio/wav'
    if (kind === 'WEBP') return 'image/webp'
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4'
  if (buffer.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg'
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
  return null
}
