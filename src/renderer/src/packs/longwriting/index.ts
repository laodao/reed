/**
 * 长文写作业务包（前端骨架）
 * @module renderer/packs/longwriting
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动
 *              （@/views/LongWriting.vue、StoryEditor.vue、CommentEditor.vue）。
 */
import { markRaw } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
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
    }
  ],
  menuItems: [
    {
      path: '/longwriting',
      label: '长文写作',
      description: 'AI 辅助长篇小说创作',
      icon: markRaw(EditPen)
    }
  ],
  // 保持历史菜单顺序：知识库之前
  menuInsertBefore: '/knowledge-base'
}
