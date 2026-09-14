/**
 * 声明式图形规格测试（figure-spec）
 * @module tests/unit/renderer/domain-learning/figure-spec.spec
 *
 * 用户需求（2026-09-12）：AI/数学类学习内容要图文并茂，但**不调 AI 生图**——
 * 由代码按数据画图。本 spec 钉死：规格解析容错/限幅、SVG 渲染确定性与关键图元、
 * 文本转义（规格来自模型，必须防注入）、以及非法规格的可读错误。
 */

import { describe, it, expect } from 'vitest'
import {
  FIGURE_LIMITS,
  escapeXml,
  figureHtml,
  formatNumber,
  parseFigureSpec,
  renderFigureSvg,
} from '../../../../src/renderer/src/views/domain-learning/figure-spec'

describe('parseFigureSpec：解析与规范化', () => {
  it('matrix：解析二维数组，默认显示数值、精度 2、单色', () => {
    const r = parseFigureSpec(JSON.stringify({ type: 'matrix', data: [[1, 2], [3, 4]], title: '权重' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.spec).toMatchObject({ type: 'matrix', title: '权重', showValues: true, precision: 2, colormap: 'blue' })
  })

  it('matrix：格子多于 100 自动关闭格内数值（避免糊成一团）', () => {
    const data = Array.from({ length: 12 }, () => Array.from({ length: 12 }, (_, i) => i))
    const r = parseFigureSpec(JSON.stringify({ type: 'matrix', data }))
    expect(r.ok && r.spec.type === 'matrix' && r.spec.showValues).toBe(false)
  })

  it('matrix：超限截断并给 warning', () => {
    const data = Array.from({ length: FIGURE_LIMITS.matrixRows + 5 }, (_, i) => [i])
    const r = parseFigureSpec(JSON.stringify({ type: 'matrix', data }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.spec.type === 'matrix' && r.spec.data).toHaveLength(FIGURE_LIMITS.matrixRows)
    expect(r.warnings.join('|')).toContain('截断')
  })

  it('plot：解析多序列与 mode；点数超限截断', () => {
    const r = parseFigureSpec(
      JSON.stringify({
        type: 'plot',
        series: [
          { name: 'f(x)=x²', points: [[0, 0], [1, 1], [2, 4]] },
          { name: '散点', mode: 'scatter', points: [[0, 1]] },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok || r.spec.type !== 'plot') return
    expect(r.spec.series).toHaveLength(2)
    expect(r.spec.series[0].mode).toBe('line')
    expect(r.spec.series[1].mode).toBe('scatter')
  })

  it('shape / network / bar：各自解析成功', () => {
    expect(parseFigureSpec(JSON.stringify({ type: 'shape', dims: [32, 3, 224, 224], labels: ['B', 'C', 'H', 'W'] })).ok).toBe(true)
    expect(parseFigureSpec(JSON.stringify({ type: 'network', layers: [{ name: '输入', units: 4 }, { units: 3 }, { units: 2 }] })).ok).toBe(true)
    expect(parseFigureSpec(JSON.stringify({ type: 'bar', items: [{ label: 'SGD', value: 1.2 }, { label: 'Adam', value: 0.4 }] })).ok).toBe(true)
  })

  it('非法输入给可读错误（不抛错）：空 / 非 JSON / 缺字段 / 非数值 / 未知类型', () => {
    expect(parseFigureSpec('')).toEqual({ ok: false, error: '图形规格为空' })
    expect(parseFigureSpec('not json')).toMatchObject({ ok: false })
    expect(parseFigureSpec('[]')).toMatchObject({ ok: false })
    expect(parseFigureSpec(JSON.stringify({ type: 'matrix' }))).toMatchObject({ ok: false })
    expect(parseFigureSpec(JSON.stringify({ type: 'matrix', data: [[1, 'x']] }))).toMatchObject({ ok: false })
    expect(parseFigureSpec(JSON.stringify({ type: 'plot', series: [{ points: [[0, 'a']] }] }))).toMatchObject({ ok: false })
    const unknown = parseFigureSpec(JSON.stringify({ type: 'pie' }))
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error).toContain('未知图形类型')
  })
})

describe('SVG 渲染：确定性与关键图元', () => {
  it('matrix：格子数 = 行×列，且包含行列标签与数值', () => {
    const r = parseFigureSpec(
      JSON.stringify({ type: 'matrix', data: [[1, 0], [0, 1]], rowLabels: ['样本1', '样本2'], colLabels: ['x', 'y'], title: '单位矩阵' }),
    )
    if (!r.ok) throw new Error('spec 应合法')
    const svg = renderFigureSvg(r.spec)
    expect(svg.startsWith('<svg')).toBe(true)
    expect((svg.match(/<rect /g) ?? []).length).toBe(4)
    expect(svg).toContain('单位矩阵')
    expect(svg).toContain('样本1')
    expect(svg).toContain('>1<')
  })

  it('plot：折线用 path、散点用 circle，且带轴范围说明', () => {
    const r = parseFigureSpec(
      JSON.stringify({ type: 'plot', series: [{ points: [[0, 0], [1, 2], [2, 4]] }], xLabel: 'x', yLabel: 'y' }),
    )
    if (!r.ok) throw new Error('spec 应合法')
    const svg = renderFigureSvg(r.spec)
    expect(svg).toContain('<path')
    expect(svg).toContain('x：0 ~ 2')
    expect(svg).toContain('y：0 ~ 4')
  })

  it('network：单元数 = 各层 units 之和，连线数 = 相邻层乘积', () => {
    const r = parseFigureSpec(JSON.stringify({ type: 'network', layers: [{ units: 3 }, { units: 2 }] }))
    if (!r.ok) throw new Error('spec 应合法')
    const svg = renderFigureSvg(r.spec)
    expect((svg.match(/<circle /g) ?? []).length).toBe(5)
    expect((svg.match(/<line class="dl-figure-edge"/g) ?? []).length).toBe(6)
  })

  it('shape：每个轴一个方块 + 轴长与标签', () => {
    const r = parseFigureSpec(JSON.stringify({ type: 'shape', dims: [32, 3, 224, 224], labels: ['batch', 'C', 'H', 'W'] }))
    if (!r.ok) throw new Error('spec 应合法')
    const svg = renderFigureSvg(r.spec)
    expect((svg.match(/dl-figure-box/g) ?? []).length).toBe(4)
    expect(svg).toContain('batch')
    expect(svg).toContain('224')
  })

  it('bar：条数 = items 数，值以文本给出', () => {
    const r = parseFigureSpec(JSON.stringify({ type: 'bar', items: [{ label: 'A', value: 3 }, { label: 'B', value: 7 }] }))
    if (!r.ok) throw new Error('spec 应合法')
    const svg = renderFigureSvg(r.spec)
    expect((svg.match(/dl-figure-bar/g) ?? []).length).toBe(2)
    expect(svg).toContain('>3<')
    expect(svg).toContain('>7<')
  })

  it('确定性：同规格两次渲染完全一致（可回归、可快照）', () => {
    const r = parseFigureSpec(JSON.stringify({ type: 'matrix', data: [[1, 2], [3, 4]] }))
    if (!r.ok) throw new Error('spec 应合法')
    expect(renderFigureSvg(r.spec)).toBe(renderFigureSvg(r.spec))
  })

  it('文本转义：标题/标签里的 HTML 被转义（规格来自模型，防注入）', () => {
    const r = parseFigureSpec(
      JSON.stringify({ type: 'matrix', data: [[1]], title: '<script>alert(1)</script>', rowLabels: ['"><img src=x onerror=alert(1)>'] }),
    )
    if (!r.ok) throw new Error('spec 应合法')
    const svg = renderFigureSvg(r.spec)
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('onerror=alert')
    expect(svg).toContain('&lt;script&gt;')
  })
})

describe('escapeXml / formatNumber', () => {
  it('escapeXml 覆盖 & < > " \'', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })

  it('formatNumber：去尾零、去 -0、非法值给 —', () => {
    expect(formatNumber(1.5)).toBe('1.5')
    expect(formatNumber(1)).toBe('1')
    expect(formatNumber(-0)).toBe('0')
    expect(formatNumber(Number.NaN)).toBe('—')
    expect(formatNumber(0.3333, 3)).toBe('0.333')
  })
})

describe('figureHtml：解析 + 渲染一步到位', () => {
  it('合法规格 → svg；非法 → error 且不抛错', () => {
    const ok = figureHtml(JSON.stringify({ type: 'shape', dims: [2, 3] }))
    expect(ok.ok && ok.svg.includes('<svg')).toBe(true)
    const bad = figureHtml('{')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('JSON')
  })
})
