# PDF解析技术方案

## 问题背景

项目当前使用 `pdf-parse` 库解析PDF文档，存在以下问题：
1. 复杂布局（多栏、表格）解析效果差
2. 扫描版PDF无法提取文字
3. 中文内容可能出现乱码
4. 无法识别文档结构（标题、段落等）

## 技术难点分析

### 1. PDF文件类型

| 类型 | 特点 | 占比 | 解决难度 |
|-----|------|------|---------|
| 文字型PDF | 可直接提取文字 | ~60% | 低 |
| 扫描型PDF | 图片形式，需OCR | ~30% | 高 |
| 混合型PDF | 文字+图片混排 | ~10% | 中 |

### 2. 布局复杂度

| 布局类型 | 难点 | 解决方案 |
|---------|------|---------|
| 单栏文本 | 相对简单 | pdf-parse 可处理 |
| 多栏布局 | 文字顺序混乱 | 需要布局分析 |
| 表格 | 结构识别困难 | 专用表格提取 |
| 图文混排 | 图片位置影响阅读顺序 | 需要结构分析 |

## 解决方案

### 方案一：多级解析策略（推荐）

采用"先简单后复杂"的策略，根据PDF类型和解析效果自动选择最佳方案。

```
PDF文件
   │
   ▼
┌─────────────────┐
│ 第一级：快速检测 │
│ - 检测是否扫描版 │
│ - 检测是否有嵌入文字 │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
 有文字    纯扫描版
    │         │
    ▼         ▼
┌─────────┐ ┌─────────┐
│ 第二级  │ │ 第三级  │
│ pdf-parse│ │  OCR   │
│ 或pdfjs │ │ Tesseract│
└────┬────┘ └────┬────┘
     │           │
     ▼           ▼
┌───────────────────┐
│ 第四级：后处理     │
│ - 清理页眉页脚     │
│ - 识别段落结构     │
│ - 合并跨页内容     │
└───────────────────┘
```

### 方案二：PDF.js + 自定义布局分析

使用 Mozilla 的 PDF.js 进行深度解析，获取更丰富的信息：

**优点：**
- 可获取文字位置信息，便于布局重建
- 支持渲染页面为图片（配合OCR）
- 活跃维护，社区支持好

**缺点：**
- Node.js 环境使用较复杂
- 需要额外的布局分析逻辑

### 方案三：Python服务 + PyMuPDF

如果允许引入Python服务，PyMuPDF (fitz) 是最强选择：

**优点：**
- 解析速度快，效果好
- 原生支持表格提取
- 支持图片提取和OCR集成
- 可获取文档结构（目录、书签）

**缺点：**
- 需要额外部署Python服务
- 增加系统复杂度

## 推荐实施方案

考虑到项目是 Electron 桌面应用，建议采用 **方案一：多级解析策略**。

### 实现架构

```typescript
// PDF解析器架构
interface PDFParser {
  parse(buffer: Buffer): Promise<PDFParseResult>
}

interface PDFParseResult {
  text: string           // 提取的文本
  pages: PageContent[]   // 分页内容
  metadata: PDFMetadata  // 元数据
  warnings: string[]     // 警告信息
}

interface PageContent {
  pageNumber: number
  text: string
  images: ImageInfo[]    // 图片信息（用于OCR判断）
  layout: 'single' | 'multi-column' | 'table'
}

interface PDFMetadata {
  title?: string
  author?: string
  pageCount: number
  isScanned: boolean     // 是否扫描版
  hasImages: boolean
}
```

### 核心模块设计

#### 1. PDF类型检测器

```typescript
class PDFTypeDetector {
  /**
   * 检测PDF类型
   * @returns 'text' | 'scanned' | 'hybrid'
   */
  async detect(buffer: Buffer): Promise<PDFType> {
    // 1. 尝试提取文字
    const textContent = await this.extractText(buffer)

    // 2. 计算文字覆盖率
    const textRatio = this.calculateTextRatio(textContent)

    // 3. 检测图片数量
    const imageCount = await this.countImages(buffer)

    // 4. 判断类型
    if (textRatio > 0.7) return 'text'
    if (textRatio < 0.1 && imageCount > 0) return 'scanned'
    return 'hybrid'
  }
}
```

#### 2. 多级解析器

```typescript
class MultiLevelPDFParser implements PDFParser {
  private parsers: Map<PDFType, PDFParser> = new Map()

  constructor() {
    this.parsers.set('text', new TextPDFParser())
    this.parsers.set('scanned', new OCRPDFParser())
    this.parsers.set('hybrid', new HybridPDFParser())
  }

  async parse(buffer: Buffer): Promise<PDFParseResult> {
    // 1. 检测类型
    const type = await this.detector.detect(buffer)

    // 2. 选择解析器
    const parser = this.parsers.get(type)

    // 3. 执行解析
    return await parser.parse(buffer)
  }
}
```

#### 3. 文字型PDF解析器

