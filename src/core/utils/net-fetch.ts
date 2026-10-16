/**
 * 外网抓取统一 fetch 出口（桌面端走 Chromium 网络栈）
 * @module core/utils/net-fetch
 * @description 搜索引擎、网页抓取、素材下载等"对外部 URL 发请求"的场景统一使用
 *              outboundFetch() 取代全局 fetch：
 *
 *              - Electron 主进程：返回 net.fetch（Chromium 网络栈），自动跟随
 *                系统代理 / PAC。全局 fetch 走 Node 的 HTTP 栈，既不读系统代理
 *                也不读 HTTP(S)_PROXY 环境变量——用户本地开了代理，外网站点
 *                （google.com / wikipedia 等）照样连不上，这是联网搜索"开了
 *                代理也失败"的根因。
 *              - 纯 Node 环境（web server / 单测）：退回 globalThis.fetch，
 *                行为与改造前一致（单测的 vi.stubGlobal('fetch') 继续生效）。
 *
 *              net.fetch 已知边界（Electron 28 官方文档）：不支持 data:/blob:，
 *              integrity 被忽略，Response 的 .type/.url 值不可靠——本仓库调用方
 *              均只请求 http(s) 且不依赖 res.url（重定向基准自行跟踪），不受影响。
 */

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

/** 进程内解析一次；非 Electron 环境固定为 null（不能缓存 globalThis.fetch，单测会动态 stub） */
let chromiumFetch: typeof fetch | null | undefined

function loadChromiumFetch(): typeof fetch | null {
  if (!isElectron) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { net } = require('electron')
    return typeof net?.fetch === 'function' ? (net.fetch.bind(net) as typeof fetch) : null
  } catch {
    return null
  }
}

/**
 * 返回当前进程可用的对外 fetch 函数：
 * Electron 主进程 → net.fetch（Chromium 栈，跟随系统代理）；纯 Node → 全局 fetch。
 */
export function outboundFetch(): typeof fetch {
  if (chromiumFetch === undefined) chromiumFetch = loadChromiumFetch()
  return chromiumFetch ?? globalThis.fetch
}
