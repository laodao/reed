/**
 * browser-read（浏览器拟人阅读）节点测试
 * @module tests/unit/core/platform/workflow/browser-read-node
 * @description mock readPageLikeHuman（窗口/滚动属桌面端能力，纯 node 环境不可跑），
 *              锁节点层的编排语义：
 *              - article 模式：正文 提取 markdown + 纯文本 双形态输出
 *              - links 模式：链接正则过滤 + 归一去重 + 排除自身 + 截断；
 *                正则同时作为"加载够了"提前收工参数传给渲染层
 *              - onError fail/skip 双策略；validateConfig 各护栏
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const { readMock } = vi.hoisted(() => ({ readMock: vi.fn() }))

vi.mock('@core/platform/workflow/nodes/browser-render', () => ({
  BROWSER_RENDER_FALLBACK_MIN_CHARS: 300,
  BROWSER_RENDER_TIMEOUT_MS: 30_000,
  BROWSER_RENDER_TIMEOUT_MAX_MS: 120_000,
  BROWSER_RENDER_SETTLE_MS: 2_500,
  BROWSER_READ_TIMEOUT_MS: 120_000,
  BROWSER_READ_TIMEOUT_MAX_MS: 300_000,
  renderPageHtml: vi.fn(),
  readPageLikeHuman: (...a: unknown[]) => readMock(...a),
  buildHumanScrollScript: vi.fn(() => 'SCRIPT'),
}))

import { BROWSER_READ_NODE_HANDLERS, filterHarvestedLinks, normalizeLinkUrl } from '@core/platform/workflow/nodes/browser-read-node'

const browserReadNode = BROWSER_READ_NODE_HANDLERS.find(h => h.type === 'browser-read')!

/** 渲染后的真实文章页（提取后正文远超 200 字） */
const ARTICLE_HTML = `<html><head><title>卢克文：中东变局全解析_头条</title></head><body>
<nav><a href="/">首页</a><a href="/login">登录</a></nav>
<article><h1>中东变局全解析</h1>
<p>${'中东地区的地缘政治格局正在经历深刻重组，各方势力的博弈进入新阶段。'.repeat(6)}</p>
<p>${'历史经纬与现实利益的交织让这片土地的每一次动荡都牵动全球目光，能源、宗教与大国角力相互缠绕。'.repeat(6)}</p>
</article>
<footer><a href="/about">关于我们</a></footer>
</body></html>`

const SCROLL_STATS = { steps: 12, totalPx: 3600, reachedBottom: true, durationMs: 21000, matchedLinks: 0 }

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    runId: 'r1',
    runKey: 'r1:c1',
    nodeId: 'c1',
    nodeType: 'browser-read',
    iterationIndex: 0,
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

interface ReadOutput {
  title: string
  text: string
  markdown: string
  length: number
  links: Array<{ title: string; url: string }>
  count: number
  finalUrl: string
  scroll: Record<string, unknown> | null
  skipped?: boolean
}

beforeEach(() => {
  readMock.mockReset()
})

describe('browser-read 节点：article 模式', () => {
  it('滚动成功 → 输出 标题/纯文本/markdown 双形态正文', async () => {
    readMock.mockResolvedValue({
      ok: true,
      html: ARTICLE_HTML,
      finalUrl: 'https://www.toutiao.com/article/123/',
      title: '卢克文：中东变局全解析_头条',
      links: [{ url: 'https://www.toutiao.com/other/', title: '无关' }],
      scroll: SCROLL_STATS,
    })
    const result = await browserReadNode.execute(makeCtx({ url: 'https://www.toutiao.com/article/123/', mode: 'article' }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ReadOutput }).output
    expect(out.title).toBe('中东变局全解析')
    expect(out.text).toContain('地缘政治格局')
    expect(out.markdown).toContain('# 中东变局全解析')
    expect(out.markdown).toContain('历史经纬与现实利益')
    expect(out.length).toBeGreaterThan(0)
    expect(out.links).toEqual([])
    expect(out.count).toBe(0)
    expect(out.finalUrl).toBe('https://www.toutiao.com/article/123/')
    expect(out.scroll).toEqual(SCROLL_STATS)
    expect(out.skipped).toBeUndefined()
  })

  it('滚动参数透传渲染层（scrollMaxMs → scroll.maxDurationMs）', async () => {
    readMock.mockResolvedValue({ ok: true, html: ARTICLE_HTML, finalUrl: 'https://x/', title: 't', links: [], scroll: SCROLL_STATS })
    await browserReadNode.execute(makeCtx({
      url: 'https://www.toutiao.com/article/1/', mode: 'article',
      scrollMaxMs: 60000, pauseMsMin: 1000, pauseMsMax: 3000,
    }))
    expect(readMock).toHaveBeenCalledWith('https://www.toutiao.com/article/1/', expect.objectContaining({
      scroll: expect.objectContaining({ maxDurationMs: 60000, pauseMsMin: 1000, pauseMsMax: 3000 }),
    }))
  })

  it('正文容器缺失 → 整页 markdown 兜底，标题回退页面标题', async () => {
    const plainHtml = `<html><head><title>纯文本页</title></head><body><div>${'这是一段没有结构的长文本内容，'.repeat(60)}</div></body></html>`
    readMock.mockResolvedValue({ ok: true, html: plainHtml, finalUrl: 'https://x/', title: '纯文本页', links: [], scroll: SCROLL_STATS })
    const result = await browserReadNode.execute(makeCtx({ url: 'https://example.com/plain', mode: 'article' }))
    const out = (result as { output: ReadOutput }).output
    expect(out.title).toBe('纯文本页')
    expect(out.markdown.length).toBeGreaterThan(0)
  })
})

