/**
 * 长文写作业务包（前端骨架）
 * @module renderer/packs/longwriting
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动
 *              （@/views/LongWriting.vue、StoryEditor.vue、CommentEditor.vue）。
 */
import { markRaw } from 'vue'
import { EditPen, Notebook, Collection, UserFilled } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const longwritingPack: RendererPackDefinition = {
  manifest: {
    id: 'longwriting',
    name: '长文写作',
    version: '1.0.0',
    description: 'AI 辅助长篇小说创作',
    contributions: {
      routePaths: ['/longwriting', '/longwriting/room/:projectId', '/story-editor/:id', '/comment-editor/:id'],
    },
  },
  routes: [
    {
      path: '/longwriting',
      name: 'LongWriting',
      component: () => import('@/views/LongWriting.vue'),
      meta: {
        title: '长文写作'
      }
    },
    {
      // 故事研讨室（v2.1）：统一对话研讨主界面
      path: '/longwriting/room/:projectId',
      name: 'StoryRoom',
      component: () => import('@/views/StoryRoom.vue'),
      meta: {
        title: '故事研讨室'
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
      // 设定资产库·世界观库（2026-09-24 P0）：侧边栏二级菜单 / 页头页签进入
      path: '/longwriting/worlds',
      name: 'WorldLibrary',
      component: () => import('@/views/WorldLibrary.vue'),
      meta: {
        title: '世界观库'
      }
    },
    {
      path: '/longwriting/ip',
      name: 'IpLibrary',
      component: () => import('@/views/IpLibrary.vue'),
      meta: {
        title: '角色 IP 库'
      }
    }
  ],
  menuItems: [
    {
      path: '/longwriting',
      label: '长文写作',
      description: 'AI 辅助长篇小说创作',
      icon: markRaw(EditPen),
      // 侧边栏 hover 二级菜单（MainLayout 悬停浮层渲染；设计 2026-09-24 §5.3）
      children: [
        { path: '/longwriting', label: '项目', icon: markRaw(Notebook) },
        { path: '/longwriting/worlds', label: '世界观库', icon: markRaw(Collection) },
        { path: '/longwriting/ip', label: '角色 IP 库', icon: markRaw(UserFilled) }
      ]
    }
  ],
  // 保持历史菜单顺序：知识库之前
  menuInsertBefore: '/knowledge-base'
}
