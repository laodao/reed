/**
 * Vue 应用挂载（双端共享）
 * @module renderer/mount
 *
 * Electron 入口（main.ts）和 Web 入口（main-web.ts）都从此处取 mountApp，
 * 但本文件 **不含顶层副作用**，纯模块——避免被 import 时即触发挂载。
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'

import './styles/index.scss'

import { appSettings } from './composables/useAppSettings'

declare global {
  interface Window {
    electronAPI: any
    __APP_PLATFORM__?: 'electron' | 'web'
  }
}

/**
 * 创建并挂载 Vue 应用
 */
export async function mountApp(): Promise<void> {
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
