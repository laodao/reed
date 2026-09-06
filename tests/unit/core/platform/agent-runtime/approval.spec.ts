/**
 * ApprovalCoordinator 单元测试（契约 = 23 号 §4/§4b + 24 号 Amendment）
 * 覆盖：决定三态/编辑透传/幂等/超时/中断/取消清理/同 scope 单卡断言/
 * Amendment 会话免批与键规范化/落库恢复完整性/决定集下发。
 */

import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import {
  ApprovalCoordinator,
  InMemoryApprovalStore,
  amendmentKey,
  stableStringify,
  AVAILABLE_DECISIONS,
  type ApprovalStore,
} from '@core/platform/agent-runtime/runtime/approval'
import type { AgentEvent, ApprovalDecision } from '@shared/types/agent.types'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'

const saveTool: AgentToolDef<{ name: string; motive?: string }> = {
  name: 'save_entity',
  description: '保存',
  inputSchema: z.object({ name: z.string(), motive: z.string().optional() }),
  execute: async () => ({ ok: true }),
  requiresApproval: true,
  approvalCard: {
    title: '保存人物卡',
    summary: (i) => `保存 ${i.name}`,
    editable: ['motive'],
  },
}

/** 微任务冲刷：request() 落库（await store.save）后才注册 pending —— 契约：
 *  调用方 await request 或 flush 后可观测 listPending */
const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

function mkCoord(opts?: {
  store?: ApprovalStore
  timeoutMs?: number
  clock?: () => number
  sessionCacheCapacity?: number
}) {
  const events: AgentEvent[] = []
  const coord = new ApprovalCoordinator({
    emit: (e) => events.push(e),
    store: opts?.store,
    timeoutMs: opts?.timeoutMs,
    clock: opts?.clock,
    sessionCacheCapacity: opts?.sessionCacheCapacity,
  })
  return { coord, events }
}

describe('stableStringify / amendmentKey', () => {
  it('键排序稳定：同内容不同插入序 → 同串', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })
  it('缓存键含工具名', () => {
    expect(amendmentKey('t', { x: 1 })).toBe(`t:${stableStringify({ x: 1 })}`)
  })
})

