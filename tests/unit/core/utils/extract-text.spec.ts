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
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { extractTextFromFile, rewriteImageRefs, persistLocalImages } from '@core/utils/extract-text'
import { buildMiniPdfWithOutline } from './fixtures/minipdf-outline.builder'

const miniBookPath = path.join(__dirname, 'fixtures', 'minibook.epub')
const miniBook2Path = path.join(__dirname, 'fixtures', 'minibook2.epub')
const samplePdfPath = path.join(__dirname, 'fixtures', 'sample-ai-chat.pdf')

// 带书签大纲的 PDF 运行时生成（.pdf 入库会被 core.autocrlf 破坏，见 builder 注释）
let outlineDir = ''
let pdfOutlinePath = ''
beforeAll(() => {
  outlineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-extract-pdf-'))
  pdfOutlinePath = path.join(outlineDir, 'minipdf-outline.pdf')
  fs.writeFileSync(pdfOutlinePath, buildMiniPdfWithOutline())
})
afterAll(() => {
  if (outlineDir) fs.rmSync(outlineDir, { recursive: true, force: true })
})

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

    // 书名（metadata.title）为 H1；目录中的章节为 H2 —— 章节层级来自 EPUB 目录（nav/ncx），
    // 不依赖正文里是否有 <h1> 标签（《深度学习》这类书正文标题不是 heading 标签）
    expect(md).toContain('# 测试之书')
    expect(md).toContain('## 第一章 引子')
    expect(md).toContain('## 第二章 图片')
    // 章节正文完整（HTML → Markdown 后文本仍在；turndown 保留 **加粗** 语义）
    const plain = compact(md).replace(/\*\*/g, '')
    expect(plain).toContain('这是测试之书的第一章正文，包含中文与样式标签。')
    expect(plain).toContain('本章包含一个自闭合图片引用与空段落。')
    // 段落以空行分隔（章节内 <p> 不再被压成空格）
    expect(md).toMatch(/\n\n/)
    // 无 HTML 残留
    expect(md).not.toMatch(/<[a-zA-Z/][^>]*>/)
    // 无 EPUB 内部链接锚点噪音（anydoc 生成的 #oebps-* target）
    expect(md).not.toMatch(/\(#?oebps-[^)]*\)/)
  })
})

describe('extractTextFromFile: epub 内嵌图片 → 资源目录（相对路径）', () => {
  it('提供 resourceDir：图片复制到该目录，正文只写相对路径，且解析结束/解析器清理后文件仍在', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-res-'))
    const resourceDir = path.join(root, 'assets', 'doc1')
    try {
      const md = await extractTextFromFile(miniBookPath, 'epub', {
        asMarkdown: true,
        resourceDir,
        resourceRefPrefix: 'knowledge-base/kb1/documents/assets/doc1',
      })

      // 图片真实落到目标目录
      const files = fs.readdirSync(resourceDir)
      expect(files.length).toBeGreaterThan(0)

      // 正文只写 dataPath 相对路径
      expect(md).toContain('![logo](knowledge-base/kb1/documents/assets/doc1/')
      expect(md).not.toContain(os.tmpdir())
      expect(md).not.toContain('kb-epub-')
      expect(md).not.toMatch(/[A-Za-z]:[\\/]/)

      // 关键回归：解析器 destroy() 会异步删除它自己的工作区资源；
      // 复制出来的文件必须留在应用数据目录（早期实现把工作区直接指向数据目录，图片随后被删空）
      const copied = files.map(f => path.join(resourceDir, f))
      await new Promise(r => setTimeout(r, 600))
      for (const file of copied) {
        expect(fs.existsSync(file), `${path.basename(file)} 在解析结束后被删除`).toBe(true)
      }
      expect(fs.readdirSync(resourceDir).length).toBe(files.length)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('未提供 resourceDir：不残留临时绝对路径（本地图片引用被清理）', async () => {
    const md = await extractTextFromFile(miniBookPath, 'epub', { asMarkdown: true })

    expect(md).not.toContain(os.tmpdir())
    expect(md).not.toContain('kb-epub-')
    expect(md).not.toMatch(/[A-Za-z]:[\\/]/)
  })
})

describe('persistLocalImages：图片复制 + 引用改写', () => {
  let workDir = ''
  let targetDir = ''

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-work-'))
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-target-'))
  })

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true })
    fs.rmSync(targetDir, { recursive: true, force: true })
  })

  it('工作区内图片复制到目标目录，引用改写为相对前缀（去重复制一次）', async () => {
    fs.writeFileSync(path.join(workDir, 'a.png'), 'A')
    fs.writeFileSync(path.join(workDir, 'b.png'), 'B')
    const md = `![1](${path.join(workDir, 'a.png')}) ![2](${workDir.replace(/\\/g, '/')}/b.png) ![1-again](${path.join(workDir, 'a.png')})`

    const result = await persistLocalImages(md, {
      workspaceDir: workDir,
      targetDir,
      refPrefix: 'knowledge-base/kb1/documents/assets/doc1',
    })

    expect(result.saved).toBe(2)
    expect(result.failed).toBe(0)
    expect(fs.readFileSync(path.join(targetDir, 'a.png'), 'utf8')).toBe('A')
    expect(fs.readFileSync(path.join(targetDir, 'b.png'), 'utf8')).toBe('B')
    expect(result.markdown).toBe(
      '![1](knowledge-base/kb1/documents/assets/doc1/a.png) ' +
        '![2](knowledge-base/kb1/documents/assets/doc1/b.png) ' +
        '![1-again](knowledge-base/kb1/documents/assets/doc1/a.png)',
    )
  })

  it('文件已不存在（解析器已清理）→ 引用被剔除，不写入死链', async () => {
    const missing = path.join(workDir, 'gone.png')
    const result = await persistLocalImages(`前文 ![x](${missing}) 后文`, {
      workspaceDir: workDir,
      targetDir,
      refPrefix: 'p',
    })

    expect(result.saved).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.markdown).not.toContain('gone.png')
    expect(result.markdown).toContain('前文')
    expect(result.markdown).toContain('后文')
  })

  it('远程图片与相对路径引用保持不变', async () => {
    const md = '![r](https://x.com/a.png) ![rel](images/a.png)'
    const result = await persistLocalImages(md, {
      workspaceDir: workDir,
      targetDir,
      refPrefix: 'p',
    })
    expect(result.markdown).toBe(md)
    expect(result.saved).toBe(0)
  })

  it('目标目录不存在时自动创建', async () => {
    fs.writeFileSync(path.join(workDir, 'c.png'), 'C')
    const nested = path.join(targetDir, 'deep', 'assets')
    const result = await persistLocalImages(`![c](${path.join(workDir, 'c.png')})`, {
      workspaceDir: workDir,
      targetDir: nested,
      refPrefix: 'p',
    })
    expect(result.saved).toBe(1)
    expect(fs.existsSync(path.join(nested, 'c.png'))).toBe(true)
  })
})

