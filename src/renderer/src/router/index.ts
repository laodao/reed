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
  {
    path: '/voice',
    name: 'Voice',
    component: () => import('@/views/Voice.vue'),
    meta: {
      title: '语音助手'
    }
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
    path: '/story-to-video',
    name: 'StoryToVideo',
    component: () => import('@/views/StoryToVideo.vue'),
    meta: {
      title: '剧集制作'
    }
  },
  {
    path: '/story-to-video/:projectId',
    name: 'VideoProjectEditor',
    component: () => import('@/views/VideoProjectEditor.vue'),
    meta: {
      title: '项目编辑'
    }
  },
  {
    path: '/story-to-video/:projectId/production/:sceneId',
    name: 'VideoProduction',
    component: () => import('@/views/VideoProductionPage.vue'),
    meta: {
      title: '视频制作'
    }
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
