/**
 * R11 黑户道具 / RV 审读疑点闭环单测（天下捕快实跑修复 2026-09-21）
 * R11：状态切片里有 item、物品册查无此名 → 必须告警（告密信事故的直接回归用例）。
 * RV：wizard_state.reviewConflicts 登记的写后审读疑点必须进入 scanContradictions，
 * 且 conflictKey 与登记侧一致——否则门禁永远看不见，闭环断裂。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ db: {} as any }))
vi.mock('@core/database/database-manager.interface', () => ({ getCoreDatabaseManager: () => h.db }))

import { ConsistencyService } from '@core/platform/services/longwriting/graph/consistency.service'
import { conflictKey, formatReviewConflictMessage } from '@core/platform/services/longwriting/conflict-gate'

function fakeManager(over: Partial<Record<string, any>> = {}): any {
  return {
    lwEntityStates: { getByProjectId: async () => [], getLatestEntityState: async () => null },
    lwItems: { getByProjectId: async () => [] },
    lwCharacters: { getByProjectId: async () => [] },
    lwLocations: { getByProjectId: async () => [] },
    lwFactions: { getByProjectId: async () => [] },
    lwSkills: { getByProjectId: async () => [] },
    lwEvents: { getByProjectId: async () => [] },
    lwOutlines: { getByProjectId: async () => [] },
    lwForeshadows: { getByProjectId: async () => [], getByProjectAndStatus: async () => [] },
    lwChapters: { getByOutlineId: async () => null },
    lwProjects: { getById: async () => null },
    ...over,
  }
}

beforeEach(() => {
  ConsistencyService.resetInstance()
})

describe('R11 名册外黑户道具', () => {
  it('切片里有 item 而物品册没有 → 告警（告密信回归用例）', async () => {
    h.db = fakeManager({
      lwEntityStates: {
        getLatestEntityState: async () => null,
        getByProjectId: async () => [
          { entityType: 'item', entityName: '告密信', chapterNumber: 3, entityId: 'ghost_1', stateSummary: 'x', keyChanges: [] },
          { entityType: 'item', entityName: '告密信', chapterNumber: 5, entityId: 'ghost_1', stateSummary: 'y', keyChanges: [] },
        ],
      },
      lwItems: {
        getByProjectId: async () => [{ id: 'i1', name: '半枚玄铁令·沈家半枚', importance: 'main', description: 'x' }],
      },
    })
    const svc = ConsistencyService.getInstance(h.db)
    const all = await svc.scanContradictions('p1')
    const r11 = all.filter((c) => c.rule === 'R11')
    expect(r11).toHaveLength(1)
    expect(r11[0].entityName).toBe('告密信')
    expect(r11[0].chapterNumber).toBe(3)
    expect(r11[0].message).toContain('未登记进物品册')
  })

  it('在册道具（含去括号核心名命中）不告警', async () => {
    h.db = fakeManager({
      lwEntityStates: {
        getLatestEntityState: async () => null,
        getByProjectId: async () => [
          { entityType: 'item', entityName: '半枚玄铁令', chapterNumber: 2, entityId: 'i1', stateSummary: 'x', keyChanges: [] },
        ],
      },
      lwItems: {
        getByProjectId: async () => [{ id: 'i1', name: '半枚玄铁令·沈家半枚', importance: 'main', description: 'x' }],
      },
    })
    const svc = ConsistencyService.getInstance(h.db)
    const all = await svc.scanContradictions('p1')
    expect(all.filter((c) => c.rule === 'R11')).toHaveLength(0)
  })
})

describe('RV 写后审读疑点闭环', () => {
  it('wizard_state.reviewConflicts 进入扫描，且 conflictKey 可与登记侧互认', async () => {
    const entry = {
      key: '',
      message: '告密信来源翻转：上一章为裴知微袖中遗言信，本章写成周家密室搜出的伪造告密信',
      evidence: '那是从周家密室里搜出来的',
      why: '与前文事实冲突',
      chapterNumber: 4,
      at: 1,
    }
    entry.key = conflictKey({ rule: 'RV', message: formatReviewConflictMessage(entry), chapterNumber: 4 })
    h.db = fakeManager({
      lwProjects: {
        getById: async () => ({ id: 'p1', wizardState: { reviewConflicts: [entry] } }),
      },
    })
    const svc = ConsistencyService.getInstance(h.db)
    const all = await svc.scanContradictions('p1')
    const rv = all.filter((c) => c.rule === 'RV')
    expect(rv).toHaveLength(1)
    expect(rv[0].chapterNumber).toBe(4)
    expect(conflictKey(rv[0])).toBe(entry.key)
  })

  it('无登记时不产出 RV 疑点', async () => {
    h.db = fakeManager()
    const svc = ConsistencyService.getInstance(h.db)
    const all = await svc.scanContradictions('p1')
    expect(all.filter((c) => c.rule === 'RV')).toHaveLength(0)
  })
})
