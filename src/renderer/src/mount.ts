/**
 * Vue 应用挂载（双端共享）
 * @module renderer/mount
 *
 * Electron 入口（main.ts）和 Web 入口（main-web.ts）都从此处取 mountApp，
 * 但本文件 **不含顶层副作用**，纯模块——避免被 import 时即触发挂载。
 */

import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useUserStore, type CurrentUser } from './stores/user'

import './styles/index.scss'

import { appSettings } from './composables/useAppSettings'

declare global {
  interface Window {
    electronAPI: any
    __APP_PLATFORM__?: 'electron' | 'web'
  }
}

export interface MountOptions {
  /** Web 端启动时已经从 /api/auth/me 拿到的当前用户。Electron 端传 undefined。 */
  initialUser?: CurrentUser | null
}

/**
 * 创建并挂载 Vue 应用
 */
export async function mountApp(opts: MountOptions = {}): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)
  app.use(ElementPlus)
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  // 在挂载前把 initialUser 写入 user store。
  // setActivePinia 让 useStore 可在 setup 之外调用。
  if (opts.initialUser !== undefined) {
    setActivePinia(pinia)
    useUserStore().setUser(opts.initialUser)
  }

  await appSettings.loadSettings()
  app.mount('#app')
}
