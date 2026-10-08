/**
 * 信息搜集（正式包）
 * @module renderer/packs/info-collection
 * @description 任意主题的信息搜集：项目列表 + 创建向导（AI 起草蓝图，快速/精调双模式）
 *              + 项目详情（任务进度 / 待审工作台 / 结构化条目浏览）。
 *              数据全链路走 ic: IPC（preload.infoCollection）。
 */
import { markRaw } from 'vue'
import { Collection } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const infoCollectionPack: RendererPackDefinition = {
  manifest: {
    id: 'info-collection',
    name: '信息搜集',
    version: '0.1.0',
    description: '任意主题的条目级、带溯源、可增量刷新的研究资料库（落知识库复用）',
    contributions: {
      routePaths: ['/info-collection', '/info-collection/:id'],
    },
  },
  routes: [
    {
      path: '/info-collection',
      name: 'InfoCollectionHome',
      component: () => import('@/views/info-collection/InfoCollectionHome.vue'),
      meta: { title: '信息搜集' },
    },
    {
      path: '/info-collection/:id',
      name: 'InfoCollectionProject',
      // 不开 keepAlive：参数路由共用组件实例（切项目不重挂），且组件无 defineOptions 名，
      // include 从未匹配上——缓存是假的；关掉后 onMounted/onBeforeUnmount 生命周期干净。
      component: () => import('@/views/info-collection/InfoCollectionProject.vue'),
      meta: { title: '搜集项目' },
    },
  ],
  menuItems: [
    {
      path: '/info-collection',
      label: '信息搜集',
      description: '任意主题的带溯源研究资料库——搜集、整理、入库一体',
      icon: markRaw(Collection),
    },
  ],
  menuInsertBefore: '/knowledge-base',
}
