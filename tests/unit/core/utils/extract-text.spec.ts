/**
 * 文件 → 文本/Markdown 提取 单测
 * @module tests/unit/core/utils/extract-text
 *
 * 背景：
 *  - epub 分支曾误用 epub-parser@0.2.5 的错误 API，后改用 @lingo-reader/epub-parser；
 *    本轮接入 @firecrawl/anydoc（Rust），输出带章节目录/标题层级的 Markdown，
 *    默认（asMarkdown=false）去标记转纯文本，知识库传 asMarkdown=true 保留结构。
 *  - pdf 分支接入 @firecrawl/pdf-inspector（Rust）：TextBased 输出结构化 Markdown；
 *    Scanned/ImageBased 抛明确错误（需 OCR）；并对中文行内断字、H4+ 噪音标题做规范化。
 *
 * 夹具：fixtures/minibook.epub（EPUB3）、minibook2.epub（EPUB2）、
 *       sample-ai-chat.pdf（真实 258KB 中文 PDF，含 #/## 标题与多段落）。
 */
import { describe, it, expect } from 'vitest'
import path from 'path'
import { extractTextFromFile } from '@core/utils/extract-text'

const miniBookPath = path.join(__dirname, 'fixtures', 'minibook.epub')
const miniBook2Path = path.join(__dirname, 'fixtures', 'minibook2.epub')
const samplePdfPath = path.join(__dirname, 'fixtures', 'sample-ai-chat.pdf')

/** 去除全部空白后比对 */
function compact(s: string): string {
  return s.replace(/\s+/g, '')
}

describe('extractTextFromFile: epub（默认纯文本模式）', () => {
  it('解析真实 epub（EPUB3 + nav + 两章中文正文）成功', async () => {
    const text = await extractTextFromFile(miniBookPath, 'epub')
    const c = compact(text)

    expect(c).toContain('第一章引子')
    expect(c).toContain('这是测试之书的第一章正文，包含中文与样式标签。')
    expect(c).toContain('第二段：验证多段合并后依旧保留段落分隔。')
    expect(c).toContain('第二章图片')
    expect(c).toContain('本章包含一个自闭合图片引用与空段落。')
    expect(c).toContain('结尾段落。')
  })

  it('纯文本模式不残留 Markdown/HTML 语法', async () => {
    const text = await extractTextFromFile(miniBookPath, 'epub')

    expect(text).not.toMatch(/<[a-zA-Z/][^>]*>/)
    expect(text).not.toContain('body { color: #333; }')
    expect(text).not.toContain('logo.svg')
    expect(text).not.toMatch(/#{1,6}\s+\S/) // 无 # 标题
    expect(text).not.toContain('**')
  })

  it('保留阅读顺序（第一章正文在第二章正文之前）', async () => {
    const text = await extractTextFromFile(miniBookPath, 'epub')
    const c = compact(text)

    const firstChapterBody = c.indexOf('这是测试之书的第一章正文')
    const secondChapterBody = c.indexOf('本章包含一个自闭合图片引用')
    expect(firstChapterBody).toBeGreaterThanOrEqual(0)
    expect(secondChapterBody).toBeGreaterThan(firstChapterBody)
  })
})

describe('extractTextFromFile: epub markdown 结构模式（asMarkdown）', () => {
  it('保留 Markdown 标题层级与段落空行（知识库切片需要的结构）', async () => {
    const md = await extractTextFromFile(miniBookPath, 'epub', { asMarkdown: true })

    // 书名/章节标题转为 Markdown 标题
    expect(md).toContain('# 测试之书')
    expect(md).toContain('# 第一章 引子')
    expect(md).toContain('# 第二章 图片')
    // 段落以空行分隔（章节内 <p> 不再被压成空格）
    expect(md).toMatch(/\n\n/)
    // 无 HTML 残留
    expect(md).not.toMatch(/<[a-zA-Z/][^>]*>/)
  })
})

describe('extractTextFromFile: epub2（NCX 目录老格式）', () => {
  it('解析 EPUB2 epub 成功：正文完整、按 spine 顺序拼接', async () => {
    const text = await extractTextFromFile(miniBook2Path, 'epub')
    const c = compact(text)

    expect(c).toContain('这是测试之书的第一章正文，包含中文与样式标签。')
    expect(c).toContain('第二段：验证多段合并后依旧保留段落分隔。')
    expect(c).toContain('结尾段落。')
    expect(text).not.toMatch(/<[a-zA-Z/][^>]*>/)

    const first = c.indexOf('这是测试之书的第一章正文')
    const second = c.indexOf('本章包含一个自闭合图片引用')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThan(first)
  })
})

describe('extractTextFromFile: pdf（pdf-inspector）', () => {
  it('markdown 模式：标题层级 + 段落空行 + 无乱码', async () => {
    const md = await extractTextFromFile(samplePdfPath, 'pdf', { asMarkdown: true })

    expect(md).toContain('# AI回答')
    expect(md).toMatch(/\n\n/)
    expect(md).not.toContain('\uFFFD')
  })

  it('纯文本模式：剥离标题标记、保留正文', async () => {
    const text = await extractTextFromFile(samplePdfPath, 'pdf')

    expect(text).not.toMatch(/^#{1,6}\s+/m)
    expect(text).toContain('落地实施设计')
  })

  it('中文行内断字被规范化（“内 存”→“内存”）', async () => {
    const md = await extractTextFromFile(samplePdfPath, 'pdf', { asMarkdown: true })

    expect(md).toContain('内存')
    expect(md).not.toContain('内 存')
  })
})

describe('extractTextFromFile: 其他类型', () => {
  it('不支持的类型抛错', async () => {
    await expect(
      extractTextFromFile(miniBookPath, 'doc' as never),
    ).rejects.toThrow('不支持的文件类型: doc')
  })
})