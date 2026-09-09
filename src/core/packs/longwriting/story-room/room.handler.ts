/**
 * 故事研讨室 IPC 通道（v2.1 M3）
 * @module core/packs/longwriting/story-room/room.handler
 *
 * 会话主循环 + 账本操作 + 阶段切换。全部 `longwriting:` 前缀（包守卫自动覆盖）。
 * 提炼/卡片采纳通道（distill/adoptCard/regenerateCard）随 M4 接入。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { StoryRoomSessionService } from './room-session'
import { StoryRoomDistillerService } from './room-distiller'
import { applyLedgerOp } from './room-ledger'
import type { RoomPhaseId } from '@shared/types/story-room.types'

export const ROOM_CHANNELS = {
  ROOM_SEND: 'longwriting:room:send',
  ROOM_HISTORY: 'longwriting:room:history',
  ROOM_STATE: 'longwriting:room:state',
  ROOM_CANCEL: 'longwriting:room:cancel',
  ROOM_LEDGER_UPDATE: 'longwriting:room:ledger:update',
  ROOM_SET_PHASE: 'longwriting:room:setPhase',
  ROOM_DISTILL: 'longwriting:room:distill',
  ROOM_ADOPT_CARD: 'longwriting:room:adoptCard',
  ROOM_REGENERATE_CARD: 'longwriting:room:regenerateCard',
  ROOM_IGNORE_CARD: 'longwriting:room:ignoreCard',
  ROOM_SET_TARGET: 'longwriting:room:setTarget',
} as const

export function registerStoryRoomHandlers(): void {
  ipcBridge.handle(ROOM_CHANNELS.ROOM_SEND, async (_event, projectId: string, message: string, opts?: { providerConfigId?: string; modelId?: string }) => {
    try {
      const result = await StoryRoomSessionService.getInstance().sendMessage(projectId, message, opts || {})
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[StoryRoomHandler] room:send 失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_HISTORY, async (_event, projectId: string) => {
    try {
      return { success: true, data: await StoryRoomSessionService.getInstance().getHistory(projectId) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_STATE, async (_event, projectId: string) => {
    try {
      return { success: true, data: await StoryRoomSessionService.getInstance().getState(projectId) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_CANCEL, async (_event, projectId: string) => {
    try {
      StoryRoomSessionService.getInstance().cancel(projectId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_LEDGER_UPDATE, async (_event, projectId: string, op: Parameters<typeof applyLedgerOp>[2]) => {
    try {
      const ledger = await applyLedgerOp(getDb(), projectId, op)
      return { success: true, data: { ledger } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 故事圣经统一读模型（P0） ====================

  ipcBridge.handle('longwriting:bible:list', async (_event, projectId: string) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().list(projectId) }
    } catch (error: any) {
      console.error('[StoryRoomHandler] bible:list 失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:detail', async (_event, projectId: string, kindKey: string, id: string) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().detail(projectId, kindKey, id) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:custom:create', async (_event, projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: Record<string, unknown>) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().customCreate(projectId, kindKey, name, fields, origin as never) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:custom:update', async (_event, _projectId: string, id: string, patch: { name?: string; fields?: Record<string, unknown> | null }) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().customUpdate(projectId, id, patch) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:custom:delete', async (_event, projectId: string, id: string) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().customDelete(id) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_SET_TARGET, async (_event, projectId: string, target: 'novel' | 'script') => {
    try {
      if (target !== 'novel' && target !== 'script') {
        return { success: false, error: `未知的内容目标：${target}` }
      }
      const { patchRoomState } = await import('./room-state')
      await patchRoomState(getDb(), projectId, { contentTarget: target })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_SET_PHASE, async (_event, projectId: string, phase: RoomPhaseId) => {
    try {
      return { success: true, data: await StoryRoomSessionService.getInstance().setPhase(projectId, phase) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 提炼与卡片闭环（M4） ====================

  const DISTILL_SCOPES = ['overview', 'characters', 'plots', 'world', 'outline', 'chapter']

  ipcBridge.handle(ROOM_CHANNELS.ROOM_DISTILL, async (_event, projectId: string, scope: string, opts?: { providerConfigId?: string; modelId?: string }) => {
    try {
      if (scope.startsWith('kind:')) {
        // 动态分类：key 必须存在于 lw_bible_kinds
        const kind = await getDb().lwBibleKinds?.getByKey(scope.slice(5))
        if (!kind) return { success: false, error: `未知的设定分类：${scope}` }
      } else if (!DISTILL_SCOPES.includes(scope)) {
        return { success: false, error: `未知的提炼范围：${scope}` }
      }
      const result = await StoryRoomDistillerService.getInstance().distill(projectId, scope as never, opts || {})
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[StoryRoomHandler] room:distill 失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_ADOPT_CARD, async (_event, projectId: string, cardId: string, patch?: Record<string, any>) => {
    try {
      const card = await StoryRoomDistillerService.getInstance().adoptCard(projectId, cardId, patch)
      return { success: true, data: { card } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_REGENERATE_CARD, async (_event, projectId: string, cardId: string, feedback: string, opts?: { providerConfigId?: string; modelId?: string }) => {
    try {
      const result = await StoryRoomDistillerService.getInstance().regenerateCard(projectId, cardId, feedback, opts || {})
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_IGNORE_CARD, async (_event, projectId: string, cardId: string) => {
    try {
      const card = await StoryRoomDistillerService.getInstance().ignoreCard(projectId, cardId)
      return { success: true, data: { card } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

function getDb(): any {
  return getCoreDatabaseManager()
}
