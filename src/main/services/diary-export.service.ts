/**
 * 日记导出服务
 * @module services/diary-export.service
 */

import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { marked } from 'marked'
import { DiaryEntryRepository } from '../database/repositories/diary-entry.repository'
import { markdownToDocx } from '../utils/markdown-to-docx'
import type { DiaryIpcResponse } from '../../shared/types/diary.types'

export class DiaryExportService {
  private diaryEntryRepository: DiaryEntryRepository
  private rootPath: string

  constructor(diaryEntryRepository: DiaryEntryRepository, rootPath: string) {
    this.diaryEntryRepository = diaryEntryRepository
    this.rootPath = rootPath
  }

  /**
   * 导出为 HTML
   */
  async exportToHtml(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const entry = this.diaryEntryRepository.findById(entryId)
      if (!entry) {
        return { success: false, error: '日记条目不存在' }
      }

      const htmlContent = await marked(entry.content || '')
      const fullHtml = this.wrapHtml(entry.title, htmlContent)

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'html')
      fs.writeFileSync(filePath, fullHtml, 'utf-8')

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToHtml error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 导出为 PDF
   */
  async exportToPdf(entryId: string, window: BrowserWindow): Promise<DiaryIpcResponse<string>> {
    try {
      const entry = this.diaryEntryRepository.findById(entryId)
      if (!entry) {
        return { success: false, error: '日记条目不存在' }
      }

      const htmlContent = await marked(entry.content || '')
      const fullHtml = this.wrapHtml(entry.title, htmlContent, true)

      // 创建临时 HTML 文件
      const tempPath = path.join(this.rootPath, '.temp-export.html')
      fs.writeFileSync(tempPath, fullHtml, 'utf-8')

      // 加载 HTML 并打印
      await window.loadFile(tempPath)

      const pdfData = await window.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 1,
          bottom: 1,
          left: 1,
          right: 1
        }
      })

      // 清理临时文件
      fs.unlinkSync(tempPath)

      // 保存 PDF
      const outputPath = this.getDefaultExportPath(entry.title, 'pdf')
      fs.writeFileSync(outputPath, pdfData)

      return { success: true, data: outputPath }
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
      const entry = this.diaryEntryRepository.findById(entryId)
      if (!entry) {
        return { success: false, error: '日记条目不存在' }
      }

      const buffer = await markdownToDocx(entry.content || '', {
        title: entry.title
      })

      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'docx')
      fs.writeFileSync(filePath, buffer)

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToDocx error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 包装 HTML 内容
   */
  private wrapHtml(title: string, content: string, forPrint: boolean = false): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.8;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
    }
    pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 16px;
      color: #666;
    }
    img {
      max-width: 100%;
    }
    ${forPrint ? '@media print { body { padding: 0; } }' : ''}
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content}
</body>
</html>`
  }

  /**
   * 获取默认导出路径
   */
  private getDefaultExportPath(title: string, ext: string): string {
    const downloadsPath = path.join(os.homedir(), 'Downloads')
    const safeName = title.replace(/[<>:"/\\|?*]/g, '_')
    return path.join(downloadsPath, `${safeName}.${ext}`)
  }
}