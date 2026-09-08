/**
 * HTML → Markdown 转换测试
 * @module tests/unit/utils/html-to-markdown
 */
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@core/utils/html-to-markdown'

describe('htmlToMarkdown', () => {
  it('标题/段落/链接/列表转 md', () => {
    const md = htmlToMarkdown('<h1>标题</h1><p>正文 <a href="https://a.com">链接</a></p><ul><li>甲</li><li>乙</li></ul>')
    expect(md).toContain('# 标题')
    expect(md).toContain('[链接](https://a.com)')
    expect(md).toMatch(/-+\s+甲/)
    expect(md).toMatch(/-+\s+乙/)
  })

  it('剥离 script/style/iframe 等噪声，内容不进入正文', () => {
    const md = htmlToMarkdown('<div><script>var x = "隐藏";</script><style>.x{color:red}</style><p>可见正文</p><iframe src="https://x.com"></iframe><nav>导航链接</nav></div>')
    expect(md).toContain('可见正文')
    expect(md).not.toContain('隐藏')
    expect(md).not.toContain('color:red')
    expect(md).not.toContain('x.com')
    expect(md).not.toContain('导航链接')
  })

  it('相对链接/图片可选解析为绝对地址', () => {
    const md = htmlToMarkdown('<p><a href="/docs/a">文档</a> <img src="../img/pic.png"></p>', 'https://example.com/base/')
    expect(md).toContain('[文档](https://example.com/docs/a)')
    expect(md).toContain('https://example.com/img/pic.png')
  })

  it('不传 baseUrl 时保留相对地址', () => {
    const md = htmlToMarkdown('<a href="/docs/a">文档</a>')
    expect(md).toContain('](/docs/a)')
  })

  it('空/非 HTML 输入安全', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
    expect(htmlToMarkdown('plain text')).toBe('plain text')
  })

  it('代码块 fenced 风格', () => {
    const md = htmlToMarkdown('<pre><code>const a = 1</code></pre>')
    expect(md).toContain('```')
    expect(md).toContain('const a = 1')
  })
})
