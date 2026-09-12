/**
 * 讲义「声明式图形」规格与渲染（纯函数；2026-09-12 用户需求）
 * @module views/domain-learning/figure-spec
 *
 * 需求：AI/数学类学习内容要图文并茂，但不走「AI 生图」——由**代码**按数据画图。
 *
 * 做法（用户拍板方案 A）：模型只产出**图形规格**（JSON），渲染层用自写的 SVG 渲染器画出来：
 * - 零依赖、离线可用、确定性（同一规格 => 同一张图，可测）；
 * - 无脚本执行（规格里只有数据，没有代码）——与"在线运行代码"是两件独立的事；
 * - 覆盖 AI/数学学习里绝大多数图形需求：矩阵热力网格、函数曲线/散点、柱状对比、张量形状、网络结构。
 *
 * 讲义写法（skill 里同步约定）：
 * ```figure
 * {"type":"matrix","data":[[1,2],[3,4]],"title":"2×2 权重"}
 * ```
 */

/** 数值矩阵图（热力网格，可选显示数值/行列标签） */
export interface MatrixFigure {
  type: 'matrix'
  /** 行 × 列数值（空数组视为非法） */
  data: number[][]
  title?: string
  /** 行标签（如样本名） */
  rowLabels?: string[]
  /** 列标签（如特征名） */
  colLabels?: string[]
  /** 是否在格子里写数值（默认 true；格子多于 100 个时自动关闭） */
  showValues?: boolean
  /** 数值小数位（默认 2） */
  precision?: number
  /** 配色：blue=单色深浅；diverging=以 0 为中心的红蓝 */
  colormap?: 'blue' | 'diverging'
}

/** 曲线/散点图（多序列） */
export interface PlotFigure {
  type: 'plot'
  series: Array<{
    name?: string
    /** [x, y] 点（按 x 升序连线；mode=scatter 时只画点） */
    points: Array<[number, number]>
    mode?: 'line' | 'scatter' | 'both'
  }>
  title?: string
  xLabel?: string
  yLabel?: string
}

/** 柱状对比 */
export interface BarFigure {
  type: 'bar'
  items: Array<{ label: string; value: number; color?: string }>
  title?: string
  yLabel?: string
}

/** 张量形状示意（每轴一个方块 + 轴长度） */
export interface ShapeFigure {
  type: 'shape'
  /** 各轴长度，如 [32, 3, 224, 224] */
  dims: number[]
  /** 各轴名称（如 ['batch','channel','height','width']） */
  labels?: string[]
  title?: string
}

/** 网络结构示意（每层一组单元 + 相邻层全连接） */
export interface NetworkFigure {
  type: 'network'
  layers: Array<{ name?: string; units: number }>
  title?: string
}

export type DlFigureSpec = MatrixFigure | PlotFigure | BarFigure | ShapeFigure | NetworkFigure

/** 规格容量上限（防止畸形规格生成超大 SVG 卡死页面） */
export const FIGURE_LIMITS = {
  matrixRows: 24,
  matrixCols: 24,
  plotPoints: 400,
  plotSeries: 6,
  barItems: 16,
  shapeDims: 8,
  networkLayers: 6,
  networkUnits: 16,
  labelLen: 24,
} as const

export type ParseFigureResult =
  | { ok: true; spec: DlFigureSpec; warnings: string[] }
  | { ok: false; error: string }

