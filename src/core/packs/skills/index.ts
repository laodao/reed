/**
 * 技能库内置业务包（后端接线）
 * @module core/packs/skills
 * @description 原地登记式：handler 文件原地不动（@electron/ipc/handlers/skill.handler），
 *              本包只在 activate 时调用其 registerSkillHandlers()。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/skills）保持一致。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 skill:*"为止——handler 注册保留、
 *              服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer。
 */

import { registerSkillHandlers } from '@electron/ipc/handlers/skill.handler'
import type { PackDefinition } from '../registry'

export const skillsPack: PackDefinition = {
  manifest: {
    id: 'skills',
    name: '技能库',
    version: '1.0.0',
    description: 'AI 技能包管理——内置预置 + 自定义技能',
    contributions: {
      // skill.handler.ts 全部 9 个 channel 均为 skill:* 前缀
      ipcChannelPrefixes: ['skill:'],
    },
  },
  activate() {
    registerSkillHandlers()
  },
}
