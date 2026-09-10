/**
 * 文件 → 纯文本 提取工具
 * @module core/utils/extract-text
 * @description 从 knowledge-base.service 抽出的纯函数版本，供"剧本批量导入"等
 *              非知识库场景复用。逻辑与原实现一致；**补全了原 getFileType 漏掉的 pdf/epub**。
 *
 * 支持：txt / md / pdf / epub / mobi / azw3 / docx / xlsx / xls / webpage（webpage 按 txt 处理）。
 * 中文文本自动识别 UTF-8(BOM) / GBK / GB2312 / Big5 等编码。
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import type { FileType } from '@shared/types/knowledge-base.types'

/**
 * 从文件名推断文档类型。
 * 补全了 `knowledge-base.service:getFileType` 漏掉的 `pdf` / `epub`。
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
 * HTML → 纯文本（去 style/script/标签，合并空白）。epub/mobi 章节共用。
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
 * 提取文件纯文本（按类型分派）。
 * 逻辑与 `knowledge-base.service.parseFile` 一致。
 */
export async function extractTextFromFile(
  filePath: string,
  fileType: FileType,
): Promise<string> {
  const buffer = await fs.promises.readFile(filePath)

  switch (fileType) {
    case 'txt':
    case 'md':
    case 'webpage': // 网页内容存储为 txt 格式
      return decodeTextFile(buffer)

    case 'pdf': {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data.text
    }

    case 'epub':
      return extractEpubText(filePath)

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
 * 提取 EPUB 电子书纯文本。
 *
 * 历史修复：旧实现误用 epub-parser@0.2.5 的 API（该库只导出 open/getZip/
 * extractText 等回调式方法，且返回结构没有 sections），导致任何 epub 上传都报
 * "EPub.parse is not a function"。现改用 @lingo-reader/epub-parser —— 与
 * @lingo-reader/mobi-parser 同族、API 同构（initEpubFile / getSpine / loadChapter），
 * 且支持 EPUB2/EPUB3 与加密章节，解析能力完整。
 *
 * @lingo-reader/* 包统一走动态 import（与 extractMobiLikeText 一致，避免 ESM
 * 产物在 CJS 下 require 损坏）；Node 端章节内图片/CSS 会写到 resourceSaveDir，
 * 这里传临时目录并在结束时清理。loadChapter 返回的 HTML 经 stripHtmlToText
 * 提取正文后，图片路径等残留不会进入文本。
 */
async function extractEpubText(filePath: string): Promise<string> {
  const { initEpubFile } = await import('@lingo-reader/epub-parser')
  const saveDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kb-epub-'))
  try {
    type EpubBook = {
      getSpine(): Array<{ id: string }>
      loadChapter(id: string): Promise<{ id?: string; html?: string } | undefined>
      destroy(): void
    }
    const book = (await initEpubFile(filePath, saveDir)) as EpubBook

    try {
      let text = ''
      for (const chapter of book.getSpine()) {
        const loaded = await book.loadChapter(chapter.id)
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
 * 逻辑与 `knowledge-base.service.decodeTextFile` 一致。
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
