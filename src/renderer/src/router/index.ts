/**
 * Vue Router 配置
 * @module renderer/router
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
 * 路由配置
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
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/Chat.vue'),
    meta: {
      keepAlive: true,
      title: 'AI 对话'
    }
  },
  {
    path: '/portrait',
    name: 'Portrait',
    component: () => import('@/views/Portrait.vue'),
    meta: {
      keepAlive: true,
      title: '人像设计'
    }
  },
  {
    path: '/portrait/geometry',
    name: 'FaceGeometryPage',
    component: () => import('@/views/FaceGeometryPage.vue'),
    meta: { keepAlive: true, title: '面部微调' },
  },
  {
    path: '/portrait-templates',
    name: 'PortraitTemplates',
    component: () => import('@/views/PortraitTemplates.vue'),
    meta: {
      keepAlive: true,
      title: '提示词模板库'
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
    path: '/voice/design',
    name: 'VoiceDesign',
    component: () => import('@/views/voice/VoiceDesign.vue'),
    meta: { title: '声音设计' },
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
  {
    path: '/assistant',
    name: 'Assistant',
    component: () => import('@/views/Assistant.vue'),
    meta: {
      title: '智能助手'
    }
  },
  {
    path: '/longwriting',
    name: 'LongWriting',
    component: () => import('@/views/LongWriting.vue'),
    meta: {
      title: '长文写作'
    }
  },
  {
    path: '/story-editor/:id',
    name: 'StoryEditor',
    component: () => import('@/views/StoryEditor.vue'),
    meta: {
      title: '故事编辑'
    }
  },
  {
    path: '/comment-editor/:id',
    name: 'CommentEditor',
    component: () => import('@/views/CommentEditor.vue'),
    meta: {
      title: '评论编辑'
    }
  },
  {
    path: '/diary',
    name: 'Diary',
    component: () => import('@/views/Diary.vue'),
    meta: {
      keepAlive: true,
      title: '日记'
    }
  },
  {
    path: '/episode-production',
    name: 'EpisodeHome',
    // 菜单入口 → 首页：导入剧本卡（中间文本框）+ 底部最近项目横向滑动
    component: () => import('@/views/EpisodeHome.vue'),
    meta: {
      title: '剧集制作'
    }
  },
  {
    path: '/episode-production/all',
    name: 'EpisodeProjectList',
    // 「更多项目」→ 项目列表页（卡片网格 + 新建项目）
    component: () => import('@/views/EpisodeProjectListV3.vue'),
    meta: {
      title: '项目列表'
    }
  },
  {
    path: '/episode-production/:projectId',
    name: 'EpisodeProjectShortcut',
    // 旧路径：直接访问项目无 episodeId 时，beforeEnter 选首集 redirect 到新版工作台或剧本创建页
    beforeEnter: async (to) => {
      const projectId = to.params.projectId as string
      try {
        const api = (window as any).electronAPI?.episodeProduction
        const resp = await api.listEpisodes(projectId)
        if (resp?.success && Array.isArray(resp.data) && resp.data.length > 0) {
          const first = resp.data[0]
          return `/episode-production/${projectId}/studio/${first.id}`
        }
        return `/episode-production/${projectId}/creator`
      } catch {
        return `/episode-production/${projectId}/creator`
      }
    },
    // 给 vue-router 一个空的 component 占位，避免报 missing component 警告
    component: { template: '<div />' },
  },
  {
    // 无剧本空项目 → 剧本创建页（上传剧本 / AI 生成剧本）
    path: '/episode-production/:projectId/creator',
    name: 'EpisodeCreator',
    component: () => import('@/views/EpisodeCreator.vue'),
    meta: { title: '剧集制作' },
  },
  {
    path: '/episode-production/:projectId/episode/:episodeId',
    name: 'EpisodeWorkbench',
    component: () => import('@/views/EpisodeWorkbench.vue'),
    meta: { title: '剧集编辑' },
  },
  {
    // 新版工作台（三段式 + 右侧 agent）：菜单入口 → 项目列表 → 本工作台
    path: '/episode-production/:projectId/studio/:episodeId',
    name: 'EpisodeAgentStudio',
    component: () => import('@/views/EpisodeStudio.vue'),
    meta: { title: '剧集制作' },
  },
  {
    path: '/episode-production/:projectId/production/:sceneId',
    name: 'EpisodeProduction',
    component: () => import('@/views/EpisodeProductionPage.vue'),
    meta: {
      title: '画面制作'
    }
  },
  // =====================================================
  // 旧路由兼容 redirect（1 个版本周期后移除）
  // 旧 path: /story-to-video → 新 /episode-production
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
 * 创建路由实例
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
