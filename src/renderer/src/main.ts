/**
 * Vue 应用入口
 * @module renderer/main
 *
 * 双端入口：
 * - Electron 模式：preload 已挂 window.electronAPI，直接挂载
 * - Web 模式：检测无 electronAPI 时安装 web 桥接 + 鉴权门
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'

// 导入全局样式
import './styles/index.scss'

// 导入应用设置
import { appSettings } from './composables/useAppSettings'

declare global {
  interface Window {
    electronAPI: any
    __APP_PLATFORM__?: 'electron' | 'web'
  }
}

async function bootstrap(): Promise<void> {
  const isWebMode = !window.electronAPI || window.__APP_PLATFORM__ === 'web'

  if (isWebMode) {
    // 安装 Web 桥接（动态 import 避免 Electron 打包时把它带入）
    const { installWebElectronApi } = await import('@web-client/bridge')
    installWebElectronApi()
    window.__APP_PLATFORM__ = 'web'

    // 鉴权门：未登录展示登录页，登录成功后再挂载完整 App
    const authed = await checkAuthOrShowLogin()
    if (!authed) return // 登录页已自行接管
  }

  // 创建 Vue 应用
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(ElementPlus)
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  await appSettings.loadSettings()
  app.mount('#app')
}

async function checkAuthOrShowLogin(): Promise<boolean> {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' })
    if (resp.ok) {
      const body = await resp.json()
      if (body.ok) return true
    }
  } catch {
    // ignore
  }

  // 渲染极简登录页
  const { mountLoginPage } = await import('@web-client/login-page')
  mountLoginPage('#app', () => {
    // 登录成功回调：刷新页面重新走完整 bootstrap
    window.location.reload()
  })
  return false
}

bootstrap().catch(err => {
  console.error('[main] bootstrap failed:', err)
})
