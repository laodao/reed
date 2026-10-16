# PyMuPDF PDF解析实现方案

## 概述

本方案通过 Python 子进程调用 PyMuPDF (fitz) 库实现 PDF 解析，解决 Node.js 生态中 PDF 解析库存在的内存泄漏和功能不足问题。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 主进程                           │
│  ┌─────────────────┐    IPC    ┌─────────────────────────┐ │
│  │ KnowledgeBase   │ ────────► │ PDFParserService        │ │
│  │ Service         │           │ (Node.js)               │ │
│  └─────────────────┘           └───────────┬─────────────┘ │
│                                            │                │
│                                            │ spawn          │
│                                            ▼                │
│                                ┌─────────────────────────┐  │
│                                │ Python 子进程           │  │
│                                │ (pdf_parser.py)         │  │
│                                │                         │  │
│                                │  ┌───────────────────┐  │  │
│                                │  │ PyMuPDF (fitz)    │  │  │
│                                │  │ - 文本提取        │  │  │
│                                │  │ - 目录结构        │  │  │
│                                │  │ - 元数据          │  │  │
│                                │  │ - 表格识别        │  │  │
│                                │  └───────────────────┘  │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 文件结构

```
src/main/
├── services/
│   └── pdf-parser.service.ts      # PDF解析服务（Node.js端）
├── python/
│   ├── pdf_parser.py              # PDF解析脚本（Python）
│   └── requirements.txt           # Python依赖
└── utils/
    └── python-env.util.ts         # Python环境检测工具
```

## 实现代码

### 1. Python 端：pdf_parser.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF解析器 - 基于 PyMuPDF
支持文本提取、目录结构、表格识别

使用方式：
    python pdf_parser.py parse --input <file_path> --output <output_path>
    python pdf_parser.py detect --input <file_path>
