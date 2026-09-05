/**
 * AI 对话内置业务包（后端接线）
 * @module core/packs/chat
 * @description 物理收拢式：chat/dialog/message/role 四个 handler 已搬入包目录
 *              （./handlers/），chat 专属的 ChatService 一并搬入（./services/chat.service）；
 *              本包在 activate 时调用各自的 register*Handlers()。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/chat）保持一致。
 *
 *              归属说明：chat（流式对话收发）、dialog（会话管理）、message（消息记录）、
 *              role（助手库/角色，仅服务 AI 对话业务）四个 handler 共 21 个 channel 全归本包。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 chat:/dialog:/message:/role: 四前缀"为止——
 *              handler 注册保留、服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer。
 */

import { registerChatHandlers } from './handlers/chat.handler'
import { registerDialogHandlers } from './handlers/dialog.handler'
import { registerMessageHandlers } from './handlers/message.handler'
import { registerRoleHandlers } from './handlers/role.handler'
import type { PackDefinition } from '../registry'

export const chatPack: PackDefinition = {
  manifest: {
    id: 'chat',
    name: 'AI 对话',
    version: '1.0.0',
    description: '与 AI 进行智能对话，支持多种大模型',
    contributions: {
      // chat.handler 2 个 + dialog.handler 7 个 + message.handler 6 个 + role.handler 6 个，共 21 个 channel
      ipcChannelPrefixes: ['chat:', 'dialog:', 'message:', 'role:'],
    },
  },
  activate() {
    registerChatHandlers()
    registerDialogHandlers()
    registerMessageHandlers()
    registerRoleHandlers()
  },
}
