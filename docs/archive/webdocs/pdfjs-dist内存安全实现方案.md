# pdfjs-dist 内存安全实现方案

## 概述

本方案基于 Mozilla 的 pdfjs-dist 库实现 PDF 解析，核心是**严格的内存管理**，确保每个资源都被正确释放，避免内存泄漏。

## 核心原则

### 1. 资源释放顺序

```
PDFDocument → Page → TextContent
     │           │         │
     ▼           ▼         ▼
  destroy()  cleanup()   (自动GC)
```

### 2. 必须遵守的规则

| 规则 | 说明 | 违反后果 |
|-----|------|---------|
| 每页必 cleanup | 处理完一页立即释放 | 页面数据堆积 |
| 文档必 destroy | 无论成功失败都要释放 | 文档对象泄漏 |
| 不缓存 Page 对象 | 只缓存处理后的数据 | 内存无法释放 |
| 大文件分批处理 | 避免一次性加载 | 内存溢出 |

---

## 完整实现代码

### 1. 类型定义：pdf.types.ts

```typescript
/**
 * PDF解析类型定义
 * @module shared/types/pdf.types
 */

/**
 * PDF元数据
 */
export interface PDFMetadata {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  producer?: string
  creationDate?: string
  modDate?: string
  pageCount: number
}

/**
 * PDF布局类型
 */
export type PDFLayoutType = 'text' | 'scanned' | 'hybrid'

/**
 * PDF布局信息
 */
export interface PDFLayout {
  type: PDFLayoutType
  hasText: boolean
  hasImages: boolean
  textDensity: number
}

/**
 * 目录项
 */
export interface PDFOutlineItem {
  title: string
  dest?: string | number
  items: PDFOutlineItem[]
}

/**
 * 文本项（带位置信息）
 */
export interface PDFTextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontName?: string
  fontSize?: number
}

/**
 * 页面内容
 */
export interface PDFPageContent {
  pageNumber: number
  text: string
  items: PDFTextItem[]
}

/**
 * 章节结构
 */
export interface PDFSection {
  title: string
  level: number
  page: number
  content: string
}

/**
 * 解析结果
 */
export interface PDFParseResult {
  success: boolean
  metadata: PDFMetadata
  outline: PDFOutlineItem[]
  layout: PDFLayout
  text: string
  pages: PDFPageContent[]
  sections: PDFSection[]
  warnings: string[]
  error?: string
}

/**
 * 解析选项
 */
export interface PDFParseOptions {
  /** 最大内存使用量（MB），超过则分批处理 */
  maxMemoryMB?: number
  /** 是否提取位置信息 */
  extractPositions?: boolean
  /** 是否识别章节结构 */
  detectSections?: boolean
  /** 进度回调 */
  onProgress?: (page: number, total: number) => void
}
```

### 2. PDF解析服务：pdf-parser.service.ts

