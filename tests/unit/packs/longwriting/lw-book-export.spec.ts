/**
 * lw-book-export 单测（2026-09-19 长文封面 + 成书导出）
 *
 * - collectBookData：平铺大纲自建树（卷分组 / 根级章归匿名卷）、正文回填
 * - buildPdfHtml：封面 data URI / 无封面降级标题页 / 章节大纲与分页 CSS
 * - buildEpub：OCF 结构（mimetype 首位 STORE / container / opf / nav / ncx）、封面图、章文件
 * - add-lw-project-cover-path 迁移：加列 / 幂等 / 表不存在跳过
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import JSZip from 'jszip'
import { DataSource } from 'typeorm'
import { collectBookData, buildPdfHtml, buildEpub, type BookData } from '@core/packs/longwriting/services/lw-book-export.service'
import { addLwProjectCoverPath } from '@core/database/migrations/add-lw-project-cover-path'

const project = {
  id: 'p1',
  name: '测试书名',
  type: 'story',
  stage: 'chapters',
  progress: 80,
  coverPath: null as string | null,
  createdAt: 0,
  updatedAt: 0,
}

const flatOutlines = [
  { id: 'vol1', parentId: null, nodeType: 'volume', name: '第一卷', summary: '卷纲一', level: 1, orderIndex: 0 },
  { id: 'ch1', parentId: 'vol1', nodeType: 'chapter', name: '第一章', summary: '概要甲', level: 2, orderIndex: 1 },
  { id: 'sec1', parentId: 'ch1', nodeType: 'section', name: '1.1 节', summary: '', level: 3, orderIndex: 2 },
  { id: 'ch2', parentId: null, nodeType: 'chapter', name: '序章', summary: '概要乙', level: 1, orderIndex: 3 },
]

const contents: Record<string, string> = { ch1: '甲的第一段正文', sec1: '节内正文', ch2: '' }

function fakeService(p: { coverPath: string | null } = project) {
  return {
    getProject: async () => ({ ...project, coverPath: p.coverPath }),
    getStoryOverview: async () => null,
    getOutlineTree: async () => flatOutlines,
    getChapter: async (id: string) => ({ id, outlineId: id, content: contents[id] || '', wordCount: 0, createdAt: 0, updatedAt: 0 }),
  } as never as Parameters<typeof collectBookData>[0]
}

async function makeBook(coverPath: string | null = null): Promise<BookData> {
  return await collectBookData(fakeService({ coverPath }), 'p1')
}

describe('collectBookData 成书数据收集', () => {
  it('平铺大纲按卷建树：章下节挂 sections，根级章归匿名卷，正文逐章回填', async () => {
    const book = await makeBook()
    expect(book.title).toBe('测试书名')
    expect(book.chapterCount).toBe(3) // 2 章 + 1 节

    expect(book.volumes).toHaveLength(2)
    const [vol, anon] = book.volumes
    expect(vol.name).toBe('第一卷')
    expect(vol.summary).toBe('卷纲一')
    expect(vol.chapters.map(c => c.name)).toEqual(['第一章'])
    expect(vol.chapters[0].content).toBe('甲的第一段正文')
    expect(vol.chapters[0].sections.map(s => s.name)).toEqual(['1.1 节'])
    expect(vol.chapters[0].sections[0].content).toBe('节内正文')

    expect(anon.name).toBe('')
    expect(anon.chapters.map(c => c.name)).toEqual(['序章'])
    expect(anon.chapters[0].summary).toBe('概要乙')
  })
})

describe('buildPdfHtml 成书 HTML', () => {
  it('无封面时标题页兜底，含目录（仅标题，不贴大纲概要）与分页样式', async () => {
    const html = await buildPdfHtml(await makeBook())
    expect(html).toContain('class="title-page"')
    expect(html).not.toContain('<img src="data:')
    expect(html).toContain('目录')
    expect(html).toContain('第一章')
    // 只列目录标题，不粘贴大纲概要
    expect(html).not.toContain('概要甲')
    expect(html).not.toContain('本章大纲')
    expect(html).toContain('page-break-before: always')
    expect(html).toContain('第一卷')
    expect(html).toContain('toc-section') // 目录含节层级
    expect(html).toContain('1.1 节')
    expect(html).not.toContain('概要甲')
    expect(html).not.toContain('本章大纲')
    // 目录条目为文内跳转链接（可点击目录），正文各级标题带锚点
    expect(html).toContain('<a href="#ch-ch1">第一章</a>')
    expect(html).toContain('<a href="#sec-sec1">1.1 节</a>')
    expect(html).toContain('<a href="#vol-vol1">第一卷</a>')
    expect(html).toContain('id="ch-ch1"')
    expect(html).toContain('id="sec-sec1"')
    expect(html).toContain('id="vol-vol1"')
    // 正文：章内容 + 章内 h3 节连排（节标题带书签标记）
    expect(html).toContain('甲的第一段正文')
    expect(html).toContain('id="sec-sec1"')
    expect(html).toContain('[[LW:s:sec1]]')
    expect(html).toContain('1.1 节</h3>')
    expect(html).toContain('节内正文')
    expect(html).toContain('（本章暂无正文）')
  })

  it('有封面时封面页内嵌 data URI（绝对路径直读）', async () => {
    const tmp = path.join(os.tmpdir(), `lw-cover-test-${Date.now()}.png`)
    fs.writeFileSync(tmp, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    try {
      const html = await buildPdfHtml(await makeBook(tmp))
      expect(html).toContain('class="cover-page"')
      expect(html).toMatch(/<img src="data:image\/png;base64,/)
      expect(html).not.toContain('class="title-page"')
    } finally {
      fs.unlinkSync(tmp)
    }
  })
})

describe('buildEpub EPUB 打包', () => {
  it('OCF 结构齐全：mimetype 首位、container/opf/nav/ncx、封面图、章文件', async () => {
    const tmp = path.join(os.tmpdir(), `lw-cover-test-${Date.now()}.png`)
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    fs.writeFileSync(tmp, pngBytes)
    try {
      const buffer = await buildEpub(await makeBook(tmp))
      const zip = await JSZip.loadAsync(buffer)
      const names = Object.keys(zip.files)

      // mimetype 必须是首个条目（OCF 规范要求物理首位）
      expect(names[0]).toBe('mimetype')
      expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip')

      expect(zip.file('META-INF/container.xml')).toBeTruthy()
      const container = await zip.file('META-INF/container.xml')!.async('string')
      expect(container).toContain('OEBPS/content.opf')

      const opf = await zip.file('OEBPS/content.opf')!.async('string')
      expect(opf).toContain('<dc:title>测试书名</dc:title>')
      expect(opf).toContain('properties="nav"')
      expect(opf).toContain('properties="cover-image"')
      expect(opf).toContain('<itemref idref="toc"/>')
      expect(opf).toContain('<itemref idref="ch1"/>')
      expect(opf).toContain('<meta name="cover" content="cover-image"/>')

      const nav = await zip.file('OEBPS/nav.xhtml')!.async('string')
      expect(nav).toContain('目录')
      expect(nav).toContain('href="ch1.xhtml"')
      expect(nav).toContain('href="vol1.xhtml"')
      // 阅读器目录三层嵌套：卷 → 章 → 节（锚点）
      expect(nav).toContain('href="ch1.xhtml#sec-sec1"')

      const ncx = await zip.file('OEBPS/toc.ncx')!.async('string')
      expect(ncx).toContain('<navMap>')
      expect(ncx).toContain('np-sec-sec1') // NCX 嵌套节导航点
      expect(ncx).toMatch(/np-ch1[\s\S]*np-sec-sec1/) // 节嵌在章 navPoint 内
      expect(ncx).not.toMatch(/np-sec-sec1[\s\S]*np-ch1"/) // playOrder 父先子后

      // 目录页：仅标题并可跳转，不粘贴大纲概要
      const tocPage = await zip.file('OEBPS/toc.xhtml')!.async('string')
      expect(tocPage).toContain('<h1>目录</h1>')
      expect(tocPage).toContain('<a href="ch1.xhtml">第一章</a>')
      expect(tocPage).toContain('<a href="ch1.xhtml#sec-sec1">1.1 节</a>')
      expect(tocPage).not.toContain('概要甲')

      const ch1 = await zip.file('OEBPS/ch1.xhtml')!.async('string')
      expect(ch1).not.toContain('本章大纲')
      expect(ch1).not.toContain('概要甲')
      expect(ch1).toContain('甲的第一段正文')
      expect(ch1).toContain('<h3 id="sec-sec1">1.1 节</h3>')
      expect(ch1).toContain('节内正文')

      // 封面图字节一致
      const coverEntry = zip.file('OEBPS/cover.png')
      expect(coverEntry).toBeTruthy()
      expect(await coverEntry!.async('nodebuffer')).toEqual(pngBytes)
    } finally {
      fs.unlinkSync(tmp)
    }
  })

  it('无封面时无 cover-image 声明，spine 从目录页开始', async () => {
    const buffer = await buildEpub(await makeBook())
    const zip = await JSZip.loadAsync(buffer)
    const opf = await zip.file('OEBPS/content.opf')!.async('string')
    expect(opf).not.toContain('cover-image')
    expect(opf).toMatch(/<spine[^>]*>\s*<itemref idref="toc"\/>/)
    expect(zip.file('OEBPS/cover.xhtml')).toBeNull()
  })
})

describe('add-lw-project-cover-path 迁移', () => {
  async function buildLegacyDb(): Promise<DataSource> {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    await ds.query(`CREATE TABLE lw_projects (
      id TEXT PRIMARY KEY, name TEXT, type TEXT, stage TEXT,
      progress INTEGER, wizard_state TEXT, created_at TIMESTAMP, updated_at TIMESTAMP
    )`)
    return ds
  }

  it('加 cover_path 列且幂等', async () => {
    const ds = await buildLegacyDb()
    try {
      await addLwProjectCoverPath(ds)
      let rows = await ds.query(`PRAGMA table_info(lw_projects)`)
      expect(rows.map((r: { name: string }) => r.name)).toContain('cover_path')

      await addLwProjectCoverPath(ds) // 幂等：再跑一次不报错
      rows = await ds.query(`PRAGMA table_info(lw_projects)`)
      expect(rows.filter((r: { name: string }) => r.name === 'cover_path')).toHaveLength(1)
    } finally {
      await ds.destroy()
    }
  })

  it('表不存在时跳过不抛错', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    })
    await ds.initialize()
    try {
      await expect(addLwProjectCoverPath(ds)).resolves.toBeUndefined()
    } finally {
      await ds.destroy()
    }
  })
})
