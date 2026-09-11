/**
 * 文件 → 文本 / Markdown 提取工具
 * @module core/utils/extract-text
 * @description 从 knowledge-base.service 抽出的纯函数版本，供"剧本批量导入"等
 *              非知识库场景复用。
 *
 * 支持：txt / md / pdf / epub / mobi / azw3 / docx / xlsx / xls / webpage（webpage 按 txt 处理）。
 * 中文文本自动识别 UTF-8(BOM) / GBK / GB2312 / Big5 等编码。
 *
 * pdf / epub 解析（2026-09 接入）：
 *  - pdf  → @firecrawl/pdf-inspector（Rust/NAPI）：TextBased 输出结构化 Markdown
 *           （标题 H1-H4、段落空行、表格、代码块）；扫描/图片版抛明确错误。
 *  - epub → @firecrawl/anydoc（Rust/NAPI）：EPUB2/EPUB3 转带章节标题的 GFM Markdown。
 * 两者输出经 postProcessExtractedMarkdown 规范化：中文行内断字合并、H4+ 噪音标题
 * 降级为加粗正文、pdf 严重乱码（字体 CID 解码失败）抛错提示。
 * asMarkdown=true 返回 Markdown 结构（知识库切片需要标题/段落边界）；
 * 默认 false 返回去除标记的纯文本（剧本批量导入等消费端不感知 Markdown 语法）。
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import type { FileType } from '@shared/types/knowledge-base.types'

/** 提取选项 */
export interface ExtractTextOptions {
  /** 返回 Markdown 结构（pdf/epub 走解析器原生 Markdown；txt/md 原样返回）。默认 false：去标记纯文本 */
  asMarkdown?: boolean
}

/**
 * 从文件名推断文档类型。
 */
export function inferFileType(fileName: string): FileType | null {
  const ext = path.extname(fileName).toLowerCase().slice(1)
  const map: Record<string, FileType> = {
    txt: 'txt',
    md: 'md',
    pdf: 'pdf',
    epub: 'epub',
    mobi: 'mobi',
    azw3: 'azw3',
    docx: 'docx',
    doc: 'doc',
    xlsx: 'xlsx',
    xls: 'xls',
  }
  return map[ext] || null
}

/**
 * HTML → 纯文本（去 style/script/标签，合并空白）。mobi 章节共用。
 */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 规范化解析器输出的 Markdown：
 *  1. 中文行内断字合并（PDF 每行为一个文本段，行尾中文前有空格的“内 存”→“内存”）
 *  2. H4+ 标题降级为加粗正文（pdf-inspector 的 #### 多为日期/作者/页码头噪音，
 *     避免被结构检测当成章节标题产生碎章）
 *  3. pdf 严重乱码检测：字体 CID 解码失败会产生大量 U+FFFD，比例超阈值抛错提示
 */
