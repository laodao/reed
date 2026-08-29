/**
 * 日记内置业务包（后端接线）
 * @module core/packs/diary
 * @description 原地登记式：handler 文件原地不动（@electron/ipc/handlers/diary.handler），
 *              本包只在 activate 时调用其 registerDiaryHandlers()。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/diary）保持一致。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 diary:*"为止——handler 注册保留、
 *              服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer。
 */

import { registerDiaryHandlers } from '@electron/ipc/handlers/diary.handler'
import type { PackDefinition } from '../registry'

export const diaryPack: PackDefinition = {
  manifest: {
    id: 'diary',
    name: '日记',
    version: '1.0.0',
    description: '智能日记记录与管理',
    contributions: {
      // diary.handler.ts 全部 16 个 channel 均为 diary:* 前缀
      ipcChannelPrefixes: ['diary:'],
    },
  },
  activate() {
    registerDiaryHandlers()
  },
}
