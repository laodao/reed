/**
 * 资产下载纯函数（文件名清洗 / 扩展名补齐 / URL 快捷方式内容）
 * @module core/modules/assets/asset-download
 * @description 桌面端（主进程对话框 + 复制/写文件）与 Web 端（浏览器下载）共用，
 *              保证两侧下载出的文件名/内容一致。业务组装见 AssetService.buildDownloadPayload。
 */

/** 文件名清洗：剥离 Windows 非法字符（<>:"/\|?* 与控制字符），去首尾空白；空名兜底 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').trim()
  return cleaned || 'asset'
}

/** 确保文件名带扩展名（已有同后缀不重复，不区分大小写）；空名兜底为 asset.<ext> */
export function ensureExtension(name: string, ext: string): string {
  const base = sanitizeFileName(name)
  if (new RegExp(`\\.${ext}$`, 'i').test(base)) return base
  return `${base}.${ext}`
}

/** URL 型资产的快捷方式文件内容（Windows InternetShortcut；跨端可双击打开） */
export function buildUrlShortcut(url: string): string {
  return `[InternetShortcut]\nURL=${url}\n`
}

/** 资产下载载荷（主进程对话框 + 复制/写文件用） */
export interface AssetDownloadPayload {
  /** 默认文件名（已清洗 + 补扩展名） */
  fileName: string
  /** file=复制源文件；text=写文本内容 */
  kind: 'file' | 'text'
  /** kind=file 时：源文件绝对路径 */
  sourcePath?: string
  /** kind=text 时：要写入的文本内容 */
  content?: string
}
