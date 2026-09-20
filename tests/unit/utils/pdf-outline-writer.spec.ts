/**
 * pdf-outline-writer 单测（长文成书导出 PDF 书签，2026-09-19）
 *
 * pdf-lib 造 3 页带 `[[LW:...]]` 标记的 PDF → extractMarkerPages 反解页码
 * → writePdfOutline 注入嵌套书签树 → 重新加载断言 /Outlines 结构与跳转目标。
 */

import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFDict, PDFArray, StandardFonts } from 'pdf-lib'
import { extractMarkerPages, writePdfOutline, type PdfOutlineSpec } from '@core/utils/pdf-outline-writer'

async function buildMarkedPdf(markersPerPage: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const marker of markersPerPage) {
    const page = doc.addPage([595, 842])
    if (marker) page.drawText(marker, { x: 50, y: 800, size: 10, font })
  }
  return Buffer.from(await doc.save())
}

describe('extractMarkerPages 标记页码反解', () => {
  it('多页标记各归其位，无标记页不产生条目', async () => {
    const pdf = await buildMarkedPdf(['[[LW:p:title]]', '', '[[LW:c:ch1]]'])
    const map = await extractMarkerPages(pdf)
    expect(map.get('p:title')).toBe(1)
    expect(map.get('c:ch1')).toBe(3)
    expect(map.size).toBe(2)
  })
})

describe('writePdfOutline 书签注入', () => {
  const specs: PdfOutlineSpec[] = [
    { markerId: 'p:title', title: '书名页', children: [] },
    { markerId: 'p:toc', title: '目录', children: [] },
    {
      markerId: 'v:vol1',
      title: '第一卷',
      children: [
        { markerId: 'c:ch1', title: '第一章', children: [{ markerId: 's:s1', title: '第一节', children: [] }] },
        { markerId: 'c:missing', title: '无标记章（应整支丢弃）', children: [] },
      ],
    },
  ]

  it('注入后可回读嵌套 /Outlines，缺标记节点被丢弃，Dest 指向标记所在页', async () => {
    const pdf = await buildMarkedPdf(['[[LW:p:title]]', '[[LW:p:toc]]', '[[LW:v:vol1]]', '[[LW:c:ch1]]', '[[LW:s:s1]]'])
    const markerPages = await extractMarkerPages(pdf)
    const result = await writePdfOutline(pdf, specs, markerPages)

    const out = await PDFDocument.load(result)
    expect(out.catalog.get(PDFName.of('PageMode'))).toEqual(PDFName.of('UseOutlines'))

    const outlines = out.context.lookup(out.catalog.get(PDFName.of('Outlines'))) as PDFDict
    expect(outlines.get(PDFName.of('Type'))).toEqual(PDFName.of('Outlines'))

    const first = out.context.lookup(outlines.get(PDFName.of('First'))) as PDFDict
    expect((first.get(PDFName.of('Title')) as { decodeText: () => string }).decodeText()).toBe('书名页')

    // 第三根 = 第一卷（书名页 → Next → 目录 → Next → 第一卷）
    const toc = out.context.lookup(first.get(PDFName.of('Next'))) as PDFDict
    const vol = out.context.lookup(toc.get(PDFName.of('Next'))) as PDFDict
    expect((vol.get(PDFName.of('Title')) as { decodeText: () => string }).decodeText()).toBe('第一卷')

    // 第一卷的孩子只有第一章（无标记的章整支丢弃）；第一章下挂第一节
    const ch1 = out.context.lookup(vol.get(PDFName.of('First'))) as PDFDict
    expect((ch1.get(PDFName.of('Title')) as { decodeText: () => string }).decodeText()).toBe('第一章')
    const s1 = out.context.lookup(ch1.get(PDFName.of('First'))) as PDFDict
    expect((s1.get(PDFName.of('Title')) as { decodeText: () => string }).decodeText()).toBe('第一节')

    // Dest 第一项 = 标记所在页的 page ref（第一节标记在第 5 页 → index 4）
    const pages = out.getPages()
    const dest = s1.get(PDFName.of('Dest')) as PDFArray
    expect(dest.get(1)).toEqual(PDFName.of('XYZ'))
    expect(dest.get(0)).toEqual(pages[4].ref)

    // 兄弟链闭合：第一卷 Prev=目录、Next 缺省（是最后一根）
    expect(vol.get(PDFName.of('Prev'))).toBeDefined()
    expect(vol.get(PDFName.of('Next'))).toBeUndefined()
  })

  it('全部标记缺失时不产生任何书签根，产物仍可正常加载', async () => {
    const pdf = await buildMarkedPdf(['', '', ''])
    const result = await writePdfOutline(pdf, specs, new Map())
    const out = await PDFDocument.load(result)
    expect(out.catalog.get(PDFName.of('Outlines'))).toBeUndefined()
    expect(out.getPageCount()).toBe(3)
  })
})
