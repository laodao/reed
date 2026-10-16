/**
 * 外链打开（讲义证据来源/著作链接用）
 * @module shared/utils/external-link
 *
 * 需求（2026-09-12）：讲义的「证据来源」「相关著作」要给出**可点击**的 URL。
 *
 * 实现口径：统一走 `window.open(url, '_blank')`——
 * - Electron：主进程 `setWindowOpenHandler` 只放行 http(s) 并转 `shell.openExternal`
 *   （见 src/electron/index.ts），弹窗被 deny，因此在渲染层 window.open 是安全且正确的做法；
 * - Web：开新标签。
 *
 * 安全：只允许 http/https（`javascript:` / `data:` / `file:` 等一律拒绝，不打开也不返回 true）。
 */

/** 是否是可安全打开的外链（仅 http/https） */
export function isSafeExternalUrl(url: unknown): boolean {
  const s = String(url ?? '').trim()
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 打开外链。
 * @returns true = 已交给系统浏览器/新标签；false = URL 非法或环境不支持
 */
export function openExternalUrl(url: unknown): boolean {
  if (!isSafeExternalUrl(url)) return false
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  window.open(String(url).trim(), '_blank', 'noopener,noreferrer')
  return true
}

/** 展示用的站点标签（如 `deeplearningbook.org`）；非法 URL 返回空串 */
export function externalHostLabel(url: unknown): string {
  if (!isSafeExternalUrl(url)) return ''
  try {
    return new URL(String(url).trim()).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}
