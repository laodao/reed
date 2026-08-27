// @vitest-environment happy-dom
/**
 * sanitizeHtml 消毒工具单测（marked 输出安全网）
 * @module tests/renderer/utils/sanitize-html
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '@/utils/sanitize-html'

describe('sanitizeHtml', () => {
  it('保留正常展示性 HTML（标题/段落/粗体/链接/图片）', () => {
    const out = sanitizeHtml('<h2>标题</h2><p>正文 <strong>加粗</strong> <a href="https://example.com">链接</a></p><img src="/assets/x.png" alt="图">')
    expect(out).toContain('<h2>标题</h2>')
    expect(out).toContain('<strong>加粗</strong>')
    expect(out).toContain('<a href="https://example.com">链接</a>')
    expect(out).toContain('<img src="/assets/x.png"')
  })

  it('剥掉 script 标签与 on* 事件属性（存储型 XSS 核心向量）', () => {
    // 注：真实浏览器 DOMParser.parseFromString 不执行 <script>；happy-dom 会执行，
    // 故脚本内容用无副作用的表达式（var 声明），断言的是标签本身被剥除
    const out = sanitizeHtml('<p onclick="alert(1)">内容</p><script>var a = 1</script><img src=x onerror="alert(3)">')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onerror')
    expect(out).toContain('<p>内容</p>') // 事件属性被剥，标签保留
  })

  it('拆散 iframe/object/embed 危险标签，保留文本内容', () => {
    const out = sanitizeHtml('<iframe src="https://evil.com"></iframe>你好<object data="x"></object>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<object')
    expect(out).toContain('你好')
  })

  it('拒绝 javascript:/data: URL（href/src）', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">点我</a><img src="data:text/html;base64,PHNjcmlwdD4=">')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('data:')
    // 无 href 的 a 标签保留
    expect(out).toContain('<a>点我</a>')
  })

  it('剥掉非白名单属性（style/class 之外的任意属性）', () => {
    const out = sanitizeHtml('<div data-x="1" id="foo" class="bar">内容</div>')
    expect(out).not.toContain('data-x')
    expect(out).not.toContain('id=')
    expect(out).not.toContain('class=')
    expect(out).toContain('<div>内容</div>')
  })
})
