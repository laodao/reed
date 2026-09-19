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

export default router
