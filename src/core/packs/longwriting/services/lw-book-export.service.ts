/**
 * 长文成书导出服务（PDF / EPUB）
 * @module core/packs/longwriting/services/lw-book-export.service
 * @description 第7步「导出全部」的成书链路：封面页 + 章节大纲 + 正文。
 *              - collectBookData：项目 + 大纲树 + 逐章正文 → 成书模型（卷→章）
 *              - buildPdfHtml / renderBookPdf：阅读版 HTML（图片 data URI 内嵌）→ printToPDF
 *              - buildEpub：archiver 手打 EPUB3（nav + NCX 双目录，封面进 manifest）
 *              handler 只做存盘对话框与写盘，组装与渲染全部在本服务。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import archiver from 'archiver'
import { resolveAssetPath } from '@core/utils/asset-path'
import { getDocumentTools } from '@core/platform/services/document-tools/document-tools'
import { extractMarkerPages, writePdfOutline, type PdfOutlineSpec } from '@core/utils/pdf-outline-writer'
import type { LongWritingProject, StoryOutline } from '@shared/types/longwriting.types'
import type { LongWritingService } from './longwriting.service'

// ==================== 成书模型 ====================

export interface BookSection {
  id: string
  name: string
  /** 节大纲概要（当前目录只取标题，保留字段备查） */
  summary: string
  content: string
}

export interface BookChapter {
  id: string
  name: string
  summary: string
  content: string
  /** 章下小节（大纲第三层 level 3），正文作为章内 h3 小节连排 */
  sections: BookSection[]
}

export interface BookVolume {
  id: string
  /** 卷名；空串表示无卷结构（不渲染分隔页） */
  name: string
  summary: string
  chapters: BookChapter[]
}

export interface BookData {
  title: string
  project: LongWritingProject
  /** 封面图相对 dataPath 路径；null=未设置 */
  coverPath: string | null
  volumes: BookVolume[]
  chapterCount: number
}

/** 图片扩展名 → mime（与 LongWritingService.COVER_IMAGE_MIMES 同表） */
const IMAGE_MIMES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

// ==================== 数据收集 ====================

interface OutlineNode extends StoryOutline {
  children?: OutlineNode[]
}

/**
 * 收集成书数据：项目 + 大纲（平铺自建树）+ 逐章正文。
 * 卷=volume 节点；章/节（chapter/section）=叶子章。无卷结构时归入一个匿名卷。
 */
export async function collectBookData(service: LongWritingService, projectId: string): Promise<BookData> {
  const project = await service.getProject(projectId)
  if (!project) throw new Error('项目不存在')

  const overview = project.type === 'story' ? await service.getStoryOverview(projectId) : null
  const title = overview?.title || project.name

  // service.getOutlineTree 返回平铺列表（按 order_index 排序），这里按 parentId 自建树
  const flat = (await service.getOutlineTree(projectId)) as OutlineNode[]
  const nodeMap = new Map<string, OutlineNode>()
  for (const n of flat) nodeMap.set(n.id, { ...n, children: [] })
  const roots: OutlineNode[] = []
  for (const n of flat) {
    const node = nodeMap.get(n.id)!
    const parent = n.parentId ? nodeMap.get(n.parentId) : undefined
    if (parent) parent.children!.push(node)
    else roots.push(node)
  }

  const volumes: BookVolume[] = []
  const toSection = (node: OutlineNode): BookSection => ({
    id: node.id, name: node.name, summary: node.summary || '', content: '',
  })
  const toChapter = (node: OutlineNode): BookChapter => ({
    id: node.id,
    name: node.name,
    summary: node.summary || '',
    content: '',
    sections: (node.children || []).map(toSection),
  })
  // 收集某卷节点子树内全部章（保序；卷嵌套属非预期结构，摊平处理）
  const collectChapters = (node: OutlineNode, vol: BookVolume) => {
    for (const child of node.children || []) {
      if (child.nodeType === 'volume') {
        collectChapters(child, vol)
      } else {
        vol.chapters.push(toChapter(child))
      }
    }
  }

  for (const root of roots) {
    if (root.nodeType === 'volume') {
      const vol: BookVolume = { id: root.id, name: root.name, summary: root.summary || '', chapters: [] }
      collectChapters(root, vol)
      volumes.push(vol)
    } else {
      // 根级章/节（无卷结构）：归入匿名卷；根级节按章条目处理
      let vol = volumes.find(v => v.name === '' && v.id === '')
      if (!vol) {
        vol = { id: '', name: '', summary: '', chapters: [] }
        volumes.push(vol)
      }
      vol.chapters.push(root.nodeType === 'section'
        ? { id: root.id, name: root.name, summary: root.summary || '', content: '', sections: [] }
        : toChapter(root))
    }
  }

  const chapterCount = volumes.reduce(
    (sum, v) => sum + v.chapters.length + v.chapters.reduce((s, c) => s + c.sections.length, 0),
    0,
  )

  // 批量填正文
  for (const vol of volumes) {
    for (const ch of vol.chapters) {
      const chapter = await service.getChapter(ch.id)
      ch.content = chapter?.content || ''
      for (const sec of ch.sections) {
        const secChapter = await service.getChapter(sec.id)
        sec.content = secChapter?.content || ''
      }
    }
  }

  return {
    title,
    project,
    coverPath: project.coverPath || null,
    volumes,
    chapterCount,
  }
}

