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
import { planConflictResolution, executeConflictAction, type ConflictInput } from './room-conflict'
import { acknowledgeConflict, unacknowledgeConflict } from '@core/platform/services/longwriting/conflict-gate'
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
  ROOM_DESIGN_CONFIRM: 'longwriting:room:designConfirm',
  ROOM_DESIGN_DISCARD: 'longwriting:room:designDiscard',
} as const

export function registerStoryRoomHandlers(): void {
  ipcBridge.handle(ROOM_CHANNELS.ROOM_SEND, async (_event, projectId: string, message: string, opts?: { providerConfigId?: string; modelId?: string }) => {
    try {
      const modelOpts = await resolveRoomModelOpts(projectId, opts)
      const result = await StoryRoomSessionService.getInstance().sendMessage(projectId, message, modelOpts)
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

  // ==================== 设计包（46 号：长程任务产物整体确认制） ====================

  ipcBridge.handle(ROOM_CHANNELS.ROOM_DESIGN_CONFIRM, async (_event, projectId: string, packageId: string, itemIds?: string[]) => {
    try {
      const { confirmDesignPackage } = await import('./room-design')
      const r = await confirmDesignPackage(getDb(), projectId, packageId, itemIds)
      const state = await StoryRoomSessionService.getInstance().getState(projectId)
      return { success: true, data: { ...r, state } }
    } catch (error: any) {
      console.error('[StoryRoomHandler] design:confirm 失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle(ROOM_CHANNELS.ROOM_DESIGN_DISCARD, async (_event, projectId: string, packageId: string) => {
    try {
      const { discardDesignPackage } = await import('./room-design')
      await discardDesignPackage(getDb(), projectId, packageId)
      const state = await StoryRoomSessionService.getInstance().getState(projectId)
      return { success: true, data: { state } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ==================== 故事圣经统一读模型（P0） ====================

  ipcBridge.handle('longwriting:bible:list', async (_event, projectId: string) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      const { getRoomState } = await import('./room-state')
      let roomCards: Array<Record<string, any>> = []
      try {
        roomCards = (await getRoomState(getDb(), projectId)).pendingCards as never
      } catch { /* 无房间状态视为空 */ }
      return { success: true, data: await BibleQueryService.getInstance().list(projectId, { roomCards }) }
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

  ipcBridge.handle('longwriting:bible:progression', async (_event, projectId: string, kindKey: string, id: string) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().progression(projectId, kindKey, id) }
    } catch (error: any) {
      console.error('[StoryRoomHandler] bible:progression 失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:foreshadow:status', async (_event, _projectId: string, id: string, status: 'open' | 'paid' | 'dropped', payoffChapter?: number | null) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().setForeshadowStatus(id, status, payoffChapter) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:custom:create', async (_event, projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: Record<string, unknown>, parentId?: string | null) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().customCreate(projectId, kindKey, name, fields, origin as never, parentId) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:custom:update', async (_event, projectId: string, id: string, patch: { name?: string; fields?: Record<string, unknown> | null; parentId?: string | null }) => {
    try {
      const { BibleQueryService } = await import('@core/platform/services/longwriting/bible.service')
      return { success: true, data: await BibleQueryService.getInstance().customUpdate(projectId, id, patch) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcBridge.handle('longwriting:bible:custom:delete', async (_event, _projectId: string, id: string) => {
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

  const DISTILL_SCOPES = ['overview', 'characters', 'plots', 'world', 'outline', 'chapter', 'foreshadow']

  ipcBridge.handle('longwriting:room:conflict:plan', async (_event, projectId: string, conflict: ConflictInput, opts?: { providerConfigId?: string; modelId?: string }) => {
    try {
      const modelOpts = await resolveRoomModelOpts(projectId, opts)
      const db = getCoreDatabaseManager()
      const r = await planConflictResolution(db, projectId, conflict, modelOpts)
      return r.ok ? { success: true, data: r.plan } : { success: false, error: r.error || '解题失败' }
    } catch (error: any) {
      console.error('[StoryRoomHandler] conflict:plan 失败:', error)
      return { success: false, error: error.message }
    }
  })
  ipcBridge.handle('longwriting:room:conflict:execute', async (_event, projectId: string, action: string, payload: Record<string, unknown>) => {
    try {
      const db = getCoreDatabaseManager()
      const conflict = (payload?.conflict || null) as ConflictInput | null
      // 知情保留：作者显式确认保留该疑点（如续篇钩子类伏笔），登记后不再拦截
      if (action === 'acknowledge_conflict' && conflict) {
        await acknowledgeConflict(db, projectId, conflict, 'kept', String(payload?.note || ''))
        return { success: true, data: { message: '已知情保留，该疑点不再拦截生成' } }
      }
      // 撤销保留：保留记录只进不出会让误保留无法回退——按锚点语义移除登记
      if (action === 'unacknowledge_conflict' && conflict) {
        const removed = await unacknowledgeConflict(db, projectId, conflict)
        return removed > 0
          ? { success: true, data: { message: '已撤销保留，该疑点恢复拦截' } }
          : { success: false, error: '未找到对应的保留记录' }
      }
      const r = await executeConflictAction(db, projectId, action, payload)
      // 受控动作成功 → 源疑点自动登记为已解决（逐章门禁据此放行）
      if (r.ok && conflict) await acknowledgeConflict(db, projectId, conflict, 'resolved', r.message)
      return { success: r.ok, data: { message: r.message }, error: r.ok ? undefined : r.message }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  ipcBridge.handle(ROOM_CHANNELS.ROOM_DISTILL, async (_event, projectId: string, scope: string, opts?: { providerConfigId?: string; modelId?: string }) => {
    try {
      if (scope.startsWith('kind:')) {
        // 动态分类：key 必须存在于 lw_bible_kinds
        const kind = await getDb().lwBibleKinds?.getByKey(scope.slice(5))
        if (!kind) return { success: false, error: `未知的设定分类：${scope}` }
      } else if (!DISTILL_SCOPES.includes(scope)) {
        return { success: false, error: `未知的提炼范围：${scope}` }
      }
      const modelOpts = await resolveRoomModelOpts(projectId, opts)
      const result = await StoryRoomDistillerService.getInstance().distill(projectId, scope as never, modelOpts)
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

/**
 * 默认模型治理（评审实测 400 根因）：无显式模型时回退项目阶段配置
 * （story-room → overview → chapter → 首行），绝不落到 provider 默认
 * （可能是嵌入/多媒体端点——"input.contents" 400 教训）。
 */
async function resolveRoomModelOpts(projectId: string, opts?: { providerConfigId?: string; modelId?: string }): Promise<{ providerConfigId?: string; modelId?: string }> {
  if (opts?.providerConfigId && opts?.modelId) return opts
  try {
    const configs = (await getDb().lwProjectModelConfigs?.getByProjectId(projectId)) || []
    const pick = (stage: string) => configs.find((c: any) => c.stage === stage)
    const hit = pick('story-room') || pick('overview') || pick('chapter') || configs[0]
    if (hit?.providerConfigId && hit?.modelId) {
      return { providerConfigId: hit.providerConfigId, modelId: hit.modelId }
    }
  } catch { /* 配置读取失败 → 原样返回，由宿主默认兜底 */ }
  return opts || {}
}
