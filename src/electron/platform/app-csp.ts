/**
 * 应用 CSP 策略（Electron 主进程唯一来源）
 * @module electron/platform/app-csp
 *
 * 背景（2026-09-15 用户报错「导出的 pdf 中 graph TD 没有渲染成图」）：
 * CSP 是**装在 session 上**的（`session.webRequest.onHeadersReceived`），因此会作用于
 * 该 session 里的**所有 WebContents**——包括"把本地生成的排版 HTML 渲染成 PDF/长图"的
 * 隐藏窗口（`electron-document-renderer`）与日记导出窗口。
 *
 * 而排版 HTML 需要两样东西：
 *  1. **内联脚本**：mermaid 运行脚本 + 渲染就绪标志（`window.__docRenderDone`）；
 *  2. **data: 字体**：KaTeX 字体以 base64 内联（自包含，隐藏窗口/Web 打印两端一致）。
 * 应用界面的 CSP（`script-src 'self'`、无 `font-src` → 回落 `default-src 'self'`）会把这两样
 * 全部拒绝，而且是**静默降级**：容器里留着 `graph TD` 源码文本、公式退回系统字体，
 * 渲染器等不到就绪标志直接打印——导出看着"成功"却缺图（实测证据见 progress 记录）。
 *
 * 因此按 WebContents 分流：
 *  - 应用界面（主窗口）：保持原有严格策略（不放宽）；
 *  - 文档渲染窗口：允许内联脚本/样式 + data: 字体，但 `default-src 'none'` +
 *    `connect-src 'none'`——讲义正文来自模型，不允许它联网外发或加载外部资源。
 */

/** 应用界面（主窗口）CSP——与原策略逐字一致 */
export const APP_UI_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "worker-src 'self' blob:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: local-image: file:; " +
  "media-src 'self' file: local-image: local-file: local-video:; " +
  "connect-src 'self' ws://localhost:* http://localhost:*"

/**
 * 文档渲染窗口 CSP（本地生成的排版 HTML → PDF/长图/日记导出）。
 *
 * - `script-src 'unsafe-inline'`：mermaid 运行脚本/就绪标志是内联的（**必须**）；
 * - `font-src data:`：KaTeX 内联 woff2（**必须**，否则公式字体被拒）；
 * - `default-src 'none'` + `connect-src 'none'`：正文里的任何外部引用/外发请求一律禁止。
 */
export const DOCUMENT_RENDER_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' 'wasm-unsafe-eval'; " +
  "worker-src 'self' blob:; " +
  "style-src 'unsafe-inline'; " +
  "img-src 'self' data: blob: local-image: file:; " +
  "font-src data:; " +
  "media-src 'self' file: data: blob: local-image: local-file: local-video:; " +
  "connect-src 'none'"

/**
 * 按请求所属 WebContents 选 CSP。
 *
 * @param details webRequest 的请求详情（含 `webContentsId`）
 * @param appWebContentsId 应用主窗口的 WebContents id（拿不到时按"应用界面"保守处理）
 * @returns 该请求应当带上的 CSP 字符串
 */
export function cspForRequest(
  details: { webContentsId?: number },
  appWebContentsId: number | undefined,
): string {
  const fromAppWindow =
    details.webContentsId === undefined || details.webContentsId === appWebContentsId
  return fromAppWindow ? APP_UI_CSP : DOCUMENT_RENDER_CSP
}
