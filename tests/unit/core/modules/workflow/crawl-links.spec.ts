/**
 * crawl-links 批量抓链接节点测试（两级采集第二步：专栏页/二级页 → 新闻链接）
 * @module tests/core/modules/workflow/crawl-links
 * @description 覆盖 parseUrlList（JSON/数组/文本/去重/过滤）与 handler execute
 *              （并发抓取 + extractPageLinks 复用 + 失败容错）与目录注册。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseUrlList } from '@core/modules/workflow/nodes/news-nodes'
import { NEWS_NODE_HANDLERS } from '@core/modules/workflow/nodes/news-nodes'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowNodeContext } from '@core/modules/workflow/engine/node-handler'

const crawlLinksNode = NEWS_NODE_HANDLERS.find(h => h.type === 'crawl-links')!

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseUrlList', () => {
  it('JSON 字符串数组', () => {
    expect(parseUrlList('["https://a.com","https://b.com"]').map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('JSON 对象数组（name+url）', () => {
    expect(parseUrlList('[{"name":"专栏A","url":"https://a.com"}]')).toEqual([{ name: '专栏A', url: 'https://a.com' }])
  })

  it('逗号/换行分隔的文本', () => {
    expect(parseUrlList('https://a.com,\nhttps://b.com').map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('运行时数组（引擎深解析后）', () => {
    expect(parseUrlList(['https://a.com', { name: 'B', url: 'https://b.com' }]).map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('跨来源去重', () => {
    const out = parseUrlList('["https://a.com","https://a.com","https://b.com"]')
    expect(out).toHaveLength(2)
  })

  it('过滤非 http(s)、空、javascript:', () => {
    expect(parseUrlList('["ftp://x.com","","javascript:void(0)","https://ok.com"]').map(u => u.url)).toEqual(['https://ok.com'])
  })

  it('undefined / 空串 → 空数组', () => {
    expect(parseUrlList(undefined)).toEqual([])
    expect(parseUrlList('')).toEqual([])
  })

  it('嵌套分组结构展平：[{source, items:[{title,url}]}]（LLM 按来源分组输出）', () => {
    const raw = JSON.stringify([
      { source: '来源A', items: [{ title: '栏目1', url: 'https://a.com/col1' }, { title: '栏目2', url: 'https://a.com/col2' }] },
      { source: '来源B', items: [{ title: '栏目3', url: 'https://b.com/col3' }] },
    ])
    expect(parseUrlList(raw)).toEqual([
      { name: '栏目1', url: 'https://a.com/col1' },
      { name: '栏目2', url: 'https://a.com/col2' },
      { name: '栏目3', url: 'https://b.com/col3' },
    ])
  })

  it('嵌套 links 键同样展平，且跨分组去重', () => {
    const raw = [
      { source: 'A', links: [{ url: 'https://a.com/1' }] },
      { source: 'B', links: [{ url: 'https://a.com/1' }, { url: 'https://b.com/2' }] },
    ]
    expect(parseUrlList(raw).map(u => u.url)).toEqual(['https://a.com/1', 'https://b.com/2'])
  })

  it('嵌套 items 中 source 用作 name 兜底', () => {
    const raw = JSON.stringify([{ source: '来源A', items: [{ url: 'https://a.com/col1' }] }])
    expect(parseUrlList(raw)).toEqual([{ name: '来源A', url: 'https://a.com/col1' }])
  })
})

describe('crawl-links handler execute', () => {
  function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
    return {
      runId: 'r1',
      runKey: 'r1:c1',
      nodeId: 'c1',
      nodeType: 'crawl-links',
      iterationIndex: 0,
      // 测试禁用礼貌随机间隔（实际运行由节点配置/工作流默认控制）
      config: { delayMsMin: 0, delayMsMax: 0, ...config },
      startInputs: {},
      triggerInfo: {},
      signal: new AbortController().signal,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      emitProgress: vi.fn(),
      resolveTemplate: (t: string) => t,
      getVariable: () => undefined,
    } as unknown as WorkflowNodeContext
  }

  it('并发抓取多页并合并提取的链接（去重、转绝对 URL）', async () => {
    const html = () => `<html><body>
      <a href="/news/1">第一条新闻标题内容比较长值得收录</a>
      <a href="/news/2">第二条新闻标题内容也比较长</a>
      <a href="/">首页</a>
      <a href="/dup">重复链接标题足够长</a>
      <a href="javascript:void(0)">bad</a>
    </body></html>`
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => html(),
    })))
    const result = await crawlLinksNode.execute(makeCtx({ urls: ['https://a.com/col', 'https://b.com/col'] }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: { links: Array<{ url: string }>; count: number; failedUrls: unknown[] } }).output
    // 每页 3 条有效（首页/bad 被过滤）；a.com/dup 与 b.com/dup 是不同 URL 不去重 → 共 6 条
    expect(out.count).toBe(6)
    const urls = out.links.map(l => l.url)
    expect(urls).toContain('https://a.com/news/1')
    expect(urls).toContain('https://b.com/news/2')
    expect(urls).toContain('https://a.com/dup')
    expect(urls).toContain('https://b.com/dup')
    expect(out.failedUrls).toEqual([])
  })

  it('单页失败不阻断整体，全部失败则节点失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('bad')) throw new Error('ECONNREFUSED')
      return { ok: true, status: 200, text: async () => '<a href="/x">这条新闻标题足够长值得收录</a>' }
    }))
    const partial = await crawlLinksNode.execute(makeCtx({ urls: ['https://a.com/ok', 'https://bad.com'] }))
    expect(partial.status).toBe('succeeded')
    expect((partial as { output: { failedUrls: unknown[] } }).output.failedUrls).toHaveLength(1)

    const all = await crawlLinksNode.execute(makeCtx({ urls: ['https://bad1.com', 'https://bad2.com'] }))
    expect(all.status).toBe('failed')
  })

  it('空列表 → 节点失败（retryable=false）', async () => {
    const result = await crawlLinksNode.execute(makeCtx({ urls: [] }))
    expect(result.status).toBe('failed')
    expect((result as { retryable?: boolean }).retryable).toBe(false)
  })

  it('validateConfig：空列表报错，模板字符串通过', () => {
    expect(crawlLinksNode.validateConfig({ urls: [] }).length).toBeGreaterThan(0)
    expect(crawlLinksNode.validateConfig({ urls: '' }).length).toBeGreaterThan(0)
    expect(crawlLinksNode.validateConfig({ urls: '{{pick1.parsed}}' })).toEqual([])
  })
})

describe('crawl-links 目录注册', () => {
  it('目录存在且 catalog 与 handler 输出键一致', () => {
    const entry = NODE_TYPE_CATALOG_MAP['crawl-links']
    expect(entry).toBeDefined()
    expect(crawlLinksNode).toBeDefined()
    const handlerKeys = crawlLinksNode.outputSchema.map(f => `${f.key}:${f.type}`).sort()
    const catalogKeys = entry.outputSchema.map(f => `${f.key}:${f.type}`).sort()
    expect(handlerKeys).toEqual(catalogKeys)
  })
})
