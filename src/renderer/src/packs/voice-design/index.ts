/**
 * 声音设计业务包（前端骨架）
 * @module renderer/packs/voice-design
 * @description 原地登记式：本期只搬路由声明（该包无主菜单入口），
 *              组件文件原地不动（@/views/voice/VoiceDesign.vue）。
 *              episode-production 包依赖本包（跨包引用 VoiceCloneDialog，
 *              依赖关系在其 manifest 中显式声明）。
 */
import type { RendererPackDefinition } from '../registry'

export const voiceDesignPack: RendererPackDefinition = {
  manifest: {
    id: 'voice-design',
    name: '声音设计',
    version: '1.0.0',
    description: 'AI 声音设计与音色管理',
    contributions: {
      routePaths: ['/voice/design'],
    },
  },
  routes: [
    {
      path: '/voice/design',
      name: 'VoiceDesign',
      component: () => import('@/views/voice/VoiceDesign.vue'),
      meta: { title: '声音设计' },
    }
  ]
}
