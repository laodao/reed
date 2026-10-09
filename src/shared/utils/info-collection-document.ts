/**
 * 信息搜集 · 文档直链探测（多模态 M1，2026-10-08）
 * @module shared/utils/info-collection-document
 * @description 判定一个 URL 是否为"文档直链"（.pdf/.docx/.xlsx/... 结尾的路径）。
 *              命中 → 走下载原件分支（executeHttpFetch file 模式 + extractTextFromFile），
 *              不走网页抓取。纯函数，可直测。
 *
 * 值域对齐 core/utils/extract-text.ts 的 inferFileType（doc 未实现不收、csv 不在提取器清单不收）。
 */

/** 可探测的文档扩展名（与 extract-text 提取器清单对齐） */
export const IC_DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xls', 'xlsx', 'epub', 'mobi', 'azw3', 'txt', 'md'] as const

export type IcDocumentExt = (typeof IC_DOCUMENT_EXTENSIONS)[number]

export interface IcDocumentProbe {
  /** 小写扩展名（不含点） */
  ext: IcDocumentExt
}

/**
 * 探测 URL 是否文档直链。
 * 只看 pathname 的结尾扩展名，忽略查询串与 hash；`filetype:pdf` 检索算子带来的
 * 结果多为直链，网页重定向到文档的由响应头嗅探兜底（服务层职责，此处不判）。
 */
export function detectDirectDocumentUrl(url: string): IcDocumentProbe | null {
  if (!url) return null
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const last = pathname.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = last.slice(dot + 1).toLowerCase()
  return (IC_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext) ? { ext: ext as IcDocumentExt } : null
}

/** 文档单件下载上限（字节；缺省 50MB，多模态设计 §9 红线） */
export const IC_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024

/** 可探测的图片扩展名（常见栅格图；svg 矢量文本不进 VLM 描述） */
export const IC_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] as const

export type IcImageExt = (typeof IC_IMAGE_EXTENSIONS)[number]

/**
 * 探测 URL 是否图片直链（多模态 M2）。与文档探测同规则：只看 pathname 结尾扩展名。
 */
export function detectImageUrl(url: string): { ext: IcImageExt } | null {
  if (!url) return null
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const last = pathname.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = last.slice(dot + 1).toLowerCase()
  return (IC_IMAGE_EXTENSIONS as readonly string[]).includes(ext) ? { ext: ext as IcImageExt } : null
}

/** 图片单件下载上限（字节；8MB——照片足够，防超大图占盘） */
export const IC_IMAGE_MAX_BYTES = 8 * 1024 * 1024

/** 单任务 VLM 图片描述上限（多模态设计 §9 红线：按张计费必须熔断） */
export const IC_MAX_IMAGE_DESCRIPTIONS = 20

/** 可解析的视频页(M3 元数据+字幕档);youtube/抖音风控强,当前如实不支持 */
export type IcVideoPlatform = 'bilibili'

/**
 * 探测 URL 是否已支持的视频页。bilibili: /video/BVxxx、b23.tv 短链。
 */
export function detectVideoPageUrl(url: string): { platform: IcVideoPlatform } | null {
  if (!url) return null
  let host = ''
  let path = ''
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    path = u.pathname
  } catch {
    return null
  }
  if (host === 'b23.tv') return { platform: 'bilibili' }
  if (host.endsWith('bilibili.com') && /\/video\/(BV|av)/i.test(path)) return { platform: 'bilibili' }
  return null
}

/** 可探测的音频扩展名（M4 转写） */
export const IC_AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'] as const

export type IcAudioExt = (typeof IC_AUDIO_EXTENSIONS)[number]

/** 探测 URL 是否音频直链（M4）。 */
export function detectAudioUrl(url: string): { ext: IcAudioExt } | null {
  if (!url) return null
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const last = pathname.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = last.slice(dot + 1).toLowerCase()
  return (IC_AUDIO_EXTENSIONS as readonly string[]).includes(ext) ? { ext: ext as IcAudioExt } : null
}

/** 音频单件下载上限（字节；100MB——1 小时级别播客量级） */
export const IC_AUDIO_MAX_BYTES = 100 * 1024 * 1024
/** 单条音频转写时长上限（秒；2 小时——超长播客不自动转写，防止烧穿预算） */
export const IC_MAX_TRANSCRIBE_SEC = 2 * 60 * 60
