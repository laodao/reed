/**
 * Vue Router 配置
 * @module renderer/router
 */

import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

/**
 * 路由配置
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: {
      title: '首页'
    }
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/Chat.vue'),
    meta: {
      title: 'AI 对话'
    }
  },
  {
    path: '/image',
    name: 'Image',
    component: () => import('@/views/Image.vue'),
    meta: {
      title: '图像生成'
    }
  },
  {
    path: '/portrait',
    name: 'Portrait',
    component: () => import('@/views/Portrait.vue'),
    meta: {
      title: '人像设计'
    }
  },
  {
    path: '/translate',
    name: 'Translate',
    component: () => import('@/views/Translate.vue'),
    meta: {
      title: '文档翻译'
    }
  },
  // 语音助手 —— 2026-05-08 拆 3 个独立页面 + 主菜单子菜单
  // /voice 兼容跳转：默认进文本转语音
  { path: '/voice', redirect: '/voice/tts' },
  {
    path: '/voice/tts',
    name: 'VoiceTTS',
    component: () => import('@/views/voice/VoiceTTS.vue'),
    meta: { title: '文本转语音' },
  },
  {
    path: '/voice/stt',
    name: 'VoiceSTT',
    component: () => import('@/views/voice/VoiceSTT.vue'),
    meta: { title: '语音转文本' },
  },
  {
    path: '/voice/clone',
    name: 'VoiceClone',
    component: () => import('@/views/voice/VoiceClone.vue'),
    meta: { title: '声音复刻' },
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBase',
    component: () => import('@/views/KnowledgeBase.vue'),
    meta: {
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
      title: '日记'
    }
  },
  {
    path: '/episode-production',
    name: 'EpisodeProjectList',
    // FU5-B1：切到 V2（按原型 §1 重写 + 用 listProjectsSummary 聚合数据）
    // 旧 EpisodeProjectList.vue 暂保留作参考，下个 phase 删除
    component: () => import('@/views/EpisodeProjectListV2.vue'),
    meta: {
      title: '剧集制作'
    }
  },
  {
    path: '/episode-production/:projectId',
    name: 'EpisodeWorkbench',
    component: () => import('@/views/EpisodeWorkbench.vue'),
    meta: {
      title: '剧集编辑'
    }
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
