/**
 * 技能库业务包（前端骨架）
 * @module renderer/packs/skills
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/skills/）。
 */
import { markRaw } from 'vue'
import { MagicStick } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const skillsPack: RendererPackDefinition = {
  manifest: {
    id: 'skills',
    name: '技能库',
    version: '1.0.0',
    description: 'AI 技能包管理——内置预置 + 自定义技能',
    contributions: {
      routePaths: ['/skills'],
    },
  },
  routes: [
    {
      path: '/skills',
      name: 'SkillLibrary',
      component: () => import('@/views/skills/SkillLibrary.vue'),
      // 不缓存：技能实时变化（导入/新建/复制后立即可见）
      meta: { title: '技能库' },
    }
  ],
  menuItems: [
    {
      path: '/skills',
      label: '技能库',
      description: 'AI 技能包管理——内置预置 + 自定义技能，工作流「技能调用」节点使用',
      icon: markRaw(MagicStick)
    }
  ]
  // 无 menuInsertBefore：历史上技能库排在主菜单末尾，追加即可
}
