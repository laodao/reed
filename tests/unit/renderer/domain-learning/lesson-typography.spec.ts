/**
 * 讲义正文排版契约（lesson-markdown.scss）
 * @module tests/unit/renderer/domain-learning/lesson-typography.spec
 *
 * 背景（2026-09-12 用户反馈「表格没有边框 / 段落第一行没有空格 / 编号紧挨左侧边框」）：
 * bytemd 不带 `.markdown-body` 内容样式，而全局 `* { margin: 0; padding: 0 }`
 * （styles/index.scss）又把浏览器默认的段落间距与列表左内边距清零——排版规则必须
 * 由讲义自己的样式表补齐。CSS 在 happy-dom 里不参与布局计算，故这里对样式表
 * 做**契约断言**（规则存在且落在正确的选择器上），防止后续重构把排版规则丢掉。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCSS_PATH = resolve(__dirname, '../../../../src/renderer/src/views/domain-learning/lesson-markdown.scss')
const SFC_PATH = resolve(__dirname, '../../../../src/renderer/src/views/domain-learning/MarkdownViewer.vue')
// 读入即归一换行（Windows 检出是 CRLF，下面的选择器断言按 \n 匹配）
const scss = readFileSync(SCSS_PATH, 'utf8').replace(/\r\n/g, '\n')
const sfc = readFileSync(SFC_PATH, 'utf8').replace(/\r\n/g, '\n')

/** 取某个选择器块的原文（从选择器起匹配到下一个同级 `}`；够用的浅层提取） */
function blockOf(selectorText: string): string {
  const start = scss.indexOf(selectorText)
  expect(start, `样式表缺少选择器：${selectorText}`).toBeGreaterThanOrEqual(0)
  return scss.slice(start, scss.indexOf('\n  }', start) + 4)
}

describe('讲义排版契约', () => {
  it('样式表挂在 .markdown-body 上且经 :deep() 落到 bytemd 生成的 DOM', () => {
    expect(scss).toContain('.markdown-viewer :deep(.markdown-body)')
  })

  it('MarkdownViewer 引入该样式表（排版规则随组件加载）', () => {
    expect(sfc).toContain("@use './lesson-markdown.scss'")
  })

  it('表格有边框（表头/单元格都描边，并允许横向滚动）', () => {
    const table = blockOf('table {')
    expect(table).toContain('border-collapse: collapse')
    expect(table).toContain('overflow-x: auto')
    const cells = blockOf('th,\n  td {')
    expect(cells).toContain('border: 1px solid')
  })

  it('段落首行缩进两字，但列表项/单元格/引用内的段落不缩进', () => {
    const p = blockOf('p {')
    expect(p).toContain('text-indent: 2em')
    expect(scss).toContain('li > p,')
    expect(scss).toMatch(/blockquote > p \{\s*margin: 0;\s*text-indent: 0;/)
  })

  it('列表有左内边距（编号不再压到正文左边界之外）', () => {
    const list = blockOf('ul,\n  ol {')
    expect(list).toMatch(/padding-left:\s*[\d.]+em/)
    const li = blockOf('li {')
    expect(li).toContain('text-indent: 0')
  })

  it('章节层级：正文标题分级且带左色条（区标题 > h3 > 正文）', () => {
    expect(blockOf('h1,\n  h2 {')).toContain('border-left')
    expect(blockOf('h3 {')).toContain('border-left')
    // 标题与区标题字号不冲突（正文标题小于区标题 15px）
    expect(blockOf('h3 {')).toMatch(/font-size:\s*14(\.5)?px/)
  })

  it('块级公式居中留白且可横向滚动（长公式不撑破版面）', () => {
    const display = blockOf('.katex-display {')
    expect(display).toContain('overflow-x: auto')
    expect(display).toMatch(/margin:\s*\d+px 0/)
  })
})
