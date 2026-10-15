/**
 * 账本 agent 写机制单测（lw_update_ledger 机制层，用户拍板 2026-09-15）
 *
 * 钉死：条目定位规则（id 精确 → 标题归一化子串唯一；多命中不猜返回候选；
 * 找不到明确报错）；批量状态翻转原子性（任一 ref 定位失败整批不动）；
 * 新增条目规范化（status 缺省 confirmed、title/points 截断、同题查重）；
 * 手动翻转的 status 能扛住回合末静默提取（append-only，不重置既有 status）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import type { ConsensusEntry, RoomWorkspaceState } from '@shared/types/story-room.types'
import { defaultRoomState } from '@shared/types/story-room.types'
import {
  addLedgerEntry,
  ledgerStatusCounts,
  locateLedgerEntry,
  setLedgerEntriesStatus,
  silentExtractLedger,
} from '@core/packs/longwriting/story-room/room-ledger'
import { generateRoomText } from '@core/packs/longwriting/story-room/room-llm'

vi.mock('@core/packs/longwriting/story-room/room-llm', () => ({
  generateRoomText: vi.fn(async () => '{"entries":[]}'),
}))

const mockedGenerate = vi.mocked(generateRoomText)

function mkEntry(partial: Partial<ConsensusEntry> & { id: string }): ConsensusEntry {
  return {
    kind: 'premise',
    title: partial.id,
    points: [],
    status: 'tentative',
    sourceTurn: 1,
    updatedAt: 1,
    ...partial,
  }
}

function seedLedger(): ConsensusEntry[] {
  return [
    mkEntry({ id: 'ce_1_1_aaaa', kind: 'plot', title: '钩子方案A：悬念型开场', points: ['雨夜开局'], status: 'tentative', updatedAt: 100 }),
    mkEntry({ id: 'ce_1_2_bbbb', kind: 'plot', title: '钩子方案B：倒叙型开场', points: ['先给结局'], status: 'tentative', updatedAt: 101 }),
    mkEntry({ id: 'ce_2_1_cccc', kind: 'world', title: '森林是禁地', points: ['入者不归'], status: 'confirmed', updatedAt: 102 }),
  ]
}

beforeEach(() => {
  mockedGenerate.mockClear()
  mockedGenerate.mockImplementation(async () => '{"entries":[]}')
  registerEventEmitter(() => ({
    emit: () => undefined,
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  } as never))
})

describe('locateLedgerEntry 定位规则', () => {
  it('先按 id 精确匹配', () => {
    const ledger = seedLedger()
    const r = locateLedgerEntry(ledger, 'ce_1_2_bbbb')
    expect('entry' in r && r.entry.id).toBe('ce_1_2_bbbb')
  })

  it('id 未中再按标题唯一子串匹配', () => {
    const ledger = seedLedger()
    const r = locateLedgerEntry(ledger, '倒叙型')
    expect('entry' in r && r.entry.id).toBe('ce_1_2_bbbb')
  })

  it('标题匹配经 normalizeTitle（空白/标点差异不漏判）', () => {
    const ledger = [mkEntry({ id: 'ce_1_1_aaaa', title: '森林 是禁地，入者不归' })]
    const r = locateLedgerEntry(ledger, '森林是禁地')
    expect('entry' in r && r.entry.id).toBe('ce_1_1_aaaa')
  })

  it('命中多条不猜——返回候选（id/title/status）', () => {
    const ledger = seedLedger()
    const r = locateLedgerEntry(ledger, '钩子方案')
    expect('entry' in r).toBe(false)
    if (!('entry' in r)) {
      expect(r.reason).toBe('ambiguous')
      expect(r.candidates.map((c) => c.id)).toEqual(['ce_1_1_aaaa', 'ce_1_2_bbbb'])
      expect(r.candidates[0]).toEqual({ id: 'ce_1_1_aaaa', title: '钩子方案A：悬念型开场', status: 'tentative' })
    }
  })

  it('找不到明确返回 not-found', () => {
    const r = locateLedgerEntry(seedLedger(), '不存在的条目')
    expect('entry' in r).toBe(false)
    if (!('entry' in r)) expect(r.reason).toBe('not-found')
  })
})

describe('setLedgerEntriesStatus 状态翻转', () => {
  it('翻转 status + 刷新 updatedAt，回执含前后状态', () => {
    const ledger = seedLedger()
    const r = setLedgerEntriesStatus(ledger, ['ce_1_1_aaaa'], 'rejected', 999)
    expect(r.failures).toEqual([])
    expect(r.updated).toEqual([{ id: 'ce_1_1_aaaa', title: '钩子方案A：悬念型开场', status: 'rejected', from: 'tentative' }])
    expect(r.ledger.find((e) => e.id === 'ce_1_1_aaaa')).toMatchObject({ status: 'rejected', updatedAt: 999 })
    // 其余条目不动（不可变更新）
    expect(r.ledger.find((e) => e.id === 'ce_1_2_bbbb')).toMatchObject({ status: 'tentative', updatedAt: 101 })
  })

  it('多 ref 混用 id/标题子串；同条目多 ref 去重', () => {
    const ledger = seedLedger()
    const r = setLedgerEntriesStatus(ledger, ['ce_1_1_aaaa', '方案A', '倒叙型'], 'confirmed', 1)
    expect(r.failures).toEqual([])
    expect(r.updated).toHaveLength(2)
    expect(r.ledger.find((e) => e.id === 'ce_1_2_bbbb')?.status).toBe('confirmed')
  })

  it('原子语义：任一 ref 定位失败整批不动', () => {
    const ledger = seedLedger()
    const r = setLedgerEntriesStatus(ledger, ['ce_1_1_aaaa', '没有这条'], 'rejected', 999)
    expect(r.failures).toEqual([{ ref: '没有这条', reason: 'not-found' }])
    expect(r.updated).toEqual([])
    expect(r.ledger).toBe(ledger) // 原样返回，未产生新数组
    expect(ledger.every((e) => e.updatedAt !== 999)).toBe(true)
  })

  it('原子语义：多命中（ambiguous）也整批不动并给候选', () => {
    const ledger = seedLedger()
    const r = setLedgerEntriesStatus(ledger, ['ce_1_1_aaaa', '钩子方案'], 'confirmed', 999)
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0].reason).toBe('ambiguous')
    if (r.failures[0].reason === 'ambiguous') {
      expect(r.failures[0].candidates).toHaveLength(2)
    }
    expect(r.updated).toEqual([])
  })

  it('status 等值翻转同样出回执（幂等重申不报错）', () => {
    const ledger = seedLedger()
    const r = setLedgerEntriesStatus(ledger, ['ce_2_1_cccc'], 'confirmed', 999)
    expect(r.failures).toEqual([])
    expect(r.updated).toEqual([{ id: 'ce_2_1_cccc', title: '森林是禁地', status: 'confirmed', from: 'confirmed' }])
  })
})

describe('addLedgerEntry 新增条目', () => {
  it('status 缺省 confirmed（用户拍板后补记），id 对齐 ce_<轮>_<序>_<时间尾> 风格', () => {
    const ledger = seedLedger()
    const r = addLedgerEntry(ledger, { kind: 'plot', title: '就用悬念型开场', points: ['用户拍板'] }, 3, 12345)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entry.status).toBe('confirmed')
      expect(r.entry.id).toMatch(/^ce_3_4_[0-9a-z]+$/)
      expect(r.entry.sourceTurn).toBe(3)
      expect(r.ledger).toHaveLength(4)
      expect(r.ledger[r.ledger.length - 1].id).toBe(r.entry.id)
    }
  })

  it('title>40 截断、points 最多 3 条各 40 字、kind 枚举外钳为 premise', () => {
    const r = addLedgerEntry(
      [],
      { kind: 'bogus' as never, title: '边'.repeat(80), points: ['点'.repeat(60), '乙', '丙', '丁'] },
      1,
      1,
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entry.title).toHaveLength(40)
      expect(r.entry.points).toHaveLength(3)
      expect(r.entry.points[0]).toHaveLength(40)
      expect(r.entry.kind).toBe('premise')
    }
  })

  it('同题（归一化后）查重拒绝并给出既有条目，账本不动', () => {
    const ledger = seedLedger()
    const r = addLedgerEntry(ledger, { kind: 'world', title: '森林，是禁地。', points: ['x'] }, 3, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('同题')
      expect(r.error).toContain('set-status')
      expect(r.duplicateOf?.id).toBe('ce_2_1_cccc')
    }
    expect(r.ledger).toBe(ledger)
  })

  it('显式 status=rejected 保留（补记被否方案）', () => {
    const r = addLedgerEntry([], { kind: 'tone', title: '不用倒叙', points: ['用户否了'], status: 'rejected' }, 2, 1)
    expect(r.ok && r.entry.status).toBe('rejected')
  })
})

describe('ledgerStatusCounts 计数', () => {
  it('confirmed/tentative/rejected 各多少', () => {
    expect(ledgerStatusCounts(seedLedger())).toEqual({ confirmed: 1, tentative: 2, rejected: 0 })
    expect(ledgerStatusCounts([])).toEqual({ confirmed: 0, tentative: 0, rejected: 0 })
  })
})

describe('手动翻转的 status 扛住回合末静默提取', () => {
  /** 内存房间状态 db（同 room-ledger.spec 的 mkDb） */
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

  it('手动 rejected 后提取器 append 新条目——已否决状态不被重置', async () => {
    const ledger = setLedgerEntriesStatus(seedLedger(), ['ce_1_1_aaaa'], 'rejected', 999).ledger
    const { db, getState } = mkDb({ ledger, turnNo: 2 })
    mockedGenerate.mockImplementation(async () =>
      JSON.stringify({ entries: [{ op: 'add', kind: 'plot', title: '新定的钩子方案C', status: 'tentative', points: [] }] }),
    )
    const result = await silentExtractLedger(db, 'p1', { userText: 'u', assistantText: 'a', turnNo: 3 })
    expect(result).not.toBeNull()
    expect(result!.find((e) => e.id === 'ce_1_1_aaaa')?.status).toBe('rejected')
    expect(result!.some((e) => e.title === '新定的钩子方案C')).toBe(true)
    expect(getState().ledger.find((e) => e.id === 'ce_1_1_aaaa')?.status).toBe('rejected')
  })

  it('既定语义（非重置）：提取器显式 conflict op 会把 manually-confirmed 降回 tentative', async () => {
    const ledger = setLedgerEntriesStatus(seedLedger(), ['ce_1_2_bbbb'], 'confirmed', 999).ledger
    const { db, getState } = mkDb({ ledger, turnNo: 2 })
    mockedGenerate.mockImplementation(async () => JSON.stringify({ entries: [{ op: 'conflict', conflictWith: '钩子方案B：倒叙型开场' }] }))
    await silentExtractLedger(db, 'p1', { userText: 'u', assistantText: 'a', turnNo: 3 })
    // 这是系统处理矛盾的既定行为（提取器明确报告推翻），不是回合末提炼对手动状态的覆盖；
    // rejected 条目任何情况下都不会被提取器改动（conflict 只降 confirmed）
    expect(getState().ledger.find((e) => e.id === 'ce_1_2_bbbb')?.status).toBe('tentative')
  })
})
