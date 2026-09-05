/**
 * 声音设计内置业务包（后端接线）
 * @module core/packs/voice-design
 * @description 物理收拢式：handler 已搬入包目录（./handlers/voice.handler），
 *              其专属的 VoiceDesignService 一并搬入（./services/voice-design.service）；
 *              VoiceService/VoiceCloneService 被剧集制作与 workflow 语音节点共用、
 *              VoiceCloneJobScheduler 被双端壳启动引用，均留在 @core/services 不搬。
 *              本包在 activate 时调用 registerVoiceHandlers()。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/voice-design）保持一致。
 *
 *              归属说明：voice.handler 一个文件承载语音全家桶（TTS/STT/复刻/设计），
 *              全部 20 个 channel 均为 voice:* 前缀。工作流语音节点复用 VoiceService 但
 *              不走 IPC，故 voice:* IPC 全归本包。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 voice:*"为止——handler 注册保留、
 *              服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer。
 */

import { registerVoiceHandlers } from './handlers/voice.handler'
import type { PackDefinition } from '../registry'

export const voiceDesignPack: PackDefinition = {
  manifest: {
    id: 'voice-design',
    name: '声音设计',
    version: '1.0.0',
    description: 'AI 声音设计与音色管理',
    contributions: {
      // voice.handler.ts 全部 20 个 channel 均为 voice:* 前缀
      ipcChannelPrefixes: ['voice:'],
    },
  },
  activate() {
    registerVoiceHandlers()
  },
}
