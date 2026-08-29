/**
 * Vue Router 配置（壳路由表）
 * @module renderer/router
 * @description 业务包架构（P3）改造后，本文件只保留壳路由：
 *              壳功能页（首页/设置/工作流/应用/资产/知识库）+ 旧路由兼容 redirect
 *              + 能力迁移重定向（redirectToApp）。
 *              7 个业务包的路由已搬入 src/renderer/src/packs/<name>/index.ts，
 *              由 mount.ts 的 installBuiltinPackages(router) 在 app.use(router) 前
 *              经 router.addRoute 动态注册（禁用/依赖未就绪的包不注册）。
 */

import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

/**
 * 能力应用重定向：按应用名称反查已发布应用（阶段三——旧能力入口迁移到应用模块）。
 * 应用 id 运行时生成，无法静态写死；找不到时兜底进应用列表。
 */
function redirectToApp(appName: string) {
  return async (): Promise<string> => {
    try {
      const api = (window as unknown as { electronAPI?: { app?: { list: (p: { page: number; pageSize: number }) => Promise<{ success: boolean; data?: { items: Array<{ id: string; name: string }> } }> } } }).electronAPI?.app
      const resp = await api?.list({ page: 1, pageSize: 200 })
      const app = (resp?.success ? resp.data?.items ?? [] : []).find(a => a.name === appName)
      if (app?.id) return `/apps/${app.id}`
    } catch {
      /* 反查失败兜底进应用列表 */
    }
    return '/apps'
  }
}

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
  // ==================== 能力应用迁移（阶段三） ====================
  // 旧能力入口（图像生成/文档翻译/语音助手）→ 已发布的应用（按名称反查，失败兜底应用列表）
  {
    path: '/image',
    beforeEnter: redirectToApp('图像生成'),
    component: { template: '<div />' },
  },
  {
    path: '/translate',
    beforeEnter: redirectToApp('文档翻译'),
    component: { template: '<div />' },
  },
  { path: '/voice', redirect: '/apps' },
  {
    path: '/voice/tts',
    beforeEnter: redirectToApp('文本转语音'),
    component: { template: '<div />' },
  },
  {
    path: '/voice/stt',
    beforeEnter: redirectToApp('语音转文本'),
    component: { template: '<div />' },
  },
  {
    path: '/voice/clone',
    beforeEnter: redirectToApp('语音复刻'),
    component: { template: '<div />' },
  },
  {
    path: '/workflow',
    name: 'WorkflowList',
    component: () => import('@/views/workflow/WorkflowList.vue'),
    meta: { title: '工作流' },
  },
  {
    path: '/apps',
    name: 'AppList',
    component: () => import('@/views/app/AppList.vue'),
    meta: { title: '应用' },
  },
  {
    path: '/apps/:id',
    name: 'AppDetail',
    component: () => import('@/views/app/AppDetail.vue'),
    meta: { title: '应用详情' },
  },
  {
    path: '/assets',
    name: 'AssetCenter',
    component: () => import('@/views/asset/AssetCenter.vue'),
    // 不缓存：资产实时变化（工作流随时保存新资产），每次进入取最新数据
    meta: { title: '资产管理' },
  },
  {
    // 会话页必须有 sessionId（新建会话由列表/详情页创建后跳转；无 id 路由已废弃）
    path: '/apps/:id/session/:sessionId',
    name: 'AppSession',
    component: () => import('@/views/app/AppSession.vue'),
    meta: { title: '应用会话' },
  },
  {
    path: '/workflow/editor/:id',
    name: 'WorkflowEditor',
    component: () => import('@/views/workflow/WorkflowEditor.vue'),
    meta: { title: '工作流编辑器' },
  },
  {
    path: '/workflow-run/:token',
    name: 'WorkflowGuestRun',
    component: () => import('@/views/workflow/WorkflowGuestRun.vue'),
    meta: { title: '工作流运行', guest: true },
  },
  {
    // 应用分享页（片4）：复用 WorkflowGuestRun——后端 resolveShare 应用优先
    // （apps 表 share_token → sourceId 回源定义），数据面纯 REST 免登录，与 token 渠道无关
    path: '/app-share/:token',
    name: 'AppShare',
    component: () => import('@/views/workflow/WorkflowGuestRun.vue'),
    meta: { title: '应用运行', guest: true },
  },
  {
    path: '/workflow/runs/:definitionId',
    name: 'WorkflowRunsHistory',
    component: () => import('@/views/workflow/WorkflowRunsHistory.vue'),
    meta: { title: '运行历史' },
  },
  {
    path: '/workflow/run/:runId',
    name: 'WorkflowRunDetail',
    component: () => import('@/views/workflow/WorkflowRunDetail.vue'),
    meta: { title: '运行详情' },
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBase',
    component: () => import('@/views/KnowledgeBase.vue'),
    meta: {
      keepAlive: true,
      title: '知识库'
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
    path: '/story-to-video/:projectId/production/:sceneId',
    redirect: (to) =>
      `/episode-production/${to.params.projectId}/production/${to.params.sceneId}`
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