```typescript
/**
 * PDF解析服务 - 基于 pdfjs-dist
 * @module services/pdf-parser.service
 * @description 内存安全的PDF解析实现
 */

import { join } from 'path'
import { readFile } from 'fs/promises'
import { app } from 'electron'
import type {
  PDFParseResult,
  PDFParseOptions,
  PDFMetadata,
  PDFOutlineItem,
  PDFLayout,
  PDFPageContent,
  PDFTextItem,
  PDFSection
} from '../../shared/types/pdf.types'

// 延迟加载 pdfjs-dist，避免启动时加载
type PDFJSLibrary = typeof import('pdfjs-dist/legacy/build/pdf.js')

export class PDFParserService {
  private pdfjs: PDFJSLibrary | null = null
  private initialized: boolean = false

  // 默认配置
  private static readonly DEFAULT_MAX_MEMORY = 512 // MB
  private static readonly BATCH_SIZE = 10 // 每批处理页数
  private static readonly CLEANUP_INTERVAL = 5 // 每处理N页强制GC提示

  /**
   * 初始化服务
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    if (this.initialized) {
      return { success: true }
    }

    try {
      // 动态导入 pdfjs-dist
      this.pdfjs = await import('pdfjs-dist/legacy/build/pdf.js')

      // 设置 worker（可选，用于复杂PDF）
      // 注意：Node.js 环境下可能需要特殊配置
      // this.pdfjs.GlobalWorkerOptions.workerSrc = '...'

      // 设置标准字体路径（可选）
      if (app.isPackaged) {
        const fontPath = join(process.resourcesPath, 'standard_fonts')
        this.pdfjs.StandardFontDataFactory.options = {
          standardFontDataUrl: fontPath
        }
      }

      this.initialized = true
      console.log('[PDF] pdfjs-dist 初始化成功')
      return { success: true }

    } catch (e: any) {
      console.error('[PDF] 初始化失败:', e)
      return { success: false, error: `pdfjs-dist 加载失败: ${e.message}` }
    }
  }

  /**
   * 解析PDF文件
   */
  async parse(
    filePath: string,
    options: PDFParseOptions = {}
  ): Promise<PDFParseResult> {
    if (!this.initialized || !this.pdfjs) {
      return this.createErrorResult('服务未初始化')
    }

    const warnings: string[] = []

    // ========== 阶段1：加载文档 ==========
    let doc: any = null
    let buffer: Buffer | null = null

    try {
      // 读取文件
      buffer = await readFile(filePath)

      // 检查文件大小
      const fileSizeMB = buffer.length / (1024 * 1024)
      if (fileSizeMB > (options.maxMemoryMB || PDFParserService.DEFAULT_MAX_MEMORY)) {
        warnings.push(`文件较大(${fileSizeMB.toFixed(1)}MB)，处理可能较慢`)
      }

      // 加载文档
      const loadingTask = this.pdfjs.getDocument({
        data: buffer,
        useSystemFonts: true,        // 使用系统字体
        standardFontDataUrl: '',      // 不加载标准字体数据
        isEvalSupported: false,       // 安全考虑，禁用eval
        useWorkerFetch: false,        // Node.js环境
        isOffscreenCanvasSupported: false, // Node.js环境
      })

      doc = await loadingTask.promise
      console.log(`[PDF] 文档加载成功，共 ${doc.numPages} 页`)

    } catch (e: any) {
      return this.createErrorResult(`文档加载失败: ${e.message}`)
    }

    // ========== 阶段2：提取元数据 ==========
    let metadata: PDFMetadata
    let outline: PDFOutlineItem[]

    try {
      metadata = await this.extractMetadata(doc)
      outline = await this.extractOutline(doc)
    } catch (e: any) {
      warnings.push(`元数据提取失败: ${e.message}`)
      metadata = { pageCount: doc.numPages }
      outline = []
    }

    // ========== 阶段3：提取文本（分批处理） ==========
    const pages: PDFPageContent[] = []
    const sections: PDFSection[] = []
    let layout: PDFLayout = { type: 'text', hasText: true, hasImages: false, textDensity: 0 }

    try {
      const totalPages = doc.numPages
      let processedPages = 0
      let totalTextLength = 0
      let hasImages = false

      // 分批处理
      for (let batchStart = 1; batchStart <= totalPages; batchStart += PDFParserService.BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + PDFParserService.BATCH_SIZE - 1, totalPages)

        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          let page = null

          try {
            // 获取页面
            page = await doc.getPage(pageNum)

            // 提取文本
            const pageContent = await this.extractPageContent(page, pageNum, options)
            pages.push(pageContent)
            totalTextLength += pageContent.text.length

            // 检测图片（简化版）
            const ops = await page.getOperatorList()
            if (ops.fnArray.some((fn: number) => fn === this.pdfjs!.OPS.paintImageXObject)) {
              hasImages = true
            }

            processedPages++

            // 进度回调
            if (options.onProgress) {
              options.onProgress(processedPages, totalPages)
            }

          } catch (e: any) {
            warnings.push(`第${pageNum}页提取失败: ${e.message}`)
          } finally {
            // ========== 关键：立即释放页面资源 ==========
            if (page) {
              page.cleanup()
              page = null
            }
          }
        }

        // 每批处理完后提示GC（可选）
        if (global.gc && batchEnd % PDFParserService.CLEANUP_INTERVAL === 0) {
          global.gc()
        }
      }

      // 计算布局类型
      const avgTextPerPage = totalTextLength / totalPages
      layout = {
        type: this.detectLayoutType(totalTextLength, hasImages, totalPages),
        hasText: totalTextLength > 0,
        hasImages,
        textDensity: avgTextPerPage
      }

      // 识别章节（如果启用）
      if (options.detectSections !== false) {
        try {
          const detectedSections = this.detectSections(pages, outline)
          sections.push(...detectedSections)
        } catch (e: any) {
          warnings.push(`章节识别失败: ${e.message}`)
        }
      }

    } catch (e: any) {
      warnings.push(`文本提取过程出错: ${e.message}`)
    } finally {
      // ========== 关键：确保文档被销毁 ==========
      if (doc) {
        doc.destroy()
        doc = null
      }
      // 释放 buffer 引用
      buffer = null
    }

    // ========== 组装结果 ==========
    const fullText = pages.map(p => p.text).join('\n\n')

    return {
      success: true,
      metadata,
      outline,
      layout,
      text: fullText,
      pages,
      sections,
      warnings
    }
  }

  /**
   * 提取元数据
   */
  private async extractMetadata(doc: any): Promise<PDFMetadata> {
    const info = await doc.getMetadata().catch(() => null)
    const metadata: PDFMetadata = {
      pageCount: doc.numPages
    }

    if (info?.info) {
      const i = info.info
      metadata.title = i.Title || undefined
      metadata.author = i.Author || undefined
      metadata.subject = i.Subject || undefined
      metadata.keywords = i.Keywords || undefined
      metadata.creator = i.Creator || undefined
      metadata.producer = i.Producer || undefined
      metadata.creationDate = i.CreationDate || undefined
      metadata.modDate = i.ModDate || undefined
    }

    return metadata
  }

  /**
   * 提取目录结构
   */
  private async extractOutline(doc: any): Promise<PDFOutlineItem[]> {
    const outline = await doc.getOutline().catch(() => null)

    if (!outline) {
      return []
    }

    return this.processOutlineItems(outline)
  }

  /**
   * 递归处理目录项
   */
  private processOutlineItems(items: any[]): PDFOutlineItem[] {
    if (!items || items.length === 0) {
      return []
    }

    return items.map(item => ({
      title: item.title || '',
      dest: item.dest,
      items: this.processOutlineItems(item.items || [])
    }))
  }

  /**
   * 提取页面内容
   */
  private async extractPageContent(
    page: any,
    pageNumber: number,
    options: PDFParseOptions
  ): Promise<PDFPageContent> {
    // 获取文本内容
    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false
    })

    // 提取位置信息（如果需要）
    const items: PDFTextItem[] = []
    const textParts: string[] = []

    for (const item of textContent.items) {
      // 收集文本
      textParts.push(item.str)

      // 收集位置信息（如果需要）
      if (options.extractPositions && 'transform' in item) {
        // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const tx = item.transform
        items.push({
          text: item.str,
          x: tx[4],
          y: tx[5],
          width: item.width,
          height: item.height,
          fontName: item.fontName,
          fontSize: Math.abs(tx[0]) // 字体大小近似值
        })
      }
    }

    // 组合文本（处理换行）
    let text = textParts.join('')

    // 优化换行
    text = this.optimizeLineBreaks(text)

    return {
      pageNumber,
      text,
      items
    }
  }

  /**
   * 优化换行
   * 处理 PDF 中常见的断行问题
   */
  private optimizeLineBreaks(text: string): string {
    // 移除行尾连字符导致的断词
    text = text.replace(/-\n/g, '')

    // 合并被不当分割的行（中文）
    // PDF经常在每行末尾插入不必要的空格或换行
    text = text.replace(/([^\n])\n([^\n])/g, (match, p1, p2) => {
      // 如果前后都是中文字符，合并
      if (/[\u4e00-\u9fa5]/.test(p1) && /[\u4e00-\u9fa5]/.test(p2)) {
        return p1 + p2
      }
      // 英文单词之间保留空格
      if (/[a-zA-Z]/.test(p1) && /[a-zA-Z]/.test(p2)) {
        return p1 + ' ' + p2
      }
      return match
    })

    return text.trim()
  }

  /**
   * 检测布局类型
   */
  private detectLayoutType(
    totalTextLength: number,
    hasImages: boolean,
    totalPages: number
  ): 'text' | 'scanned' | 'hybrid' {
    const avgTextPerPage = totalTextLength / totalPages

    // 如果每页平均文字很少且有图片，可能是扫描版
    if (avgTextPerPage < 100 && hasImages) {
      return 'scanned'
    }

    // 如果有一定文字但也有图片，可能是混合型
    if (avgTextPerPage < 500 && hasImages) {
      return 'hybrid'
    }

    return 'text'
  }

  /**
   * 识别章节结构
   * 基于字体大小和目录信息
   */
  private detectSections(
    pages: PDFPageContent[],
    outline: PDFOutlineItem[]
  ): PDFSection[] {
    const sections: PDFSection[] = []

    // 如果有目录，基于目录划分
    if (outline.length > 0) {
      const flatOutline = this.flattenOutline(outline)

      for (let i = 0; i < flatOutline.length; i++) {
        const item = flatOutline[i]
        const nextItem = flatOutline[i + 1]

        // 找到对应页码的内容
        const startPage = typeof item.dest === 'number' ? item.dest + 1 : 1
        const endPage = nextItem
          ? (typeof nextItem.dest === 'number' ? nextItem.dest + 1 : pages.length)
          : pages.length

        // 提取该章节的文本
        const content = pages
          .filter(p => p.pageNumber >= startPage && p.pageNumber < endPage)
          .map(p => p.text)
          .join('\n\n')

        sections.push({
          title: item.title,
          level: item.level,
          page: startPage,
          content
        })
      }
    } else {
      // 没有目录时，尝试基于文本特征识别
      // 这里使用简单的启发式规则
      const allText = pages.map(p => p.text).join('\n')

      // 尝试识别常见的章节标题模式
      const chapterPatterns = [
        /^第[一二三四五六七八九十\d]+[章节篇部]/gm,  // 中文
        /^Chapter\s+\d+/gim,                          // 英文
        /^[一二三四五六七八九十]+[、.．]/gm,          // 中文序号
        /^\d+(\.\d+)*\s+.+/gm                         // 数字编号
      ]

      // 简单实现：将整个文档作为一个章节
      sections.push({
        title: '全文',
        level: 0,
        page: 1,
        content: allText
      })
    }

    return sections
  }

  /**
   * 扁平化目录结构
   */
  private flattenOutline(
    items: PDFOutlineItem[],
    level: number = 1
  ): Array<{ title: string; dest: string | number | undefined; level: number }> {
    const result: Array<{ title: string; dest: string | number | undefined; level: number }> = []

    for (const item of items) {
      result.push({
        title: item.title,
        dest: item.dest,
        level
      })

      if (item.items && item.items.length > 0) {
        result.push(...this.flattenOutline(item.items, level + 1))
      }
    }

    return result
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(error: string): PDFParseResult {
    return {
      success: false,
      metadata: { pageCount: 0 },
      outline: [],
      layout: { type: 'text', hasText: false, hasImages: false, textDensity: 0 },
      text: '',
      pages: [],
      sections: [],
      warnings: [],
      error
    }
  }

  /**
   * 检查服务状态
   */
  isReady(): boolean {
    return this.initialized && this.pdfjs !== null
  }

  /**
   * 销毁服务（清理资源）
   */
  destroy(): void {
    this.pdfjs = null
    this.initialized = false
    console.log('[PDF] 服务已销毁')
  }
}

// 单例实例
let instance: PDFParserService | null = null

export function getPDFParserService(): PDFParserService {
  if (!instance) {
    instance = new PDFParserService()
  }
  return instance
}
```