// ==================== PDF ====================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function getMarked() {
  const mod = await import('marked')
  return mod
}

/** 读取封面 → data URI（printToPDF 的 data: URL 页面加载不了 file://，必须内嵌） */
async function loadCoverDataUri(coverPath: string): Promise<string | null> {
  try {
    const ext = path.extname(coverPath).toLowerCase()
    const mime = IMAGE_MIMES[ext]
    if (!mime) return null
    const bytes = await fs.promises.readFile(resolveAssetPath(coverPath))
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null // 封面文件丢失时不阻断导出，跳过封面页
  }
}

/** 阅读版样式（A4 打印；封面页满幅、卷分隔页/章各起新页） */
const BOOK_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
         color: #262626; font-size: 14px; line-height: 1.9; margin: 0; }
  .cover-page { height: 100vh; display: flex; flex-direction: column; align-items: center;
                justify-content: center; text-align: center; page-break-after: always; }
  .cover-page img { max-width: 78%; max-height: 60%; object-fit: contain; }
  .cover-title { font-size: 34px; font-weight: 600; letter-spacing: 4px; margin-top: 32px; }
  .title-page { height: 100vh; display: flex; flex-direction: column; align-items: center;
                justify-content: center; text-align: center; page-break-after: always; }
  .title-page h1 { font-size: 36px; letter-spacing: 4px; margin: 0; }
  .toc-page h1 { font-size: 24px; border-bottom: 2px solid #b8860b; padding-bottom: 10px; }
  .toc-page a { color: inherit; text-decoration: none; }
  .toc-volume { font-size: 17px; color: #6b4f1d; font-weight: 600; margin: 16px 0 8px; }
  .toc-volume a { color: #6b4f1d; }
  .toc-chapter { margin: 8px 0 4px; font-size: 14.5px; padding-left: 1.5em; }
  .toc-section { margin: 4px 0; font-size: 13px; color: #555; padding-left: 3em; }
  .volume-divider { page-break-before: always; text-align: center; padding-top: 200px; }
  .volume-divider h1 { font-size: 28px; letter-spacing: 6px; margin: 0 0 14px; }
  .chapter { page-break-before: always; }
  .chapter h2 { font-size: 21px; border-bottom: 1px solid #d9d4c5; padding-bottom: 10px; }
  .chapter h3 { font-size: 16.5px; color: #4a3f28; margin: 1.8em 0 0.8em; }
  .chapter-content p { margin: 0 0 0.65em; text-indent: 2em; }
  .chapter-content.empty { color: #9a9a9a; font-style: italic; text-indent: 0; }
  /* 书签标记：随标题流入对应分页但不显示不占版面（渲染后由 pdfjs 反解页码注入书签大纲） */
  .pdf-marker { color: transparent; font-size: 1px; line-height: 0; }
`

/**
 * 成书 HTML：封面页（或标题页）→ 章节大纲页 → 正文（卷分隔页 + 章）。
 * 无封面自动降级为纯标题页；无章节内容时正文区仅剩大纲页（调用方一般已拦）。
 */
export async function buildPdfHtml(book: BookData): Promise<string> {
  const mod = await getMarked()
  const coverDataUri = book.coverPath ? await loadCoverDataUri(book.coverPath) : null

  const parts: string[] = []

  // 封面页 / 标题页（埋书签标记）
  if (coverDataUri) {
    parts.push(`
      <div class="cover-page">
        <span class="pdf-marker">[[LW:p:title]]</span>
        <img src="${coverDataUri}" alt="封面"/>
        <div class="cover-title">${escapeHtml(book.title)}</div>
      </div>`)
  } else {
    parts.push(`
      <div class="title-page">
        <span class="pdf-marker">[[LW:p:title]]</span>
        <h1>${escapeHtml(book.title)}</h1>
      </div>`)
  }

  // 目录页（卷 → 章 → 节 三层结构；条目为文内跳转链接，配合书签大纲构成可索引目录）
  const tocBlocks = book.volumes
    .filter(v => v.chapters.length > 0)
    .map(v => {
      const volumeHeading = v.name
        ? `<div class="toc-volume"><a href="#vol-${v.id}">${escapeHtml(v.name)}</a></div>`
        : ''
      const chapters = v.chapters
        .map(c => {
          const sections = c.sections
            .map(s => `<div class="toc-section"><a href="#sec-${s.id}">${escapeHtml(s.name)}</a></div>`)
            .join('')
          return `<div class="toc-chapter"><a href="#ch-${c.id}">${escapeHtml(c.name)}</a></div>${sections}`
        })
        .join('')
      return `${volumeHeading}${chapters}`
    })
    .join('')
  parts.push(`
    <div class="toc-page">
      <span class="pdf-marker">[[LW:p:toc]]</span>
      <h1>目录</h1>
      ${tocBlocks}
    </div>`)

  // 正文：卷分隔页 → 章（独立起页）→ 节（章内 h3 连排）；各级标题带锚点 id 供目录链接与书签大纲定位
  for (const vol of book.volumes) {
    if (vol.name) {
      parts.push(`
        <div class="volume-divider" id="vol-${vol.id}">
          <span class="pdf-marker">[[LW:v:${vol.id}]]</span>
          <h1>${escapeHtml(vol.name)}</h1>
        </div>`)
    }
    for (const ch of vol.chapters) {
      const chapterHtml = ch.content
        ? `<div class="chapter-content">${await mod.marked(ch.content, { gfm: true, breaks: true })}</div>`
        : (ch.sections.length ? '' : `<div class="chapter-content empty">（本章暂无正文）</div>`)
      const sectionHtmls: string[] = []
      for (const sec of ch.sections) {
        const secHtml = sec.content
          ? `<div class="chapter-content">${await mod.marked(sec.content, { gfm: true, breaks: true })}</div>`
          : `<div class="chapter-content empty">（本节暂无正文）</div>`
        sectionHtmls.push(`<h3 id="sec-${sec.id}"><span class="pdf-marker">[[LW:s:${sec.id}]]</span>${escapeHtml(sec.name)}</h3>\n${secHtml}`)
      }
      parts.push(`
        <div class="chapter" id="ch-${ch.id}">
          <h2><span class="pdf-marker">[[LW:c:${ch.id}]]</span>${escapeHtml(ch.name)}</h2>
          ${chapterHtml}
          ${sectionHtmls.join('\n')}
        </div>`)
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(book.title)}</title>
<style>${BOOK_CSS}</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`
}

/** HTML → PDF Buffer（平台渲染器 printToPDF，仅桌面端），再按标记页码注入卷/章/节书签大纲 */
export async function renderBookPdf(book: BookData): Promise<Buffer> {
  const html = await buildPdfHtml(book)
  const pdf = await getDocumentTools().renderHtmlToPdf(html)
  const markerPages = await extractMarkerPages(pdf)
  return await writePdfOutline(pdf, buildPdfOutlineSpecs(book), markerPages)
}

/** 书签大纲规格：书名 → 目录 → 卷 → 章 → 节（与正文标记一一对应） */
function buildPdfOutlineSpecs(book: BookData): PdfOutlineSpec[] {
  const chapterSpec = (ch: BookChapter): PdfOutlineSpec => ({
    markerId: `c:${ch.id}`,
    title: ch.name,
    children: ch.sections.map(s => ({ markerId: `s:${s.id}`, title: s.name, children: [] })),
  })
  const specs: PdfOutlineSpec[] = [
    { markerId: 'p:title', title: book.title, children: [] },
    { markerId: 'p:toc', title: '目录', children: [] },
  ]
  for (const vol of book.volumes) {
    if (!vol.name) {
      specs.push(...vol.chapters.map(chapterSpec))
    } else {
      specs.push({ markerId: `v:${vol.id}`, title: vol.name, children: vol.chapters.map(chapterSpec) })
    }
  }
  return specs
}

// ==================== EPUB ====================

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** marked 输出的 HTML 转合法 XHTML：闭合空元素（EPUB 阅读器按 XML 解析） */
function htmlToXhtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '<br/>')
    .replace(/<hr\s*\/?>/gi, '<hr/>')
    .replace(/<img([^>]*?)(?<!\/)>/gi, '<img$1/>')
}

function xhtmlDoc(title: string, body: string, cssHref: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head>
<title>${xmlEscape(title)}</title>
<link rel="stylesheet" type="text/css" href="${cssHref}"/>
</head>
<body>
${body}
</body>
</html>`
}

const EPUB_CSS = `
  body { font-family: serif; line-height: 1.8; margin: 1em; }
  h1 { font-size: 1.6em; text-align: center; margin: 1.2em 0; }
  h2 { font-size: 1.3em; border-bottom: 1px solid #ccc; padding-bottom: 0.3em; }
  .cover-body { margin: 0; padding: 0; text-align: center; }
  .cover-figure { margin: 0; }
  .cover-figure img { max-width: 100%; max-height: 100%; }
  .toc-volume { font-weight: bold; color: #6b4f1d; margin: 0.8em 0 0.3em; }
  .toc-chapter { margin: 0.2em 0 0.2em 1.2em; }
  .toc-chapter a { text-decoration: none; color: inherit; }
  .toc-section { margin: 0.15em 0 0.15em 2.4em; font-size: 0.92em; }
  .toc-section a { text-decoration: none; color: #444; }
  h3 { font-size: 1.1em; margin: 1.4em 0 0.5em; }
  .empty-note { color: #999; font-style: italic; }
  p { margin: 0 0 0.6em; text-indent: 2em; }
`

interface EpubFile {
  name: string
  data: Buffer
  /** mimetype 必须首个写入且不压缩（OCF 规范） */
  store?: boolean
  mediaType?: string
}

/**
 * 打包 EPUB：封面页 + 章节大纲页 + 卷分隔页 + 逐章 XHTML；
 * EPUB3 nav 与 EPUB2 NCX 双目录，封面图进 manifest（properties="cover-image"）。
 */
export async function buildEpub(book: BookData): Promise<Buffer> {
  const mod = await getMarked()
  const uuid = crypto.randomUUID()
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  // 展平章清单（卷分隔页穿插其间）
  const files: EpubFile[] = []
  const spine: string[] = []
  const navItems: string[] = [] // nav.xhtml <ol> 项
  const ncxPoints: string[] = []
  let playOrder = 0

  /** NCX 子导航点数据（序列化时父先子后统一编 playOrder） */
  interface NavRef { id: string; title: string; src: string }

  // 预分配卷/章文件名（目录页要先于正文生成，需提前知道各章链接；节是章文件内锚点）
  const volFile = new Map<string, string>()
  const chFile = new Map<string, string>()
  {
    let vseq = 0
    let cseq = 0
    for (const vol of book.volumes) {
      if (vol.name) {
        vseq += 1
        volFile.set(vol.id, `vol${vseq}.xhtml`)
      }
      for (const ch of vol.chapters) {
        cseq += 1
        chFile.set(ch.id, `ch${cseq}.xhtml`)
      }
    }
  }

  const serializeNavPoint = (id: string, title: string, src: string, children: NavRef[] = []): string => {
    playOrder += 1
    const kids = children.map(c => {
      playOrder += 1
      return `<navPoint id="np-${c.id}" playOrder="${playOrder}"><navLabel><text>${xmlEscape(c.title)}</text></navLabel><content src="${c.src}"/></navPoint>`
    })
    const inner = kids.length ? `\n${kids.join('\n')}\n    ` : ''
    return `<navPoint id="np-${id}" playOrder="${playOrder}"><navLabel><text>${xmlEscape(title)}</text></navLabel><content src="${src}"/>${inner}</navPoint>`
  }

  const addSpineItem = (id: string, href: string, title: string, body: string, childNav: NavRef[] = []) => {
    files.push({ name: `OEBPS/${href}`, data: Buffer.from(xhtmlDoc(title, body, 'style.css'), 'utf-8'), mediaType: 'application/xhtml+xml' })
    spine.push(id)
    ncxPoints.push(`    ${serializeNavPoint(id, title, href, childNav)}`)
  }

  // 封面页
  let coverHref: string | null = null
  let coverMediaType: string | null = null
  if (book.coverPath) {
    const ext = path.extname(book.coverPath).toLowerCase()
    const mime = IMAGE_MIMES[ext]
    if (mime) {
      try {
        const bytes = await fs.promises.readFile(resolveAssetPath(book.coverPath))
        coverHref = `cover${ext}`
        coverMediaType = mime
        files.push({ name: `OEBPS/${coverHref}`, data: bytes, mediaType: mime })
        const coverBody = `<div class="cover-body"><figure class="cover-figure"><img src="${coverHref}" alt="封面"/></figure></div>`
        files.push({ name: 'OEBPS/cover.xhtml', data: Buffer.from(xhtmlDoc(book.title, coverBody, 'style.css'), 'utf-8'), mediaType: 'application/xhtml+xml' })
        spine.push('cover')
        playOrder += 1
        ncxPoints.push(
          `    <navPoint id="np-cover" playOrder="${playOrder}"><navLabel><text>封面</text></navLabel><content src="cover.xhtml"/></navPoint>`
        )
      } catch {
        // 封面文件丢失：跳过封面页继续导出
      }
    }
  }

  // 目录页（卷 → 章 → 节 三层，仅标题；章/节可点击跳转）
  const tocBlocks = book.volumes
    .filter(v => v.chapters.length > 0)
    .map(v => {
      const volumeHeading = v.name ? `<div class="toc-volume">${xmlEscape(v.name)}</div>` : ''
      const chapters = v.chapters
        .map(c => {
          const href = chFile.get(c.id)!
          const sections = c.sections
            .map(s => `<div class="toc-section"><a href="${href}#sec-${s.id}">${xmlEscape(s.name)}</a></div>`)
            .join('')
          return `<div class="toc-chapter"><a href="${href}">${xmlEscape(c.name)}</a></div>${sections}`
        })
        .join('')
      return `${volumeHeading}${chapters}`
    })
    .join('')
  addSpineItem('toc', 'toc.xhtml', '目录', `<h1>目录</h1>${tocBlocks}`)
  navItems.push(`      <li><a href="toc.xhtml">目录</a></li>`)

  // 卷 + 章（+ 章内节）
  for (const vol of book.volumes) {
    const chapterLis: string[] = []
    const volHref = vol.name ? volFile.get(vol.id)! : ''
    if (vol.name) {
      const volId = volHref.replace('.xhtml', '')
      addSpineItem(volId, volHref, vol.name, `<h1>${xmlEscape(vol.name)}</h1>`)
    }
    for (const ch of vol.chapters) {
      const chHref = chFile.get(ch.id)!
      const chId = chHref.replace('.xhtml', '')
      const chapterHtml = ch.content
        ? htmlToXhtml(await mod.marked(ch.content, { gfm: true, breaks: true }))
        : (ch.sections.length ? '' : `<p class="empty-note">（本章暂无正文）</p>`)
      const secBodies: string[] = []
      const secNav: NavRef[] = []
      for (const sec of ch.sections) {
        const secHtml = sec.content
          ? await mod.marked(sec.content, { gfm: true, breaks: true })
          : `<p class="empty-note">（本节暂无正文）</p>`
        secBodies.push(`<h3 id="sec-${sec.id}">${xmlEscape(sec.name)}</h3>\n  ${htmlToXhtml(secHtml)}`)
        secNav.push({ id: `sec-${sec.id}`, title: sec.name, src: `${chHref}#sec-${sec.id}` })
      }
      const body = `
  <h2 id="ch-${ch.id}">${xmlEscape(ch.name)}</h2>
  ${chapterHtml}
  ${secBodies.join('\n  ')}`
      addSpineItem(chId, chHref, ch.name, body, secNav)
      const secLis = ch.sections
        .map(s => `              <li><a href="${chHref}#sec-${s.id}">${xmlEscape(s.name)}</a></li>`)
        .join('\n')
      const secOl = secLis ? `\n              <ol>\n${secLis}\n              </ol>` : ''
      chapterLis.push(`            <li><a href="${chHref}">${xmlEscape(ch.name)}</a>${secOl}</li>`)
    }
    if (vol.name && chapterLis.length > 0) {
      navItems.push(
        `      <li><a href="${volHref}">${xmlEscape(vol.name)}</a>
        <ol>
${chapterLis.join('\n')}
        </ol>
      </li>`
      )
    } else {
      navItems.push(...chapterLis.map(li => `      ${li.trim()}`))
    }
  }

  // manifest / spine
  const manifestItems: string[] = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="css" href="style.css" media-type="text/css"/>`,
  ]
  if (coverHref && coverMediaType) {
    manifestItems.push(`    <item id="cover-image" href="${coverHref}" media-type="${coverMediaType}" properties="cover-image"/>`)
    manifestItems.push(`    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`)
  }
  for (const f of files) {
    if (!f.name.startsWith('OEBPS/') || !f.name.endsWith('.xhtml')) continue
    const id = f.name.replace('OEBPS/', '').replace('.xhtml', '')
    // nav/cover 已在上方显式登记，避免重复
    if (id === 'nav' || id === 'cover') continue
    manifestItems.push(`    <item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
  }
  const spineItems = spine.map(id => `    <itemref idref="${id}"/>`).join('\n')

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${xmlEscape(book.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    ${coverHref ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
${manifestItems.join('\n')}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh-CN">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="3"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(book.title)}</text></docTitle>
  <navMap>
${ncxPoints.join('\n')}
  </navMap>
</ncx>`

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head><title>目录</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navItems.join('\n')}
    </ol>
  </nav>
</body>
</html>`

  files.push({ name: 'OEBPS/content.opf', data: Buffer.from(opf, 'utf-8') })
  files.push({ name: 'OEBPS/toc.ncx', data: Buffer.from(ncx, 'utf-8') })
  files.push({ name: 'OEBPS/nav.xhtml', data: Buffer.from(nav, 'utf-8'), mediaType: 'application/xhtml+xml' })
  files.push({ name: 'OEBPS/style.css', data: Buffer.from(EPUB_CSS, 'utf-8'), mediaType: 'text/css' })

  // OCF 规范：mimetype 必须第一个条目且 STORE 无压缩
  files.unshift({ name: 'mimetype', data: Buffer.from('application/epub+zip', 'utf-8'), store: true })
  files.splice(1, 0, {
    name: 'META-INF/container.xml',
    data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`, 'utf-8'),
  })

  const archive = archiver('zip', { zlib: { level: 9 } })
  const collected = archiveToBuffer(archive)
  for (const f of files) {
    archive.append(f.data, { name: f.name, store: f.store ?? false })
  }
  await archive.finalize()
  return await collected
}

/** 收集 archiver 输出为 Buffer（finalize 由调用方在 append 完成后调用） */
function archiveToBuffer(archive: archiver.Archiver): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('warning', (err: archiver.ArchiverError) => {
      if (err.code !== 'ENOENT') reject(err)
    })
    archive.on('error', reject)
    archive.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
