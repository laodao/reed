/**
 * 浏览器渲染抽取兜底（反爬 / JS 渲染站点）
 * @module core/platform/workflow/nodes/browser-render
 * @description 头条/微信/知乎等站点对纯 HTTP 请求返回 200 的 JS 挑战页
 *              （body 为空、正文必须浏览器渲染才出现），web-extract 的 HTTP
 *              抓取因此拿不到正文。本模块在主进程开隐藏 BrowserWindow：
 *              - 独立持久 session partition（挑战通过后 cookie 复用，同站后续加载更快）
 *              - UA 伪装成正常 Chrome（默认 UA 带 Electron/应用特征会被反爬识别）
 *              - 拦截图片/媒体/字体（正文提取用不到，显著加速加载）
 *              - did-finish-load 后再等一段稳定时间（SPA 二次渲染）
 *              - 取 document.documentElement.outerHTML 交回调用方，走同一套
 *                extractArticleContent 启发式提取（与 HTTP 路径同口径）
 *
 *              readPageLikeHuman（browser-read 节点用）：在渲染窗口里**模拟真人阅读**——
 *              随机步长滚动 + 随机停顿 + 小概率驻留，直到底部（懒加载内容随之就位），
 *              再一次性取回 HTML / 标题 / 页内链接 / 滚动统计。列表页可配链接正则：
 *              命中数达标即提前收工（"加载更多"不必滚到全量底部）。
 *
 *              安全：入口与重定向后的最终 URL 都过 validateOutboundUrl（SSRF 闸门）；
 *              弹窗与权限请求一律拒绝；超时/取消/渲染进程崩溃都会销毁窗口。
 *              electron 依赖在函数体内动态 import：纯 node 环境（单测）加载本模块
 *              不报错，调用时才返回"桌面端不可用"。
 */

import { validateOutboundUrl } from '@core/utils/outbound-url'

/** auto 模式下 HTTP 提取正文低于该字数 → 触发浏览器渲染兜底（与博客蒸馏模板 guard 阈值同口径） */
export const BROWSER_RENDER_FALLBACK_MIN_CHARS = 300

/** 渲染总超时（毫秒）：加载 + 稳定等待 + 取 DOM 全在内（兜底路径本就慢于 HTTP） */
export const BROWSER_RENDER_TIMEOUT_MS = 30_000
/** 上限（防配置手滑把超时拉到分钟级卡死循环抓取） */
export const BROWSER_RENDER_TIMEOUT_MAX_MS = 120_000
/** did-finish-load 后的稳定等待（毫秒）：SPA 拉数据二次渲染 */
export const BROWSER_RENDER_SETTLE_MS = 2_500

/** 拟人阅读默认总超时：加载 + 稳定 + 滚动预算 + 收尾（阅读路径天然慢于纯渲染） */
export const BROWSER_READ_TIMEOUT_MS = 120_000
/** 拟人阅读超时上限（长列表页滚动加载可配到 5 分钟） */
export const BROWSER_READ_TIMEOUT_MAX_MS = 300_000

/** 全局并发上限：隐藏窗口是重资源，循环抓取场景最多同时开 2 个 */
const MAX_CONCURRENT_RENDERS = 2

/** 伪装 UA：与默认 UA 的 Electron/应用名特征区分开（反爬识别点） */
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 渲染专用持久 partition：挑战 cookie 跨渲染复用（通过一次，同站后续免挑战） */
const RENDER_PARTITION = 'persist:web-extract-render'

export interface BrowserRenderOptions {
  /** 总超时毫秒（默认 30s，封顶 120s） */
  timeoutMs?: number
  /** 加载完成后的稳定等待毫秒（默认 2500；0 = 不等） */
  settleMs?: number
  /** 取消信号（工作流取消/超时） */
  signal?: AbortSignal
}

export type BrowserRenderResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string }

// ==================== 全局并发信号量（跨节点共享） ====================