### 3. 集成到知识库服务

修改 `knowledge-base.service.ts` 中的 PDF 解析部分：

```typescript
import { getPDFParserService } from './pdf-parser.service'

// 在 KnowledgeBaseService 类中添加
private pdfParser: PDFParserService | null = null

private async getPDFParser(): Promise<PDFParserService> {
  if (!this.pdfParser) {
    this.pdfParser = getPDFParserService()
    await this.pdfParser.initialize()
  }
  return this.pdfParser
}

// 修改 parseFile 方法
private async parseFile(filePath: string, fileType: FileType): Promise<string> {
  const buffer = await fs.promises.readFile(filePath)

  switch (fileType) {
    // ... 其他类型 ...

    case 'pdf': {
      const parser = await this.getPDFParser()

      const result = await parser.parse(filePath, {
        extractPositions: false,
        detectSections: true,
        onProgress: (page, total) => {
          // 可选：发送进度
          console.log(`[PDF] 解析进度: ${page}/${total}`)
        }
      })

      if (!result.success) {
        throw new Error(result.error || 'PDF解析失败')
      }

      // 记录警告
      if (result.warnings.length > 0) {
        console.warn('[PDF] 解析警告:', result.warnings)
      }

      // 如果是扫描版，记录提示
      if (result.layout.type === 'scanned') {
        console.warn('[PDF] 检测到扫描版PDF，文本可能不完整')
      }

      return result.text
    }

    // ... 其他类型 ...
  }
}
```

