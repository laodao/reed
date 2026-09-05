/**
 * 人像设计业务包（前端骨架）
 * @module renderer/packs/portrait
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/Portrait*.vue）。
 */
import { markRaw } from 'vue'
import { User } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const portraitPack: RendererPackDefinition = {
  manifest: {
    id: 'portrait',
    name: '人像设计',
    version: '1.0.0',
    description: 'AI 角色人像设计与生成',
    contributions: {
      routePaths: ['/portrait', '/portrait/geometry', '/portrait-templates'],
    },
  },
  routes: [
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
    }
  ],
  menuItems: [
    {
      path: '/portrait',
      label: '人像设计',
      description: 'AI 角色人像设计与生成',
      icon: markRaw(User)
    }
  ],
  // 保持历史菜单顺序：知识库之前
  menuInsertBefore: '/knowledge-base'
}