describe('ApprovalCoordinator 基础决定流', () => {
  it('① request→decide(approve)：resolve approve；request/resolved 事件成对；store 清理', async () => {
    const store = new InMemoryApprovalStore()
    const { coord, events } = mkCoord({ store })
    const p = coord.request('s1', saveTool, { name: '林晓' })
    await tick()
    await tick()
    expect(coord.pendingCount).toBe(1)
    const saved = await store.listBySession('s1')
    expect(saved.length).toBe(1) // 落库（重启恢复依据）
    expect(coord.decide(saved[0].approvalId, { action: 'approve' })).toBe(true)
    await expect(p).resolves.toEqual({ action: 'approve' })
    expect(await store.listBySession('s1')).toHaveLength(0) // 决定后清库
    const types = events.map((e) => e.type)
    expect(types).toContain('approval:request')
    expect(types).toContain('approval:resolved')
  })

  it('② decide(reject)：resolve 带原因', async () => {
    const { coord } = mkCoord()
    const p = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    const id = coord.listPending('s1')[0].approvalId
    coord.decide(id, { action: 'reject', reason: '换一版' })
    await expect(p).resolves.toEqual({ action: 'reject', reason: '换一版' })
  })

  it('③ decide(approve_with_edit)：编辑后的 input 透传给调用方', async () => {
    const { coord } = mkCoord()
    const p = coord.request('s1', saveTool, { name: 'x', motive: '旧' })
    await tick()
    const id = coord.listPending('s1')[0].approvalId
    coord.decide(id, { action: 'approve_with_edit', input: { name: 'x', motive: '新' } })
    const d: ApprovalDecision = await p
    expect(d.action).toBe('approve_with_edit')
    if (d.action === 'approve_with_edit') expect(d.input.motive).toBe('新')
  })

  it('④ decide 幂等：不存在的 id / 二次决定 → false', async () => {
    const { coord } = mkCoord()
    expect(coord.decide('nope', { action: 'approve' })).toBe(false)
    const p = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    const id = coord.listPending('s1')[0].approvalId
    expect(coord.decide(id, { action: 'approve' })).toBe(true)
    void p
    expect(coord.decide(id, { action: 'approve' })).toBe(false) // 已决
  })

  it('⑤ 超时：resolve reject(timeout) + resolved(timeout) 事件', async () => {
    vi.useFakeTimers()
    try {
      const { coord, events } = mkCoord({ timeoutMs: 1000 })
      const p = coord.request('s1', saveTool, { name: 'x' })
      await tick()
      const settle = p.then((d) => d)
      vi.advanceTimersByTime(1001)
      await expect(settle).resolves.toEqual({ action: 'reject', reason: 'timeout' })
      expect(events.some((e) => e.type === 'approval:resolved' && e.action === 'timeout')).toBe(true)
      expect(coord.pendingCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('⑥ signal 中断：resolve reject(cancelled)', async () => {
    const ac = new AbortController()
    const { coord } = mkCoord()
    const p = coord.request('s1', saveTool, { name: 'x' }, ac.signal)
    await tick()
    ac.abort()
    await expect(p).resolves.toEqual({ action: 'reject', reason: 'cancelled' })
    expect(coord.pendingCount).toBe(0)
  })

  it('⑦ cancelScope：scope 内挂起卡全部补发拒绝', async () => {
    const { coord, events } = mkCoord()
    const p = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    coord.cancelScope('s1')
    await expect(p).resolves.toEqual({ action: 'reject', reason: 'cancelled' })
    expect(events.some((e) => e.type === 'approval:resolved' && e.action === 'cancelled')).toBe(true)
  })

  it('⑧ 同 scope 第二张挂起卡：fail-fast 断言错误', async () => {
    const { coord } = mkCoord()
    void coord.request('s1', saveTool, { name: 'x' })
    await tick()
    await expect(coord.request('s1', saveTool, { name: 'y' })).rejects.toThrow(/最多一张/)
  })

  it('⑨ sweep：过期卡由外部扫描触发拒绝', async () => {
    let now = 0
    const { coord } = mkCoord({ clock: () => now, timeoutMs: 100 })
    const p = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    now = 200
    expect(coord.sweep()).toBe(1)
    await expect(p).resolves.toEqual({ action: 'reject', reason: 'timeout' })
  })

  it('⑩ 过期后 decide → false（时钟注入）', async () => {
    let now = 0
    const { coord } = mkCoord({ clock: () => now, timeoutMs: 100 })
    void coord.request('s1', saveTool, { name: 'x' })
    await tick()
    const id = coord.listPending('s1')[0].approvalId
    now = 150
    expect(coord.decide(id, { action: 'approve' })).toBe(false)
    coord.cancelScope('s1') // 清理挂起的 promise
  })
})

describe('Amendment 会话级免批（24 号 §4b）', () => {
  it('⑪ approve(scope=session) 后：同类同参第二次直接放行，不发新卡', async () => {
    const { coord, events } = mkCoord()
    const p1 = coord.request('s1', saveTool, { name: '林晓' })
    await tick()
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve', scope: 'session' })
    await p1
    const requestCount1 = events.filter((e) => e.type === 'approval:request').length

    const d2 = await coord.request('s1', saveTool, { name: '林晓' }) // 同工具同参
    expect(d2).toEqual({ action: 'approve' })
    const requestCount2 = events.filter((e) => e.type === 'approval:request').length
    expect(requestCount2).toBe(requestCount1) // 未发新卡
    expect(events.some((e) => e.type === 'approval:resolved' && e.action === 'session-amendment')).toBe(true)
  })

  it('⑫ 键规范化：同内容不同键序命中同一缓存', async () => {
    const { coord } = mkCoord()
    const p1 = coord.request('s1', saveTool, { name: 'x', motive: 'a' })
    await tick()
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve', scope: 'session' })
    await p1
    const d2 = await coord.request('s1', saveTool, { motive: 'a', name: 'x' }) // 键序不同
    expect(d2.action).toBe('approve')
  })

  it('⑬ 不同入参：不命中缓存，正常发卡', async () => {
    const { coord, events } = mkCoord()
    const p1 = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve', scope: 'session' })
    await p1
    const before = events.filter((e) => e.type === 'approval:request').length
    const p2 = coord.request('s1', saveTool, { name: 'y' }) // 不同参数
    await tick()
    expect(events.filter((e) => e.type === 'approval:request').length).toBe(before + 1)
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve' })
    await p2
  })

  it('⑭ 缓存容量 LRU：容量 1 时先缓存的键被淘汰', async () => {
    const { coord } = mkCoord({ sessionCacheCapacity: 1 })
    const p1 = coord.request('s1', saveTool, { name: 'a' })
    await tick()
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve', scope: 'session' })
    await p1
    const p2 = coord.request('s1', saveTool, { name: 'b' }) // 挤掉 a
    await tick()
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve', scope: 'session' })
    await p2
    const p3 = coord.request('s1', saveTool, { name: 'a' }) // a 已被淘汰 → 重新发卡
    await tick()
    expect(coord.listPending('s1')).toHaveLength(1)
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve' })
    await p3
  })

  it('⑮ 单次 approve（无 scope）不进缓存', async () => {
    const { coord, events } = mkCoord()
    const p1 = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve' })
    await p1
    const before = events.filter((e) => e.type === 'approval:request').length
    const p2 = coord.request('s1', saveTool, { name: 'x' })
    await tick()
    expect(events.filter((e) => e.type === 'approval:request').length).toBe(before + 1) // 又发卡
    coord.decide(coord.listPending('s1')[0].approvalId, { action: 'approve' })
    await p2
  })
})

describe('卡片信息与决定集', () => {
  it('⑯ listPending/事件携带卡片与决定集（服务端下发，前端零硬编码）', async () => {
    const { coord, events } = mkCoord()
    void coord.request('s1', saveTool, { name: '谢无咎' })
    await tick()
    const pending = coord.listPending('s1')
    expect(pending[0].cardTitle).toBe('保存人物卡')
    expect(pending[0].cardSummary).toContain('谢无咎')
    const req = events.find((e) => e.type === 'approval:request')
    expect(req && req.type === 'approval:request' && req.card.editable).toEqual(['motive'])
    expect(AVAILABLE_DECISIONS).toContain('approve_with_edit')
  })
})
