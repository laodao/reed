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
import type { DiaryIpcResponse } from '@shared/types/diary.types'

/** 日记导出启用公式与 mermaid 渲染 */
const ENHANCE = { math: true, mermaid: true } as const

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

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'html')
      fs.writeFileSync(filePath, html, 'utf-8')

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
      const rendered = await tools.renderPdf({
        markdown: entry.content || '',
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
