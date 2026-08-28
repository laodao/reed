/**
 * 网页正文提取测试（启发式：文本密度选主内容容器）
 * @module tests/workflow/web-extract-article
 * @description extractArticleContent：剔除导航/按钮/评论/相关链接等噪声，只保留文章
 *              标题与正文段落；标题优先级 h1 > og:title > <title>；无正文容器回退。
 */
import { describe, it, expect } from 'vitest'
import { extractArticleContent, extractPageLinks } from '@core/modules/workflow/nodes/extra-nodes'

const NEWS_HTML = `<!DOCTYPE html><html><head>
  <title>官网标题 - 示例新闻站</title>
  <meta property="og:title" content="OG标题：今日科技重大突破" />
</head><body>
<header><nav><a href="/">首页</a><a href="/news">新闻</a><a href="/login">登录</a><a href="/reg">注册</a></nav></header>
<div class="content">
  <h1>今日科技重大突破</h1>
  <p>这是正文第一段，介绍科技突破的具体内容，包含足够多的有效信息来描述事件本身的来龙去脉，以及研究团队的背景与实验过程，字数足够构成正文容器。</p>
  <p>这是正文第二段，继续说明事件的影响与后续发展，为读者提供完整的背景信息与各方反应，同时展望这项技术在未来应用中的前景与挑战。</p>
  <div class="related"><a href="/r1">相关新闻一：另一篇报道标题</a><a href="/r2">相关新闻二：延伸阅读</a><a href="/r3">相关新闻三：更多内容</a></div>
</div>
<footer><button>点赞</button><button>分享</button><a href="/about">关于我们</a><span>版权所有</span></footer>
</body></html>`

describe('extractArticleContent 正文提取（剔除噪声）', () => {
  it('标题取正文容器 h1（优先于 og:title / <title>）', () => {
    const { title } = extractArticleContent(NEWS_HTML)
    expect(title).toBe('今日科技重大突破')
  })

  it('正文只含文章段落，不含导航/按钮/页脚/相关链接', () => {
    const { text } = extractArticleContent(NEWS_HTML)
    expect(text).toContain('这是正文第一段')
    expect(text).toContain('这是正文第二段')
    // 噪声不应混入
    expect(text).not.toContain('首页')
    expect(text).not.toContain('登录')
    expect(text).not.toContain('点赞')
    expect(text).not.toContain('关于我们')
    expect(text).not.toContain('相关新闻')
    expect(text).not.toContain('版权所有')
  })

  it('段落以换行分隔（结构化）', () => {
    const { text } = extractArticleContent(NEWS_HTML)
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
    expect(lines.some(l => l === '这是正文第一段，介绍科技突破的具体内容，包含足够多的有效信息来描述事件本身的来龙去脉，以及研究团队的背景与实验过程，字数足够构成正文容器。')).toBe(true)
  })
})

describe('标题提取优先级', () => {
  it('无正文 h1 时取 og:title', () => {
    const html = `<html><head><title>站点名</title><meta property="og:title" content="文章标题（OG）" /></head><body>
      <div><p>正文内容段落一，有足够长度，介绍主要事件并给出具体细节与时间线，让这段文字构成可识别的正文容器。</p><p>正文内容段落二，继续补充背景信息与相关影响，为后续展开做铺垫。</p></div></body></html>`
    const { title } = extractArticleContent(html)
    expect(title).toBe('文章标题（OG）')
  })

  it('仅 <title> 时取之', () => {
    const html = `<html><head><title>只有标题的页面</title></head><body><div><p>正文段落内容足够长，可以构成正文容器，介绍事件的主要内容并补充足够多的细节信息。</p><p>第二段补充更多内容与相关背景，保证总长度超过正文识别阈值。</p></div></body></html>`
    const { title } = extractArticleContent(html)
    expect(title).toBe('只有标题的页面')
  })
})

describe('无正文页面回退', () => {
  it('纯链接/导航页（无正文容器）→ 回退极简提取，不抛错', () => {
    const html = `<html><head><title>链接页</title></head><body><nav><a href="/a">链接A</a><a href="/b">链接B</a></nav></body></html>`
    const { text } = extractArticleContent(html)
    expect(typeof text).toBe('string')
    // 回退保留全部文本（无正文可提取时兼容旧行为）
    expect(text).toContain('链接A')
  })

  it('损坏 HTML 不抛错（回退）', () => {
    const { text } = extractArticleContent('<div>未闭合的标签<p>文字')
    expect(typeof text).toBe('string')
  })
})

describe('extractPageLinks 社交/短内容平台过滤', () => {
  const html = (links: string) => `<html><body>${links}</body></html>`
  const a = (href: string, title: string) => `<a href="${href}">${title}</a>`

  it('排除 x.com / twitter 推文链接（普通 fetch 无正文，正文采集应跳过）', () => {
    const out = extractPageLinks(
      html(a('https://x.com/amir/status/2092786156085899518', '英伟达收购 Hugging Face') +
          a('https://www.qbitai.com/2026/08/478164.html', '量子位：英伟达AI服务器将涨价15%')),
      'https://example.com', 50
    )
    const urls = out.map(l => l.url)
    expect(urls).not.toContain('https://x.com/amir/status/2092786156085899518')
    expect(urls).toContain('https://www.qbitai.com/2026/08/478164.html')
  })

  it('排除 facebook/instagram/youtube/weibo 等平台链接', () => {
    const out = extractPageLinks(
      html(a('https://www.facebook.com/posts/123', 'Facebook 帖子') +
          a('https://www.instagram.com/p/abc/', 'Instagram 帖子') +
          a('https://www.youtube.com/watch?v=xyz', 'YouTube 视频') +
          a('https://weibo.com/123456', '微博') +
          a('https://spectrum.ieee.org/article', 'IEEE Spectrum 文章')),
      'https://example.com', 50
    )
    const urls = out.map(l => l.url)
    expect(urls).not.toContain('https://www.facebook.com/posts/123')
    expect(urls).not.toContain('https://www.instagram.com/p/abc/')
    expect(urls).not.toContain('https://www.youtube.com/watch?v=xyz')
    expect(urls).not.toContain('https://weibo.com/123456')
    expect(urls).toContain('https://spectrum.ieee.org/article')
  })

  it('正常新闻站链接不受影响', () => {
    const out = extractPageLinks(
      html(a('https://news.example.com/story/1', '某媒体深度报道标题足够长')),
      'https://example.com', 50
    )
    expect(out.some(l => l.url === 'https://news.example.com/story/1')).toBe(true)
  })
})
