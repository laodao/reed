/**
 * 故事研讨室 v2.1 评审修复回归：room-state 写串行化（P1-1）+ 账本容量语义（P2-4）
 * @module tests/unit/core/packs/longwriting/story-room/room-state.spec
 */

import { describe, it, expect } from 'vitest'
import { patchRoomState } from '@core/packs/longwriting/story-room/room-state'
import { compactLedger } from '@core/packs/longwriting/story-room/room-ledger'

function makeDb(initialRoom: Record<string, unknown> = { turnNo: 0 }) {
  const project: any = { id: 'p1', name: 'x', type: 'story', stage: 'overview', progress: 0, wizardState: { room: initialRoom } }
  const writes: Array<Record<string, unknown>> = []
  const db = {
    lwProjects: {
      getById: async () => {
        // 让出事件循环，放大并发窗口
        await new Promise((r) => setTimeout(r, 5))
        return { ...project, wizardState: JSON.parse(JSON.stringify(project.wizardState)) }
      },
      update: async (_id: string, patch: any) => {
        project.wizardState = patch.wizardState
        writes.push(JSON.parse(JSON.stringify(patch.wizardState)))
        return { ...project }
      },
    },
    _writes: writes,
  }
  return db
}

describe('room-state 写串行化（评审 P1-1）', () => {
  it('并发 patch 严格串行：两次不同字段的 patch 都生效，互不覆盖', async () => {
    const db = makeDb({ turnNo: 0, ledger: [], summary: '' })
    // 模拟发送轮收尾 turnNo patch 与用户 ledger patch 并发
    const [a, b] = await Promise.all([
      patchRoomState(db, 'p1', { turnNo: 7 }),
      new Promise((resolve) =>
        setTimeout(() => resolve(patchRoomState(db, 'p1', { summary: '前情提要' })), 2),
      ) as Promise<any>,
    ])
    expect(a.turnNo).toBe(7)
    expect(b.summary).toBe('前情提要')
    const room = (db.lwProjects as any)._projects?.room ?? null
    void room
    const final = await patchRoomState(db, 'p1', {})
    expect(final.turnNo).toBe(7)
    expect(final.summary).toBe('前情提要')
  })
})

describe('账本容量语义（评审 P2-4，compactLedger 直测）', () => {
  const mk = (id: string, status: string, turn: number) =>
    ({ id, kind: 'premise', title: id, points: [], status, sourceTurn: turn, updatedAt: 1 }) as never

  it('超限先丢最老 tentative，tentative 丢尽才丢最老 rejected；confirmed 不动', () => {
    const confirmed = Array.from({ length: 8 }, (_, i) => mk(`cf${i}`, 'confirmed', i + 1))
    const ledger = [
      ...confirmed,
      mk('rj_old', 'rejected', 10),
      mk('rj_new', 'rejected', 11),
      mk('tn_old', 'tentative', 12),
      mk('tn_new', 'tentative', 13),
    ]
    // cap=10：budget = 10-8 = 2 → rest(4) 丢最老 2 条（两条 tentative），rejected 全保
    const out = compactLedger(ledger, 10)
    expect(out).toHaveLength(10)
    const ids = out.map((e) => e.id)
    expect(ids).toContain('rj_old')
    expect(ids).toContain('rj_new')
    expect(ids).not.toContain('tn_old')
    expect(ids).not.toContain('tn_new')
    confirmed.forEach((c) => expect(ids).toContain(c.id))
  })

  it('tentative 丢尽后才开始丢最老 rejected', () => {
    const confirmed = Array.from({ length: 8 }, (_, i) => mk(`cf${i}`, 'confirmed', i + 1))
    const ledger = [
      ...confirmed,
      mk('rj_old', 'rejected', 10),
      mk('rj_new', 'rejected', 11),
      mk('tn_old', 'tentative', 12),
      mk('tn_new', 'tentative', 13),
    ]
    // cap=9：budget=1 → 丢 3 个：tn_old、tn_new、rj_old（最老 rejected）
    const out = compactLedger(ledger, 9)
    const ids = out.map((e) => e.id)
    expect(ids).not.toContain('tn_old')
    expect(ids).not.toContain('tn_new')
    expect(ids).not.toContain('rj_old')
    expect(ids).toContain('rj_new')
  })

  it('confirmed 自身超过 cap 时不被挤出（budget 夹紧）', () => {
    const confirmed = Array.from({ length: 12 }, (_, i) => mk(`cf${i}`, 'confirmed', i + 1))
    const out = compactLedger([...confirmed, mk('tn1', 'tentative', 20)], 10)
    expect(out).toHaveLength(12) // confirmed 全保留，不强行凑 cap
  })
})