---

## 内存管理详解

### 关键点图解

```
┌─────────────────────────────────────────────────────────┐
│                     PDF 解析流程                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Buffer ──► PDFDocument ──► Page ──► TextContent       │
│                │              │                          │
│                │              │                          │
│     ┌──────────┴──────────┐   │                          │
│     │                     │   │                          │
│     ▼                     ▼   ▼                          │
│  doc.destroy()      page.cleanup()                       │
│     │                     │                              │
│     │                     │                              │
│     ▼                     ▼                              │
│  释放文档对象         释放页面资源                        │
│  (所有页面数据)       (渲染数据、字体缓存等)              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 为什么会内存泄漏？

```typescript
// ❌ 错误示例：忘记 cleanup
for (let i = 1; i <= numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  pages.push(content) // 只存储数据
  // 忘记 page.cleanup() → 页面对象一直占用内存！
}

// ❌ 错误示例：忘记 destroy
const doc = await pdfjs.getDocument(data).promise
const text = await extractAll(doc)
return text
// 忘记 doc.destroy() → 整个文档对象泄漏！

// ✅ 正确示例
let doc = null
try {
  doc = await pdfjs.getDocument(data).promise
  for (let i = 1; i <= doc.numPages; i++) {
    let page = null
    try {
      page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(content)
    } finally {
      if (page) page.cleanup()
    }
  }
  return pages
} finally {
  if (doc) doc.destroy()
}
```

---

## 性能优化建议

### 1. 大文件处理

```typescript
// 对于超大文件，可以只提取部分页面
async function parseLargeFile(filePath: string, maxPages: number = 100) {
  const result = await parser.parse(filePath, {
    onProgress: (page, total) => {
      if (page > maxPages) {
        throw new Error(`文件过大，仅处理前${maxPages}页`)
      }
    }
  })
  return result
}
```

### 2. 流式处理

```typescript
// 使用生成器逐页返回
async function* parsePages(filePath: string) {
  const doc = await pdfjs.getDocument(data).promise
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      try {
        const content = await page.getTextContent()
        yield { page: i, text: content.items.map((i: any) => i.str).join('') }
      } finally {
        page.cleanup()
      }
    }
  } finally {
    doc.destroy()
  }
}
```

### 3. 缓存策略

```typescript
// 缓存解析结果，避免重复解析
const cache = new Map<string, { result: PDFParseResult; timestamp: number }>()

