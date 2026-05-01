/**
 * Vue 应用入口（Web 端）
 * @module renderer/main-web
 *
 * 仅在 Web 端被使用：vite.config.web.ts 通过 transformIndexHtml 把
 * index.html 中 `/src/main.ts` 的 entry 替换为 `/src/main-web.ts`，从而
 * 把 @web-client 相关的依赖和登录逻辑彻底从 Electron 构建里剔除。
 */

import { mountApp } from './mount'
import { installWebElectronApi } from '@web-client/bridge'
import { mountLoginPage } from '@web-client/login-page'

async function bootstrapWeb(): Promise<void> {
  installWebElectronApi()
  window.__APP_PLATFORM__ = 'web'

  const authed = await checkAuthOrShowLogin()
  if (!authed) return // 登录页接管，不再 mount Vue

  await mountApp()
}

async function checkAuthOrShowLogin(): Promise<boolean> {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' })
    if (resp.ok) {
      const body = await resp.json()
      if (body.ok) return true
    }
  } catch {
    // 网络失败也走登录门
  }

  mountLoginPage('#app', () => {
    window.location.reload()
  })
  return false
}

bootstrapWeb().catch((err) => {
  console.error('[main-web] bootstrap failed:', err)
})
