/**
 * lw_update_ledger（写共识账本）+ lw_query_ledger 审计单测（用户拍板 2026-09-15）
 *
 * 走真实注册表管线（zod 校验/序列化同线上）：断言
 * - set-status：id / 唯一标题子串定位翻转；多命中返回候选不猜；找不到报错附全账本索引；
 *   回执由代码生成（updated[] {id,title,status} + counts + total）；
 * - add：补记新条目（缺省 confirmed、sourceTurn 对齐轮次口径 turnNo+1）；同题拒绝；
 * - 写后发 ledger:update 事件（「讨论成果」面板的事件驱动刷新源）；
 * - lw_query_ledger 返回 entries[]（id/kind/status/title）+ counts，供改条目前定位。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import type { ConsensusEntry, RoomWorkspaceState } from '@shared/types/story-room.types'
import { defaultRoomState } from '@shared/types/story-room.types'
import { registerLwRoomTools } from '@core/packs/longwriting/story-room/room-agent-tools'

vi.mock('@core/database/database-manager.interface', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCoreDatabaseManager: () => (globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb,
}))

function seedLedger(): ConsensusEntry[] {
  return [
    { id: 'ce_1_1_aaaa', kind: 'plot', title: '钩子方案A：悬念型开场', points: ['雨夜开局'], status: 'tentative', sourceTurn: 1, updatedAt: 100 },
    { id: 'ce_1_2_bbbb', kind: 'plot', title: '钩子方案B：倒叙型开场', points: ['先给结局'], status: 'tentative', sourceTurn: 1, updatedAt: 101 },
    { id: 'ce_2_1_cccc', kind: 'world', title: '森林是禁地', points: ['入者不归'], status: 'confirmed', sourceTurn: 2, updatedAt: 102 },
  ]
}

/** 内存房间状态 db（lwProjects.getById/update 语义 = mutateWizardState 消费口径） */
function mkFakeDb(ledger: ConsensusEntry[], turnNo = 2): { db: any; getState: () => RoomWorkspaceState } {
  let current: RoomWorkspaceState = { ...defaultRoomState(), ledger, turnNo }
  const db = {
    lwProjects: {
      getById: async () => ({ id: 'p1', wizardState: { room: current } }),
      update: async (id: string, patch: { wizardState: Record<string, unknown> }) => {
        current = patch.wizardState.room as RoomWorkspaceState
        return { id }
      },
    },
  }
  return { db, getState: () => current }
}

// ==================== 装配（同 room-read-tools.spec 的管线口径） ====================

let fake: { db: any; getState: () => RoomWorkspaceState }

function getTool(name: string): AgentToolDef {
  const registry = new AgentToolRegistry()
  registerLwRoomTools(registry)
  const defs = registry.buildToolDefs([{ tool: name } as never])
  const def = defs[name]
  if (!def) throw new Error(`工具未注册：${name}`)
  return def
}

const ctx = { logContext: { projectId: 'p1' } } as never

/** 注册表包装层：管线成功时把工具原始返回包在 outer.data；管线自身失败（zod 校验/
 * 超时等）直接 outer.ok=false + error code（不包 data）——两种信封都要解 */
async function run(name: string, input: unknown) {
  const outer = (await getTool(name).execute(input, ctx)) as {
    ok?: boolean
    data?: Record<string, unknown>
    error?: unknown
    detail?: unknown
    hint?: unknown
  }
  if (outer.ok === false) {
    return {
      ok: false,
      data: {} as Record<string, unknown>,
      error: String(outer.detail ?? outer.hint ?? outer.error ?? ''),
    }
  }
  const raw = (outer.data ?? {}) as { ok?: boolean; data?: Record<string, unknown>; error?: unknown }
  return {
    ok: raw.ok !== false,
    data: (raw.data ?? {}) as Record<string, unknown>,
    error: typeof raw.error === 'string' ? raw.error : String(raw.error ?? ''),
  }
}

beforeEach(() => {
  fake = mkFakeDb(seedLedger())
  ;(globalThis as unknown as { __lwRoomFakeDb?: unknown }).__lwRoomFakeDb = fake.db
  captured.length = 0
  registerEventEmitter(() => ({
    emit: (channel: string, event: unknown) => {
      captured.push({ channel, event: event as { type: string } })
    },
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  } as never))
})

const captured: Array<{ channel: string; event: { type: string; [k: string]: unknown } }> = []