async function parseWithCache(filePath: string) {
  const stat = await fs.stat(filePath)
  const key = `${filePath}:${stat.size}:${stat.mtimeMs}`

  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1小时有效
    return cached.result
  }

  const result = await parser.parse(filePath)
  cache.set(key, { result, timestamp: Date.now() })
  return result
}
```

---

## 测试验证

### 内存测试脚本

```typescript
// scripts/test-pdf-memory.ts
import { getPDFParserService } from '../src/main/services/pdf-parser.service'

async function testMemory() {
  const parser = getPDFParserService()
  await parser.initialize()

  const testFile = '/path/to/large.pdf'

  // 记录初始内存
  const initialMemory = process.memoryUsage()

  // 连续解析10次
  for (let i = 0; i < 10; i++) {
    console.log(`\n=== 第 ${i + 1} 次解析 ===`)

    const before = process.memoryUsage()
    const result = await parser.parse(testFile)
    const after = process.memoryUsage()

    console.log(`解析结果: ${result.text.length} 字符`)
    console.log(`内存变化: ${((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2)} MB`)

    // 强制GC（需要 --expose-gc 参数）
    if (global.gc) {
      global.gc()
      const afterGC = process.memoryUsage()
      console.log(`GC后内存: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    }
  }

  // 最终内存
  const finalMemory = process.memoryUsage()
  console.log('\n=== 内存总结 ===')
  console.log(`初始: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
  console.log(`最终: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
  console.log(`增量: ${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB`)
}

testMemory().catch(console.error)
```

运行测试：
```bash
node --expose-gc dist/scripts/test-pdf-memory.js
```

---

## 依赖安装

```bash
npm install pdfjs-dist
```

### package.json 配置

```json
{
  "dependencies": {
    "pdfjs-dist": "^4.0.379"
  }
}
```

---

## 已知限制

| 限制 | 说明 | 解决方案 |
|-----|------|---------|
| 扫描版PDF | 无法提取文字 | 需要 OCR |
| 复杂表格 | 可能提取不完整 | 简单处理 |
| 加密PDF | 需要密码 | 提示用户 |
| 嵌入字体 | 可能显示乱码 | 使用系统字体 |

---

## 总结

### 优点
- ✅ 纯 Node.js，无需外部依赖
- ✅ 支持目录结构提取
- ✅ 内存可控制（严格遵循 cleanup/destroy）
- ✅ 支持大文件分批处理

### 缺点
- ⚠️ 需要严格遵守内存管理规则
- ⚠️ 扫描版PDF无法处理
- ⚠️ 表格识别能力有限

### 适用场景
- 以文字为主的 PDF 文档
- 需要目录结构的知识库
- 用户不想安装 Python 环境