let activeRenders = 0
const slotWaiters: Array<() => void> = []

async function acquireRenderSlot(signal?: AbortSignal): Promise<void> {
  while (activeRenders >= MAX_CONCURRENT_RENDERS) {
    if (signal?.aborted) throw new Error('已取消')
    await new Promise<void>(resolve => slotWaiters.push(resolve))
  }
  activeRenders++
}

function releaseRenderSlot(): void {
  const next = slotWaiters.shift()
  if (next) next()
  else activeRenders--
}

// ==================== session 一次性接线（拦截重资源 + 拒绝权限弹窗） ====================

interface RenderSession {
  webRequest: {
    onBeforeRequest(
      filter: unknown,
      listener: (details: { resourceType: string }, callback: (r: { cancel?: boolean }) => void) => void,
    ): void
  }
  setPermissionRequestHandler(handler: (_wc: unknown, _permission: string, callback: (granted: boolean) => void) => void): void
}

let wiredSession: RenderSession | null = null

/**
 * 图片放行计数（readPageLikeHuman 模拟真人阅读时放行图片：懒加载触发 +
 * markdown 图文保真；纯渲染路径维持拦截加速）。共享 session 的拦截 listener
 * 只装一次，按该计数实时决定——任一活跃读者要图片，则图片放行。
 */
let imageAllowReaders = 0

function ensureSessionWired(session: RenderSession): void {
  if (wiredSession === session) return
  wiredSession = session
  // 图片/媒体/字体对正文提取无意义：取消加载，省带宽与渲染时间
  // （例外：拟人阅读活跃时放行图片——懒加载图文完整性优先）
  session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const t = details.resourceType
    const blockImage = t === 'image' && imageAllowReaders === 0
    callback({ cancel: t === 'media' || t === 'font' || blockImage })
  })
  // 权限请求（定位/通知/剪贴板…）一律拒绝：页面弹不出权限框就不会卡住渲染
  try {
    session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  } catch {
    /* 新版 Electron 改 API 时不致命：最多页面弹一次权限框 */
  }
}

// ==================== 主流程（共享窗口生命周期） ====================

/** electron BrowserWindow 的最小结构面（避免引入完整 electron 类型依赖） */
interface RenderWebContents {
  setUserAgent(ua: string): void
  session: RenderSession
  getURL(): string
  executeJavaScript(code: string, userGesture: boolean): Promise<unknown>
  once(event: string, listener: (...args: unknown[]) => void): void
  setWindowOpenHandler?(handler: () => { action: string }): void
}

interface RenderWindow {
  webContents: RenderWebContents
  loadURL(url: string): Promise<void>
  destroy(): void
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** 超时竞速：promise 太慢就给一句干净的错误（窗口销毁会让底层 promise 自行 reject） */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    p.then(v => { clearTimeout(timer); resolve(v) },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))) })
  })
}

/**
 * 渲染窗口共享生命周期：开窗 → 加载 → 稳定等待 → 最终 URL SSRF 复检 →
 * 执行调用方回调（取 DOM / 滚动阅读）→ 销毁窗口。超时/取消/崩溃统一收口，
 * 失败返回 { ok:false, error }（不抛错——节点侧按 onError 策略决定 fail/skip）。
 */