describe('rewriteImageRefs：图片引用改写/清理', () => {
  const resDir = path.join('C:', 'data', 'knowledge-base', 'kb1', 'documents', 'assets', 'doc1')

  it('资源目录内的绝对路径 → 相对前缀（两种分隔符都认）', () => {
    const md = `![a](${path.join(resDir, 'x.png')})\n![b](${resDir.replace(/\\/g, '/')}/y.png)`
    const out = rewriteImageRefs(md, {
      resourceDir: resDir,
      refPrefix: 'knowledge-base/kb1/documents/assets/doc1',
    })
    expect(out).toBe(
      '![a](knowledge-base/kb1/documents/assets/doc1/x.png)\n![b](knowledge-base/kb1/documents/assets/doc1/y.png)',
    )
  })

  it('远程图片（http/https/data）保留原样', () => {
    const md = '![a](https://x.com/a.png) ![b](data:image/png;base64,AAA)'
    const out = rewriteImageRefs(md, { resourceDir: resDir, refPrefix: 'p' })
    expect(out).toBe(md)
  })

  it('资源目录之外的本地绝对路径（临时目录等）整段删除，不写入 DB', () => {
    const md = `前文\n\n![dead](${path.join('C:', 'Users', 'x', 'AppData', 'Local', 'Temp', 'kb-epub-1', 'a.png')})\n\n后文`
    const out = rewriteImageRefs(md, { resourceDir: resDir, refPrefix: 'p' })
    expect(out).not.toContain('kb-epub-1')
    expect(out).not.toContain('![')
    expect(out).toContain('前文')
    expect(out).toContain('后文')
  })

  it('已是相对路径：保留（源文档自带的相对引用）', () => {
    const md = '![a](images/a.png)'
    expect(rewriteImageRefs(md, { resourceDir: resDir, refPrefix: 'p' })).toBe(md)
  })

  it('HTML <img src> 形式同样处理', () => {
    const md = `<img src="${path.join(resDir, 'z.jpg')}" alt="z"/>`
    const out = rewriteImageRefs(md, {
      resourceDir: resDir,
      refPrefix: 'knowledge-base/kb1/documents/assets/doc1',
    })
    expect(out).toBe('<img src="knowledge-base/kb1/documents/assets/doc1/z.jpg" alt="z"/>')
  })

  it('未给相对前缀：本地引用一律清理（宁缺勿留死链）', () => {
    const md = `![a](${path.join(resDir, 'x.png')}) ![keep](https://x.com/a.png)`
    const out = rewriteImageRefs(md, { resourceDir: resDir })
    expect(out).not.toContain('x.png')
    expect(out).toContain('https://x.com/a.png')
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

  it('带书签大纲的 PDF：标题层级来自书签（而非版面推断），正文不丢', async () => {
    const md = await extractTextFromFile(pdfOutlinePath, 'pdf', { asMarkdown: true })

    expect(md).toContain('# Chapter One')
    expect(md).toContain('## Section 1.1')
    expect(md).toContain('# Chapter Two')
    expect(md).toContain('# Chapter Three')
    expect(md).toContain('Body of chapter one.')
    expect(md).toContain('Body of chapter three.')
  })
})

describe('extractTextFromFile: 其他类型', () => {
  it('不支持的类型抛错', async () => {
    await expect(
      extractTextFromFile(miniBookPath, 'doc' as never),
    ).rejects.toThrow('不支持的文件类型: doc')
  })
})