function str(v: unknown, max = FIGURE_LIMITS.labelLen): string {
  return String(v ?? '').trim().slice(0, max)
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function strList(v: unknown, cap: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.slice(0, cap).map((x) => str(x))
  return out.length ? out : undefined
}

/**
 * 解析并规范化图形规格（宽松入参：容错、限幅、给出可读错误）。
 * 非法规格不抛错——渲染层保留原始代码块并显示错误，读者仍能看到规格文本。
 */
export function parseFigureSpec(raw: string): ParseFigureResult {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, error: '图形规格为空' }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `图形规格不是合法 JSON：${(e as Error).message}` }
  }
  if (!json || typeof json !== 'object') return { ok: false, error: '图形规格必须是 JSON 对象' }
  const spec = json as Record<string, unknown>
  const type = str(spec.type)
  const warnings: string[] = []

  if (type === 'matrix') {
    const rows = Array.isArray(spec.data) ? spec.data : null
    if (!rows || rows.length === 0) return { ok: false, error: 'matrix 需要非空的 data（二维数组）' }
    const data: number[][] = []
    for (const row of rows.slice(0, FIGURE_LIMITS.matrixRows)) {
      if (!Array.isArray(row)) return { ok: false, error: 'matrix 的 data 必须是二维数组' }
      const r: number[] = []
      for (const cell of row.slice(0, FIGURE_LIMITS.matrixCols)) {
        const n = num(cell)
        if (n === null) return { ok: false, error: `matrix 的 data 含非数值：${String(cell)}` }
        r.push(n)
      }
      data.push(r)
    }
    if (rows.length > FIGURE_LIMITS.matrixRows || (rows[0] as unknown[]).length > FIGURE_LIMITS.matrixCols) {
      warnings.push(`矩阵已截断到 ${FIGURE_LIMITS.matrixRows}×${FIGURE_LIMITS.matrixCols}`)
    }
    const cells = data.length * (data[0]?.length ?? 0)
    return {
      ok: true,
      warnings,
      spec: {
        type: 'matrix',
        data,
        ...(str(spec.title) ? { title: str(spec.title) } : {}),
        ...(strList(spec.rowLabels, data.length) ? { rowLabels: strList(spec.rowLabels, data.length)! } : {}),
        ...(strList(spec.colLabels, data[0]?.length ?? 0) ? { colLabels: strList(spec.colLabels, data[0]?.length ?? 0)! } : {}),
        showValues: spec.showValues === undefined ? cells <= 100 : spec.showValues !== false,
        precision: Math.min(6, Math.max(0, num(spec.precision) ?? 2)),
        colormap: spec.colormap === 'diverging' ? 'diverging' : 'blue',
      },
    }
  }

  if (type === 'plot') {
    const rawSeries = Array.isArray(spec.series) ? spec.series : null
    if (!rawSeries || rawSeries.length === 0) return { ok: false, error: 'plot 需要非空的 series' }
    const series: PlotFigure['series'] = []
    for (const s of rawSeries.slice(0, FIGURE_LIMITS.plotSeries)) {
      const obj = (s ?? {}) as Record<string, unknown>
      const pts = Array.isArray(obj.points) ? obj.points : null
      if (!pts || pts.length === 0) return { ok: false, error: 'plot 的每个 series 需要非空 points' }
      const points: Array<[number, number]> = []
      for (const p of pts.slice(0, FIGURE_LIMITS.plotPoints)) {
        const arr = Array.isArray(p) ? p : null
        const x = num(arr?.[0])
        const y = num(arr?.[1])
        if (x === null || y === null) return { ok: false, error: 'plot 的 points 必须是 [x,y] 数值对' }
        points.push([x, y])
      }
      if (pts.length > FIGURE_LIMITS.plotPoints) warnings.push(`序列点数已截断到 ${FIGURE_LIMITS.plotPoints}`)
      series.push({
        points,
        ...(str(obj.name) ? { name: str(obj.name) } : {}),
        mode: obj.mode === 'scatter' ? 'scatter' : obj.mode === 'both' ? 'both' : 'line',
      })
    }
    return {
      ok: true,
      warnings,
      spec: {
        type: 'plot',
        series,
        ...(str(spec.title) ? { title: str(spec.title) } : {}),
        ...(str(spec.xLabel) ? { xLabel: str(spec.xLabel) } : {}),
        ...(str(spec.yLabel) ? { yLabel: str(spec.yLabel) } : {}),
      },
    }
  }

  if (type === 'bar') {
    const rawItems = Array.isArray(spec.items) ? spec.items : null
    if (!rawItems || rawItems.length === 0) return { ok: false, error: 'bar 需要非空的 items' }
    const items: BarFigure['items'] = []
    for (const it of rawItems.slice(0, FIGURE_LIMITS.barItems)) {
      const obj = (it ?? {}) as Record<string, unknown>
      const value = num(obj.value)
      if (value === null) return { ok: false, error: 'bar 的 items 需要数值 value' }
      items.push({ label: str(obj.label) || '—', value, ...(str(obj.color) ? { color: str(obj.color) } : {}) })
    }
    if (rawItems.length > FIGURE_LIMITS.barItems) warnings.push(`条目已截断到 ${FIGURE_LIMITS.barItems}`)
    return {
      ok: true,
      warnings,
      spec: {
        type: 'bar',
        items,
        ...(str(spec.title) ? { title: str(spec.title) } : {}),
        ...(str(spec.yLabel) ? { yLabel: str(spec.yLabel) } : {}),
      },
    }
  }

  if (type === 'shape') {
    const dims = Array.isArray(spec.dims) ? spec.dims : null
    if (!dims || dims.length === 0) return { ok: false, error: 'shape 需要非空 dims（各轴长度）' }
    const nums: number[] = []
    for (const d of dims.slice(0, FIGURE_LIMITS.shapeDims)) {
      const n = num(d)
      if (n === null || n < 0) return { ok: false, error: 'shape 的 dims 必须是非负数值' }
      nums.push(n)
    }
    if (dims.length > FIGURE_LIMITS.shapeDims) warnings.push(`轴数已截断到 ${FIGURE_LIMITS.shapeDims}`)
    const labels = strList(spec.labels, nums.length)
    return {
      ok: true,
      warnings,
      spec: {
        type: 'shape',
        dims: nums,
        ...(labels ? { labels } : {}),
        ...(str(spec.title) ? { title: str(spec.title) } : {}),
      },
    }
  }

  if (type === 'network') {
    const rawLayers = Array.isArray(spec.layers) ? spec.layers : null
    if (!rawLayers || rawLayers.length === 0) return { ok: false, error: 'network 需要非空 layers' }
    const layers: NetworkFigure['layers'] = []
    for (const l of rawLayers.slice(0, FIGURE_LIMITS.networkLayers)) {
      const obj = (l ?? {}) as Record<string, unknown>
      const units = num(obj.units)
      if (units === null || units <= 0) return { ok: false, error: 'network 的每层需要正数 units' }
      layers.push({
        units: Math.min(FIGURE_LIMITS.networkUnits, Math.round(units)),
        ...(str(obj.name) ? { name: str(obj.name) } : {}),
      })
    }
    if (rawLayers.length > FIGURE_LIMITS.networkLayers) warnings.push(`层数已截断到 ${FIGURE_LIMITS.networkLayers}`)
    return {
      ok: true,
      warnings,
      spec: { type: 'network', layers, ...(str(spec.title) ? { title: str(spec.title) } : {}) },
    }
  }

  return { ok: false, error: `未知图形类型：${type || '(空)'}（支持 matrix/plot/bar/shape/network）` }
}

