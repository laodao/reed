/**
 * web-extract 链接提取测试（内置应用 C1/C2 采集链路的基础）
 * @module tests/core/modules/workflow/web-extract-links
 * @description 验证 extractPageLinks：绝对 URL 归一化、去重、非法协议过滤、
 *              空文本兜底、maxLinks 上限、0=不提取。
 */
import { describe, it, expect } from 'vitest'
import { extractPageLinks } from '@core/modules/workflow/nodes/extra-nodes'

const SAMPLE_HTML = `
<html><body>
  <article>
    <a href="/news/ai-breakthrough">AI 重大突破</a>
    <a href="https://example.com/news/second">第二篇</a>
    <a href="https://example.com/news/ai-breakthrough">重复链接（同 URL）</a>
    <a href="javascript:void(0)">JS 链接应过滤</a>
    <a href="mailto:x@y.com">邮件链接应过滤</a>
    <a href="#section">锚点应过滤</a>
    <a>无 href 应过滤</a>
    <a href="https://external.com/story">站外链接保留</a>
  </article>
</body></html>`

describe('extractPageLinks', () => {
  it('提取链接并归一化为绝对 URL', () => {
    const links = extractPageLinks(SAMPLE_HTML, 'https://example.com/list', 100)
    const urls = links.map(l => l.url)
    expect(urls).toContain('https://example.com/news/ai-breakthrough')
    expect(urls).toContain('https://example.com/news/second')
    expect(urls).toContain('https://external.com/story')
  })

  it('同 URL 去重（保留首个标题）', () => {
    const links = extractPageLinks(SAMPLE_HTML, 'https://example.com/list', 100)
    const dup = links.filter(l => l.url === 'https://example.com/news/ai-breakthrough')
    expect(dup).toHaveLength(1)
    expect(dup[0].title).toBe('AI 重大突破')
  })

  it('过滤 javascript:/mailto:/锚点/无 href', () => {
    const links = extractPageLinks(SAMPLE_HTML, 'https://example.com/list', 100)
    const urls = links.map(l => l.url)
    expect(urls.some(u => u.startsWith('javascript:'))).toBe(false)
    expect(urls.some(u => u.startsWith('mailto:'))).toBe(false)
    expect(urls.some(u => u.includes('#'))).toBe(false)
  })

  it('标题清洗空白', () => {
    const links = extractPageLinks('<a href="/a">  标题  带  空格  </a>', 'https://example.com', 10)
    expect(links[0].title).toBe('标题 带 空格')
  })

  it('maxLinks 截断', () => {
    const links = extractPageLinks(SAMPLE_HTML, 'https://example.com/list', 2)
    expect(links.length).toBeLessThanOrEqual(2)
  })

  it('maxLinks=0 不提取', () => {
    expect(extractPageLinks(SAMPLE_HTML, 'https://example.com', 0)).toEqual([])
  })

  it('相对路径解析基于 baseUrl（URL 类自动规范化 ../）', () => {
    const links = extractPageLinks('<a href="../up">上</a>', 'https://example.com/news/list', 10)
    expect(links[0].url).toBe('https://example.com/up')
  })

  it('过滤导航链接（首页/资讯/更多/登录/指向站点根）', () => {
    const html = `
      <a href="/">首页</a>
      <a href="/news">资讯</a>
      <a href="/more">更多</a>
      <a href="/login">登录</a>
      <a href="/news/real-story-2026">00后清华博士生创业神经接口：把人类肌肉反应炼成Token</a>
      <a href="/news/second">第二篇真实新闻标题内容较长</a>
    `
    const links = extractPageLinks(html, 'https://example.com/', 100)
    const urls = links.map(l => l.url)
    expect(urls).not.toContain('https://example.com/')
    expect(urls).not.toContain('https://example.com/news')
    expect(urls).not.toContain('https://example.com/login')
    expect(urls).toContain('https://example.com/news/real-story-2026')
  })

  it('新闻特征优先：真实条目保留且导航链接被过滤', () => {
    const html = `
      <a href="/nav1">首页</a>
      <a href="/story1">A short</a>
      <a href="/story2">2026年人工智能领域迎来重大突破，多家公司发布新模型并投入商用</a>
      <a href="/story3">08-23 新能源汽车销量创新高，产业链公司业绩普遍超预期</a>
      <a href="/nav2">更多</a>
    `
    const links = extractPageLinks(html, 'https://example.com/', 10)
    const urls = links.map(l => l.url)
    // 导航被过滤
    expect(urls).not.toContain('https://example.com/nav1')
    expect(urls).not.toContain('https://example.com/nav2')
    // 真实条目都在（含较短的 story1，它不算导航词）
    expect(urls).toContain('https://example.com/story2')
    expect(urls).toContain('https://example.com/story3')
    // 导航链接全部被过滤（首页/更多）
    expect(links.every(l => !l.url.includes('nav'))).toBe(true)
    expect(links.length).toBe(3)
  })

  it('纯符号/纯数字链接过滤', () => {
    const html = `<a href="/a">···</a><a href="/b">12345</a><a href="/c">真实新闻标题足够长</a>`
    const links = extractPageLinks(html, 'https://example.com/', 10)
    expect(links.map(l => l.url)).toEqual(['https://example.com/c'])
  })
})
