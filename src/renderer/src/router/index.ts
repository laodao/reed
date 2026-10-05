/**
 * Vue Router 配置（壳路由表）
 * @module renderer/router
 * @description 业务包架构改造后，本文件只保留壳路由：
 *              壳功能页（首页/设置）+ 旧路由兼容 redirect（story-to-video →
 *              episode-production）。
 *              二期（2026-09-05）后工作流/应用/知识库/资产中心也已包化，
 *              能力迁移重定向（redirectToApp，/image /translate /voice/* 旧入口）
 *              随 app 包收编。全部 11 个业务包的路由在 src/renderer/src/packs/<name>/
 *              index.ts，由 mount.ts 的 installBuiltinPackages(router) 在
 *              app.use(router) 前经 router.addRoute 动态注册
 *              （禁用/依赖未就绪的包不注册）。
 */

import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { ElMessage } from 'element-plus'

/**
 * 壳路由配置（业务包路由见 src/renderer/src/packs/）
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: {
      keepAlive: true,
      title: '首页'
    }
  },
  // =====================================================
  // 旧路由兼容 redirect（1 个版本周期后移除）
  // 旧 path: /story-to-video → 新 /episode-production（episode-production 包）
  // =====================================================
  { path: '/story-to-video', redirect: '/episode-production' },
  {
    path: '/story-to-video/:projectId',
    redirect: (to) => `/episode-production/${to.params.projectId}`
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: {
      keepAlive: true,
      title: '设置'
    }
  }
]

/**
 * 创建路由实例（仅壳路由；业务包路由由 installBuiltinPackages 动态注册）
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

/**
 * 路由守卫 - 设置页面标题
 */
router.beforeEach((to, _from, next) => {
  const title = to.meta.title as string
  if (title) {
    document.title = `${title} - The Bot`
  }
  next()
})

/**
 * 懒加载失败兜底（2026-10-05）：视图 chunk 拉取失败时 vue-router 会静默中止导航，
 * 用户看到的现象是"点菜单没有任何反应"。典型诱因：依赖/工具链升级（如 vite 大版本
 * 跳跃）后 node_modules/.vite 里的陈旧缓存，或依赖安装不完整。
 * 处置：首次失败 → 记下目标路由后整页 reload（清空浏览器模块缓存重试）；
 * 10s 内重复失败 → 不再 reload（防死循环），只给出可操作提示。
 */
const DYNAMIC_IMPORT_FAIL_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const CHUNK_RETRY_KEY = 'router:chunk-reload-at'

router.onError((error, to) => {
  if (!DYNAMIC_IMPORT_FAIL_RE.test(error.message)) return
  console.error('[router] 页面模块加载失败:', error.message)
  const last = Number(sessionStorage.getItem(CHUNK_RETRY_KEY) || 0)
  const now = Date.now()
  if (now - last > 10_000) {
    sessionStorage.setItem(CHUNK_RETRY_KEY, String(now))
    // 先把 hash 指到目标路由再 reload：重启后直接落在用户想去的页面
    if (to) window.location.hash = to.fullPath
    window.location.reload()
  } else {
    void ElMessage.error('页面资源加载失败——请完全退出应用重新打开；仍失败则删除 node_modules/.vite 后重新 npm install')
  }
})

export default router
