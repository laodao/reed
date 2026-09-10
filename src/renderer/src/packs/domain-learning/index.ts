/**
 * 领域共学空间（正式包）
 * @module renderer/packs/domain-learning
 * @description 围绕一个领域系统研究并教到你懂：空间列表页 + 三栏学习空间页
 *              （左概念图/中讲义/右追问）+ 知识全景。数据全链路走 dl: IPC
 *              （列表/聚合视图/图谱/掌握度推进/研究·追问 Agent）。
 */
import { markRaw } from 'vue'
import { Reading } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const domainLearningPack: RendererPackDefinition = {
  manifest: {
    id: 'domain-learning',
    name: '领域学习',
    version: '0.1.0',
    description: '领域共学空间——围绕一个领域系统研究并教到你懂',
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
      // keepAlive：本地展示态（当前概念/树展开/任务流水）在组件实例内，空间 ↔ 全景往返不丢
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
      description: '领域共学空间——围绕一个领域系统研究并教到你懂',
      icon: markRaw(Reading),
    },
  ],
  menuInsertBefore: '/knowledge-base',
}
