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
import type { CurrentUser } from './stores/user'

/** 免登录公开路由（C3 工作流分享页等）：命中则跳过登录门直接挂载 */
const GUEST_ROUTES = [/^#\/workflow-run\//]
function isGuestRoute(): boolean {
  return GUEST_ROUTES.some(re => re.test(window.location.hash))
}

async function bootstrapWeb(): Promise<void> {
  installWebElectronApi()
  window.__APP_PLATFORM__ = 'web'

  // 访客页自行走公开 REST，不依赖用户态（stores 的鉴权请求失败由页面自身兜底）
  if (isGuestRoute()) {
    await mountApp()
    return
  }

  const user = await checkAuthOrShowLogin()
  if (!user) return // 登录页接管，不再 mount Vue

  await mountApp({ initialUser: user })
}

async function checkAuthOrShowLogin(): Promise<CurrentUser | null> {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' })
    if (resp.ok) {
      const body = await resp.json()
      if (body.ok && body.data) return body.data as CurrentUser
    }
  } catch {
    // 网络失败也走登录门
  }

  mountLoginPage('#app', () => {
    window.location.reload()
  })
  return null
}

bootstrapWeb().catch((err) => {
  console.error('[main-web] bootstrap failed:', err)
})