function postProcessExtractedMarkdown(md: string, { strictGarbled = true } = {}): string {
  // 1. 中文行内断字合并（PDF 每行为一个文本段，行尾“内 存”→“内存”）：
  //    逐行处理且跳过 Markdown 标题行（章节标题里的分词空格必须保留）
  let out = md
    .split('\n')
    .map(line =>
      /^#{1,6}\s+/.test(line)
        ? line
        : line.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, ''),
    )
    .join('\n')
  // 1.5 剥离 anydoc 输出的 EPUB 内部导航锚点（<a id="..."></a>，对切片无价值）
  out = out.replace(/<a\s+[^>]*><\/a>/g, '')
  // 1.6 剥离 EPUB 内部链接目标残留（[文本](#oebps-*) 的 target 部分；
  //     保留链接文本，仅去掉锚点目标——否则切片内容会混入 filepos 噪音）
  out = out.replace(/\(#?oebps-[^)]*\)/g, '')
  // 2. H4-H6 标题 → 加粗正文（保留文本内容但不再作为章节标题）
  out = out.replace(/^#{4,6}\s+(.+)$/gm, '**$1**')
  // 3. 乱码检测
  if (strictGarbled) {
    const garbledCount = (out.match(/\uFFFD/g) || []).length
    const ratio = garbledCount / Math.max(out.length, 1)
    if (garbledCount > 10 && ratio > 0.01) {
      throw new Error(
        `文档约 ${garbledCount} 处字符无法解码（${(ratio * 100).toFixed(1)}%），` +
          '疑似特殊嵌入字体导致 CID 映射缺失，无法可靠提取，请更换文档来源',
      )
    }
  }
  return out
}

/**
 * Markdown → 纯文本（去除标题标记/加粗/链接/表格围栏等，保留段落空行）。
 * 供默认（asMarkdown=false）调用方使用：剧本批量导入等消费端不感知 Markdown 语法。
 */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    // 标题标记
    .replace(/^#{1,6}\s+/gm, '')
    // 表格分隔行（|---|、|:--:| 等）
    .replace(/^\|[\s:|-]+\|$/gm, '')
    // 水平线 / 分隔线
    .replace(/^-{3,}$/gm, '')
    .replace(/^\*{3,}$/gm, '')
    // 引用
    .replace(/^>\s?/gm, '')
    // 图片 ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 链接 [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 行内代码 `code` → code
    .replace(/`([^`]+)`/g, '$1')
    // 加粗/斜体（**x** / __x__ / *x* / _x_）
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1$2')
    // 无序列表符号（保留文本）
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    // 有序列表符号（保留编号文本）
    .replace(/^[ \t]*(\d+)[.)]\s+/gm, '$1. ')
    // 残留空行压平（最多两个换行）
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 提取文件内容（文本或 Markdown，按 options.asMarkdown）。
 * pdf / epub 走 Rust 解析器；txt/md 原样；其余按既有实现。
 */
export async function extractTextFromFile(
  filePath: string,
  fileType: FileType,
  options: ExtractTextOptions = {},
): Promise<string> {
  const buffer = await fs.promises.readFile(filePath)

  switch (fileType) {
    case 'txt':
    case 'md':
    case 'webpage': // 网页内容存储为 txt 格式
      return decodeTextFile(buffer)

    case 'pdf': {
      const { processPdf } = await import('@firecrawl/pdf-inspector')
      const result = processPdf(buffer)
      if (result.pdfType === 'Scanned' || result.pdfType === 'ImageBased') {
        throw new Error(
          `PDF 为${result.pdfType === 'Scanned' ? '扫描版' : '图片版'}（无文本层），本地无法提取，需要 OCR 能力，请上传文字版 PDF`,
        )
      }
      if (!result.markdown || result.markdown.trim().length === 0) {
        throw new Error('PDF 未提取到文本（可能为图片型页面）')
      }
      const md = postProcessExtractedMarkdown(result.markdown)
      return options.asMarkdown ? md : markdownToPlainText(md)
    }

    case 'epub': {
      const { toMarkdownBytes } = await import('@firecrawl/anydoc')
      const md = await toMarkdownBytes(buffer)
      if (!md || md.trim().length === 0) {
        throw new Error('EPUB 未解析出内容')
      }
      const normalized = postProcessExtractedMarkdown(md, { strictGarbled: false })
      return options.asMarkdown ? normalized : markdownToPlainText(normalized)
    }

    case 'mobi':
    case 'azw3':
      return extractMobiLikeText(filePath)

    case 'docx': {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    }

    case 'xlsx':
    case 'xls': {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const XLSX = require('xlsx')
      const wb = XLSX.read(buffer)
      return wb.SheetNames.map((name: string) => {
        const sheet = wb.Sheets[name]
        return `## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`
      }).join('\n\n')
    }

    default:
      throw new Error(`不支持的文件类型: ${fileType}`)
  }
}

/**
 * 提取 MOBI / AZW3 电子书纯文本。
 *
 * 扩展名不可信（.mobi 可能是 KF8 混合格式，.azw3 也可能被改名），
 * 且两个入口交叉解析会吐出乱码而非报错，所以按格式而非扩展名分派：
 * 先按 KF8（AZW3 / hybrid）解析，老 MOBI（PalmDOC，无 KF8 boundary）会在此抛错，
 * 再回退到老 MOBI 入口。
 *
 * @lingo-reader/mobi-parser 是 ESM-only 包（其 require 导出产物已损坏），
 * 只能动态 import；Node 端它会把章节内图片/CSS 写到 resourceSaveDir，
 * 这里传临时目录并在结束时清理。loadChapter 返回的 HTML 经 stripHtmlToText
 * 提取正文后图片路径等残留不会进入文本。
 */