async function runRenderWindow<T>(
  url: string,
  opts: { timeoutMs: number; settleMs: number; signal?: AbortSignal; loadImages?: boolean },
  failurePrefix: string,
  use: (wc: RenderWebContents, finalUrl: string) => Promise<T>,
): Promise<{ ok: true; value: T; finalUrl: string } | { ok: false; error: string }> {
  // electron 动态 import：纯 node 环境加载本模块零副作用，走到这里才碰 electron
  let BrowserWindowCtor: (new (opts: Record<string, unknown>) => RenderWindow) | null = null
  try {
    const electron = (await import('electron')) as unknown as Record<string, unknown>
    const ctor = electron.BrowserWindow
    if (typeof ctor === 'function') BrowserWindowCtor = ctor as new (opts: Record<string, unknown>) => RenderWindow
  } catch (e) {
    return { ok: false, error: `${failurePrefix}不可用：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!BrowserWindowCtor) {
    return { ok: false, error: `${failurePrefix}仅在桌面端可用（非 Electron 运行时）` }
  }

  try {
    await acquireRenderSlot(opts.signal)
  } catch {
    return { ok: false, error: '已取消' }
  }

  const { timeoutMs, settleMs } = opts
  // 唯一取消出口：abort/超时都走 destroy()，挂着的 loadURL/executeJavaScript 会立即 reject
  let win: RenderWindow | null = null
  let aborted = false
  const onAbort = () => { aborted = true; win?.destroy() }
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(onAbort, timeoutMs)
  const allowImages = opts.loadImages === true
  if (allowImages) imageAllowReaders++

  try {
    win = new BrowserWindowCtor({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        javascript: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: RENDER_PARTITION,
        backgroundThrottling: false,
      },
    })
    const wc = win.webContents
    ensureSessionWired(wc.session)
    wc.setUserAgent(CHROME_UA)
    // 外部弹窗（window.open / target=_blank）一律拒绝
    try {
      wc.setWindowOpenHandler?.(() => ({ action: 'deny' }))
    } catch { /* 旧 API 缺失不致命 */ }

    // 主框架加载：did-fail-load 只认主框架非中止错误（-3=ERR_ABORTED，重定向/取消噪声）
    let loadError: string | null = null
    const load = new Promise<void>(resolve => {
      wc.once('did-fail-load', (...args: unknown[]) => {
        const code = args[1] as number
        const desc = args[2] as string
        const isMain = args[4] as boolean
        if (!isMain || code === -3) return
        loadError = `页面加载失败（${code}）：${desc}`
        resolve()
      })
      win?.loadURL(url)
        .then(() => resolve())
        .catch((e: unknown) => { loadError = e instanceof Error ? e.message : String(e); resolve() })
    })
    await withTimeout(load, timeoutMs, `${failurePrefix}超时（${timeoutMs}ms）`)
    if (aborted) return { ok: false, error: '已取消' }
    if (loadError) return { ok: false, error: loadError }

    // SPA 稳定等待（等待期间被取消 → 直接返回）
    if (settleMs > 0) {
      await sleep(settleMs)
      if (aborted) return { ok: false, error: '已取消' }
    }

    // 重定向后的最终 URL 重过 SSRF 闸门（与 executeHttpFetch/manual 跟随同款收口）
    const finalUrl = wc.getURL()
    const finalGuard = validateOutboundUrl(finalUrl)
    if (!finalGuard.ok) {
      return { ok: false, error: `重定向目标未过 SSRF 闸门（${finalUrl}）：${finalGuard.reason}` }
    }

    const value = await use(wc, finalUrl)
    if (aborted) return { ok: false, error: '已取消' }
    return { ok: true, value, finalUrl }
  } catch (e) {
    return { ok: false, error: aborted ? '已取消' : `${failurePrefix}失败：${e instanceof Error ? e.message : String(e)}` }
  } finally {
    if (allowImages) imageAllowReaders--
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
    try { win?.destroy() } catch { /* 已销毁 */ }
    releaseRenderSlot()
  }
}

/**
 * 浏览器渲染取页面完整 HTML（主进程桌面端专用）。
 * 失败返回 { ok:false, error }（不抛错——节点侧按 onError 策略决定 fail/skip）。
 */
export async function renderPageHtml(url: string, opts: BrowserRenderOptions = {}): Promise<BrowserRenderResult> {
  // SSRF：与 HTTP 路径同一闸门（渲染也是一次"请求"，URL 可能来自模板/LLM）
  const guard = validateOutboundUrl(url)
  if (!guard.ok) return { ok: false, error: `URL 校验失败：${guard.reason}` }

  const timeoutMs = Math.min(Math.max(1, opts.timeoutMs ?? BROWSER_RENDER_TIMEOUT_MS), BROWSER_RENDER_TIMEOUT_MAX_MS)
  const settleMs = Math.max(0, opts.settleMs ?? BROWSER_RENDER_SETTLE_MS)
  const run = await runRenderWindow<string>(url, { timeoutMs, settleMs, signal: opts.signal }, '浏览器渲染', async wc => {
    return withTimeout(
      wc.executeJavaScript('document.documentElement.outerHTML', false) as Promise<string>,
      Math.max(5_000, timeoutMs - 5_000),
      '页面 DOM 获取超时',
    )
  })
  if (!run.ok) return run
  if (!run.value || run.value.length < 200) return { ok: false, error: '渲染后页面内容为空（可能仍被反爬拦截）' }
  return { ok: true, html: run.value, finalUrl: run.finalUrl }
}

// ==================== 拟人阅读（browser-read 节点） ====================

/** 拟人滚动参数（全部可配；缺省即内置"人味"节奏，无需逐项填写） */
export interface HumanScrollOptions {
  /** 每步滚动距离下限（像素，默认 280） */
  stepPxMin?: number
  /** 每步滚动距离上限（像素，默认 720） */
  stepPxMax?: number
  /** 步间停顿下限（毫秒，默认 800） */
  pauseMsMin?: number
  /** 步间停顿上限（毫秒，默认 2600） */
  pauseMsMax?: number
  /** "驻留"概率（0-1，默认 0.12：读到有意思处多停一会儿） */
  dwellChance?: number
  /** 驻留时长下限（毫秒，默认 2000） */
  dwellMsMin?: number
  /** 驻留时长上限（毫秒，默认 5000） */
  dwellMsMax?: number
  /** 触底后等待毫秒（默认 2500：懒加载余量 + 读完尾部） */
  bottomSettleMs?: number
  /** 滚动总预算毫秒（默认 90000；到底/达标提前收工） */
  maxDurationMs?: number
  /** 滚动步数硬上限（默认 4000，防极长页面空转） */
  maxSteps?: number
  /**
   * 提前收工链接正则（列表页"加载更多"场景）：页面内命中该正则的链接数
   * ≥ minLinks 即停止滚动。缺省不启用——滚到底为止。
   */
  linkPattern?: string
  /** 提前收工的命中数目标（默认 0 = 不提前收工；配合 linkPattern 使用） */
  minLinks?: number
}

/** 页内采集的链接项 */
export interface PageLinkItem {
  url: string
  title: string
}

/** 滚动统计（供节点输出/日志诊断：到底没有、滚了多远） */
export interface HumanScrollStats {
  steps: number
  totalPx: number
  reachedBottom: boolean
  durationMs: number
  /** linkPattern 命中的链接数（未启用正则时为 0） */
  matchedLinks: number
}

export interface BrowserReadOptions {
  /** 总超时毫秒（默认 120s，封顶 300s）——覆盖 加载+稳定+滚动 全程 */
  timeoutMs?: number
  /** 加载完成后的稳定等待毫秒（默认 2500；0 = 不等） */
  settleMs?: number
  /** 取消信号（工作流取消/超时） */
  signal?: AbortSignal
  /** 拟人滚动参数（缺省用内置人味节奏） */
  scroll?: HumanScrollOptions
  /**
   * 是否放行图片加载（默认 true：模拟真人阅读 + 触发懒加载图、markdown 图文保真；
   * 传 false 加速纯文字场景）。媒体/字体始终拦截。
   */
  loadImages?: boolean
}

export type BrowserReadResult =
  | { ok: true; html: string; finalUrl: string; title: string; links: PageLinkItem[]; scroll: HumanScrollStats }
  | { ok: false; error: string }

/** 拟人滚动缺省节奏（"人味"基线：随机步长 + 随机停顿 + 小概率驻留） */
const HUMAN_SCROLL_DEFAULTS = {
  stepPxMin: 280,
  stepPxMax: 720,
  pauseMsMin: 800,
  pauseMsMax: 2600,
  dwellChance: 0.12,
  dwellMsMin: 2000,
  dwellMsMax: 5000,
  bottomSettleMs: 2500,
  maxDurationMs: 90_000,
  maxSteps: 4000,
  minLinks: 0,
} as const

/**
 * 生成页面内执行的拟人滚动脚本（JSON 注入参数，页面上下文异步执行到收工才 resolve）。
 * 滚动语义：
 * - 每步随机距离 scrollBy + 随机停顿；小概率触发"驻留"（人读到有意思处多停几秒）
 * - 触底后再等 bottomSettleMs 复核：高度增长（懒加载插入内容）→ 继续滚；仍触底 → 收工
 * - linkPattern 命中数达标（minLinks）→ 提前收工（列表页不必滚到全量底部）
 * - 连续 5 步纹丝不动（滚动容器不在 window 的非常规页面）→ 防空转收工
 * 收工时一次性带回 HTML / 标题 / 页内链接（绝对地址）/ 滚动统计。
 */
export function buildHumanScrollScript(opts: HumanScrollOptions): string {
  const p = {
    stepPxMin: opts.stepPxMin ?? HUMAN_SCROLL_DEFAULTS.stepPxMin,
    stepPxMax: opts.stepPxMax ?? HUMAN_SCROLL_DEFAULTS.stepPxMax,
    pauseMsMin: opts.pauseMsMin ?? HUMAN_SCROLL_DEFAULTS.pauseMsMin,
    pauseMsMax: opts.pauseMsMax ?? HUMAN_SCROLL_DEFAULTS.pauseMsMax,
    dwellChance: opts.dwellChance ?? HUMAN_SCROLL_DEFAULTS.dwellChance,
    dwellMsMin: opts.dwellMsMin ?? HUMAN_SCROLL_DEFAULTS.dwellMsMin,
    dwellMsMax: opts.dwellMsMax ?? HUMAN_SCROLL_DEFAULTS.dwellMsMax,
    bottomSettleMs: opts.bottomSettleMs ?? HUMAN_SCROLL_DEFAULTS.bottomSettleMs,
    maxDurationMs: opts.maxDurationMs ?? HUMAN_SCROLL_DEFAULTS.maxDurationMs,
    maxSteps: opts.maxSteps ?? HUMAN_SCROLL_DEFAULTS.maxSteps,
    linkPattern: opts.linkPattern ?? '',
    minLinks: opts.minLinks ?? HUMAN_SCROLL_DEFAULTS.minLinks,
  }
  return `(async () => {
  const P = ${JSON.stringify(p)}
  const rand = (a, b) => a + Math.random() * (b - a)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let re = null
  if (P.linkPattern) { try { re = new RegExp(P.linkPattern) } catch (e) { re = null } }
  const countMatched = () => {
    if (!re) return 0
    let n = 0
    for (const a of document.querySelectorAll('a[href]')) { try { if (re.test(a.href || '')) n++ } catch (e) {} }
    return n
  }
  const doc = document.documentElement
  const collect = (steps, reachedBottom, stalls, t0) => ({
    html: doc.outerHTML,
    title: document.title || '',
    links: Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({ url: a.href || '', title: (a.textContent || '').trim().slice(0, 200) }))
      .filter((l) => /^https?:/i.test(l.url))
      .slice(0, 1000),
    scroll: {
      steps,
      totalPx: Math.round(window.scrollY),
      reachedBottom,
      durationMs: Date.now() - t0,
      matchedLinks: countMatched(),
      stalls,
    },
  })
  const t0 = Date.now()
  let steps = 0
  let stalls = 0
  for (;;) {
    const before = window.scrollY
    window.scrollBy(0, Math.round(rand(P.stepPxMin, P.stepPxMax)))
    steps++
    const rest = Math.random() < P.dwellChance
      ? Math.round(rand(P.dwellMsMin, P.dwellMsMax))
      : Math.round(rand(P.pauseMsMin, P.pauseMsMax))
    await sleep(rest)
    const moved = window.scrollY > before
    const bottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2
    if (re && P.minLinks > 0 && countMatched() >= P.minLinks) return collect(steps, bottom, stalls, t0)
    if (bottom) {
      await sleep(P.bottomSettleMs)
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2) return collect(steps, true, stalls, t0)
      continue
    }
    if (!moved) { stalls++; if (stalls >= 5) return collect(steps, false, stalls, t0) } else { stalls = 0 }
    if (Date.now() - t0 >= P.maxDurationMs || steps >= P.maxSteps) return collect(steps, false, stalls, t0)
  }
})()`
}

/** 页面回传载荷的运行时形状（executeJavaScript 结构化克隆，仅做形状防御） */
interface PageReadPayload {
  html?: unknown
  title?: unknown
  links?: unknown
  scroll?: unknown
}

/**
 * 浏览器拟人阅读取页面（主进程桌面端专用）：开窗加载 → 模拟真人滚动到底 →
 * 一次性取回 HTML/标题/链接/滚动统计。供 browser-read 节点使用。
 */
export async function readPageLikeHuman(url: string, opts: BrowserReadOptions = {}): Promise<BrowserReadResult> {
  // SSRF：与 HTTP 路径同一闸门（URL 可能来自模板/LLM）
  const guard = validateOutboundUrl(url)
  if (!guard.ok) return { ok: false, error: `URL 校验失败：${guard.reason}` }

  const timeoutMs = Math.min(Math.max(1, opts.timeoutMs ?? BROWSER_READ_TIMEOUT_MS), BROWSER_READ_TIMEOUT_MAX_MS)
  const settleMs = Math.max(0, opts.settleMs ?? BROWSER_RENDER_SETTLE_MS)
  const script = buildHumanScrollScript(opts.scroll ?? {})

  const run = await runRenderWindow<PageReadPayload>(
    url,
    { timeoutMs, settleMs, signal: opts.signal, loadImages: opts.loadImages !== false },
    '浏览器阅读',
    async wc => {
      return withTimeout(
        wc.executeJavaScript(script, false) as Promise<PageReadPayload>,
        Math.max(15_000, timeoutMs - 5_000),
        '页面滚动阅读超时',
      )
    },
  )
  if (!run.ok) return run

  const payload = run.value
  const html = typeof payload.html === 'string' ? payload.html : ''
  if (!html || html.length < 200) return { ok: false, error: '阅读后页面内容为空（可能仍被反爬拦截）' }
  const rawLinks = Array.isArray(payload.links) ? payload.links : []
  const links: PageLinkItem[] = []
  for (const item of rawLinks) {
    if (!item || typeof item !== 'object') continue
    const u = (item as PageLinkItem).url
    if (typeof u !== 'string' || !/^https?:/i.test(u)) continue
    links.push({ url: u, title: typeof (item as PageLinkItem).title === 'string' ? (item as PageLinkItem).title : '' })
  }
  const s = (payload.scroll ?? {}) as Record<string, unknown>
  const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const scroll: HumanScrollStats & { stalls?: number } = {
    steps: num(s.steps),
    totalPx: num(s.totalPx),
    reachedBottom: s.reachedBottom === true,
    durationMs: num(s.durationMs),
    matchedLinks: num(s.matchedLinks),
  }
  if (typeof s.stalls === 'number') scroll.stalls = s.stalls
  return {
    ok: true,
    html,
    finalUrl: run.finalUrl,
    title: typeof payload.title === 'string' ? payload.title : '',
    links,
    scroll,
  }
}
