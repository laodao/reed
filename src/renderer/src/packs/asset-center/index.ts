/**
 * 资产中心业务包（前端骨架）
 * @module renderer/packs/asset-center
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/asset/）。
 */
import { markRaw } from 'vue'
import { Collection } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const assetCenterPack: RendererPackDefinition = {
  manifest: {
    id: 'asset-center',
    name: '资产管理',
    version: '1.0.0',
    description: '工作流成果统一沉淀——按分类查看、预览、复用',
    contributions: {
      routePaths: ['/assets'],
    },
  },
  routes: [
    {
      path: '/assets',
      name: 'AssetCenter',
      component: () => import('@/views/asset/AssetCenter.vue'),
      // 不缓存：资产实时变化（工作流随时保存新资产），每次进入取最新数据
      meta: { title: '资产管理' },
    },
  ],
  menuItems: [
    {
      path: '/assets',
      label: '资产管理',
      description: '工作流成果统一沉淀——按分类查看、预览、复用',
      icon: markRaw(Collection),
    },
  ],
  // 无 menuInsertBefore：注册顺序保证其位于应用之后（见 renderer/packs/index.ts）
}
