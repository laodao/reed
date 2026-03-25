/**
 * 文档解析服务
 * @module services/document-parser.service
 * @description 解析各种格式文档并进行智能切分
 */

import fs from 'fs'
import path from 'path'
import type { FileType, DocumentMetadata, Chunk, ChunkMetadata } from '../../shared/types/knowledge-base.types'

/**
 * 解析结果
 */
interface ParseResult {
  success: boolean
  content?: string
  metadata?: DocumentMetadata
  error?: string
}

/**
 * 文档解析服务
 */
export class DocumentParserService {
  // 默认切分参数
  private readonly defaultChunkSize = 500  // 默认切片大小（字符）
  private readonly defaultOverlap = 50     // 默认重叠大小（字符）

  /**
   * 解析文档
   */
  async parse(filePath: string, fileType: FileType): Promise<ParseResult> {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      // 根据文件类型调用相应的解析器
      switch (fileType) {
        case 'pdf':
          return await this.parsePdf(filePath)
        case 'docx':
        case 'doc':
          return await this.parseWord(filePath)
        case 'txt':
          return await this.parseTxt(filePath)
        case 'md':
          return await this.parseMarkdown(filePath)
        case 'epub':
          return await this.parseEpub(filePath)
        case 'xlsx':
        case 'xls':
          return await this.parseExcel(filePath)
        default:
          return { success: false, error: `不支持的文件类型: ${fileType}` }
      }
    } catch (error: any) {
      console.error('[DocumentParser] 解析错误:', error)
      return { success: false, error: error.message || '文档解析失败' }
    }
  }

  /**
   * 切分文档
   */
  chunk(
    content: string,
    fileType: FileType,
    metadata?: DocumentMetadata
  ): Chunk[] {
    switch (fileType) {
      case 'pdf':
        return this.chunkPdf(content, metadata)
      case 'docx':
      case 'doc':
        return this.chunkWord(content, metadata)
      case 'txt':
        return this.chunkTxt(content)
      case 'md':
        return this.chunkMarkdown(content)
      case 'epub':
        return this.chunkEpub(content, metadata)
      case 'xlsx':
      case 'xls':
        return this.chunkExcel(content)
      default:
        return this.chunkDefault(content)
    }
  }

  /**
   * 获取支持的文件类型
   */
  getSupportedTypes(): FileType[] {
    return ['pdf', 'docx', 'doc', 'txt', 'md', 'epub', 'xlsx', 'xls']
  }

  // ==================== 解析器 ====================

  /**
   * 解析 PDF 文件
   */
  private async parsePdf(filePath: string): Promise<ParseResult> {
    try {
      const pdfParse = require('pdf-parse')
      const dataBuffer = fs.readFileSync(filePath)
      const data = await pdfParse(dataBuffer)

      return {
        success: true,
        content: data.text,
        metadata: {
          pageCount: data.numpages,
          title: data.info?.Title || path.basename(filePath, '.pdf')
        }
      }
    } catch (error: any) {
      console.error('[DocumentParser] PDF解析错误:', error)
      return { success: false, error: `PDF解析失败: ${error.message}` }
    }
  }

  /**
   * 解析 Word 文件
   */
  private async parseWord(filePath: string): Promise<ParseResult> {
    try {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })

      return {
        success: true,
        content: result.value,
        metadata: {
          title: path.basename(filePath, path.extname(filePath))
        }
      }
    } catch (error: any) {
      console.error('[DocumentParser] Word解析错误:', error)
      return { success: false, error: `Word解析失败: ${error.message}` }
    }
  }

  /**
   * 解析 TXT 文件
   */
  private async parseTxt(filePath: string): Promise<ParseResult> {
    try {
      // 尝试多种编码读取
      const encodings = ['utf-8', 'gbk', 'gb2312', 'utf-16le']
      let content: string | null = null

      for (const encoding of encodings) {
        try {
          content = fs.readFileSync(filePath, encoding as BufferEncoding)
          // 检查是否有乱码特征
          if (!this.hasGarbledText(content)) {
            break
          }
        } catch {
          continue
        }
      }

      if (!content) {
        return { success: false, error: '无法识别文件编码' }
      }

      return {
        success: true,
        content,
        metadata: {
          title: path.basename(filePath, '.txt')
        }
      }
    } catch (error: any) {
      console.error('[DocumentParser] TXT解析错误:', error)
      return { success: false, error: `TXT解析失败: ${error.message}` }
    }
  }

  /**
   * 解析 Markdown 文件
   */
  private async parseMarkdown(filePath: string): Promise<ParseResult> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')

      // 提取标题作为文档标题
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md')

      // 提取章节
      const sections: Array<{ title: string; startIndex: number }> = []
      const headingRegex = /^(#{1,3})\s+(.+)$/gm
      let match
      while ((match = headingRegex.exec(content)) !== null) {
        sections.push({
          title: match[2],
          startIndex: match.index
        })
      }

      return {
        success: true,
        content,
        metadata: {
          title,
          sections
        }
      }
    } catch (error: any) {
      console.error('[DocumentParser] Markdown解析错误:', error)
      return { success: false, error: `Markdown解析失败: ${error.message}` }
    }
  }

  /**
   * 解析 EPUB 文件
   */
  private async parseEpub(filePath: string): Promise<ParseResult> {
    try {
      const EPub = require('epub-parser')
      const epub = await EPub.parse(filePath)

      // 提取所有章节内容
      const chapters: string[] = []
      for (const chapter of epub.chapters || []) {
        if (chapter.text) {
          // 移除 HTML 标签
          const text = chapter.text.replace(/<[^>]+>/g, '')
          chapters.push(text)
        }
      }

      return {
        success: true,
        content: chapters.join('\n\n'),
        metadata: {
          title: epub.metadata?.title || path.basename(filePath, '.epub'),
          author: epub.metadata?.creator
        }
      }
    } catch (error: any) {
      console.error('[DocumentParser] EPUB解析错误:', error)
      return { success: false, error: `EPUB解析失败: ${error.message}` }
    }
  }

  /**
   * 解析 Excel 文件
   */
  private async parseExcel(filePath: string): Promise<ParseResult> {
    try {
      const XLSX = require('xlsx')
      const workbook = XLSX.readFile(filePath)

      // 读取所有工作表
      const sheets: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        sheets.push(`## ${sheetName}\n${csv}`)
      }

      return {
        success: true,
        content: sheets.join('\n\n'),
        metadata: {
          title: path.basename(filePath, path.extname(filePath))
        }
      }
    } catch (error: any) {
      console.error('[DocumentParser] Excel解析错误:', error)
      return { success: false, error: `Excel解析失败: ${error.message}` }
    }
  }

  // ==================== 切分器 ====================

  /**
   * PDF 切分（按页）
   */
  private chunkPdf(content: string, metadata?: DocumentMetadata): Chunk[] {
    const chunks: Chunk[] = []
    const pageSize = 2000  // 每页大约字符数

    // 简单按长度切分，实际可按页码切分
    const pages = this.splitByLength(content, pageSize, this.defaultOverlap)

    pages.forEach((page, index) => {
      chunks.push({
        content: page.content,
        index,
        startOffset: page.startOffset,
        endOffset: page.endOffset,
        metadata: {
          page: index + 1
        }
      })
    })

    return chunks
  }

  /**
   * Word 切分（按段落）
   */
  private chunkWord(content: string, metadata?: DocumentMetadata): Chunk[] {
    // 按段落分割
    const paragraphs = content.split(/\n\s*\n/)
    const chunks: Chunk[] = []
    let currentChunk = ''
    let currentStartOffset = 0
    let chunkIndex = 0
    let offset = 0

    for (const para of paragraphs) {
      if (currentChunk.length + para.length > this.defaultChunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          startOffset: currentStartOffset,
          endOffset: offset,
          metadata: {}
        })
        currentChunk = para
        currentStartOffset = offset
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para
      }
      offset += para.length + 2  // +2 for \n\n
    }

    // 添加最后一个块
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        startOffset: currentStartOffset,
        endOffset: offset,
        metadata: {}
      })
    }

    return chunks
  }

  /**
   * TXT 切分（固定长度 + 重叠）
   */
  private chunkTxt(content: string): Chunk[] {
    const chunks: Chunk[] = []
    const result = this.splitByLength(content, this.defaultChunkSize, this.defaultOverlap)

    result.forEach((chunk, index) => {
      chunks.push({
        content: chunk.content,
        index,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        metadata: {}
      })
    })

    return chunks
  }

  /**
   * Markdown 切分（按标题层级）
   */
  private chunkMarkdown(content: string): Chunk[] {
    const chunks: Chunk[] = []
    const lines = content.split('\n')
    let currentChunk = ''
    let currentStartOffset = 0
    let chunkIndex = 0
    let offset = 0
    let currentSection: string | undefined

    for (const line of lines) {
      // 检测标题
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
      if (headingMatch && currentChunk.length > this.defaultChunkSize / 2) {
        // 遇到标题且当前块足够长，创建新块
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          startOffset: currentStartOffset,
          endOffset: offset,
          metadata: currentSection ? { section: currentSection } : {}
        })
        currentChunk = line + '\n'
        currentSection = headingMatch[2]
        currentStartOffset = offset
      } else {
        if (headingMatch) {
          currentSection = headingMatch[2]
        }
        currentChunk += line + '\n'

        // 如果块太大，强制切分
        if (currentChunk.length > this.defaultChunkSize * 2) {
          chunks.push({
            content: currentChunk.trim(),
            index: chunkIndex++,
            startOffset: currentStartOffset,
            endOffset: offset + line.length,
            metadata: currentSection ? { section: currentSection } : {}
          })
          currentChunk = ''
          currentStartOffset = offset + line.length + 1
        }
      }
      offset += line.length + 1
    }

    // 添加最后一个块
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        startOffset: currentStartOffset,
        endOffset: offset,
        metadata: currentSection ? { section: currentSection } : {}
      })
    }

    return chunks
  }

  /**
   * EPUB 切分（按章节）
   */
  private chunkEpub(content: string, metadata?: DocumentMetadata): Chunk[] {
    // 类似 TXT 切分
    return this.chunkTxt(content)
  }

  /**
   * Excel 切分（每行作为一个切片）
   */
  private chunkExcel(content: string): Chunk[] {
    const chunks: Chunk[] = []
    const lines = content.split('\n')

    lines.forEach((line, index) => {
      if (line.trim()) {
        chunks.push({
          content: line,
          index,
          startOffset: 0,
          endOffset: line.length,
          metadata: {}
        })
      }
    })

    return chunks
  }

  /**
   * 默认切分
   */
  private chunkDefault(content: string): Chunk[] {
    return this.chunkTxt(content)
  }

  // ==================== 工具方法 ====================

  /**
   * 按长度切分文本
   */
  private splitByLength(
    content: string,
    chunkSize: number,
    overlap: number
  ): Array<{ content: string; startOffset: number; endOffset: number }> {
    const chunks: Array<{ content: string; startOffset: number; endOffset: number }> = []
    let start = 0

    while (start < content.length) {
      let end = Math.min(start + chunkSize, content.length)

      // 尝试在句子边界切分
      if (end < content.length) {
        const lastPeriod = content.lastIndexOf('。', end)
        const lastQuestion = content.lastIndexOf('？', end)
        const lastExclaim = content.lastIndexOf('！', end)
        const lastDot = content.lastIndexOf('.', end)
        const lastNewline = content.lastIndexOf('\n', end)

        const boundary = Math.max(lastPeriod, lastQuestion, lastExclaim, lastDot, lastNewline)
        if (boundary > start + chunkSize / 2) {
          end = boundary + 1
        }
      }

      chunks.push({
        content: content.slice(start, end).trim(),
        startOffset: start,
        endOffset: end
      })

      start = end - overlap
      if (start < 0) start = 0
      if (start >= content.length) break
    }

    return chunks
  }

  /**
   * 检查是否有乱码
   */
  private hasGarbledText(text: string): boolean {
    // 简单检测：检查是否有大量不可见字符或替换字符
    const garbledPattern = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/
    const matchCount = (text.match(garbledPattern) || []).length
    return matchCount > text.length * 0.01  // 超过1%的乱码
  }
}