describe('lw_update_ledger set-status', () => {
  it('按 id 翻转：回执（updated/counts/total）由代码生成，db 落盘并发 ledger:update', async () => {
    const r = await run('lw_update_ledger', { op: 'set-status', status: 'confirmed', refs: ['ce_1_1_aaaa'] })
    expect(r.ok).toBe(true)
    expect(r.data.updated).toEqual([{ id: 'ce_1_1_aaaa', title: '钩子方案A：悬念型开场', status: 'confirmed' }])
    expect(r.data.counts).toEqual({ confirmed: 2, tentative: 1, rejected: 0 })
    expect(r.data.total).toBe(3)
    expect(fake.getState().ledger.find((e) => e.id === 'ce_1_1_aaaa')?.status).toBe('confirmed')
    const ev = captured.find((c) => c.event.type === 'ledger:update')
    expect(ev).toBeTruthy()
    expect((ev!.event.ledger as ConsensusEntry[]).find((e) => e.id === 'ce_1_1_aaaa')?.status).toBe('confirmed')
  })

  it('按唯一标题子串翻转（用户拍板 B 弃 A 场景）：弃与立是两次调用', async () => {
    // set-status 语义 = 一个 status 施加于全部 refs；「B 弃 A」必须拆两步
    const rejectA = await run('lw_update_ledger', { op: 'set-status', status: 'rejected', refs: ['悬念型开场'] })
    expect(rejectA.ok).toBe(true)
    const confirmB = await run('lw_update_ledger', { op: 'set-status', status: 'confirmed', refs: ['ce_1_2_bbbb'] })
    expect(confirmB.ok).toBe(true)
    expect(fake.getState().ledger.find((e) => e.id === 'ce_1_1_aaaa')?.status).toBe('rejected')
    expect(fake.getState().ledger.find((e) => e.id === 'ce_1_2_bbbb')?.status).toBe('confirmed')
    expect(confirmB.data.counts).toEqual({ confirmed: 2, tentative: 0, rejected: 1 })
  })

  it('多命中不猜：返回候选列表，账本不动', async () => {
    const r = await run('lw_update_ledger', { op: 'set-status', status: 'rejected', refs: ['钩子方案'] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('命中多条')
    expect(r.error).toContain('ce_1_1_aaaa')
    expect(r.error).toContain('ce_1_2_bbbb')
    expect(fake.getState().ledger.find((e) => e.id === 'ce_1_1_aaaa')?.status).toBe('tentative')
    expect(captured.some((c) => c.event.type === 'ledger:update')).toBe(false)
  })

  it('找不到明确报错并附当前账本索引', async () => {
    const r = await run('lw_update_ledger', { op: 'set-status', status: 'confirmed', refs: ['不存在的那条'] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不存在')
    expect(r.error).toContain('ce_2_1_cccc')
    expect(r.error).toContain('森林是禁地')
  })

  it('缺 status / 缺 refs 的参数守卫', async () => {
    const noStatus = await run('lw_update_ledger', { op: 'set-status', refs: ['ce_1_1_aaaa'] })
    expect(noStatus.ok).toBe(false)
    expect(noStatus.error).toContain('status')
    const noRefs = await run('lw_update_ledger', { op: 'set-status', status: 'confirmed' })
    expect(noRefs.ok).toBe(false)
    expect(noRefs.error).toContain('refs')
    expect(noRefs.error).toContain('lw_query_ledger')
  })
})

describe('lw_update_ledger add', () => {
  it('补记新条目：缺省 confirmed、sourceTurn 对齐轮次口径（turnNo+1）、发事件', async () => {
    const r = await run('lw_update_ledger', {
      op: 'add',
      entry: { kind: 'plot', title: '就用悬念型开场', points: ['用户拍板选A'] },
    })
    expect(r.ok).toBe(true)
    const entry = (r.data.entry ?? {}) as { id?: string; title?: string; status?: string }
    expect(entry.status).toBe('confirmed')
    expect(entry.title).toBe('就用悬念型开场')
    expect(entry.id).toMatch(/^ce_3_/)
    const stored = fake.getState().ledger.find((e) => e.id === entry.id)
    expect(stored).toBeTruthy()
    expect(stored!.sourceTurn).toBe(3)
    // 种子 1 confirmed + 2 tentative，补记 1 confirmed → 2/2/0
    expect(r.data.counts).toEqual({ confirmed: 2, tentative: 2, rejected: 0 })
    expect(captured.some((c) => c.event.type === 'ledger:update')).toBe(true)
  })

  it('同题（归一化）拒绝，提示走 set-status', async () => {
    const r = await run('lw_update_ledger', { op: 'add', entry: { kind: 'world', title: '森林，是禁地。', points: ['x'] } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('同题')
    expect(fake.getState().ledger).toHaveLength(3)
  })

  it('缺 points 拒绝（注册表 zod 校验层拦截，error 指向 points）', async () => {
    const r = await run('lw_update_ledger', { op: 'add', entry: { kind: 'tone', title: '基调定为冷峻' } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/points|INVALID_ARGS/)
  })
})

describe('lw_query_ledger 审计（结构化条目供改前定位）', () => {
  it('返回 entries[]（id/kind/status/title，最近更新在前）+ counts，text 保留', async () => {
    const r = await run('lw_query_ledger', {})
    expect(r.ok).toBe(true)
    const entries = (r.data.entries ?? []) as Array<{ id: string; kind: string; status: string; title: string }>
    expect(entries.map((e) => e.id)).toEqual(['ce_2_1_cccc', 'ce_1_2_bbbb', 'ce_1_1_aaaa'])
    expect(entries[0]).toEqual({ id: 'ce_2_1_cccc', kind: 'world', status: 'confirmed', title: '森林是禁地' })
    expect(r.data.counts).toEqual({ confirmed: 1, tentative: 2, rejected: 0 })
    expect(String(r.data.text)).toContain('【共识账本】')
    expect(String(r.data.text)).toContain('森林是禁地')
    expect(r.data.phase).toBe('story-core')
  })
})