async function extractMobiLikeText(filePath: string): Promise<string> {
  const { initKf8File, initMobiFile } = await import('@lingo-reader/mobi-parser')
  const saveDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kb-ebook-'))
  try {
    type EbookChapter = { id: string; html?: string }
    type Ebook = {
      getSpine(): Array<{ id: string }>
      loadChapter(id: string): EbookChapter | undefined
      destroy(): void
    }
    let book: Ebook
    try {
      book = (await initKf8File(filePath, saveDir)) as Ebook
    } catch {
      book = (await initMobiFile(filePath, saveDir)) as Ebook
    }

    try {
      let text = ''
      for (const chapter of book.getSpine()) {
        const loaded = book.loadChapter(chapter.id)
        if (loaded?.html) {
          text += stripHtmlToText(loaded.html) + '\n\n'
        }
      }
      return text.trim()
    } finally {
      book.destroy()
    }
  } finally {
    await fs.promises.rm(saveDir, { recursive: true, force: true })
  }
}

/**
 * 尝试多种编码解析文本文件。
 * 优先级：UTF-8 BOM > jschardet 自动检测 > UTF-8 > GBK > UTF-8 强制。
 */
export function decodeTextFile(buffer: Buffer): string {
  // UTF-8 with BOM
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.slice(3).toString('utf-8')
  }

  // jschardet 自动检测
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jschardet = require('jschardet')
    const detected = jschardet.detect(buffer)

    if (detected && detected.encoding && detected.confidence > 0.7) {
      const encoding = detected.encoding.toLowerCase()
      const encodingMap: Record<string, string> = {
        'utf-8': 'utf-8',
        'utf8': 'utf-8',
        'gbk': 'gbk',
        'gb2312': 'gbk', // GB2312 是 GBK 的子集，用 GBK 解码更安全
        'gb18030': 'gbk',
        'big5': 'big5',
        'shift_jis': 'shiftjis',
        'euc-jp': 'eucjp',
        'iso-8859-1': 'latin1',
        'ascii': 'utf-8', // ASCII 兼容 UTF-8
      }
      const targetEncoding = encodingMap[encoding] || encoding

      if (targetEncoding === 'utf-8') {
        const text = buffer.toString('utf-8')
        if (!hasGarbledChars(text)) return text
      } else {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const iconv = require('iconv-lite')
          if (iconv.encodingExists(targetEncoding)) {
            const text = iconv.decode(buffer, targetEncoding)
            if (!hasGarbledChars(text)) return text
          }
        } catch {
          // iconv 解码失败，继续尝试其他方法
        }
      }
    }
  } catch {
    // 编码检测失败
  }

  // 尝试 UTF-8
  try {
    const utf8Text = buffer.toString('utf-8')
    if (!hasGarbledChars(utf8Text)) return utf8Text
  } catch {
    // UTF-8 解码失败
  }

  // 尝试 GBK（最常见的中文字符编码）
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const iconv = require('iconv-lite')
    const gbkText = iconv.decode(buffer, 'gbk')
    if (!hasGarbledChars(gbkText)) return gbkText
  } catch {
    // iconv-lite 未安装或解码失败
  }

  // 最后 UTF-8 强制解码（即使有乱码也比 latin1 好，因为 latin1 对中文完全不可读）
  return buffer.toString('utf-8')
}

/**
 * 检查文本是否包含乱码字符。
 * 判据：非 ASCII 字符中乱码比例 > 20%，或含 Unicode 替换字符 / 控制字符。
 */
export function hasGarbledChars(text: string): boolean {
  const garbledPatterns = [
    /\uFFFD/, // Unicode 替换字符
    // 控制字符（换行、制表符除外）——检测电子书解析产物的乱码，控制字符类是判据本身
    // eslint-disable-next-line no-control-regex
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/,
  ]

  let nonAsciiCount = 0
  let garbledCount = 0

  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code > 127) {
      nonAsciiCount++
      if (code === 0xfffd || (code >= 0x80 && code <= 0x9f)) {
        garbledCount++
      }
    }
  }

  if (nonAsciiCount > 0 && garbledCount / nonAsciiCount > 0.2) {
    return true
  }

  for (const pattern of garbledPatterns) {
    if (pattern.test(text)) return true
  }

  return false
}