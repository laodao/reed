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
 *           若 PDF 自带书签大纲（/Outlines）则**以大纲为权威章节结构**（见 pdf-outline.ts），
 *           正文仍取逐页 Markdown；无大纲才回退版面标题推断。
 *  - epub → @firecrawl/anydoc（Rust/NAPI）：EPUB2/EPUB3 转带章节标题的 GFM Markdown；
 *           若容器自带目录（NCX/nav）则优先按目录 + 锚点切分生成权威层级。
 * 两者输出经 postProcessExtractedMarkdown 规范化：中文行内断字合并、H4+ 噪音标题
 * 降级为加粗正文、pdf 严重乱码（字体 CID 解码失败）抛错提示。
 * asMarkdown=true 返回 Markdown 结构（知识库切片需要标题/段落边界）；
 * 默认 false 返回去除标记的纯文本（剧本批量导入等消费端不感知 Markdown 语法）。
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import type { FileType } from '@shared/types/knowledge-base.types'
import { inferHeadingLevel, isMetadataHeading } from '@core/utils/heading-level'
import { mergeOutlineIntoMarkdown, readPdfOutline } from '@core/utils/pdf-outline'

/**
 * 认定「PDF 有可用书签大纲」的最少条目数。
 * 单条书签常见于打印/合并工具产生的占位大纲，用它覆盖整本标题结构反而更差，
 * 故条目太少时仍回退到版面标题推断。
 */
const MIN_PDF_OUTLINE_ENTRIES = 3

