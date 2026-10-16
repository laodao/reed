/**
 * Atlas 导出纯工具（M4-A P1-6 拆分第一步：从 DomainAtlas 抽出 DOM/文件工具）
 * @module views/domain-learning/atlas-export
 */

/** 下载字符串/Blob（统一走系统式 anchor 下载） */
export function downloadBlob(content: Blob | string, filename: string, mime?: string): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime ?? 'text/plain;charset=utf-8' }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 把原图元素的计算样式按元素序内联进克隆（PNG 才可见） */
export function inlineComputedStyles(orig: Element, clone: Element): void {
  if (orig.nodeType !== 1 || clone.nodeType !== 1) return
  const cs = window.getComputedStyle(orig)
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'text-anchor'] as const
  const ce = clone as HTMLElement
  for (const p of props) {
    const v = cs.getPropertyValue(p)
    if (v && v !== 'none') ce.style.setProperty(p, v)
  }
  const oe = [...orig.children]
  const ceArr = [...clone.children]
  for (let i = 0; i < oe.length && i < ceArr.length; i++) {
    if (oe[i].tagName === ceArr[i].tagName) inlineComputedStyles(oe[i], ceArr[i])
  }
}

/**
 * 图谱 PNG 导出：序列化 force-graph-svg（计算样式内联）→ canvas(2x) → PNG Blob。
 * @param svg 目标 svg 元素
 */
export async function graphSvgToPngBlob(svg: SVGSVGElement): Promise<Blob> {
  const vb = (svg.getAttribute('viewBox') ?? '0 0 920 600').split(/\s+/).map(Number)
  const w = vb[2] || 920
  const h = vb[3] || 600
  const clone = svg.cloneNode(true) as SVGSVGElement
  inlineComputedStyles(svg, clone)
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('svg 渲染失败'))
  })
  const scale = 2
  const cv = document.createElement('canvas')
  cv.width = Math.round(w * scale)
  cv.height = Math.round(h * scale)
  const cx = cv.getContext('2d')
  if (!cx) throw new Error('canvas 不可用')
  cx.fillStyle = '#fff'
  cx.fillRect(0, 0, cv.width, cv.height)
  cx.scale(scale, scale)
  cx.drawImage(img, 0, 0, w, h)
  return new Promise<Blob>((resolve, reject) => {
    cv.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 生成失败'))), 'image/png')
  })
}
