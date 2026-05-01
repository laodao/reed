/**
 * Vue 应用入口（Electron 端）
 * @module renderer/main
 *
 * Electron 端 entry：preload 已注入 window.electronAPI，直接 mount。
 * Web 端 entry 在 main-web.ts，通过 vite.config.web.ts 的 transformIndexHtml
 * 把 index.html 中的 entry 替换过来。
 */

import { mountApp } from './mount'

mountApp().catch((err) => {
  console.error('[main] mountApp failed:', err)
})
