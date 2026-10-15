/**
 * 声音设计内置业务包（后端）
 * @module core/packs/voice-design
 * @description 声音设计页（renderer /voice/design）的业务包。2026-10-15 起
 *              voice:* IPC 全家桶（TTS/STT/复刻/设计，voice.handler）与
 *              VoiceDesignService 迁回壳层（src/electron/ipc/handlers +
 *              @core/platform/services）——语音助手是平台能力，不随本包启停；
 *              本包不再声明 voice: 前缀（守卫对无归属前缀放行），
 *              activate 相应为空。manifest 与前端骨架保持一致。
 */

import type { PackDefinition } from '../registry'

export const voiceDesignPack: PackDefinition = {
  manifest: {
    id: 'voice-design',
    name: '声音设计',
    version: '1.0.0',
    description: 'AI 声音设计与音色管理',
  },
}
