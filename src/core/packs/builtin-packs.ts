/**
 * 内置业务包清单（双端共用）
 * @module core/packs/builtin-packs
 * @description 现有业务"原地登记式"迁移为内置包的登记处：Electron（src/electron/index.ts）
 *              与 Web（src/web/server/index.ts）启动时把它交给 initPackSubsystem()，
 *              由包内核统一注册/激活（IPC handler 在包 activate 时登记，替代原先的
 *              initIpcHandlers()/registerAllWebChannels() 平铺调用）。
 *
 *              批次记录：
 *              - P4 第一批：skills / diary / portrait（最薄的三个，handler 零改动迁移）。
 *              - P4 第二批：chat（chat/dialog/message/role 四 handler）/ voice-design（voice）。
 *              - P4 第三批：longwriting（longwriting.handler 单文件 202 个 channel）。
 *              后续批次（episode-production）继续在此追加。
 */

import type { PackDefinition } from './registry'
import { skillsPack } from './skills'
import { diaryPack } from './diary'
import { portraitPack } from './portrait'
import { chatPack } from './chat'
import { voiceDesignPack } from './voice-design'
import { longwritingPack } from './longwriting'

export const builtinPacks: PackDefinition[] = [
  skillsPack,
  diaryPack,
  portraitPack,
  chatPack,
  voiceDesignPack,
  longwritingPack,
]
