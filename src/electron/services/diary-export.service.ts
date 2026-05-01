/**
 * 日记导出服务
 * @module services/diary-export.service
 */

import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DiaryService } from '@core/services/diary.service'
import { markdownToDocx } from '@core/utils/markdown-to-docx'
import type { DiaryIpcResponse } from '@shared/types/diary.types'

// 缓存 marked 模块
let markedModule: typeof import('marked') | null = null

/**
 * 动态加载 marked 模块
 */
async function getMarked(): Promise<typeof import('marked')> {
  if (!markedModule) {
    markedModule = await import('marked')
  }
  return markedModule
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
      const result = await this.diaryService.getEntry(entryId)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || '日记不存在' }
      }

      const entry = result.data
      const marked = await getMarked()
      const htmlContent = await marked.marked(entry.content || '')
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
  async exportToPdf(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    let pdfWindow: BrowserWindow | null = null
    try {
      const result = await this.diaryService.getEntry(entryId)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || '日记不存在' }
      }

      const entry = result.data
      const marked = await getMarked()
      const htmlContent = await marked.marked(entry.content || '')
      const fullHtml = this.wrapHtml(entry.title, htmlContent, true)

      // 创建临时 HTML 文件
      const tempPath = path.join(this.diaryService.getRootPath(), '.temp-export.html')
      fs.writeFileSync(tempPath, fullHtml, 'utf-8')

      // 创建隐藏窗口用于生成 PDF
      pdfWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      // 加载 HTML 并生成 PDF
      await pdfWindow.loadFile(tempPath)

      const pdfData = await pdfWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 1,
          bottom: 1,
          left: 1,
          right: 1
        }
      })

      // 关闭隐藏窗口
      pdfWindow.close()
      pdfWindow = null

      // 清理临时文件
      fs.unlinkSync(tempPath)

      // 保存 PDF
      const filePath = outputPath || this.getDefaultExportPath(entry.title, 'pdf')
      fs.writeFileSync(filePath, pdfData)

      return { success: true, data: filePath }
    } catch (error) {
      console.error('[DiaryExportService] exportToPdf error:', error)
      // 确保窗口被关闭
      if (pdfWindow) {
        pdfWindow.close()
      }
      return { success: false, error: String(error) }
    }
  }

  /**
   * 导出为 Word
   */
  async exportToDocx(entryId: string, outputPath?: string): Promise<DiaryIpcResponse<string>> {
    try {
      const result = await this.diaryService.getEntry(entryId)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || '日记不存在' }
      }

      const entry = result.data
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
    h1:first-child {
      margin-top: 0;
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
  ${content}
</body>
</html>`
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPathProvider } = require('@core/interfaces/path.interface')
    const dataPath = getPathProvider().getDataPath()
    const exportsDir = path.join(dataPath, 'exports')
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true })
    return path.join(exportsDir, `${safeName}.${ext}`)
  }
}