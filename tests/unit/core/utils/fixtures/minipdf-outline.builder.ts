/**
 * 生成带书签大纲（/Outlines）的最小 PDF —— 测试夹具构造器。
 *
 * 为什么在测试运行时生成、而不入库一个 .pdf 夹具：
 * 本项目 `core.autocrlf=true` 且该 PDF 不含 NUL 字节（git 会按文本处理），
 * 一旦入库，全新克隆时 77 个 LF 会被改写成 CRLF，xref 偏移全部错位 → PDF 直接解析失败。
 * 故改为运行时构造，既避免二进制换行陷阱，也让夹具结构在代码里可读可改。
 *
 * 结构：3 页；大纲 2 层 4 条
 *   Chapter One (p1) → Section 1.1 (p1)
 *   Chapter Two (p2)
 *   Chapter Three (p3)
 *
 * 生成逻辑按 PDF 1.4 语法手写对象并程序化计算 xref 偏移（pdf-lib 等库不支持写书签）。
 */

/** 一页的文本内容流：标题写大字号，正文写小字号 */
function pageStream(title: string, body: string): string {
  const esc = (s: string): string => s.replace(/([()\\])/g, '\\$1')
  return (
    `BT /F1 24 Tf 72 700 Td (${esc(title)}) Tj ET\n` +
    `BT /F1 12 Tf 72 660 Td (${esc(body)}) Tj ET`
  )
}

interface OutlineSeed {
  title: string
  /** 0 基页码 */
  page: number
  children?: OutlineSeed[]
}

/** 生成带书签大纲的最小 PDF（Buffer） */
export function buildMiniPdfWithOutline(): Buffer {
  const pages = [
    { title: 'Chapter One', body: 'Body of chapter one.' },
    { title: 'Chapter Two', body: 'Body of chapter two.' },
    { title: 'Chapter Three', body: 'Body of chapter three.' },
  ]

  // 对象编号约定：1 catalog, 2 pages, 3..5 page, 6..8 content, 9 font, 10 outlines, 11.. outline items
  const OBJ_CATALOG = 1
  const OBJ_PAGES = 2
  const OBJ_PAGE_FIRST = 3
  const OBJ_CONTENT_FIRST = 6
  const OBJ_FONT = 9
  const OBJ_OUTLINES = 10
  const OBJ_ITEM_FIRST = 11

  const outline: OutlineSeed[] = [
    { title: 'Chapter One', page: 0, children: [{ title: 'Section 1.1', page: 0 }] },
    { title: 'Chapter Two', page: 1 },
    { title: 'Chapter Three', page: 2 },
  ]

  interface FlatItem extends OutlineSeed {
    id: number
    parentId: number | null
    children: FlatItem[]
  }
  const items: FlatItem[] = []
  const build = (nodes: OutlineSeed[], parentId: number | null): FlatItem[] => {
    const out: FlatItem[] = []
    for (const node of nodes) {
      const item: FlatItem = {
        ...node,
        id: OBJ_ITEM_FIRST + items.length,
        parentId,
        children: [],
      }
      items.push(item)
      out.push(item)
      if (node.children?.length) item.children = build(node.children, item.id)
    }
    return out
  }
  build(outline, null)

  const siblingsOf = (item: FlatItem): FlatItem[] => items.filter(i => i.parentId === item.parentId)
  const descCount = (item: FlatItem): number =>
    item.children.length + item.children.reduce((sum, c) => sum + descCount(c), 0)

  const objects = new Map<number, string>()
  objects.set(
    OBJ_CATALOG,
    `<< /Type /Catalog /Pages ${OBJ_PAGES} 0 R /Outlines ${OBJ_OUTLINES} 0 R /PageMode /UseOutlines >>`,
  )
  objects.set(
    OBJ_PAGES,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${OBJ_PAGE_FIRST + i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  )
  pages.forEach((p, i) => {
    objects.set(
      OBJ_PAGE_FIRST + i,
      `<< /Type /Page /Parent ${OBJ_PAGES} 0 R /MediaBox [0 0 612 792] /Contents ${OBJ_CONTENT_FIRST + i} 0 R /Resources << /Font << /F1 ${OBJ_FONT} 0 R >> >> >>`,
    )
    const stream = pageStream(p.title, p.body)
    objects.set(
      OBJ_CONTENT_FIRST + i,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    )
  })
  objects.set(OBJ_FONT, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  const topLevel = items.filter(i => i.parentId === null)
  objects.set(
    OBJ_OUTLINES,
    `<< /Type /Outlines /First ${topLevel[0].id} 0 R /Last ${topLevel[topLevel.length - 1].id} 0 R /Count ${items.length} >>`,
  )
  for (const item of items) {
    const sibs = siblingsOf(item)
    const idx = sibs.indexOf(item)
    const parts = [
      `/Title (${item.title.replace(/([()\\])/g, '\\$1')})`,
      `/Parent ${item.parentId ?? OBJ_OUTLINES} 0 R`,
    ]
    const prev = sibs[idx - 1]
    const next = sibs[idx + 1]
    if (prev) parts.push(`/Prev ${prev.id} 0 R`)
    if (next) parts.push(`/Next ${next.id} 0 R`)
    if (item.children.length) {
      parts.push(`/First ${item.children[0].id} 0 R`, `/Last ${item.children[item.children.length - 1].id} 0 R`)
    }
    // 有子项时必须给 Count（正数=展开），否则阅读器可能忽略子项
    parts.push(`/Count ${item.children.length ? descCount(item) : 0}`)
    parts.push(`/Dest [${OBJ_PAGE_FIRST + item.page} 0 R /Fit]`)
    objects.set(item.id, `<< ${parts.join(' ')} >>`)
  }

  // 组装文件并计算 xref 偏移
  const chunks: Buffer[] = []
  let offset = 0
  const offsets = new Map<number, number>()
  const push = (s: string): void => {
    const buf = Buffer.from(s, 'latin1')
    chunks.push(buf)
    offset += buf.length
  }
  push('%PDF-1.4\n')
  const maxObj = Math.max(...objects.keys())
  for (let id = 1; id <= maxObj; id++) {
    const body = objects.get(id)
    if (body === undefined) continue
    offsets.set(id, offset)
    push(`${id} 0 obj\n${body}\nendobj\n`)
  }
  const xrefOffset = offset
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= maxObj; id++) {
    xref += objects.has(id)
      ? `${String(offsets.get(id)).padStart(10, '0')} 00000 n \n`
      : `0000000000 65535 f \n`
  }
  push(xref)
  push(`trailer\n<< /Size ${maxObj + 1} /Root ${OBJ_CATALOG} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.concat(chunks)
}
