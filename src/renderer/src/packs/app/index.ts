/**
 * 应用业务包（前端骨架）
 * @module renderer/packs/app
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/app/）。
 *              应用 = 工作流的发布产物，manifest 与后端一致声明 dependencies:
 *              ['workflow']——工作流包不可用时本包整体不挂路由/菜单。
 *
 *              两类特殊路由：
 *              1. /app-share/:token 应用分享页复用 workflow 包的 WorkflowGuestRun 视图
 *                 （后端 resolveShare 应用优先：apps.share_token → 回源定义）——
 *                 跨包视图引用由 dependencies: ['workflow'] 保证方向合法；
 *              2. /image /translate /voice/* 是"能力应用迁移（阶段三）"遗留的旧能力
 *                 入口，按应用名称反查已发布应用后 redirect，随本包一并收编
 *                 （原壳路由的 redirectToApp 助手搬到这里）。
 */
import { markRaw } from 'vue'
import { Box } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

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

export const appPack: RendererPackDefinition = {
  manifest: {
    id: 'app',
    name: '应用',
    version: '1.0.0',
    description: '已发布的工作流应用——会话/分享/API 分发',
    dependencies: ['workflow'],
    contributions: {
      routePaths: ['/apps', '/apps/:id', '/apps/:id/session/:sessionId', '/app-share/:token', '/image', '/translate', '/voice', '/voice/tts', '/voice/stt', '/voice/clone'],
    },
  },
  routes: [
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
      // 会话页必须有 sessionId（新建会话由列表/详情页创建后跳转；无 id 路由已废弃）
      path: '/apps/:id/session/:sessionId',
      name: 'AppSession',
      component: () => import('@/views/app/AppSession.vue'),
      meta: { title: '应用会话' },
    },
    {
      // 应用分享页（片4）：复用 workflow 包 WorkflowGuestRun——后端 resolveShare 应用
      // 优先（apps 表 share_token → sourceId 回源定义），数据面纯 REST 免登录
      path: '/app-share/:token',
      name: 'AppShare',
      component: () => import('@/views/workflow/WorkflowGuestRun.vue'),
      meta: { title: '应用运行', guest: true },
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
  ],
  menuItems: [
    {
      path: '/apps',
      label: '应用',
      description: '已发布的工作流应用——会话/分享/API 分发',
      icon: markRaw(Box),
    },
  ],
  // 无 menuInsertBefore：注册顺序保证其位于工作流之后（见 renderer/packs/index.ts）
}
