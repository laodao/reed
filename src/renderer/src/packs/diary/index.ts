/**
 * 日记业务包（前端骨架）
 * @module renderer/packs/diary
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/Diary.vue）。
 */
import { markRaw } from 'vue'
import { Notebook } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const diaryPack: RendererPackDefinition = {
  manifest: {
    id: 'diary',
    name: '日记',
    version: '1.0.0',
    description: '智能日记记录与管理',
    contributions: {
      routePaths: ['/diary'],
    },
  },
  routes: [
    {
      path: '/diary',
      name: 'Diary',
      component: () => import('@/views/Diary.vue'),
      meta: {
        keepAlive: true,
        title: '日记'
      }
    }
  ],
  menuItems: [
    {
      path: '/diary',
      label: '日记',
      description: '智能日记记录与管理',
      icon: markRaw(Notebook)
    }
  ],
  // 保持历史菜单顺序：应用之后、资产管理之前
  menuInsertBefore: '/assets'
}