// ==================== SVG 渲染 ====================

/** 文本转义（规格内容可能来自模型，必须转义后再进 SVG） */
export function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 数值格式化（去掉 -0 与多余小数位） */
export function formatNumber(n: number, precision = 2): string {
  if (!Number.isFinite(n)) return '—'
  const fixed = n.toFixed(precision)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed === '-0' ? '0' : trimmed || '0'
}

const TITLE_H = 22
const AXIS_W = 46
const AXIS_H = 30

/** 单色深浅（蓝） */
function blueScale(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const light = 96 - Math.round(clamped * 46) // 96% → 50% 亮度
  return `hsl(212, 70%, ${light}%)`
}

/** 以 0 为中心的蓝-红（负=蓝，正=红） */
function divergingScale(t: number): string {
  const clamped = Math.max(-1, Math.min(1, t))
  const light = 92 - Math.round(Math.abs(clamped) * 42)
  return clamped >= 0 ? `hsl(6, 75%, ${light}%)` : `hsl(212, 75%, ${light}%)`
}

/** 图形容器尺寸（viewBox 用，CSS 控制实际宽度） */
function frame(title: string | undefined, w: number, h: number, body: string): string {
  return [
    `<svg class="dl-figure-svg" viewBox="0 0 ${w} ${h}" role="img"${title ? ` aria-label="${escapeXml(title)}"` : ''} xmlns="http://www.w3.org/2000/svg">`,
    title ? `<text class="dl-figure-title" x="${w / 2}" y="15" text-anchor="middle">${escapeXml(title)}</text>` : '',
    body,
    '</svg>',
  ]
    .filter(Boolean)
    .join('')
}

