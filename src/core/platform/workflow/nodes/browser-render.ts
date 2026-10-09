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

function ensureSessionWired(session: RenderSession): void {
  if (wiredSession === session) return
  wiredSession = session
  // 图片/媒体/字体对正文提取无意义：取消加载，省带宽与渲染时间
  session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const t = details.resourceType
    callback({ cancel: t === 'image' || t === 'media' || t === 'font' })
  })
  // 权限请求（定位/通知/剪贴板…）一律拒绝：页面弹不出权限框就不会卡住渲染
  try {
    session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  } catch {
    /* 新版 Electron 改 API 时不致命：最多页面弹一次权限框 */
  }
}

// ==================== 主流程 ====================

/** electron BrowserWindow 的最小结构面（避免引入完整 electron 类型依赖） */
interface RenderWebContents {
  setUserAgent(ua: string): void
  session: RenderSession
  getURL(): string
  executeJavaScript(code: string, userGesture: boolean): Promise<string>
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
 * 浏览器渲染取页面完整 HTML（主进程桌面端专用）。
 * 失败返回 { ok:false, error }（不抛错——节点侧按 onError 策略决定 fail/skip）。
 */
export async function renderPageHtml(url: string, opts: BrowserRenderOptions = {}): Promise<BrowserRenderResult> {
  // SSRF：与 HTTP 路径同一闸门（渲染也是一次"请求"，URL 可能来自模板/LLM）
  const guard = validateOutboundUrl(url)
  if (!guard.ok) return { ok: false, error: `URL 校验失败：${guard.reason}` }

  // electron 动态 import：纯 node 环境加载本模块零副作用，走到这里才碰 electron
  let BrowserWindowCtor: (new (opts: Record<string, unknown>) => RenderWindow) | null = null
  try {
    const electron = (await import('electron')) as unknown as Record<string, unknown>
    const ctor = electron.BrowserWindow
    if (typeof ctor === 'function') BrowserWindowCtor = ctor as new (opts: Record<string, unknown>) => RenderWindow
  } catch (e) {
    return { ok: false, error: `浏览器渲染不可用：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!BrowserWindowCtor) {
    return { ok: false, error: '浏览器渲染仅在桌面端可用（非 Electron 运行时）' }
  }

  try {
    await acquireRenderSlot(opts.signal)
  } catch {
    return { ok: false, error: '已取消' }
  }

  const timeoutMs = Math.min(Math.max(1, opts.timeoutMs ?? BROWSER_RENDER_TIMEOUT_MS), BROWSER_RENDER_TIMEOUT_MAX_MS)
  const settleMs = Math.max(0, opts.settleMs ?? BROWSER_RENDER_SETTLE_MS)
  // 唯一取消出口：abort/超时都走 destroy()，挂着的 loadURL/executeJavaScript 会立即 reject
  let win: RenderWindow | null = null
  let aborted = false
  const onAbort = () => { aborted = true; win?.destroy() }
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(onAbort, timeoutMs)

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
    await withTimeout(load, timeoutMs, `渲染超时（${timeoutMs}ms）`)
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

    const html = await withTimeout(
      wc.executeJavaScript('document.documentElement.outerHTML', false),
      Math.max(5_000, timeoutMs - 5_000),
      '页面 DOM 获取超时',
    )
    if (!html || html.length < 200) return { ok: false, error: '渲染后页面内容为空（可能仍被反爬拦截）' }
    return { ok: true, html, finalUrl }
  } catch (e) {
    return { ok: false, error: aborted ? '已取消' : `浏览器渲染失败：${e instanceof Error ? e.message : String(e)}` }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
    try { win?.destroy() } catch { /* 已销毁 */ }
    releaseRenderSlot()
  }
}
