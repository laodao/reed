/**
 * Single-file 网页归档工具测试（资源内联，注入假抓取器）
 * @module tests/unit/platform/assets/single-file-html
 */
import { describe, it, expect, vi } from 'vitest'
import { inlineHtmlResources, type WebResourceFetchResult } from '@core/platform/assets/single-file-html'

function fakeFetcher(map: Record<string, WebResourceFetchResult>): (url: string) => Promise<WebResourceFetchResult> {
  return async (url: string) => map[url] ?? { ok: false, reason: 'not-found' }
}

describe('inlineHtmlResources', () => {
  it('外链图片替换为 data URL', async () => {
    const res = await inlineHtmlResources(
      '<html><body><img src="https://cdn.example.com/a.png"></body></html>',
      {
        baseUrl: 'https://example.com/page',
        fetchResource: fakeFetcher({
          'https://cdn.example.com/a.png': { ok: true, text: null, dataUrl: 'data:image/png;base64,QUJD', contentType: 'image/png' },
        }),
      },
    )
    expect(res.inlinedCount).toBe(1)
    expect(res.html).toContain('data:image/png;base64,QUJD')
    expect(res.html).not.toContain('https://cdn.example.com/a.png')
  })

  it('相对图片基于 baseUrl 解析后内联', async () => {
    const res = await inlineHtmlResources(
      '<img src="../img/b.png">',
      {
        baseUrl: 'https://example.com/a/page.html',
        fetchResource: fakeFetcher({
          'https://example.com/img/b.png': { ok: true, text: null, dataUrl: 'data:image/png;base64,Qg==', contentType: 'image/png' },
        }),
      },
    )
    expect(res.inlinedCount).toBe(1)
    expect(res.html).toContain('data:image/png;base64,Qg==')
  })

  it('外链样式表内联为 data href，且其内部 url() 背景图递归内联', async () => {
    const cssText = '.hero{background:url(/assets/bg.png)} body{color:#333}'
    const res = await inlineHtmlResources(
      '<html><head><link rel="stylesheet" href="/css/main.css"></head><body><h1>x</h1></body></html>',
      {
        baseUrl: 'https://site.com/p/',
        fetchResource: fakeFetcher({
          'https://site.com/css/main.css': { ok: true, text: cssText, dataUrl: '', contentType: 'text/css' },
          'https://site.com/assets/bg.png': { ok: true, text: null, dataUrl: 'data:image/png;base64,QkdB', contentType: 'image/png' },
        }),
      },
    )
    expect(res.inlinedCount).toBe(2)
    // link href 被替换为 data: css（内部背景图已递归内联成 data URL）
    const href = (res.html.match(/<link[^>]+href="(data:text\/css;base64,[^"]+)"/) ?? [])[1]
    expect(href).toBeTruthy()
    const resolvedCss = Buffer.from(href.split(',')[1], 'base64').toString('utf-8')
    expect(resolvedCss).toContain('.hero{background:url("data:image/png;base64,QkdB")')
    expect(res.html).not.toContain('/css/main.css')
    expect(res.html).not.toContain('/assets/bg.png')
  })

  it('移除 script/iframe；保留正文', async () => {
    const res = await inlineHtmlResources(
      '<html><body><script>alert(1)</script><iframe src="https://x.com"></iframe><p>正文</p></body></html>',
      { baseUrl: 'https://a.com/' },
    )
    expect(res.strippedCount).toBeGreaterThan(0)
    expect(res.html).not.toContain('<script')
    expect(res.html).not.toContain('<iframe')
    expect(res.html).toContain('正文')
  })

  it('抓取失败保留原样并记录 warning', async () => {
    const res = await inlineHtmlResources(
      '<img src="https://cdn.example.com/missing.png">',
      {
        baseUrl: 'https://example.com/',
        fetchResource: async () => ({ ok: false, reason: 'HTTP 404' }),
      },
    )
    expect(res.inlinedCount).toBe(0)
    expect(res.html).toContain('https://cdn.example.com/missing.png')
    expect(res.warnings.some(w => w.includes('404'))).toBe(true)
  })

  it('已有 data:/协议 URL 与纯文本不处理', async () => {
    const src = '<img src="data:image/png;base64,AA=="><a href="mailto:x@y.z">mail</a><p>hi</p>'
    const res = await inlineHtmlResources(src, { baseUrl: 'https://a.com/' })
    expect(res.html).toContain('data:image/png;base64,AA==')
    expect(res.inlinedCount).toBe(0)
    expect(res.strippedCount).toBe(0)
  })

  it('maxResources 上限生效并记 warning', async () => {
    const res = await inlineHtmlResources(
      '<img src="https://cdn.example.com/1.png"><img src="https://cdn.example.com/2.png">',
      {
        baseUrl: 'https://example.com/',
        maxResources: 1,
        fetchResource: fakeFetcher({
          'https://cdn.example.com/1.png': { ok: true, text: null, dataUrl: 'data:image/png;base64,MQ==', contentType: 'image/png' },
        }),
      },
    )
    expect(res.inlinedCount).toBe(1)
    expect(res.warnings.some(w => w.includes('上限'))).toBe(true)
  })
})