```typescript
class TextPDFParser implements PDFParser {
  async parse(buffer: Buffer): Promise<PDFParseResult> {
    // 方案A：使用 pdf-parse（当前方案，简单场景够用）
    // 方案B：使用 pdfjs-dist（更强大，支持布局信息）

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js')

    const doc = await pdfjs.getDocument(buffer).promise
    const pages: PageContent[] = []

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()

      // 按Y坐标分组，重建阅读顺序
      const organizedText = this.organizeByLayout(textContent)

      pages.push({
        pageNumber: i,
        text: organizedText,
        images: [],
        layout: this.detectLayout(textContent)
      })
    }

    return {
      text: pages.map(p => p.text).join('\n\n'),
      pages,
      metadata: await this.extractMetadata(doc),
      warnings: []
    }
  }

  /**
   * 根据文字位置重建阅读顺序
   */
  private organizeByLayout(textContent: TextContent): string {
    // 按Y坐标分组，处理多栏布局
    const items = textContent.items as TextItem[]

    // 1. 按Y坐标分组
    const lines = this.groupByY(items)

    // 2. 检测多栏布局
    const columns = this.detectColumns(lines)

    // 3. 按栏重组文本
    return this.reconstructText(lines, columns)
  }
}
```

#### 4. 扫描版PDF解析器（OCR）

```typescript
class OCRPDFParser implements PDFParser {
  async parse(buffer: Buffer): Promise<PDFParseResult> {
    // 方案一：调用本地 Tesseract（需要安装）
    // 方案二：调用云端OCR API（如百度、阿里云）
    // 方案三：使用 Electron 的 Native API

    // 推荐方案：集成 Tesseract.js（纯JS，无需外部依赖）
    const Tesseract = await import('tesseract.js')

    // 1. 将PDF页面渲染为图片
    const images = await this.renderPagesToImages(buffer)

    // 2. 执行OCR
    const pages: PageContent[] = []
    for (const image of images) {
      const result = await Tesseract.recognize(image, 'chi_sim+eng', {
        logger: m => console.log(m.status, m.progress)
      })

      pages.push({
        pageNumber: image.pageNumber,
        text: result.data.text,
        images: [],
        layout: 'single'
      })
    }

    return {
      text: pages.map(p => p.text).join('\n\n'),
      pages,
      metadata: { isScanned: true, pageCount: images.length },
      warnings: ['使用了OCR识别，可能存在识别错误']
    }
  }

  /**
   * 将PDF页面渲染为图片
   */
  private async renderPagesToImages(buffer: Buffer): Promise<ImagePage[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js')
    const { createCanvas } = await import('canvas') // node-canvas

    const doc = await pdfjs.getDocument(buffer).promise
    const images: ImagePage[] = []

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 2 }) // 2x分辨率

      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      await page.render({
        canvasContext: context,
        viewport
      }).promise

      images.push({
        pageNumber: i,
        dataUrl: canvas.toDataURL('image/png')
      })
    }

    return images
  }
}
```

### 依赖库选择

| 库名 | 用途 | 优点 | 缺点 | 推荐度 |
|-----|------|------|------|-------|
| pdf-parse | 简单文本提取 | 轻量、纯JS | 布局处理差 | ⭐⭐⭐ |
| pdfjs-dist | 高级文本提取 | 功能强、获取位置信息 | 配置复杂 | ⭐⭐⭐⭐⭐ |
| tesseract.js | OCR识别 | 纯JS、支持中文 | 速度较慢 | ⭐⭐⭐⭐ |
| node-canvas | 页面渲染 | 配合pdfjs渲染图片 | 需要编译 | ⭐⭐⭐⭐ |

### 实施步骤

#### Phase 1：基础优化（1-2天）
- [ ] 添加PDF类型检测逻辑
- [ ] 优化现有 pdf-parse 的文本清理
- [ ] 添加页眉页脚过滤
- [ ] 改进错误处理和用户提示

#### Phase 2：增强解析（3-5天）
- [ ] 集成 pdfjs-dist 获取布局信息
- [ ] 实现多栏布局识别
- [ ] 添加表格检测（简化版）
- [ ] 支持PDF元数据提取（标题、作者）

#### Phase 3：OCR支持（2-3天）
- [ ] 集成 Tesseract.js
- [ ] 实现页面渲染为图片
- [ ] 添加OCR进度反馈
- [ ] 支持中英文混合识别

#### Phase 4：高级特性（可选）
- [ ] PDF目录/书签解析
- [ ] 图片内容提取
- [ ] 表格结构化提取
- [ ] 混合型PDF处理

## 用户交互设计

### 上传时的提示

```typescript
// 文件上传后显示的处理状态
interface PDFProcessingStatus {
  stage: 'detecting' | 'parsing' | 'ocr' | 'postprocessing'
  progress: number
  message: string
  warnings: string[]
}

// 示例提示
const statusMessages = {
  detecting: '正在分析PDF类型...',
  parsing: '正在提取文本内容...',
  ocr: '正在识别扫描内容（可能需要较长时间）...',
  postprocessing: '正在优化文本结构...'
}
```

### 处理结果反馈

```typescript
// 向用户展示处理结果
interface PDFProcessResult {
  success: boolean
  textLength: number
  isScanned: boolean
  warnings: string[]  // 如："部分页面为扫描件，使用了OCR识别"
  suggestions: string[] // 如："建议检查OCR识别结果"
}
```

## 风险与应对

| 风险 | 应对措施 |
|-----|---------|
| OCR识别率低 | 提供人工校对功能，或推荐用户上传文字版 |
| 大文件处理慢 | 分页处理，显示进度，支持后台处理 |
| 内存占用高 | 流式处理，限制单次处理页数 |
| 特殊字体乱码 | 尝试多种编码，提示用户转换格式 |

## 总结

推荐采用**多级解析策略**，分阶段实施：

1. **短期**：优化现有 pdf-parse，添加类型检测和用户提示
2. **中期**：集成 pdfjs-dist + Tesseract.js，支持扫描版
3. **长期**：持续优化，根据用户反馈迭代

这个方案可以在不引入外部服务的情况下，显著提升PDF解析能力。