function renderMatrix(spec: MatrixFigure): string {
  const rows = spec.data.length
  const cols = Math.max(...spec.data.map((r) => r.length))
  const flat = spec.data.flat()
  const min = Math.min(...flat)
  const max = Math.max(...flat)
  const span = max - min || 1
  const cell = 34
  const padLeft = spec.rowLabels?.length ? 62 : 12
  const padTop = (spec.title ? TITLE_H : 0) + (spec.colLabels?.length ? 18 : 6)
  const w = padLeft + cols * cell + 12
  const h = padTop + rows * cell + (spec.colLabels?.length ? 4 : 12)
  const parts: string[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = spec.data[r][c]
      if (v === undefined) continue
      const t = spec.colormap === 'diverging' ? (v / (Math.max(Math.abs(min), Math.abs(max)) || 1)) : (v - min) / span
      const fill = spec.colormap === 'diverging' ? divergingScale(t) : blueScale(t)
      const x = padLeft + c * cell
      const y = padTop + r * cell
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="var(--el-border-color-lighter)" stroke-width="1"/>`)
      if (spec.showValues) {
        parts.push(
          `<text class="dl-figure-cell" x="${x + cell / 2}" y="${y + cell / 2 + 4}" text-anchor="middle">${escapeXml(formatNumber(v, spec.precision ?? 2))}</text>`,
        )
      }
    }
  }
  spec.colLabels?.forEach((label, c) => {
    if (c >= cols) return
    parts.push(
      `<text class="dl-figure-axis" x="${padLeft + c * cell + cell / 2}" y="${padTop - 5}" text-anchor="middle">${escapeXml(label)}</text>`,
    )
  })
  spec.rowLabels?.forEach((label, r) => {
    if (r >= rows) return
    parts.push(
      `<text class="dl-figure-axis" x="${padLeft - 8}" y="${padTop + r * cell + cell / 2 + 4}" text-anchor="end">${escapeXml(label)}</text>`,
    )
  })
  return frame(spec.title, w, h, parts.join(''))
}

function renderPlot(spec: PlotFigure): string {
  const all = spec.series.flatMap((s) => s.points)
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  const w = 340
  const h = 200
  const plotW = w - AXIS_W - 14
  const plotH = h - AXIS_H - (spec.title ? TITLE_H : 8) - 8
  const top = (spec.title ? TITLE_H : 8) + 4
  const sx = (x: number): number => AXIS_W + ((x - xMin) / xSpan) * plotW
  const sy = (y: number): number => top + plotH - ((y - yMin) / ySpan) * plotH
  const parts: string[] = []
  // 坐标轴 + 网格
  parts.push(`<line class="dl-figure-axis-line" x1="${AXIS_W}" y1="${top + plotH}" x2="${AXIS_W + plotW}" y2="${top + plotH}"/>`)
  parts.push(`<line class="dl-figure-axis-line" x1="${AXIS_W}" y1="${top}" x2="${AXIS_W}" y2="${top + plotH}"/>`)
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotH / 4) * i
    parts.push(`<line class="dl-figure-grid" x1="${AXIS_W}" y1="${y}" x2="${AXIS_W + plotW}" y2="${y}"/>`)
  }
  // 序列
  spec.series.forEach((s, i) => {
    const color = `var(--dl-series-${(i % 5) + 1})`
    const pts = [...s.points].sort((a, b) => a[0] - b[0])
    if (s.mode === 'line' || s.mode === 'both') {
      const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')
      parts.push(`<path class="dl-figure-line" d="${d}" fill="none" stroke="${color}"/>`)
    }
    if (s.mode === 'scatter' || s.mode === 'both') {
      for (const p of pts) {
        parts.push(`<circle class="dl-figure-dot" cx="${sx(p[0]).toFixed(1)}" cy="${sy(p[1]).toFixed(1)}" r="2.6" fill="${color}"/>`)
      }
    }
  })
  // 轴标签
  const xLabel = spec.xLabel ? `${spec.xLabel}：${formatNumber(xMin)} ~ ${formatNumber(xMax)}` : `${formatNumber(xMin)} ~ ${formatNumber(xMax)}`
  const yLabel = spec.yLabel ? `${spec.yLabel}：${formatNumber(yMin)} ~ ${formatNumber(yMax)}` : `${formatNumber(yMin)} ~ ${formatNumber(yMax)}`
  parts.push(`<text class="dl-figure-axis" x="${AXIS_W + plotW / 2}" y="${h - 4}" text-anchor="middle">${escapeXml(xLabel)}</text>`)
  parts.push(`<text class="dl-figure-axis" x="4" y="${top + plotH / 2}" text-anchor="start">${escapeXml(yLabel)}</text>`)
  return frame(spec.title, w, h, parts.join(''))
}

function renderBar(spec: BarFigure): string {
  const w = 340
  const barH = 20
  const gap = 8
  const labelW = 96
  const h = (spec.title ? TITLE_H : 6) + spec.items.length * (barH + gap) + 10
  const maxAbs = Math.max(...spec.items.map((it) => Math.abs(it.value))) || 1
  const trackW = w - labelW - 58
  const parts: string[] = []
  spec.items.forEach((it, i) => {
    const y = (spec.title ? TITLE_H : 6) + i * (barH + gap)
    const len = Math.max(2, (Math.abs(it.value) / maxAbs) * trackW)
    parts.push(`<text class="dl-figure-axis" x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end">${escapeXml(it.label)}</text>`)
    parts.push(
      `<rect class="dl-figure-bar" x="${labelW}" y="${y}" width="${len.toFixed(1)}" height="${barH}" rx="3" fill="${it.color ? escapeXml(it.color) : 'var(--dl-series-1)'}"/>`,
    )
    parts.push(`<text class="dl-figure-cell" x="${labelW + len + 6}" y="${y + barH / 2 + 4}" text-anchor="start">${escapeXml(formatNumber(it.value))}</text>`)
  })
  return frame(spec.title, w, h, parts.join(''))
}

