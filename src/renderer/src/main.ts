/**
 * Vue 应用入口
 * @module renderer/main
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

// 创建 Vue 应用
const app = createApp(App)

// 注册 Pinia 状态管理
app.use(createPinia())

// 注册路由
app.use(router)

// 注册 Element Plus
app.use(ElementPlus)

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 加载应用设置后挂载
appSettings.loadSettings().then(() => {
  app.mount('#app')
})
