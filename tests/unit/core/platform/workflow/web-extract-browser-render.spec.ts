/**
 * web-extract 浏览器渲染兜底测试
 * @module tests/unit/core/platform/workflow/web-extract-browser-render
 * @description 反爬/JS 渲染站点（头条等）对纯 HTTP 返回挑战页（正文为空）：
 *              - render=off：仅 HTTP（旧行为，不触发渲染）
 *              - render=auto（默认）：HTTP 正文 < 300 字时浏览器渲染重试，取更优结果；
 *                渲染失败优雅降级保留 HTTP 结果
 *              - render=always：跳过 HTTP 直接渲染；失败按 onError 策略 fail/skip
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EXTRA_NODE_HANDLERS } from '@core/platform/workflow/nodes/extra-nodes'
import { resetPolitenessThrottles } from '@core/platform/workflow/nodes/http-politeness'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const { renderPageHtmlMock } = vi.hoisted(() => ({ renderPageHtmlMock: vi.fn() }))

vi.mock('@core/platform/workflow/nodes/browser-render', () => ({
  BROWSER_RENDER_FALLBACK_MIN_CHARS: 300,
  BROWSER_RENDER_TIMEOUT_MS: 30_000,
  BROWSER_RENDER_TIMEOUT_MAX_MS: 120_000,
  BROWSER_RENDER_SETTLE_MS: 2_500,
  renderPageHtml: (...a: unknown[]) => renderPageHtmlMock(...a),
}))

const webExtractNode = EXTRA_NODE_HANDLERS.find(h => h.type === 'web-extract')!

/** 反爬挑战页：HTTP 200 但无正文（头条 jsvmprt 挑战页的真实形态） */
const CHALLENGE_HTML = '<html><head><title>请升级浏览器</title></head><body><script>var _$jsvmprt=function(){};</script></body></html>'

/** 渲染后的真实文章页（提取后正文远超 300 字） */
const RENDERED_HTML = `<html><head><title>卢克文：中东变局全解析_头条</title></head><body>
<nav><a href="/">首页</a><a href="/login">登录</a></nav>
<article><h1>中东变局全解析</h1>
<p>${'中东地区的地缘政治格局正在经历深刻重组，各方势力的博弈进入新阶段。'.repeat(6)}</p>
<p>${'历史经纬与现实利益的交织让这片土地的每一次动荡都牵动全球目光，能源、宗教与大国角力相互缠绕。'.repeat(6)}</p>
</article>
<footer><a href="/about">关于我们</a></footer>
</body></html>`

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    runId: 'r1',
    runKey: 'r1:c1',
    nodeId: 'c1',
    nodeType: 'web-extract',
    iterationIndex: 0,
    config: { delayMsMin: 0, delayMsMax: 0, maxLinks: 0, ...config },
    startInputs: {},
    triggerInfo: {},
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: vi.fn(),
    resolveTemplate: (t: string) => t,
    getVariable: () => undefined,
  } as unknown as WorkflowNodeContext
}

interface ExtractOutput {
  title: string
  text: string
  length: number
  links: Array<{ title: string; url: string }>
  skipped?: boolean
  rendered?: boolean
}

beforeEach(() => {
  resetPolitenessThrottles()
  renderPageHtmlMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web-extract render 兜底策略', () => {
  it('auto + HTTP 正文足够长 → 不触发渲染（rendered=false）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => RENDERED_HTML })))
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1' }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ExtractOutput }).output
    expect(out.rendered).toBe(false)
    expect(out.text).toContain('中东变局全解析')
    expect(renderPageHtmlMock).not.toHaveBeenCalled()
  })

  it('auto + HTTP 挑战页 + 渲染成功 → 采用渲染结果（rendered=true，链接来自渲染 DOM）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => CHALLENGE_HTML })))
    renderPageHtmlMock.mockResolvedValue({ ok: true, html: RENDERED_HTML, finalUrl: 'https://a.com/news/1' })
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1', maxLinks: 5 }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ExtractOutput }).output
    expect(out.rendered).toBe(true)
    expect(out.title).toBe('中东变局全解析')
    expect(out.length).toBeGreaterThan(300)
    expect(out.text).not.toContain('请升级浏览器')
    // 链接提取自渲染后的 DOM
    expect(out.links.map(l => l.url)).toContain('https://a.com/about')
    expect(renderPageHtmlMock).toHaveBeenCalledWith('https://a.com/news/1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('auto + 挑战页 + 渲染失败 → 优雅降级保留 HTTP 结果（不报错）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => CHALLENGE_HTML })))
    renderPageHtmlMock.mockResolvedValue({ ok: false, error: '渲染超时（30000ms）' })
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1' }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ExtractOutput }).output
    expect(out.rendered).toBe(false)
    expect(typeof out.text).toBe('string')
  })

  it('auto + 渲染正文没比 HTTP 好 → 保留 HTTP 结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => RENDERED_HTML.slice(0, 200) + '</body></html>' })))
    renderPageHtmlMock.mockResolvedValue({ ok: true, html: CHALLENGE_HTML, finalUrl: 'https://a.com/news/1' })
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1' }))
    const out = (result as { output: ExtractOutput }).output
    expect(out.rendered).toBe(false)
  })

  it('off + 挑战页 → 不触发渲染（旧行为）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => CHALLENGE_HTML })))
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1', render: 'off' }))
    expect(result.status).toBe('succeeded')
    expect((result as { output: ExtractOutput }).output.rendered).toBe(false)
    expect(renderPageHtmlMock).not.toHaveBeenCalled()
  })

  it('always → 跳过 HTTP 直接渲染', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => RENDERED_HTML }))
    vi.stubGlobal('fetch', fetchMock)
    renderPageHtmlMock.mockResolvedValue({ ok: true, html: RENDERED_HTML, finalUrl: 'https://a.com/news/1' })
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1', render: 'always' }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ExtractOutput }).output
    expect(out.rendered).toBe(true)
    expect(out.length).toBeGreaterThan(300)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('always + 渲染失败 + 默认 fail → 节点失败（retryable，渲染超时可重试）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called') }))
    renderPageHtmlMock.mockResolvedValue({ ok: false, error: '页面加载失败（-118）' })
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1', render: 'always' }))
    expect(result.status).toBe('failed')
    expect((result as { retryable?: boolean; error?: string }).retryable).toBe(true)
    expect((result as { error?: string }).error).toContain('页面加载失败')
  })

  it('always + 渲染失败 + onError=skip → 空结果跳过', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called') }))
    renderPageHtmlMock.mockResolvedValue({ ok: false, error: '渲染超时' })
    const result = await webExtractNode.execute(makeCtx({ url: 'https://a.com/news/1', render: 'always', onError: 'skip' }))
    expect(result.status).toBe('succeeded')
    const out = (result as { output: ExtractOutput }).output
    expect(out.skipped).toBe(true)
    expect(out.rendered).toBe(false)
  })

  it('SSRF 校验失败两条路径都不静默（off/always 均 failed）', async () => {
    for (const render of ['off', 'always'] as const) {
      const result = await webExtractNode.execute(makeCtx({ url: 'file:///C:/windows/system32', render }))
      expect(result.status).toBe('failed')
      expect((result as { retryable?: boolean }).retryable).toBe(false)
    }
    expect(renderPageHtmlMock).not.toHaveBeenCalled()
  })
})
