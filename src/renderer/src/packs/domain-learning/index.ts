/**
 * 领域共学空间（前端原型）
 * @module renderer/packs/domain-learning
 * @description 界面原型：主题列表页 + 三栏学习空间页（左概念图/中讲义/右追问 + 知识全景）。
 *              样例数据本地填充（原型界面，后端业务未接入）。
 */
import { markRaw } from 'vue'
import { Reading } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const domainLearningPack: RendererPackDefinition = {
  manifest: {
    id: 'domain-learning',
    name: '领域学习',
    version: '0.0.3',
    description: '领域共学空间（界面原型）——多主题列表 + 三栏学习空间 + 知识全景',
    contributions: {
      routePaths: ['/domain-learning', '/domain-learning/:id', '/domain-learning/:id/atlas'],
    },
  },
  routes: [
    {
      path: '/domain-learning',
      name: 'DomainLearningHome',
      component: () => import('@/views/domain-learning/DomainLearningHome.vue'),
      meta: { title: '领域学习' },
    },
    {
      path: '/domain-learning/:id',
      name: 'DomainLearningSpace',
      component: () => import('@/views/domain-learning/DomainLearningSpace.vue'),
      // keepAlive：学习进度/追问在组件实例内，空间 ↔ 全景往返不丢（组件同名匹配缓存）
      meta: { title: '领域学习空间', keepAlive: true },
    },
    {
      path: '/domain-learning/:id/atlas',
      name: 'DomainLearningAtlas',
      component: () => import('@/views/domain-learning/DomainAtlas.vue'),
      meta: { title: '知识全景', keepAlive: true },
    },
  ],
  menuItems: [
    {
      path: '/domain-learning',
      label: '领域学习',
      description: '领域共学空间（原型）——围绕一个领域系统研究并教到你懂',
      icon: markRaw(Reading),
    },
  ],
  menuInsertBefore: '/knowledge-base',
}
