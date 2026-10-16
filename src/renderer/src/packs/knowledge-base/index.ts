/**
 * 知识库业务包（前端骨架）
 * @module renderer/packs/knowledge-base
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动
 *              （@/views/KnowledgeBase.vue 及其 components/knowledge-base/**）。
 */
import { markRaw } from 'vue'
import { FolderOpened } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const knowledgeBasePack: RendererPackDefinition = {
  manifest: {
    id: 'knowledge-base',
    name: '知识库',
    version: '1.0.0',
    description: '个人知识管理与检索——文档解析/向量化/QA 库',
    contributions: {
      routePaths: ['/knowledge-base'],
    },
  },
  routes: [
    {
      path: '/knowledge-base',
      name: 'KnowledgeBase',
      component: () => import('@/views/KnowledgeBase.vue'),
      meta: {
        keepAlive: true,
        title: '知识库',
      },
    },
  ],
  menuItems: [
    {
      path: '/knowledge-base',
      label: '知识库',
      description: '个人知识管理与检索',
      icon: markRaw(FolderOpened),
    },
  ],
  // 无 menuInsertBefore：注册顺序保证其位于剧集制作之后（见 renderer/packs/index.ts）
}
