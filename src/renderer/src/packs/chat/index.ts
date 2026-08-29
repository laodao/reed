/**
 * AI 对话业务包（前端骨架）
 * @module renderer/packs/chat
 * @description 原地登记式：本期只把路由/菜单声明从壳（router/index.ts、config/menu.ts）
 *              搬入包模块，组件文件原地不动（@/views/Chat.vue、@/views/Assistant.vue）。
 */
import { markRaw } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const chatPack: RendererPackDefinition = {
  manifest: {
    id: 'chat',
    name: 'AI 对话',
    version: '1.0.0',
    description: '与 AI 进行智能对话，支持多种大模型',
    contributions: {
      routePaths: ['/chat', '/assistant'],
    },
  },
  routes: [
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
      path: '/assistant',
      name: 'Assistant',
      component: () => import('@/views/Assistant.vue'),
      meta: {
        title: '智能助手'
      }
    }
  ],
  menuItems: [
    {
      path: '/chat',
      label: 'AI 对话',
      description: '与 AI 进行智能对话，支持多种大模型',
      icon: markRaw(ChatDotRound)
    }
  ],
  // 保持历史菜单顺序：首页之后、知识库之前
  menuInsertBefore: '/knowledge-base'
}
