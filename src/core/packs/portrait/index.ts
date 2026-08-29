/**
 * 人像设计内置业务包（后端接线）
 * @module core/packs/portrait
 * @description 原地登记式：handler 文件原地不动（@electron/ipc/handlers/portrait.handler），
 *              本包只在 activate 时调用其 registerPortraitHandlers()。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/portrait）保持一致。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 portrait:*"为止——handler 注册保留、
 *              服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer
 *              （handler 文件虽有 unregisterPortraitHandlers，但桥层 registerIpc 无对应
 *              移除能力，逆操作不完整，统一交给守卫拦截）。
 */

import { registerPortraitHandlers } from '@electron/ipc/handlers/portrait.handler'
import type { PackDefinition } from '../registry'

export const portraitPack: PackDefinition = {
  manifest: {
    id: 'portrait',
    name: '人像设计',
    version: '1.0.0',
    description: 'AI 角色人像设计与生成',
    contributions: {
      // portrait.handler.ts 全部 26 个 channel 均为 portrait:* 前缀
      ipcChannelPrefixes: ['portrait:'],
    },
  },
  activate() {
    registerPortraitHandlers()
  },
}