/** 提取选项 */
export interface ExtractTextOptions {
  /** 返回 Markdown 结构（pdf/epub 走解析器原生 Markdown；txt/md 原样返回）。默认 false：去标记纯文本 */
  asMarkdown?: boolean
  /**
   * 内嵌资源（epub 图片等）**目标目录**（绝对路径，通常为应用数据目录下的文档资源目录）。
   * 提供时：解析完把正文引用到的图片复制到该目录，正文只写 dataPath **相对路径**
   * （不落系统临时目录、不写绝对路径）；不提供时：正文里的本地图片引用会被清理（不留死链）。
   * 需与 resourceRefPrefix 一起提供。
   */
  resourceDir?: string
  /** 正文中图片引用前缀（相对 dataPath，正斜杠，不含末尾斜杠）；与 resourceDir 配套 */
  resourceRefPrefix?: string
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
function postProcessExtractedMarkdown(
  md: string,
  { strictGarbled = true, demoteDeepHeadings = true, normalizeHeadings = true } = {},
): string {
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
  // 1.7 标题归一化：
  //  · 元信息行（Release/版本/署名/版权/日期）降级为加粗正文——PDF 字体分层会把
  //    它们判成标题，导致正文小节全挂到元信息节点下（实测 numpy 的层级错挂）
  //  · 其余标题按编号模式修正层级（第1章→1 级、1.1→2 级、1.2.1→3 级）
  //    仅用于「靠字体/目录深度推断层级」的输入：EPUB 的层级已由目录+编号生成
  //    （「第1章」在书名 H1 之下是 H2），再归一化会把章压到 H1
  if (normalizeHeadings) {
    // 先统计标题文本频次：PDF 的每页页眉（如 "GETTING STARTED"、"CHAPTER"）会被
    // 判成标题并在全文重复出现——重复 >2 次的标题文本一律视为页眉噪音降级为正文
    const headingTexts = out
      .split('\n')
      .filter(l => /^#{1,6}\s+/.test(l))
      .map(l => l.replace(/^#{1,6}\s+/, '').trim())
    const freq = new Map<string, number>()
    for (const t of headingTexts) freq.set(t, (freq.get(t) ?? 0) + 1)
    // 每个标题文本的最后出现行号：PDF 前部的目录页会重复正文标题，
    // 目录在前、正文在后 → 「恰好出现 2 次」时只保留最后一次（正文）
    const lastLine = new Map<string, number>()
    const allLines = out.split('\n')
    allLines.forEach((line, i) => {
      const m = /^#{1,6}\s+(.+)$/.exec(line)
      if (m) lastLine.set(m[1].trim(), i)
    })

    out = allLines
      .map((line, i) => {
        const m = /^(#{1,6})\s+(.+)$/.exec(line)
        if (!m) return line
        const text = m[2].trim()
        const count = freq.get(text) ?? 0
        // 页眉噪音：重复 >2 次 → 全部降级
        if (count > 2) return `**${text}**`
        // 目录页重复：恰好 2 次 → 仅保留最后一次（正文中的那次）
        if (count === 2 && lastLine.get(text) !== i) return `**${text}**`
        // 目录页条目：点线 + 末尾页码
        if (/[.·]{3,}\s*\d+$/.test(text)) return `**${text}**`
        // 元信息行（版本/署名/版权/日期）
        if (isMetadataHeading(text)) return `**${text}**`
        const level = Math.min(6, inferHeadingLevel(text, m[1].length))
        return `${'#'.repeat(level)} ${text}`
      })
      .join('\n')
  }
  // 2. H4-H6 标题 → 加粗正文（保留文本内容但不再作为章节标题）。
  //    仅对「靠字体推断标题」的 PDF 生效：EPUB 走权威目录，H4+ 可能是真实的小节标题
  if (demoteDeepHeadings) {
    out = out.replace(/^#{4,6}\s+(.+)$/gm, '**$1**')
  }
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

/** 正则元字符转义（章节标题去重匹配用） */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Markdown 图片：![alt](url "title")，url 允许 <...> 包裹 */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g
/** HTML 图片标签的 src 属性 */
const HTML_IMG_TAG_RE = /<img\b[^>]*>/gi
const HTML_IMG_SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i

/** 远程/内联图片：保留原样（不落盘、也不该被清理） */
function isRemoteImageUrl(url: string): boolean {
  return /^(https?:|data:|blob:)/i.test(url)
}

/** 归一化为可比较的路径：正斜杠 + Windows 下大小写不敏感 */
function normalizeForCompare(p: string): string {
  const normalized = p.replace(/\\/g, '/').replace(/^file:\/\/\/?/i, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * 按 resolver 重写 Markdown 里的图片引用（唯一实现，供同步重写与异步落盘共用）。
 * resolver 返回 null = 删除该图片引用。
 */
function mapImageRefs(markdown: string, resolve: (url: string) => string | null): string {
  let out = markdown.replace(MD_IMAGE_RE, (_match, alt: string, wrapped?: string, plain?: string) => {
    const next = resolve(wrapped ?? plain ?? '')
    if (next === null) return ''
    return `![${alt}](${next})`
  })

  out = out.replace(HTML_IMG_TAG_RE, tag => {
    const m = HTML_IMG_SRC_RE.exec(tag)
    if (!m) return tag
    const next = resolve(m[1] ?? m[2] ?? '')
    if (next === null) return ''
    return tag.replace(HTML_IMG_SRC_RE, `src="${next}"`)
  })

  return out
}

/** 本地绝对路径判定（含 file:// 与 Windows 盘符） */
function isLocalAbsoluteImageUrl(url: string): boolean {
  const norm = normalizeForCompare(url)
  return /^[a-zA-Z]:\//.test(norm) || norm.startsWith('/')
}

/** url 是否落在指定目录内 */
function isInsideDir(url: string, dirNorm: string): boolean {
  return Boolean(dirNorm) && normalizeForCompare(url).startsWith(dirNorm + '/')
}

/**
 * 改写 / 清理 Markdown 中的本地图片引用（纯函数，不落盘）。
 *
 * 背景：@lingo-reader 系列解析器把章节内图片解压到「资源目录」并把 src 改写成该目录下的
 * **绝对路径**；而它的 destroy() 会删除这些资源文件（见 persistLocalImages 注释）。
 * 因此引用必须收口：
 *   1. 远程/内联图片（http/https/data/blob）→ 原样保留；
 *   2. 落在 resourceDir 内的绝对路径 → 改写为 `<refPrefix>/<文件名>`（dataPath 相对路径）；
 *   3. 其它本地绝对路径 / file:// → 整段删除（文件不在应用数据目录，留引用只会是死链）；
 *   4. 本来就是相对路径 → 保留（源文档自带引用，交由调用方决定如何解析）。
 *
 * 未提供 refPrefix 时，第 2 类也按第 3 类处理（无法安全表达相对路径，宁缺勿留死链）。
 */
export function rewriteImageRefs(
  markdown: string,
  options: { resourceDir?: string; refPrefix?: string } = {},
): string {
  const resDirNorm = options.resourceDir
    ? normalizeForCompare(options.resourceDir).replace(/\/+$/, '')
    : ''
  const prefix = (options.refPrefix ?? '').replace(/\\/g, '/').replace(/\/+$/, '')

  return mapImageRefs(markdown, rawUrl => {
    const url = rawUrl.trim()
    if (!url) return null
    if (isRemoteImageUrl(url)) return url
    if (!isLocalAbsoluteImageUrl(url)) return url // 已是相对路径：保留
    if (isInsideDir(url, resDirNorm) && prefix) {
      return `${prefix}/${url.replace(/\\/g, '/').split('/').pop() ?? ''}`
    }
    return null // 其它本地绝对路径：删除引用
  })
}

/**
 * 把 Markdown 里引用的本地图片**复制**到应用数据目录，并改写为相对路径引用。
 *
 * 为什么要复制：`@lingo-reader/epub-parser` / `mobi-parser` 把 resourceSaveDir 当**临时工作区**——
 * 解压出来的图片记录在 savedResourcePath 里，`destroy()` 时逐条 unlink（异步、忽略错误）。
 * 直接把 resourceSaveDir 指到应用数据目录，图片会在解析返回后被解析器自己删掉
 * （实测：解析后 1226 个文件在随后几秒内被清空，正文留下的是死链）。
 * 故工作区仍用临时目录，只把**正文真正引用到**的图片复制进目标目录，再改写引用。
 *
 * @returns { markdown, saved, failed } — failed 是复制失败（随后引用被删除）的数量
 */
export async function persistLocalImages(
  markdown: string,
  options: { workspaceDir: string; targetDir: string; refPrefix: string },
): Promise<{ markdown: string; saved: number; failed: number }> {
  const { workspaceDir, targetDir } = options
  const prefix = options.refPrefix.replace(/\\/g, '/').replace(/\/+$/, '')
  const workNorm = normalizeForCompare(workspaceDir).replace(/\/+$/, '')

  // 1. 收集工作区内被引用的图片绝对路径（去重，保持出现顺序）
  const sources: string[] = []
  const seen = new Set<string>()
  mapImageRefs(markdown, rawUrl => {
    const url = rawUrl.trim()
    if (url && !isRemoteImageUrl(url) && isInsideDir(url, workNorm)) {
      const key = normalizeForCompare(url)
      if (!seen.has(key)) {
        seen.add(key)
        sources.push(url.replace(/\\/g, '/').replace(/^file:\/\/\/?/i, ''))
      }
    }
    return rawUrl
  })

  // 2. 逐张复制到目标目录（同名不同源加序号去重，避免后复制覆盖先复制——
  //    EPUB 按章节目录存放图片时 image001.png 这类命名跨章重复极常见；
  //    失败则该引用稍后被删除）
  const copied = new Map<string, string>()
  const usedNames = new Set<string>()
  let failed = 0
  if (sources.length > 0 && prefix) {
    await fs.promises.mkdir(targetDir, { recursive: true })
    for (const source of sources) {
      const name = source.split('/').pop() ?? ''
      if (!name) continue
      try {
        let target = name
        if (usedNames.has(target)) {
          const dot = name.lastIndexOf('.')
          const stem = dot > 0 ? name.slice(0, dot) : name
          const ext = dot > 0 ? name.slice(dot) : ''
          let seq = 2
          while (usedNames.has(`${stem}_${seq}${ext}`)) seq++
          target = `${stem}_${seq}${ext}`
        }
        await fs.promises.copyFile(source, path.join(targetDir, target))
        usedNames.add(target)
        copied.set(normalizeForCompare(source), `${prefix}/${target}`)
      } catch {
        failed++
      }
    }
  }

  // 3. 改写：工作区内已复制的 → 相对路径；其余本地绝对路径 → 删除；远程/相对 → 保留
  const out = mapImageRefs(markdown, rawUrl => {
    const url = rawUrl.trim()
    if (!url) return null
    if (isRemoteImageUrl(url)) return url
    if (!isLocalAbsoluteImageUrl(url)) return url
    return copied.get(normalizeForCompare(url)) ?? null
  })

  return { markdown: out, saved: copied.size, failed }
}

let turndownService: { turndown(html: string): string } | null = null

/** 章节 HTML → Markdown（懒加载 turndown；AtX 标题 + 围栏代码块） */
function htmlToMarkdown(html: string): string {
  if (!turndownService) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TurndownService = require('turndown')
    turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  }
  const service = turndownService
  if (!service) throw new Error('turndown 初始化失败')
  return service.turndown(html)
}

/**
 * 用 EPUB 自带目录（nav/ncx）构建带**权威章节层级**的 Markdown。
 *
 * 为什么必须走容器结构：转 Markdown 会丢大纲——《深度学习》实测容器目录有 363 条
 * （书名页/版权页/译者序/数学符号…），而 anydoc 转 Markdown 后只剩书名 1 个标题
 * （该书章节标题不是 <h1> 标签）。故此处直接：
 *   目录（NCX 或 EPUB3 nav）→ 按 href 锚点在 xhtml 内切分章节正文 → 拼权威 Markdown
 * 章节标题与层级全部来自目录，正文来自容器内容。
 *
 * @lingo-reader/epub-parser 与 mobi-parser 同族（动态 import）；Node 端把章节内
 * 图片/CSS 解压到 resourceSaveDir，而 destroy() 会把这些文件删掉（该目录是它的临时工作区）：
 *   - 传了 options.resourceDir + options.resourceRefPrefix（知识库上传场景）→ 解析完把正文引用到的
 *     图片**复制**到应用数据目录并改写为相对路径引用（见 persistLocalImages）；
 *   - 没传（剧本导入等）→ 正文里的本地图片引用一并清理，不留下死链。
 * 目录为空 / 章节正文全空 → 抛错，由调用方回退 anydoc。
 */
async function extractEpubMarkdown(
  filePath: string,
  options: ExtractTextOptions = {},
): Promise<string> {
  const { initEpubFile } = await import('@lingo-reader/epub-parser')
  // 解析器的工作区始终用临时目录（它会在 destroy 时清空这里），永久目录只放复制出来的图片
  const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kb-epub-'))
  try {
    type SpineItem = { id: string; href?: string; properties?: string }
    type TocNode = { id?: string; label?: string; href?: string; children?: TocNode[] }
    type EpubBook = {
      getMetadata?(): { title?: string } | undefined
      getToc?(): TocNode[]
      getSpine?(): SpineItem[]
      loadChapter(id: string): Promise<{ html?: string } | undefined>
      destroy(): void
    }
    const book = (await initEpubFile(filePath, workspace)) as unknown as EpubBook
    try {
      const title = (book.getMetadata?.()?.title ?? '').trim()
      // 1) 目录：优先 NCX（getToc，含 EPUB2 与带 ncx 的 EPUB3）；空则解析 EPUB3 nav 文档
      let toc = book.getToc?.() ?? []
      if (toc.length === 0) {
        toc = (await readEpub3NavToc(book)) as TocNode[]
        if (toc.length > 0) console.log('[extract-text] EPUB3 nav 目录解析成功')
      }
      if (toc.length === 0) throw new Error('EPUB 目录为空（NCX 与 nav 均未解析到）')

      // 2) 按 xhtml 文件分组（同文件多锚点：一次加载，按锚点切分）
      type FlatItem = { label: string; level: number; fileHref: string; anchor: string }
      const flat: FlatItem[] = []
      const collect = (nodes: TocNode[], depth: number): void => {
        for (const node of nodes) {
          const href = (node.href ?? '').replace(/^epub:/, '')
          const [fileHref, anchor = ''] = href.split('#')
          flat.push({
            label: (node.label ?? '').trim(),
            // 层级：编号模式优先（《深度学习》的 NCX 目录是扁平的，靠「第1章 / 1.1 / 1.2.1」
            // 推导真实层级），无编号时退回目录嵌套深度
            level: Math.min(6, inferHeadingLevel((node.label ?? '').trim(), depth + 1)),
            fileHref,
            anchor,
          })
          if (node.children?.length) collect(node.children, depth + 1)
        }
      }
      collect(toc, 0)

      // 3) 逐文件加载并按锚点切分正文
      const byFile = new Map<string, FlatItem[]>()
      for (const item of flat) {
        if (!byFile.has(item.fileHref)) byFile.set(item.fileHref, [])
        byFile.get(item.fileHref)!.push(item)
      }
      const spine = book.getSpine?.() ?? []
      const bodyByItem = new Map<FlatItem, string>()
      for (const [fileHref, items] of byFile) {
        // href → manifest id（spine 里 properties 为 nav 的项是目录文档，仍可取正文）
        const spineItem =
          spine.find(s => (s.href ?? '').replace(/^epub:/, '').split('#')[0] === fileHref) ??
          spine.find(s => fileHref.endsWith((s.href ?? '').replace(/^epub:/, '').split('#')[0]))
        if (!spineItem) continue
        const html = (await book.loadChapter(spineItem.id))?.html ?? ''
        if (!html.trim()) continue
        const slices = sliceHtmlByAnchors(html, items.map(i => i.anchor).filter(Boolean))
        for (const item of items) {
          const raw = item.anchor ? slices.get(item.anchor) : html
          if (raw && raw.trim()) bodyByItem.set(item, htmlToMarkdown(raw).trim())
        }
      }

      // 4) 拼权威 Markdown：书名 H1 + 目录标题按层级 + 章节正文
      const parts: string[] = []
      if (title) parts.push(`# ${title}`)
      let chapterCount = 0
      for (const item of flat) {
        if (item.label) parts.push(`${'#'.repeat(Math.min(6, item.level + 1))} ${item.label}`)
        let body = bodyByItem.get(item) ?? ''
        // 章节内首个标题常与目录项同名 → 去重
        if (body && item.label) {
          body = body.replace(new RegExp(`^#{1,6}\\s*${escapeRegExp(item.label)}\\s*\\n+`), '')
        }
        if (body) {
          parts.push(body)
          chapterCount++
        }
      }
      if (chapterCount === 0) throw new Error('EPUB 章节正文解析为空')
      const md = parts.join('\n\n')
      // 图片收口：有永久目录就复制过去并改写为相对路径；否则清理本地引用（避免写入临时/绝对路径死链）
      if (options.resourceDir && options.resourceRefPrefix) {
        const persisted = await persistLocalImages(md, {
          workspaceDir: workspace,
          targetDir: options.resourceDir,
          refPrefix: options.resourceRefPrefix,
        })
        console.log(
          `[extract-text] EPUB 内嵌图片：落盘 ${persisted.saved} 张` +
            (persisted.failed > 0 ? `，复制失败 ${persisted.failed} 张（引用已剔除）` : ''),
        )
        return persisted.markdown
      }
      return rewriteImageRefs(md)
    } finally {
      // 解析器的 destroy() 会异步删除工作区里的资源文件；这里再兜底清一次目录
      book.destroy()
    }
  } finally {
    await fs.promises.rm(workspace, { recursive: true, force: true })
  }
}

/** 解析 EPUB3 nav 文档目录（<nav epub:type="toc"> 的 ol/ul 嵌套树） */
async function readEpub3NavToc(book: {
  getSpine?(): Array<{ id: string; properties?: string }>
  loadChapter(id: string): Promise<{ html?: string } | undefined>
}): Promise<Array<{ label: string; href: string; children?: unknown[] }>> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parse } = require('node-html-parser')
  const navItem = (book.getSpine?.() ?? []).find(s => s.properties === 'nav')
  if (!navItem) return []
  const html = (await book.loadChapter(navItem.id))?.html ?? ''
  if (!html.trim()) return []

  const root = parse(html)
  const navs = root.querySelectorAll('nav')
  const tocNav =
    navs.find((n: { getAttribute(name: string): string | undefined }) => {
      const type = n.getAttribute('epub:type') ?? n.getAttribute('type') ?? ''
      return type.includes('toc')
    }) ?? navs[0]
  if (!tocNav) return []
  const list = tocNav.querySelector('ol') ?? tocNav.querySelector('ul')
  if (!list) return []

  type NavNode = { label: string; href: string; children?: NavNode[] }
  const parseList = (listEl: { querySelectorAll(sel: string): unknown[]; childNodes?: unknown[] }): NavNode[] => {
    const out: NavNode[] = []
    // 只取直接子 li（避免把嵌套 li 当兄弟）
    const items = (listEl as { childNodes: Array<{ rawTagName?: string; querySelector?: unknown; querySelectorAll?: unknown }> }).childNodes.filter(
      c => c && c.rawTagName === 'li',
    )
    for (const li of items as Array<{
      querySelector(sel: string): { text?: string; getAttribute(name: string): string | undefined } | null
      querySelectorAll(sel: string): Array<{ querySelectorAll(sel: string): Array<unknown> }>
    }>) {
      const a = li.querySelector('a')
      const label = (a?.text ?? '').replace(/\s+/g, ' ').trim()
      const href = a?.getAttribute('href') ?? ''
      const childLists = li.querySelectorAll('ol, ul')
      const children = childLists.length > 0 ? parseList(childLists[0] as never) : undefined
      if (label || children?.length) out.push({ label, href, children })
    }
    return out
  }
  return parseList(list as never)
}

/**
 * 在一个 xhtml 内按锚点位置切分：返回 anchor → 该锚点到下一锚点之间的 HTML。
 * `filepos` 锚点通常是 `<a id="filepos...">`；找不到的锚点不入结果（该章正文为空）。
 */
function sliceHtmlByAnchors(html: string, anchors: string[]): Map<string, string> {
  const result = new Map<string, string>()
  const marks: Array<{ anchor: string; index: number }> = []
  for (const anchor of anchors) {
    const re = new RegExp(`<[a-zA-Z][^>]*(?:id|name)=["']${escapeRegExp(anchor)}["'][^>]*>`, 'i')
    const m = re.exec(html)
    if (m) marks.push({ anchor, index: m.index })
  }
  marks.sort((a, b) => a.index - b.index)
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : html.length
    result.set(marks[i].anchor, html.slice(start, end))
  }
  return result
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
  // mobi/azw3 的解析器按 filePath 自己读盘，预读的 buffer 只会白占一份等大的堆内存
  const buffer = fileType === 'mobi' || fileType === 'azw3' ? Buffer.alloc(0) : await fs.promises.readFile(filePath)

  switch (fileType) {
    case 'txt':
    case 'md':
    case 'webpage': // 网页内容存储为 txt 格式
      return decodeTextFile(buffer)

    case 'pdf': {
      const { classifyPdf, extractPagesMarkdown, processPdf } = await import('@firecrawl/pdf-inspector')
      const cls = classifyPdf(buffer)
      if (cls.pdfType === 'Scanned' || cls.pdfType === 'ImageBased') {
        throw new Error(
          `PDF 为${cls.pdfType === 'Scanned' ? '扫描版' : '图片版'}（无文本层），本地无法提取，需要 OCR 能力，请上传文字版 PDF`,
        )
      }

      // 1) 优先：PDF 自带书签大纲 → 权威章节层级（正文仍取逐页 Markdown）。
      //    必要性：pdf-inspector 的标题由字号/版面启发式推断，页眉横幅会被判成 H1、
      //    标题先后顺序也会错位（numpy-user.pdf 实测 721 页、2137 条书签 6 层）。
      let md: string | null = null
      try {
        const outline = await readPdfOutline(buffer)
        if (outline.length >= MIN_PDF_OUTLINE_ENTRIES) {
          const pages = extractPagesMarkdown(buffer)
            .pages.filter(p => (p.markdown ?? '').trim().length > 0)
            .map(p => ({ pageIndex: p.page, markdown: p.markdown }))
          if (pages.length > 0) {
            md = mergeOutlineIntoMarkdown(pages, outline)
            console.log(`[extract-text] PDF 书签大纲 ${outline.length} 条 → 权威章节结构`)
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[extract-text] PDF 大纲提取不可用，回退版面标题推断：${msg}`)
      }

      // 2) 回退：pdf-inspector 整本 Markdown（标题靠版面推断 + 标题归一化）
      if (!md || !md.trim()) {
        const result = processPdf(buffer)
        if (!result.markdown || result.markdown.trim().length === 0) {
          throw new Error('PDF 未提取到文本（可能为图片型页面）')
        }
        const fallback = postProcessExtractedMarkdown(result.markdown)
        return options.asMarkdown ? fallback : markdownToPlainText(fallback)
      }

      // 权威书签层级 + 已按大纲切分 → 关闭标题归一化（避免把章压到 H1），
      // 也不做 H4+ 降级（深层小节是真实结构）
      const normalized = postProcessExtractedMarkdown(md, {
        strictGarbled: true,
        demoteDeepHeadings: false,
        normalizeHeadings: false,
      })
      return options.asMarkdown ? normalized : markdownToPlainText(normalized)
    }

    case 'epub': {
      // 1) 优先：EPUB 自带目录（nav/ncx）→ 权威章节层级（书名 H1 / 一级章 H2 …）。
      //    必要性：《深度学习》这类 epub 的章节标题不是 <h1> 标签，anydoc 输出里
      //    只剩书名一个标题，靠正文正则只能误捡「第5章介绍了…」这类引用句。
      let md: string | null = null
      try {
        md = await extractEpubMarkdown(filePath, options)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[extract-text] EPUB 目录提取不可用，回退 anydoc：${msg}`)
      }
      // 2) 回退：anydoc 整本 Markdown（目录缺失/章节正文为空时）
      if (!md || !md.trim()) {
        const { toMarkdownBytes } = await import('@firecrawl/anydoc')
        md = await toMarkdownBytes(buffer)
      }
      if (!md || md.trim().length === 0) {
        throw new Error('EPUB 未解析出内容')
      }
      // 权威目录 + 编号推导已给出正确层级 → 关闭标题归一化（避免把章压到 H1），
      // 也不做 H4+ 降级（深层标题是真实小节）
      const normalized = postProcessExtractedMarkdown(md, {
        strictGarbled: false,
        demoteDeepHeadings: false,
        normalizeHeadings: false,
      })
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