describe('browser-read 节点：links 模式', () => {
  const LINKS = [
    { url: 'https://www.toutiao.com/article/111/', title: '文章一' },
    { url: 'https://www.toutiao.com/article/222/', title: '文章二' },
    { url: 'https://www.toutiao.com/article/222', title: '文章二（尾斜杠重复）' },
    { url: 'https://www.toutiao.com/article/222/#comment', title: '文章二（hash 重复）' },
    { url: 'https://www.toutiao.com/c/user/token/x/', title: '博主主页（不匹配正则）' },
    { url: 'https://www.toutiao.com/article/333/', title: '文章三' },
  ]

  it('正则过滤 + 归一去重 + 排除自身 + 截断，保持 DOM 顺序', async () => {
    readMock.mockResolvedValue({
      ok: true, html: '<html></html>', finalUrl: 'https://www.toutiao.com/article/333/',
      title: '博主主页', links: LINKS, scroll: { ...SCROLL_STATS, matchedLinks: 3 },
    })
    const result = await browserReadNode.execute(makeCtx({
      url: 'https://www.toutiao.com/c/user/token/x/', mode: 'links',
      linkPattern: '^https://www\\.toutiao\\.com/article/\\d+', maxLinks: 2,
    }))
    const out = (result as { output: ReadOutput }).output
    expect(out.count).toBe(2)
    expect(out.links.map(l => l.url)).toEqual([
      'https://www.toutiao.com/article/111/',
      'https://www.toutiao.com/article/222/',
    ])
    // 正则同时作为提前收工条件传给渲染层（minLinks = maxLinks）
    expect(readMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      scroll: expect.objectContaining({ linkPattern: '^https://www\\.toutiao\\.com/article/\\d+', minLinks: 2 }),
    }))
  })

  it('无正则 → 全部 http(s) 链接去重后保留', async () => {
    readMock.mockResolvedValue({ ok: true, html: '<html></html>', finalUrl: 'https://www.toutiao.com/article/333/', title: 'x', links: LINKS, scroll: SCROLL_STATS })
    const result = await browserReadNode.execute(makeCtx({ url: 'https://example.com/list', mode: 'links', maxLinks: 10 }))
    const out = (result as { output: ReadOutput }).output
    // 6 条中：333 为自身排除，222 两个重复归一 → 剩 3 条（111 / 222 / 主页）
    expect(out.count).toBe(3)
    expect(out.links.some(l => l.url.includes('/c/user/token/'))).toBe(true)
  })
})

describe('browser-read 节点：失败策略', () => {
  it('onError=skip：阅读失败输出空结果（批量采集不阻断）', async () => {
    readMock.mockResolvedValue({ ok: false, error: '阅读后页面内容为空' })
    const result = await browserReadNode.execute(makeCtx({ url: 'https://example.com/article/9', onError: 'skip' }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ReadOutput }).output
    expect(out.skipped).toBe(true)
    expect(out.markdown).toBe('')
    expect(out.length).toBe(0)
  })

  it('缺省 fail：阅读失败节点失败（可重试）', async () => {
    readMock.mockResolvedValue({ ok: false, error: '浏览器阅读超时' })
    const result = await browserReadNode.execute(makeCtx({ url: 'https://example.com/article/9' }))
    expect(result.status).toBe('failed')
    expect((result as { error: string }).error).toContain('浏览器阅读失败')
    expect((result as { retryable: boolean }).retryable).toBe(true)
  })
})

describe('browser-read 节点：validateConfig 护栏', () => {
  it('空/非 http(s) URL 必报错', () => {
    expect(browserReadNode.validateConfig({ url: '' })).toContain('url 必须是 http(s):// 开头的完整地址')
    expect(browserReadNode.validateConfig({ url: 'file:///etc/passwd' })).toContain('url 必须是 http(s):// 开头的完整地址')
  })
  it('mode/linkPattern/数值范围护栏', () => {
    expect(browserReadNode.validateConfig({ url: 'https://x/', mode: 'bad' }).join()).toContain('mode')
    expect(browserReadNode.validateConfig({ url: 'https://x/', linkPattern: '[' }).join()).toContain('合法正则')
    expect(browserReadNode.validateConfig({ url: 'https://x/', pauseMsMin: 3000, pauseMsMax: 1000 }).join()).toContain('下限不能大于上限')
    expect(browserReadNode.validateConfig({ url: 'https://x/', timeoutMs: 999999 }).join()).toContain('timeoutMs')
    expect(browserReadNode.validateConfig({ url: 'https://x/', dwellChance: 2 }).join()).toContain('dwellChance')
  })
  it('合法配置零错误', () => {
    expect(browserReadNode.validateConfig({ url: 'https://x/', mode: 'links', linkPattern: '^https://a\\.com/\\d+' })).toEqual([])
  })
})

describe('链接工具函数', () => {
  it('normalizeLinkUrl：去 hash、去尾斜杠、保留 query', () => {
    expect(normalizeLinkUrl('https://a.com/x/')).toBe('https://a.com/x')
    expect(normalizeLinkUrl('https://a.com/x#top')).toBe('https://a.com/x')
    expect(normalizeLinkUrl('https://a.com/x?from=feed')).toBe('https://a.com/x?from=feed')
  })
  it('filterHarvestedLinks：正则非法时不过滤（防御），截断保持顺序', () => {
    const links = [
      { url: 'https://a.com/1', title: 'a' },
      { url: 'https://b.com/2', title: 'b' },
      { url: 'https://a.com/3', title: 'c' },
    ]
    const r = filterHarvestedLinks(links, { pattern: '[', maxLinks: 10 })
    expect(r.links).toHaveLength(3)
    const capped = filterHarvestedLinks(links, { maxLinks: 2 })
    expect(capped.links.map(l => l.url)).toEqual(['https://a.com/1', 'https://b.com/2'])
  })
})
