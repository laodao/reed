/**
 * 上下文与记忆参数的**读取点接线**测试
 * @module tests/unit/core/platform/agent-runtime/agent-context-wiring
 *
 * 背景（2026-09-13 参数设置第三批）：参数登记了就必须真的有人读（第一轮出现过"假旋钮"）。
 * 这里用真实的 `MemoryFlywheelService`（假 repo）证明：设置页改的值确实改变行为——
 * - 蒸馏条数上限 / 置信度闸门 → distillFromTask 的实际沉淀结果；
 * - 召回条数 → assemble 的返回条数；
 * - 查重阈值 → 判重结果。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { MemoryFlywheelService, tokenize, overlapRatio } from '@core/platform/agent-runtime/memory/memory-flywheel'
import type { AgentMemoryEntryRepository } from '@core/database/repositories/agent-memory-entry.repository'
import {
  resetAgentContextParams,
  setAgentContextParams,
} from '@shared/utils/agent-context-params'

afterEach(() => resetAgentContextParams())

/** 与 m3-core.spec 同形的内存 repo（够用即可） */
function buildRepo(initial: Array<{ id: string; content: Record<string, unknown>; status?: string }> = []) {
  const rows = initial.map((e) => ({ ...e, kind: 'fact', status: e.status ?? 'active', confidence: 0.9, useCount: 0, successCount: 0 }))
  const repo = {
    async create(i: { id: string; kind: string; content: Record<string, unknown>; status: string; confidence?: number | null }) {
      const row = { id: i.id, kind: i.kind, content: i.content, status: i.status, confidence: i.confidence ?? 0, useCount: 0, successCount: 0 }
      rows.push(row as never)
      return row as never
    },
    async getById(id: string) {
      return (rows.find((r) => r.id === id) as never) ?? null
    },
    async listActive() {
      return rows.filter((r) => r.status === 'active') as never
    },
    async listByStatus(status: string) {
      return rows.filter((r) => r.status === status) as never
    },
    async patch(id: string, p: Record<string, unknown>) {
      const r = rows.find((x) => x.id === id)
      if (r) Object.assign(r, p)
    },
    async listActiveByScope() {
      return rows.filter((r) => r.status === 'active') as never
    },
    async archiveStaleBefore() {
      return 0
    },
  } as never as AgentMemoryEntryRepository
  return { repo, rows }
}

describe('记忆飞轮读「参数设置 → 上下文与记忆」', () => {
  it('蒸馏条数上限：注入 1 时，即使有 3 条合格候选也只沉淀 1 条', async () => {
    const distill = async () => [
      { kind: 'sop' as const, title: 'A', content: '采集新闻先用 wf_web_extract 提取正文', confidence: 0.95 },
      { kind: 'sop' as const, title: 'B', content: '翻译长文先分段再逐段 wf_translate', confidence: 0.95 },
      { kind: 'sop' as const, title: 'C', content: '报告写作先列大纲再逐节展开', confidence: 0.95 },
    ]
    // 上限 1（每次用干净的 repo，避免上一轮的沉淀触发查重）
    const one = buildRepo()
    const fw1 = new MemoryFlywheelService({ repo: one.repo, distill })
    setAgentContextParams({ memory: { distillMaxItems: 1 } })
    expect(await fw1.distillFromTask({ goal: 'g', outputText: '...' })).toBe(1)
    expect(one.rows.filter((r) => r.status === 'pending_review')).toHaveLength(1)

    // 放开到 3 → 三条都进（默认值即 3，这里显式注入证明读到的是配置）
    const three = buildRepo()
    const fw3 = new MemoryFlywheelService({ repo: three.repo, distill })
    setAgentContextParams({ memory: { distillMaxItems: 3 } })
    expect(await fw3.distillFromTask({ goal: 'g', outputText: '...' })).toBe(3)
  })

  it('置信度闸门：抬到 99% 后，0.95 的候选全部被丢弃', async () => {
    const { repo, rows } = buildRepo()
    const fw = new MemoryFlywheelService({
      repo,
      distill: async () => [{ kind: 'sop', title: 'A', content: '采集新闻先用 wf_web_extract 提取正文', confidence: 0.95 }],
    })
    expect(await fw.distillFromTask({ goal: 'g', outputText: '...' })).toBe(1)

    setAgentContextParams({ memory: { confidenceGatePercent: 99 } })
    expect(await fw.distillFromTask({ goal: 'g', outputText: '...' })).toBe(0)
    expect(rows.filter((r) => r.status === 'pending_review')).toHaveLength(1)
  })

  it('召回条数：注入 1 时 assemble 最多返回 1 条', async () => {
    const { repo } = buildRepo([
      { id: 'm1', content: { title: 't1', content: '报告写作先列大纲再总结' } },
      { id: 'm2', content: { title: 't2', content: '报告写作要分节展开做总结' } },
      { id: 'm3', content: { title: 't3', content: '报告写作最后统一润色并总结' } },
    ])
    const fw = new MemoryFlywheelService({ repo })
    // 查询须含 ≥2 个命中词（相邻 bigram 合并口径）——否则过不了 L1 相关度门槛
    // （六扇门复盘），参数化断言就无从谈起
    expect((await fw.assemble('报告写作 总结')).length).toBe(3) // 默认 3

    setAgentContextParams({ memory: { assembleTopK: 1 } })
    expect((await fw.assemble('报告写作 总结')).length).toBe(1)
  })

  it('查重阈值：调到 10% 后，弱重叠也算重复', async () => {
    const { repo } = buildRepo([
      { id: 'm1', content: { title: 't1', content: '报告写作先列大纲再逐节展开并统一润色' } },
    ])
    const fw = new MemoryFlywheelService({ repo })
    const candidate = '报告写作要注意语气一致性'
    // 默认 60% 阈值下不算重复（重叠很弱）
    expect(await fw.isDuplicate(candidate)).toBe(false)
    expect(overlapRatio(tokenize(candidate), tokenize('报告写作先列大纲再逐节展开并统一润色'))).toBeLessThan(0.6)

    setAgentContextParams({ memory: { dedupOverlapThresholdPercent: 10 } })
    expect(await fw.isDuplicate(candidate)).toBe(true)
  })
})
