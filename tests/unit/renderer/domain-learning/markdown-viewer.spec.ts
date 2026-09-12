// @vitest-environment happy-dom
/**
 * 讲义 Markdown 渲染契约（MarkdownViewer）
 * @module tests/unit/renderer/domain-learning/markdown-viewer.spec
 *
 * 背景（2026-09-12 用户反馈「生成内容数学公式没有渲染」）：
 * `MarkdownViewer` 曾把 bytemd 的 `sanitize` 属性当成「HTML 字符串消毒器」用
 * （传入 `(html: string) => string`），但 bytemd 的 `sanitize` 是 **hast schema 变更器**
 * （`(schema: Schema) => Schema`）。于是 schema 被替换成字符串，hast-util-sanitize 在
 * `Object.assign({}, defaultSchema, '…')` 时丢掉 bytemd 追加的 `className` 白名单，
 * 所有 class 被剥离 → plugin-math 的 `viewerEffect` 查不到 `.math.math-inline`
 * （KaTeX 客户端渲染的定位锚点）→ 公式、mermaid、代码语言类名全部失效。
 *
 * 本 spec 钉死：
 * - 行内/块级公式真的被 KaTeX 渲染成 `.katex`（回归前述根因）；
 * - 代码块语言类名（`language-*`）保留（mermaid/高亮同源依赖）；
 * - rehype-sanitize 默认白名单仍生效：script / 事件属性 / javascript: 一律不落地。
 */

import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MarkdownViewer from '../../../../src/renderer/src/views/domain-learning/MarkdownViewer.vue'

// happy-dom 13 未实现 `document.compatMode`（undefined），而 KaTeX 在**模块求值**时检查
// `document.compatMode === 'CSS1Compat'`，不等就自禁用渲染（"doesn't work in quirks mode"）。
// 真实应用页面带 `<!DOCTYPE html>`（src/renderer/index.html），故这里补齐等价的环境事实。
Object.defineProperty(document, 'compatMode', { value: 'CSS1Compat', configurable: true })

/** 等待懒加载 + KaTeX 客户端渲染完成（最多 ~4s，避免固定 sleep） */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return predicate()
}

/** 挂载并等渲染就绪后返回 wrapper */
async function mountMd(md: string): Promise<VueWrapper<InstanceType<typeof MarkdownViewer>>> {
  const w = mount(MarkdownViewer, { props: { md } })
  await waitFor(() => w.find('.bytemd').exists())
  await waitFor(() => !w.find('.el-skeleton').exists())
  return w
}

const MORE_MD = [
  '### 记号热身',
  '',
  '一段正文，用来说明形状规则。',
  '',
  '| 记号 | 读法 |',
  '| --- | --- |',
  '| `(3, 4)` | 3 行 4 列 |',
  '',
  '行内公式 $x_{2,3}=6$ 表示第 2 行第 3 列。',
  '',
  '$$',
  'x \\in \\mathbb{R}^{3\\times 4}',
  '$$',
  '',
  '- 无序项一',
  '- 无序项二',
  '',
  '1. 步骤一',
  '2. 步骤二',
  '',
  '> 引用一句。',
  '',
  '```python',
  'import torch',
  'x = torch.zeros(3, 4)',
  '```',
].join('\n')

describe('MarkdownViewer 讲义渲染', () => {
  it('行内公式与块级公式都被 KaTeX 渲染（className 未被 sanitize 剥离）', async () => {
    const w = await mountMd(MORE_MD)
    const ok = await waitFor(() => w.findAll('.katex').length > 0)
    expect(ok, `公式未渲染：${w.html().slice(0, 800)}`).toBe(true)
    // 行内与块级都渲染（块级 KaTeX 会额外带 .katex-display）
    expect(w.findAll('.katex').length).toBeGreaterThanOrEqual(2)
    expect(w.find('.katex-display').exists()).toBe(true)
  })

  it('代码块语言类名保留（language-* 是 mermaid/高亮插件的定位锚点）', async () => {
    const w = await mountMd(MORE_MD)
    expect(w.find('code.language-python').exists()).toBe(true)
  })

  it('GFM 表格渲染为 table/th/td', async () => {
    const w = await mountMd(MORE_MD)
    expect(w.find('table').exists()).toBe(true)
    expect(w.findAll('th').length).toBe(2)
    expect(w.findAll('td').length).toBe(2)
  })

  it('标题/列表/引用等块级结构齐全（章节层级与列表缩进的前提）', async () => {
    const w = await mountMd(MORE_MD)
    expect(w.find('h3').exists()).toBe(true)
    expect(w.find('ol').exists()).toBe(true)
    expect(w.find('ul').exists()).toBe(true)
    expect(w.find('blockquote').exists()).toBe(true)
  })

  it('raw HTML 注入仍被拦截：script / 事件属性 / javascript: 不落地', async () => {
    const w = await mountMd(
      [
        '<script>window.__pwned = 1</script>',
        '<img src="x" onerror="window.__pwned = 2">',
        '<a href="javascript:window.__pwned = 3">点我</a>',
        '',
        '正常正文。',
      ].join('\n'),
    )
    const html = w.html()
    expect(html).not.toContain('<script')
    expect(html.toLowerCase()).not.toContain('onerror')
    expect(html.toLowerCase()).not.toContain('javascript:')
    expect(html).toContain('正常正文')
  })
})
