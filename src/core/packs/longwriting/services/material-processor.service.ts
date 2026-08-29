/**
 * 素材处理服务
 * @module core/packs/longwriting/services/material-processor.service
 * @description 处理文件上传、内容提取、网页抓取等功能
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'

/**
 * 素材处理服务
 */
export class MaterialProcessorService {
  private static instance: MaterialProcessorService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): MaterialProcessorService {
    if (!MaterialProcessorService.instance) {
      MaterialProcessorService.instance = new MaterialProcessorService()
    }
    return MaterialProcessorService.instance
  }

  /**
   * 从文件提取内容
   */
  async extractFromFile(filePath: string): Promise<{ content: string; error?: string }> {
    try {
      const ext = path.extname(filePath).toLowerCase()

      switch (ext) {
        case '.txt':
        case '.md':
          return this.extractTextFile(filePath)

        case '.pdf':
          return this.extractPdf(filePath)

        case '.doc':
        case '.docx':
          return this.extractDocx(filePath)

        default:
          return { content: '', error: `不支持的文件格式: ${ext}` }
      }
    } catch (error: any) {
      return { content: '', error: error.message }
    }
  }

  /**
   * 提取文本文件内容
   */
  private async extractTextFile(filePath: string): Promise<{ content: string; error?: string }> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content }
    } catch (error: any) {
      return { content: '', error: `读取文件失败: ${error.message}` }
    }
  }

  /**
   * 提取 PDF 内容
   * 注意：这是一个简化实现，实际应使用 pdf-parse 等库
   */
  private async extractPdf(filePath: string): Promise<{ content: string; error?: string }> {
    try {
      // 由于没有 pdf-parse 库，返回提示信息
      // 实际项目中应安装 pdf-parse 并使用
      return {
        content: `[PDF 文件内容提取需要安装 pdf-parse 库]\n文件路径: ${filePath}`,
        error: 'PDF 内容提取需要安装额外依赖'
      }
    } catch (error: any) {
      return { content: '', error: `PDF 提取失败: ${error.message}` }
    }
  }

  /**
   * 提取 DOCX 内容
   * 注意：这是一个简化实现，实际应使用 mammoth 等库
   */
  private async extractDocx(filePath: string): Promise<{ content: string; error?: string }> {
    try {
      // 由于没有 mammoth 库，返回提示信息
      // 实际项目中应安装 mammoth 并使用
      return {
        content: `[DOCX 文件内容提取需要安装 mammoth 库]\n文件路径: ${filePath}`,
        error: 'DOCX 内容提取需要安装额外依赖'
      }
    } catch (error: any) {
      return { content: '', error: `DOCX 提取失败: ${error.message}` }
    }
  }

  /**
   * 从网页抓取内容
   */
  async fetchFromUrl(url: string): Promise<{ content: string; title?: string; error?: string }> {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http

      const request = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        timeout: 30000
      }, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            this.fetchFromUrl(redirectUrl).then(resolve)
            return
          }
        }

        if (response.statusCode !== 200) {
          resolve({ content: '', error: `HTTP 错误: ${response.statusCode}` })
          return
        }

        let data = ''
        response.setEncoding('utf8')

        response.on('data', (chunk) => {
          data += chunk
        })

        response.on('end', () => {
          try {
            const result = this.parseHtmlContent(data, url)
            resolve(result)
          } catch (error: any) {
            resolve({ content: '', error: `解析失败: ${error.message}` })
          }
        })
      })

      request.on('error', (error) => {
        resolve({ content: '', error: `请求失败: ${error.message}` })
      })

      request.on('timeout', () => {
        request.destroy()
        resolve({ content: '', error: '请求超时' })
      })
    })
  }

  /**
   * 解析 HTML 内容，提取主要文本
   */
  private parseHtmlContent(html: string, _url: string): { content: string; title: string } {
    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : ''

    // 移除脚本和样式
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

    // 尝试提取主要内容区域
    const mainPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i
    ]

    let mainContent = ''
    for (const pattern of mainPatterns) {
      const match = content.match(pattern)
      if (match && match[1].length > mainContent.length) {
        mainContent = match[1]
      }
    }

    // 如果没有找到主内容区域，使用 body
    if (!mainContent) {
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      mainContent = bodyMatch ? bodyMatch[1] : content
    }

    // 提取段落文本
    const paragraphs: string[] = []
    const paragraphRegex = /<p[^>]*>([^<]*)<\/p>/gi
    let match
    while ((match = paragraphRegex.exec(mainContent)) !== null) {
      const text = this.decodeHtmlEntities(match[1].trim())
      if (text.length > 20) {
        paragraphs.push(text)
      }
    }

    // 如果段落太少，尝试提取所有文本
    if (paragraphs.length < 3) {
      const textContent = mainContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      const decoded = this.decodeHtmlEntities(textContent)
      return {
        title,
        content: decoded.substring(0, 10000) // 限制长度
      }
    }

    return {
      title,
      content: paragraphs.join('\n\n').substring(0, 10000)
    }
  }

  /**
   * 解码 HTML 实体
   */
  private decodeHtmlEntities(html: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
      '&ldquo;': '"',
      '&rdquo;': '"',
      '&lsquo;': '\u2018',
      '&rsquo;': '\u2019',
      '&mdash;': '\u2014',
      '&ndash;': '-',
      '&hellip;': '\u2026'
    }

    let result = html
    for (const [entity, char] of Object.entries(entities)) {
      result = result.split(entity).join(char)
    }

    // 解码数字实体
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))

    return result
  }
}

/**
 * 获取素材处理服务实例
 */
export const getMaterialProcessorService = (): MaterialProcessorService =>
  MaterialProcessorService.getInstance()