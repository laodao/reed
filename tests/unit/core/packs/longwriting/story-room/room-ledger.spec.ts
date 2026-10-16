/**
 * 共识账本治理（六扇门复盘）单测
 *
 * 钉死：提取器输出的 confirmed 被钳制为 tentative（confirmed 是用户操作专属）；
 * title/points 超长截断；用户明确提出内容目标时 target 变更落状态 + 发事件；
 * 主编建议不算（不输出 target 就不动状态）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import type { RoomWorkspaceState } from '@shared/types/story-room.types'
import { defaultRoomState } from '@shared/types/story-room.types'
import { silentExtractLedger } from '@core/packs/longwriting/story-room/room-ledger'
import { generateRoomText } from '@core/packs/longwriting/story-room/room-llm'

vi.mock('@core/packs/longwriting/story-room/room-llm', () => ({
  generateRoomText: vi.fn(async () => '{"entries":[]}'),
}))

const mockedGenerate = vi.mocked(generateRoomText)

interface CapturedEvent {
  channel: string
  event: { type: string; [k: string]: unknown }
}

function installEventCapture(): CapturedEvent[] {
  const captured: CapturedEvent[] = []
  registerEventEmitter(() => ({
    emit: (channel: string, event: unknown) => {
      captured.push({ channel, event: event as { type: string } })
    },
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  } as never))
  return captured
}

/** 内存房间状态 db（lwProjects.getById/update 语义同 room-state 消费方） */
function mkDb(state: Partial<RoomWorkspaceState>): { db: any; getState: () => RoomWorkspaceState } {
  let current: RoomWorkspaceState = { ...defaultRoomState(), ...state }
  const db = {
    lwProjects: {
      getById: async () => ({ wizardState: { room: current } }),
      update: async (_id: string, patch: { wizardState: Record<string, unknown> }) => {
        current = patch.wizardState.room as RoomWorkspaceState
        return { id: _id }
      },
    },
  }
  return { db, getState: () => current }
}

beforeEach(() => {
  mockedGenerate.mockClear()
  mockedGenerate.mockImplementation(async () => '{"entries":[]}')
})

describe('silentExtractLedger 治理钳制', () => {
  it('提取器输出的 confirmed 钳制为 tentative（confirmed 是用户操作专属）', async () => {
    const { db } = mkDb({})
    mockedGenerate.mockImplementation(async () => JSON.stringify({
      entries: [
        { op: 'add', kind: 'world', title: '背景定为民国上海', status: 'confirmed', points: [] },
        { op: 'add', kind: 'world', title: '保留宋代被否', status: 'rejected', points: ['现代心算不过账房'] },
      ],
    }))
    const ledger = await silentExtractLedger(db, 'p1', { userText: 'u', assistantText: 'a', turnNo: 1 })
    expect(ledger).not.toBeNull()
    const confirmed = ledger!.find((e) => e.title === '背景定为民国上海')
    const rejected = ledger!.find((e) => e.title === '保留宋代被否')
    expect(confirmed?.status).toBe('tentative')
    expect(rejected?.status).toBe('rejected')
  })

  it('超长 title/points 截断（防过程叙事膨胀）', async () => {
    const { db } = mkDb({})
    const longTitle = '边'.repeat(80)
    mockedGenerate.mockImplementation(async () => JSON.stringify({
      entries: [{ op: 'add', kind: 'plot', title: longTitle, status: 'tentative', points: ['点'.repeat(60), '短点'] }],
    }))
    const ledger = await silentExtractLedger(db, 'p1', { userText: 'u', assistantText: 'a', turnNo: 2 })
    const entry = ledger!.find((e) => e.title.startsWith('边'))
    expect(entry!.title.length).toBe(40)
    expect(entry!.points[0].length).toBe(40)
  })

  it('用户明确提出短剧 → contentTarget 落状态 + target:changed 事件', async () => {
    const captured = installEventCapture()
    const { db, getState } = mkDb({ contentTarget: 'novel' })
    mockedGenerate.mockImplementation(async () => JSON.stringify({ entries: [], target: 'script' }))
    await silentExtractLedger(db, 'p1', { userText: '我的目标是最终要做成短剧', assistantText: 'a', turnNo: 3 })
    expect(getState().contentTarget).toBe('script')
    expect(captured.some((c) => c.event.type === 'target:changed' && c.event.target === 'script')).toBe(true)
  })

  it('target 与当前一致 / 提取器未输出 → 状态不动', async () => {
    const captured = installEventCapture()
    const { db, getState } = mkDb({ contentTarget: 'script' })
    mockedGenerate.mockImplementation(async () => JSON.stringify({ entries: [], target: 'script' }))
    await silentExtractLedger(db, 'p1', { userText: 'u', assistantText: 'a', turnNo: 4 })
    expect(getState().contentTarget).toBe('script')
    expect(captured.some((c) => c.event.type === 'target:changed')).toBe(false)
  })
})
