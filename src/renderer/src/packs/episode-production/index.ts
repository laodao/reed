/**
 * 剧集制作业务包（前端骨架）
 * @module renderer/packs/episode-production
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/Episode*.vue）。
 *              跨包引用 voice-design 包的 VoiceCloneDialog 组件，
 *              故 manifest 显式声明 dependencies: ['voice-design']——
 *              声音设计包被禁用/未就绪时，本包整体不注册（纪律 2：依赖未就绪 = pending）。
 */
import { markRaw } from 'vue'
import { VideoCamera } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const episodeProductionPack: RendererPackDefinition = {
  manifest: {
    id: 'episode-production',
    name: '剧集制作',
    version: '1.0.0',
    description: '剧本生成与视频制作',
    dependencies: ['voice-design'],
    contributions: {
      routePaths: [
        '/episode-production',
        '/episode-production/all',
        '/episode-production/:projectId',
        '/episode-production/:projectId/creator',
        '/episode-production/:projectId/studio/:episodeId',
      ],
    },
  },
  routes: [
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
      // 新版工作台（三段式 + 右侧 agent）：菜单入口 → 项目列表 → 本工作台
      path: '/episode-production/:projectId/studio/:episodeId',
      name: 'EpisodeAgentStudio',
      component: () => import('@/views/EpisodeStudio.vue'),
      meta: { title: '剧集制作' },
    },
  ],
  menuItems: [
    {
      path: '/episode-production',
      label: '剧集制作',
      description: '剧本生成与视频制作',
      icon: markRaw(VideoCamera)
    }
  ],
  // 保持历史菜单顺序：知识库之前
  menuInsertBefore: '/knowledge-base'
}