function renderShape(spec: ShapeFigure): string {
  const boxW = 62
  const gap = 26
  const h = (spec.title ? TITLE_H : 6) + 78
  const w = 16 + spec.dims.length * (boxW + gap)
  const parts: string[] = []
  const topY = (spec.title ? TITLE_H : 6) + 6
  spec.dims.forEach((dim, i) => {
    const x = 12 + i * (boxW + gap)
    parts.push(`<rect class="dl-figure-box" x="${x}" y="${topY}" width="${boxW}" height="42" rx="6"/>`)
    parts.push(`<text class="dl-figure-cell" x="${x + boxW / 2}" y="${topY + 26}" text-anchor="middle">${escapeXml(String(dim))}</text>`)
    const label = spec.labels?.[i] ?? `axis ${i}`
    parts.push(`<text class="dl-figure-axis" x="${x + boxW / 2}" y="${topY + 58}" text-anchor="middle">${escapeXml(label)}</text>`)
    if (i < spec.dims.length - 1) {
      parts.push(
        `<text class="dl-figure-axis" x="${x + boxW + gap / 2}" y="${topY + 26}" text-anchor="middle">×</text>`,
      )
    }
  })
  return frame(spec.title, w, h, parts.join(''))
}

function renderNetwork(spec: NetworkFigure): string {
  const w = 340
  const layerGapX = Math.min(70, (w - 60) / Math.max(1, spec.layers.length))
  const unitGapY = 14
  const maxUnits = Math.max(...spec.layers.map((l) => l.units))
  const plotH = Math.max(60, maxUnits * unitGapY)
  const h = (spec.title ? TITLE_H : 6) + plotH + 34
  const top = (spec.title ? TITLE_H : 6) + 8
  const xOf = (i: number): number => 40 + i * layerGapX
  const yOf = (i: number, units: number): number => top + (plotH - units * unitGapY) / 2 + i * unitGapY + unitGapY / 2
  const parts: string[] = []
  // 全连接线（先画线，后画点，避免线压住点）
  for (let l = 0; l < spec.layers.length - 1; l++) {
    const a = spec.layers[l]
    const b = spec.layers[l + 1]
    for (let i = 0; i < a.units; i++) {
      for (let j = 0; j < b.units; j++) {
        parts.push(
          `<line class="dl-figure-edge" x1="${xOf(l)}" y1="${yOf(i, a.units).toFixed(1)}" x2="${xOf(l + 1)}" y2="${yOf(j, b.units).toFixed(1)}"/>`,
        )
      }
    }
  }
  spec.layers.forEach((layer, l) => {
    for (let i = 0; i < layer.units; i++) {
      parts.push(`<circle class="dl-figure-unit" cx="${xOf(l)}" cy="${yOf(i, layer.units).toFixed(1)}" r="5"/>`)
    }
    const label = layer.name ?? `${layer.units}`
    parts.push(
      `<text class="dl-figure-axis" x="${xOf(l)}" y="${top + plotH + 18}" text-anchor="middle">${escapeXml(label)}</text>`,
    )
  })
  return frame(spec.title, w, h, parts.join(''))
}

/**
 * 渲染图形规格为 SVG 字符串（确定性、无依赖；文本全部转义）。
 * @throws 规格非法（调用方应先用 parseFigureSpec 校验）
 */
export function renderFigureSvg(spec: DlFigureSpec): string {
  switch (spec.type) {
    case 'matrix':
      return renderMatrix(spec)
    case 'plot':
      return renderPlot(spec)
    case 'bar':
      return renderBar(spec)
    case 'shape':
      return renderShape(spec)
    case 'network':
      return renderNetwork(spec)
    default:
      throw new Error(`未知图形类型：${String((spec as { type?: string }).type)}`)
  }
}

/** 解析 + 渲染一步到位（供 DOM 增强使用） */
export function figureHtml(raw: string): { ok: true; svg: string; warnings: string[] } | { ok: false; error: string } {
  const parsed = parseFigureSpec(raw)
  if (!parsed.ok) return parsed
  try {
    return { ok: true, svg: renderFigureSvg(parsed.spec), warnings: parsed.warnings }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
