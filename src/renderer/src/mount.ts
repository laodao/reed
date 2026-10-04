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
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { installBuiltinPackages } from './packs'
import { useUserStore, type CurrentUser } from './stores/user'

import './styles/index.scss'

import { appSettings } from './composables/useAppSettings'
import { initThemeMode } from './composables/useThemeMode'
import { createBootTrace } from '@core/utils/boot-trace'

declare global {
  interface Window {
    electronAPI: any
    __APP_PLATFORM__?: 'electron' | 'web'
    /** 启动分段耗时（诊断用；last 为最近一次 mountApp 的分段明细） */
    __BOOT_TRACE__?: Array<{ label: string; ms: number; atMs: number }>
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
  // 启动分段计时：从模块执行到 app.mount 的每一段都记下来，启动变慢时可直接定位
  const trace = createBootTrace('renderer.mountApp')
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  trace.mark('createApp')

  // 业务包装配：注册内置包 → 拉启用态 → 动态挂路由/菜单。
  // 必须在 app.use(router) 前完成——use(router) 会触发首次导航解析，
  // 包路由未挂上时首屏直达链接（如 #/diary）会 404。
  await installBuiltinPackages(router)
  trace.mark('installBuiltinPackages')
  app.use(router)
  app.use(ElementPlus)
  trace.mark('installElementPlus')
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }
  trace.mark('registerIcons')

  // 在挂载前把 initialUser 写入 user store。
  // setActivePinia 让 useStore 可在 setup 之外调用。
  if (opts.initialUser !== undefined) {
    setActivePinia(pinia)
    useUserStore().setUser(opts.initialUser)
  }

  await appSettings.loadSettings()
  trace.mark('loadSettings')
  // 主题模式（跟随系统深浅色）在挂载前初始化，避免首屏闪烁
  await initThemeMode()
  trace.mark('initThemeMode')
  app.mount('#app')
  trace.mark('mount')
  window.__BOOT_TRACE__ = trace.marks()
  trace.report()
}
