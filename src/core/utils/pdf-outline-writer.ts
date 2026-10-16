/**
 * PDF 书签大纲写入器（/Outlines 后处理注入）
 * @module core/utils/pdf-outline-writer
 * @description Electron 28 的 printToPDF 不支持 generateDocumentOutline（二进制无该选项映射），
 *              需要 PDF 书签的导出方（如长文成书导出）按本工具的两步走：
 *              1) HTML 里在各级标题处埋隐形标记 `[[LW:<id>]]`；
 *              2) printToPDF 后 extractMarkerPages 用 pdfjs 反解「标记 → 页码」，
 *                 再 writePdfOutline 用 pdf-lib 把嵌套 /Outlines 书签树写入产物。
 *              读取方向的 PDF 大纲解析在 ./pdf-outline（知识库导入用），互不依赖。
 */

import { PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib'

/** 书签节点规格；markerId 对应 HTML 里的 `[[LW:<markerId>]]` 标记 */
export interface PdfOutlineSpec {
  markerId: string
  title: string
  children: PdfOutlineSpec[]
}

/**
 * 从 PDF 提取标记 → 1 基页码映射（同名标记取首次出现的页）。
 * 标记是行内透明小字（见导出方 CSS），随标题所在分页落入对应页。
 */
export async function extractMarkerPages(pdf: Buffer): Promise<Map<string, number>> {
  // pdfjs-dist 只提供 CJS 构建（legacy 版兼容 Node 18 / Electron 28），与 pdf-outline.ts 同策略
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  const doc = await pdfjs.getDocument({
    data: toPdfJsBytes(pdf),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise
  const map = new Map<string, number>()
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      // 无分隔拼接：标记即使被字体/排版切成多个文本块也能拼回完整 token
      const text = tc.items.map((i: { str?: string }) => i.str ?? '').join('')
      const re = /\[\[LW:([^\]]+)\]\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        if (!map.has(m[1])) map.set(m[1], p)
      }
    }
  } finally {
    await doc.destroy()
  }
  return map
}

/**
 * 把嵌套书签树写入 PDF（以各节点标记所在页为跳转目标；无对应标记的节点整支丢弃）。
 * 同时设 /PageMode /UseOutlines，阅读器打开时侧边栏书签目录直接展开。
 */
export async function writePdfOutline(
  pdf: Buffer,
  specs: PdfOutlineSpec[],
  markerPages: Map<string, number>,
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true })
  const context = doc.context
  const pages = doc.getPages()

  /** 序列化一棵子树：先占位自身 ref（供子节点指认 Parent），装配字典后 assign，最后回填兄弟 Prev/Next 链 */
  const buildItem = (spec: PdfOutlineSpec, parentRef: PDFRef): { ref: PDFRef; count: number } | null => {
    const selfRef = context.nextRef()
    const builtChildren: Array<{ ref: PDFRef; count: number }> = []
    for (const child of spec.children) {
      const built = buildItem(child, selfRef)
      if (built) builtChildren.push(built)
    }
    const childCount = builtChildren.reduce((sum, c) => sum + 1 + c.count, 0)
    // 本节点标记无页码且没有可挂的子节点 → 整支丢弃
    const pageIndex = markerPages.get(spec.markerId)
    if (pageIndex === undefined && builtChildren.length === 0) return null

    const dict: Record<string, unknown> = {
      Title: PDFHexString.fromText(spec.title),
      Parent: parentRef,
    }
    if (pageIndex !== undefined) {
      const pageRef = pages[Math.min(Math.max(pageIndex - 1, 0), pages.length - 1)].ref
      dict.Dest = context.obj([pageRef, 'XYZ', null, null, null])
    }
    if (builtChildren.length > 0) {
      dict.Count = childCount
      dict.First = builtChildren[0].ref
      dict.Last = builtChildren[builtChildren.length - 1].ref
    }
    context.assign(selfRef, context.obj(dict))

    builtChildren.forEach((c, i) => {
      const childDict = context.lookup(c.ref) as import('pdf-lib').PDFDict
      if (i > 0) childDict.set(PDFName.of('Prev'), builtChildren[i - 1].ref)
      if (i < builtChildren.length - 1) childDict.set(PDFName.of('Next'), builtChildren[i + 1].ref)
    })
    return { ref: selfRef, count: childCount }
  }

  // 根先建 ref，再逐支挂载；全部标记缺失时不动产物直接返回
  const outlinesRef = context.nextRef()
  const roots = specs
    .map(spec => buildItem(spec, outlinesRef))
    .filter((r): r is { ref: PDFRef; count: number } => r !== null)
  if (roots.length === 0) {
    console.warn('[pdf-outline-writer] 未找到任何标记，跳过书签注入')
    return pdf
  }
  const totalCount = roots.reduce((sum, r) => sum + 1 + r.count, 0)
  context.assign(
    outlinesRef,
    context.obj({
      Type: 'Outlines',
      First: roots[0].ref,
      Last: roots[roots.length - 1].ref,
      Count: totalCount,
    }),
  )
  roots.forEach((r, i) => {
    const dict = context.lookup(r.ref) as import('pdf-lib').PDFDict
    if (i > 0) dict.set(PDFName.of('Prev'), roots[i - 1].ref)
    if (i < roots.length - 1) dict.set(PDFName.of('Next'), roots[i + 1].ref)
  })

  doc.catalog.set(PDFName.of('Outlines'), outlinesRef)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

/** 复制为纯 Uint8Array：pdf.js 拒绝 Node Buffer 且要求独占 ArrayBuffer（同 pdf-outline.ts） */
function toPdfJsBytes(input: Buffer): Uint8Array {
  const out = new Uint8Array(input.length)
  out.set(input)
  return out
}