"""

import argparse
import json
import sys
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"success": False, "error": "PyMuPDF未安装，请运行: pip install pymupdf"}))
    sys.exit(1)


class PDFParser:
    """PDF解析器"""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.doc: Optional[fitz.Document] = None

    def __enter__(self):
        self.doc = fitz.open(self.file_path)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.doc:
            self.doc.close()
        return False

    def get_metadata(self) -> Dict[str, Any]:
        """获取PDF元数据"""
        meta = self.doc.metadata
        return {
            "title": meta.get("title") or None,
            "author": meta.get("author") or None,
            "subject": meta.get("subject") or None,
            "keywords": meta.get("keywords") or None,
            "creator": meta.get("creator") or None,
            "producer": meta.get("producer") or None,
            "creationDate": meta.get("creationDate") or None,
            "modDate": meta.get("modDate") or None,
            "pageCount": self.doc.page_count,
            "format": meta.get("format") or "PDF",
        }

    def get_toc(self) -> List[Dict[str, Any]]:
        """
        获取目录结构
        返回格式: [{level, title, page, children: []}]
        """
        toc = self.doc.get_toc()  # [[level, title, page], ...]

        if not toc:
            return []

        # 转换为树形结构
        result = []
        stack = []  # 用于构建层级关系

        for item in toc:
            level, title, page = item
            node = {
                "level": level,
                "title": title,
                "page": page,
                "children": []
            }

            # 找到父节点
            while stack and stack[-1]["level"] >= level:
                stack.pop()

            if stack:
                stack[-1]["children"].append(node)
            else:
                result.append(node)

            stack.append(node)

        return result

    def extract_text(self, start_page: int = 0, end_page: int = None) -> str:
        """
        提取文本内容

        Args:
            start_page: 起始页码（0开始）
            end_page: 结束页码（不含），None表示到最后
        """
        if end_page is None:
            end_page = self.doc.page_count

        texts = []
        for page_num in range(start_page, min(end_page, self.doc.page_count)):
            page = self.doc[page_num]
            text = page.get_text("text")
            texts.append(text)

        return "\n\n".join(texts)

    def extract_text_by_structure(self) -> List[Dict[str, Any]]:
        """
        按结构提取文本，识别标题和段落
        通过字体大小判断标题层级
        """
        sections = []
        current_section = None

        for page_num in range(self.doc.page_count):
            page = self.doc[page_num]

            # 获取文本块，包含字体信息
            blocks = page.get_text("dict")["blocks"]

            for block in blocks:
                if block["type"] != 0:  # 跳过图片块
                    continue

                for line in block.get("lines", []):
                    if not line.get("spans"):
                        continue

                    # 获取第一个span的字体信息作为代表
                    span = line["spans"][0]
                    font_size = span.get("size", 12)
                    text = "".join([s["text"] for s in line["spans"]]).strip()

                    if not text:
                        continue

                    # 根据字体大小判断是否为标题
                    # 通常标题字体 > 14，副标题 12-14，正文 < 12
                    is_title = font_size > 14
                    is_subtitle = 12 < font_size <= 14

                    if is_title:
                        # 新章节
                        if current_section:
                            sections.append(current_section)
                        current_section = {
                            "type": "section",
                            "title": text,
                            "level": 1 if font_size > 16 else 2,
                            "page": page_num + 1,
                            "content": []
                        }
                    elif is_subtitle and current_section:
                        current_section["content"].append({
                            "type": "subtitle",
                            "text": text
                        })
                    else:
                        # 正文段落
                        if current_section is None:
                            # 如果还没有章节，创建一个默认的
                            current_section = {
                                "type": "section",
                                "title": "文档开头",
                                "level": 0,
                                "page": page_num + 1,
                                "content": []
                            }
                        current_section["content"].append({
                            "type": "paragraph",
                            "text": text
                        })

        if current_section:
            sections.append(current_section)

        return sections

    def detect_layout(self) -> Dict[str, Any]:
        """
        检测PDF布局类型
        """
        has_text = False
        has_images = False
        text_ratio = 0

        for page_num in range(min(5, self.doc.page_count)):  # 只检测前5页
            page = self.doc[page_num]
            text = page.get_text("text")

            if text.strip():
                has_text = True
                # 计算文字覆盖率
                text_len = len(text.strip())
                page_area = page.rect.width * page.rect.height
                text_ratio += text_len / (page_area / 1000)  # 归一化

            # 检测图片
            images = page.get_images()
            if images:
                has_images = True

        avg_text_ratio = text_ratio / min(5, self.doc.page_count)

        # 判断类型
        if not has_text and has_images:
            pdf_type = "scanned"
        elif has_text and has_images and avg_text_ratio < 0.5:
            pdf_type = "hybrid"
        else:
            pdf_type = "text"

        return {
            "type": pdf_type,
            "hasText": has_text,
            "hasImages": has_images,
            "textRatio": round(avg_text_ratio, 3)
        }

    def extract_tables(self) -> List[Dict[str, Any]]:
        """
        提取表格（简化版）
        PyMuPDF 本身的表格提取能力有限，这里提供基础实现
        """
        tables = []

        for page_num in range(self.doc.page_count):
            page = self.doc[page_num]

            # 使用表格查找功能（PyMuPDF 1.23+）
            try:
                tabs = page.find_tables()
                if tabs and hasattr(tabs, 'tables'):
                    for tab in tabs.tables:
                        # 提取表格内容
                        table_data = tab.extract()
                        if table_data:
                            tables.append({
                                "page": page_num + 1,
                                "data": table_data,
                                "bbox": list(tab.bbox) if hasattr(tab, 'bbox') else None
                            })
            except Exception:
                # 旧版本PyMuPDF不支持表格提取
                pass

        return tables

    def parse_full(self) -> Dict[str, Any]:
        """完整解析PDF"""
        return {
            "success": True,
            "metadata": self.get_metadata(),
            "toc": self.get_toc(),
            "layout": self.detect_layout(),
            "text": self.extract_text(),
            "sections": self.extract_text_by_structure(),
            "tables": self.extract_tables(),
        }


def check_environment() -> Dict[str, Any]:
    """检查Python环境和依赖"""
    result = {
        "python": sys.version,
        "pymupdf": None,
        "pymupdf_version": None,
    }

    try:
        import fitz
        result["pymupdf"] = True
        result["pymupdf_version"] = fitz.version[0]
    except ImportError:
        result["pymupdf"] = False

    return result


def main():
    parser = argparse.ArgumentParser(description="PDF解析工具")
    subparsers = parser.add_subparsers(dest="command", help="命令")

    # check 命令
    check_parser = subparsers.add_parser("check", help="检查环境")

    # detect 命令
    detect_parser = subparsers.add_parser("detect", help="检测PDF类型")
    detect_parser.add_argument("--input", "-i", required=True, help="PDF文件路径")

    # parse 命令
    parse_parser = subparsers.add_parser("parse", help="解析PDF")
    parse_parser.add_argument("--input", "-i", required=True, help="PDF文件路径")
    parse_parser.add_argument("--output", "-o", help="输出文件路径（默认stdout）")
    parse_parser.add_argument("--mode", "-m", default="full",
                             choices=["full", "text", "structure", "metadata"],
                             help="解析模式")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    try:
        if args.command == "check":
            result = check_environment()

        elif args.command == "detect":
            with PDFParser(args.input) as pdf:
                result = {
                    "success": True,
                    "layout": pdf.detect_layout(),
                    "metadata": pdf.get_metadata()
                }

        elif args.command == "parse":
            with PDFParser(args.input) as pdf:
                if args.mode == "full":
                    result = pdf.parse_full()
                elif args.mode == "text":
                    result = {
                        "success": True,
                        "text": pdf.extract_text(),
                        "metadata": pdf.get_metadata()
                    }
                elif args.mode == "structure":
                    result = {
                        "success": True,
                        "metadata": pdf.get_metadata(),
                        "toc": pdf.get_toc(),
                        "sections": pdf.extract_text_by_structure()
                    }
                elif args.mode == "metadata":
                    result = {
                        "success": True,
                        "metadata": pdf.get_metadata(),
                        "toc": pdf.get_toc(),
                        "layout": pdf.detect_layout()
                    }
                else:
                    result = {"success": False, "error": f"未知模式: {args.mode}"}

        else:
            result = {"success": False, "error": f"未知命令: {args.command}"}

    except FileNotFoundError:
        result = {"success": False, "error": f"文件不存在: {args.input}"}
    except fitz.FileDataError as e:
        result = {"success": False, "error": f"PDF文件损坏或格式错误: {str(e)}"}
    except Exception as e:
        result = {"success": False, "error": f"解析失败: {str(e)}"}

    output = json.dumps(result, ensure_ascii=False, indent=None)

    if args.command == "parse" and args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(json.dumps({"success": True, "output": args.output}))
    else:
        print(output)


if __name__ == "__main__":
    main()
```

### 2. Python 依赖：requirements.txt

```txt
pymupdf>=1.23.0
```

### 3. Node.js 端：pdf-parser.service.ts

```typescript
/**
 * PDF解析服务
 * @module services/pdf-parser.service
 * @description 通过Python子进程调用PyMuPDF解析PDF
 */

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import type { PDFParseResult, PDFMetadata, PDFLayout, PDFToc, PDFSection } from '../../shared/types/pdf.types'

// 超时配置
const DEFAULT_TIMEOUT = 60000 // 60秒
const LARGE_FILE_TIMEOUT = 180000 // 3分钟

// 文件大小阈值
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024 // 50MB

export class PDFParserService {
  private pythonPath: string | null = null
  private scriptPath: string | null = null
  private initialized: boolean = false

  /**
   * 初始化服务
   * 检测Python环境和依赖
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      // 获取脚本路径
      const appPath = app.isPackaged
        ? path.dirname(app.getPath('exe'))
        : path.join(__dirname, '..', '..')

      this.scriptPath = path.join(appPath, 'python', 'pdf_parser.py')

      // 检查脚本是否存在
      try {
        await fs.access(this.scriptPath)
      } catch {
        return { success: false, error: 'PDF解析脚本不存在' }
      }

      // 检测Python环境
      const pythonResult = await this.detectPython()
      if (!pythonResult.python) {
        return { success: false, error: '未找到Python环境，请安装Python 3.8+' }
      }

      this.pythonPath = pythonResult.path
      console.log(`[PDF] 使用Python: ${this.pythonPath}`)

      // 检查PyMuPDF
      const checkResult = await this.runScript(['check'])
      if (!checkResult.success) {
        return {
          success: false,
          error: 'PyMuPDF未安装，请运行: pip install pymupdf'
        }
      }

      console.log(`[PDF] PyMuPDF版本: ${checkResult.pymupdf_version}`)
      this.initialized = true
      return { success: true }

    } catch (e: any) {
      console.error('[PDF] 初始化失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * 检测Python环境
   */
  private async detectPython(): Promise<{ python: boolean; path?: string }> {
    const candidates = ['python3', 'python']

    for (const cmd of candidates) {
      try {
        const result = await this.executeCommand(cmd, ['--version'], 5000)
        if (result.includes('Python 3')) {
          return { python: true, path: cmd }
        }
      } catch {
        continue
      }
    }

    return { python: false }
  }

  /**
   * 执行命令
   */
  private executeCommand(
    command: string,
    args: string[],
    timeout: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        timeout,
        windowsHide: true
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(stderr || `命令执行失败，退出码: ${code}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })
    })
  }

  /**
   * 运行Python脚本
   */
  private runScript(args: string[], timeout: number = DEFAULT_TIMEOUT): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.pythonPath || !this.scriptPath) {
        reject(new Error('服务未初始化'))
        return
      }

      const proc = spawn(this.pythonPath, [this.scriptPath, ...args], {
        timeout,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout)
            resolve(result)
          } catch {
            reject(new Error(`解析输出失败: ${stdout}`))
          }
        } else {
          reject(new Error(stderr || `脚本执行失败，退出码: ${code}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`进程启动失败: ${err.message}`))
      })
    })
  }

  /**
   * 检测PDF类型
   */
  async detect(filePath: string): Promise<{ success: boolean; layout?: PDFLayout; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: '服务未初始化' }
    }

    try {
      const result = await this.runScript(['detect', '-i', filePath])
      return result
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /**
   * 解析PDF - 完整模式
   */
  async parse(filePath: string): Promise<{ success: boolean; data?: PDFParseResult; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: '服务未初始化' }
    }

    try {
      // 根据文件大小选择超时时间
      const stat = await fs.stat(filePath)
      const timeout = stat.size > LARGE_FILE_THRESHOLD
        ? LARGE_FILE_TIMEOUT
        : DEFAULT_TIMEOUT

      const result = await this.runScript(['parse', '-i', filePath, '-m', 'full'], timeout)

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return { success: true, data: result }

    } catch (e: any) {
      console.error('[PDF] 解析失败:', e)
      return { success: false, error: e.message }
    }
  }

  /**
   * 解析PDF - 仅提取文本
   */
  async parseText(filePath: string): Promise<{ success: boolean; text?: string; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: '服务未初始化' }
    }

    try {
      const result = await this.runScript(['parse', '-i', filePath, '-m', 'text'])

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return { success: true, text: result.text }

    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /**
   * 解析PDF - 获取结构信息
   */
  async parseStructure(filePath: string): Promise<{
    success: boolean
    metadata?: PDFMetadata
    toc?: PDFToc
    sections?: PDFSection[]
    error?: string
  }> {
    if (!this.initialized) {
      return { success: false, error: '服务未初始化' }
    }

    try {
      const result = await this.runScript(['parse', '-i', filePath, '-m', 'structure'])

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        metadata: result.metadata,
        toc: result.toc,
        sections: result.sections
      }

    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /**
   * 检查服务状态
   */
  isReady(): boolean {
    return this.initialized
  }
}

// 单例
let instance: PDFParserService | null = null

export function getPDFParserService(): PDFParserService {
  if (!instance) {
    instance = new PDFParserService()
  }
  return instance
}
```

### 4. 类型定义：pdf.types.ts

```typescript
/**
 * PDF解析相关类型定义
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
  format?: string
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
  textRatio: number
}

/**
 * PDF目录项
 */
export interface PDFTocItem {
  level: number
  title: string
  page: number
  children: PDFTocItem[]
}

/**
 * PDF目录
 */
export type PDFToc = PDFTocItem[]

/**
 * PDF章节内容
 */
export interface PDFSectionContent {
  type: 'paragraph' | 'subtitle'
  text: string
}

/**
 * PDF章节
 */
export interface PDFSection {
  type: 'section'
  title: string
  level: number
  page: number
  content: PDFSectionContent[]
}

/**
 * PDF表格
 */
export interface PDFTable {
  page: number
  data: string[][]
  bbox?: number[]
}

/**
 * PDF完整解析结果
 */
export interface PDFParseResult {
  metadata: PDFMetadata
  toc: PDFToc
  layout: PDFLayout
  text: string
  sections: PDFSection[]
  tables: PDFTable[]
}
```

## 集成到知识库服务

修改 `knowledge-base.service.ts`：

```typescript
import { getPDFParserService } from './pdf-parser.service'

// 在 parseFile 方法中替换 PDF 解析逻辑
case 'pdf': {
  const pdfParser = getPDFParserService()

  // 检查服务是否就绪
  if (!pdfParser.isReady()) {
    const initResult = await pdfParser.initialize()
    if (!initResult.success) {
      throw new Error(initResult.error || 'PDF解析服务初始化失败')
    }
  }

  // 检测PDF类型
  const detectResult = await pdfParser.detect(filePath)
  if (!detectResult.success) {
    throw new Error(detectResult.error || 'PDF检测失败')
  }

  // 如果是扫描版，给出警告
  if (detectResult.layout?.type === 'scanned') {
    console.warn('[KB] 检测到扫描版PDF，文本提取可能不完整')
  }

  // 解析PDF
  const parseResult = await pdfParser.parse(filePath)
  if (!parseResult.success) {
    throw new Error(parseResult.error || 'PDF解析失败')
  }

  // 返回文本内容
  return parseResult.data!.text
}
```

## 构建配置

### electron.vite.config.ts 添加资源复制

```typescript
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // ...
      }
    }
  },
  // 添加静态资源复制
  resources: [
    {
      from: 'src/main/python',
      to: 'python'
    }
  ]
})
```

### package.json 添加打包配置

```json
{
  "build": {
    "extraResources": [
      {
        "from": "src/main/python",
        "to": "python",
        "filter": ["**/*"]
      }
    ]
  }
}
```

## 用户环境检测

在应用启动时检测用户是否安装了 Python：

```typescript
// 在主进程初始化时
async function checkPDFSupport() {
  const pdfParser = getPDFParserService()
  const result = await pdfParser.initialize()

  if (!result.success) {
    console.warn('[Main] PDF支持不可用:', result.error)
    // 可以在设置页面提示用户安装Python
  }

  return result.success
}
```

## 性能优化

### 1. 进程池（可选，处理大量文件时）

```typescript
class PDFParserPool {
  private pool: PDFParserService[] = []
  private maxSize = 3

  async parse(filePath: string): Promise<PDFParseResult> {
    // 找到空闲的解析器
    const parser = this.pool.find(p => !p.busy) || await this.createParser()
    return parser.parse(filePath)
  }
}
```

### 2. 结果缓存

```typescript
// 对于同一个文件，缓存解析结果
const cache = new Map<string, PDFParseResult>()

async function parseWithCache(filePath: string): Promise<PDFParseResult> {
  const stat = await fs.stat(filePath)
  const key = `${filePath}:${stat.mtimeMs}`

  if (cache.has(key)) {
    return cache.get(key)!
  }

  const result = await this.parse(filePath)
  cache.set(key, result)
  return result
}
```

## 错误处理

### 用户友好的错误提示

```typescript
const errorMessages: Record<string, string> = {
  'PyMuPDF未安装': '请安装PyMuPDF: pip install pymupdf',
  '未找到Python环境': '请安装Python 3.8或更高版本',
  'PDF文件损坏或格式错误': 'PDF文件已损坏或格式不正确',
  '脚本执行超时': '文件过大，解析超时，请稍后重试'
}

function getUserFriendlyError(error: string): string {
  for (const [key, message] of Object.entries(errorMessages)) {
    if (error.includes(key)) {
      return message
    }
  }
  return error
}
```

## 总结

### 优点
- PyMuPDF 稳定可靠，无内存泄漏
- 支持目录结构提取
- 支持按章节结构解析
- 支持表格识别
- 处理速度快

### 依赖
- 用户需要安装 Python 3.8+
- 需要 pip install pymupdf

### 可选优化
- 打包时内置 Python 环境（增大安装包体积）
- 使用进程池处理批量文件
- 对于扫描版PDF，可集成 Tesseract OCR