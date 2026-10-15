/**
 * 能力工具业务包（前端骨架）
 * @module renderer/packs/capability
 * @description 图像生成 / 文档翻译 / 语音助手（TTS/STT/复刻）三个独立能力页的
 *              路由与菜单声明，组件文件原地不动
 *              （@/views/Image.vue、@/views/Translate.vue、@/views/voice/）。
 *
 *              2026-10-15 能力入口恢复：这三个功能在「阶段三菜单精简」时入口
 *              迁入应用模块（旧路由按应用名反查 redirect），独立页面随即作为
 *              死代码删除；现按需求恢复独立菜单与页面，app 包中的遗留重定向
 *              路由同步移除（真实页面取代 redirect）。
 *              语音助手沿用「父项 + 二级菜单」结构：子项在 menuSubmenus
 *              注册表（仅侧边栏悬停浮层消费），父项 /voice 重定向到 /voice/tts。
 */
import { markRaw } from 'vue'
import { Document, Headset, MagicStick, Microphone, Picture, Promotion } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const capabilityPack: RendererPackDefinition = {
  manifest: {
    id: 'capability',
    name: '能力工具',
    version: '1.0.0',
    description: '图像生成、文档翻译、语音助手等独立 AI 能力页',
    contributions: {
      routePaths: ['/image', '/translate', '/voice', '/voice/tts', '/voice/stt', '/voice/clone'],
    },
  },
  routes: [
    {
      path: '/image',
      name: 'ImagePage',
      component: () => import('@/views/Image.vue'),
      meta: { title: '图像生成', keepAlive: true },
    },
    {
      path: '/translate',
      name: 'Translate',
      component: () => import('@/views/Translate.vue'),
      meta: { title: '文档翻译', keepAlive: true },
    },
    // /voice 父入口：纯分组项（子菜单见 menuSubmenus），点击落在文本转语音
    { path: '/voice', redirect: '/voice/tts' },
    {
      path: '/voice/tts',
      name: 'VoiceTTS',
      component: () => import('@/views/voice/VoiceTTS.vue'),
      meta: { title: '语音助手' },
    },
    {
      path: '/voice/stt',
      name: 'VoiceSTT',
      component: () => import('@/views/voice/VoiceSTT.vue'),
      meta: { title: '语音助手' },
    },
    {
      path: '/voice/clone',
      name: 'VoiceClone',
      component: () => import('@/views/voice/VoiceClone.vue'),
      meta: { title: '语音助手' },
    },
  ],
  menuItems: [
    {
      path: '/image',
      label: '图像生成',
      description: '使用 AI 生成创意图像',
      icon: markRaw(Picture),
    },
    {
      path: '/translate',
      label: '文档翻译',
      description: '智能翻译多种语言文档',
      icon: markRaw(Document),
    },
    {
      path: '/voice',
      label: '语音助手',
      description: '语音识别与语音合成',
      icon: markRaw(Microphone),
    },
  ],
  // 二级菜单：独立注册表，仅侧边栏悬停浮层消费（与 longwriting 同模式）
  menuSubmenus: {
    '/voice': [
      { path: '/voice/tts', label: '文本转语音', icon: markRaw(Promotion) },
      { path: '/voice/stt', label: '语音转文本', icon: markRaw(Headset) },
      { path: '/voice/clone', label: '语音复刻', icon: markRaw(MagicStick) },
    ],
  },
  // 保持菜单位置：AI对话之后（锚 '/knowledge-base'；与 the-chat-bot 分支口径一致，
  // 注册位置须在 chat 包之后、portrait 包之前）
  menuInsertBefore: '/knowledge-base',
}
