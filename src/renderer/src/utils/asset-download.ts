/**
 * 渲染端资产下载工具（Web 端浏览器下载用）
 * @module renderer/utils/asset-download
 * @description Electron 端下载走主进程 IPC（asset:download，对话框+复制/写文件）；
 *              Web 端没有对话框，由本模块组装浏览器下载载荷：
 *              - file ：fetch 资产 URL → Blob 下载
 *              - text / json / url：内容文本 → Blob 下载（.md / .json / .url）
 *              文件名清洗/扩展名/URL 快捷方式格式与主进程共享 core 纯函数，保证两侧一致。
 */

import {
  buildUrlShortcut,
  ensureExtension,
  sanitizeFileName,
} from '@core/platform/assets/asset-download'
import type { AssetRecord } from '@shared/types/asset.types'

export interface WebAssetDownload {
  /** 下载文件名（已清洗 + 补扩展名） */
  fileName: string
  /** Blob MIME */
  mimeType: string
  /** file 形态：fetch 下载的资产 URL */
  fetchUrl?: string
  /** text/json/url 形态：写入 Blob 的文本内容 */
  content?: string
}

/** 存储相对路径取文件名（assets 存储路径统一 / 分隔） */
function basenameOf(rel: string): string {
  return rel.split('/').pop() ?? ''
}

/**
 * 渲染端下载载荷组装。返回 null 表示该资产暂不支持下载（调用方提示）。
 * @param asset 资产记录
 * @param fileUrl file 形态的资产可访问 URL（Web 端 /assets/...，Electron 端 local-*://）
 * @param view 'preview'=预览态（report 长图下渲染图）；'source'/缺省按存储形态
 * @param renderedImageUrl 预览态下 report 渲染长图的 data URL（Web 端）
 */
export function buildWebAssetDownload(
  asset: AssetRecord,
  fileUrl: string,
  view?: 'preview' | 'source',
  renderedImageUrl?: string | null,
): WebAssetDownload | null {
  // 预览态（图界面）：下载渲染长图（report/图文类）
  if (view === 'preview' && renderedImageUrl) {
    return { fileName: ensureExtension(asset.name, 'png'), mimeType: 'image/png', fetchUrl: renderedImageUrl }
  }
  if (asset.kind === 'file' && asset.storagePath) {
    if (!fileUrl) return null
    return {
      fileName: sanitizeFileName(basenameOf(asset.storagePath)),
      mimeType: 'application/octet-stream',
      fetchUrl: fileUrl,
    }
  }
  if (asset.kind === 'text') {
    const content = asset.textContent ?? ''
    if (!content.trim()) return null
    return { fileName: ensureExtension(asset.name, 'md'), mimeType: 'text/markdown;charset=utf-8', content }
  }
  if (asset.kind === 'json') {
    const content = asset.jsonContent ?? ''
    if (!content.trim()) return null
    return { fileName: ensureExtension(asset.name, 'json'), mimeType: 'application/json;charset=utf-8', content }
  }
  if (asset.kind === 'url' && asset.url) {
    return { fileName: ensureExtension(asset.name, 'url'), mimeType: 'text/plain;charset=utf-8', content: buildUrlShortcut(asset.url) }
  }
  return null
}
