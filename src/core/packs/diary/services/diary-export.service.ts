/**
 * 日记导出服务
 * @module core/packs/diary/services/diary-export.service
 * @description 已迁移到平台统一文档输出层 document-tools（2026-09-24 日记增强 P0-6）：
 *              排版/模板/公式（KaTeX）与 mermaid 增强统一走 DocumentToolsService，
 *              PDF 用平台注入的 IHtmlRenderer（Electron 隐藏窗口），Web 端自动降级报错。
 *              严禁再在本服务内自建 marked 排版或 printToPDF 实现。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DiaryService } from '@core/platform/services/diary.service'
import { getDocumentTools } from '@core/platform/services/document-tools/document-tools'
import { getPathProvider } from '@core/interfaces/path.interface'
import { resolveAssetPath } from '@core/utils/asset-path'
import type { DiaryIpcResponse } from '@shared/types/diary.types'

/** 日记导出启用公式与 mermaid 渲染 */
const ENHANCE = { math: true, mermaid: true } as const

/**
 * 把排版 HTML 中指向本地附件的 <img>（dataPath 相对路径）替换为 data URI。
 * 安全：resolveAssetPath 解析后必须在 dataPath 内（防 markdown 注入越权读取）。
 * 单图失败跳过（导出仍成功，图位留占位）。
 */
function embedLocalImages(html: string): string {
  const dataPath = path.resolve(getPathProvider().getDataPath())
  const imgPattern = /<img\b[^>]*src="([^"]+)"[^>]*>/gi
  const matches = [...html.matchAll(imgPattern)]
  let out = html
  for (const m of matches) {
    const src = m[1]
    if (!src || /^(https?:|data:|blob:)/i.test(src)) continue
    try {
      const abs = path.resolve(resolveAssetPath(src))
      if (!abs.startsWith(dataPath + path.sep)) continue
      const mime = guessMime(src)
      const buf = fs.readFileSync(abs)
      out = out.replace(m[0], m[0].replace(`src="${src}"`, `src="data:${mime};base64,${buf.toString('base64')}"`))
    } catch {
      // 图片缺失/越权：保留原 src，不阻断导出
    }
  }
  return out
}

/** markdown 层内嵌（PDF 渲染前）：![alt](rel) → ![alt](dataURI) */
function inlineLocalImagesToDataUri(markdown: string): string {
  const dataPath = path.resolve(getPathProvider().getDataPath())
  const mdPattern = /(!\[[^\]]*\]\()([^)]+)(\))/g
  let out = markdown
  for (const m of [...markdown.matchAll(mdPattern)]) {
    const src = m[2].trim().replace(/^<|>$/g, '')
    if (!src || /^(https?:|data:|blob:)/i.test(src)) continue
    try {
      const abs = path.resolve(resolveAssetPath(src))
      if (!abs.startsWith(dataPath + path.sep)) continue
      const mime = guessMime(src)
      const buf = fs.readFileSync(abs)
      out = out.replace(m[0], `${m[1]}data:${mime};base64,${buf.toString('base64')}${m[3]}`)
    } catch {
      // 同上：失败保留原样
    }
  }
  return out
}

function guessMime(p: string): string {
  const ext = path.extname(p).toLowerCase()
  return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.gif' ? 'image/gif'
    : ext === '.webp' ? 'image/webp'
    : ext === '.svg' ? 'image/svg+xml'
    : 'image/png'
}

export class DiaryExportService {
  private diaryService: DiaryService

  constructor(diaryService: DiaryService) {
    this.diaryService = diaryService
  }

  /**
   * 导出为 HTML
   */
  async exportToHtml(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const entry = await this.requireEntry(entryId)
      if (typeof entry === 'string') {
        return { success: false, error: entry }
      }

      const tools = getDocumentTools()
      const html = await tools.renderHtml({
        markdown: entry.content || '',
        title: entry.title,
        enhance: ENHANCE
      })
      // 贴图内嵌：markdown 里的本地图片（dataPath 相对路径）转 data URI，
      // 导出文件离线自包含（P3-1 资源嵌入）
      const embedded = embedLocalImages(html)

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'html')
      fs.writeFileSync(filePath, embedded, 'utf-8')

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToHtml error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 导出为 PDF（依赖平台渲染器，仅桌面端；Web 端由 handler 预先拦截）
   */
  async exportToPdf(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const entry = await this.requireEntry(entryId)
      if (typeof entry === 'string') {
        return { success: false, error: entry }
      }

      const tools = getDocumentTools()
      // PDF 渲染前把本地图片 src 换成 data URI（渲染窗口 file:// 加载拦截相对资源）
      const markdown = inlineLocalImagesToDataUri(entry.content || '')
      const rendered = await tools.renderPdf({
        markdown,
        title: entry.title,
        enhance: ENHANCE
      })
      if (rendered.format !== 'pdf') {
        return { success: false, error: '当前环境无 PDF 渲染器，PDF 导出仅桌面端可用' }
      }

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'pdf')
      fs.writeFileSync(filePath, rendered.buffer)

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToPdf error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 导出为 Word
   */
  async exportToDocx(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const entry = await this.requireEntry(entryId)
      if (typeof entry === 'string') {
        return { success: false, error: entry }
      }

      const tools = getDocumentTools()
      const rendered = await tools.renderDocx({
        markdown: entry.content || '',
        title: entry.title
      })

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'docx')
      fs.writeFileSync(filePath, rendered.buffer)

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToDocx error:', error)
      return { success: false, error: String(error) }
    }
  }

  /** 取日记详情；失败时返回错误消息 */
  private async requireEntry(entryId: string) {
    const result = await this.diaryService.getEntry(entryId)
    if (!result.success || !result.data) {
      return result.error || '日记不存在'
    }
    return result.data
  }

  /**
   * 获取默认导出路径
   */
  private getDefaultExportPath(title: string, ext: string): string {
    const safeName = title.replace(/[<>:"/\\|?*]/g, '_')
    const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
    if (isElectron) {
      // Electron 端：Downloads 目录，用户能直接看到
      const downloadsPath = path.join(os.homedir(), 'Downloads')
      return path.join(downloadsPath, `${safeName}.${ext}`)
    }
    // Web 端：用户数据目录的 exports 子文件夹（前端通过 /assets/exports/... 下载）
    // 这里依赖 IPathProvider 已注册（web-server bootstrap 已完成）
    const dataPath = getPathProvider().getDataPath()
    const exportsDir = path.join(dataPath, 'exports')
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true })
    return path.join(exportsDir, `${safeName}.${ext}`)
  }
}
