/**
 * 飞轮落库前模型复核（闸门④）单测
 *
 * 钉死：复核拒收的候选不入库；分类纠偏（fact→sop）生效；复核器抛错/缺端口
 * 降级跳过（置信度+查重+人工批准三道闸仍在）；复核器未表态的下标按通过。
 */

import { describe, it, expect } from 'vitest'
import { MemoryFlywheelService } from '@core/platform/agent-runtime/memory/memory-flywheel'
import type { MemoryCandidate, MemoryReviewVerdict } from '@core/platform/agent-runtime/memory/memory-flywheel'

interface FakeRow {
  id: string
  kind: string
  content: { title: string; content: string }
  status: string
  confidence: number
}

function mkFlywheel(opts: {
  distill: MemoryCandidate[]
  review?: (input: { goal: string; candidates: MemoryCandidate[] }) => Promise<MemoryReviewVerdict[]>
}): { svc: MemoryFlywheelService; rows: FakeRow[] } {
  const rows: FakeRow[] = []
  const svc = new MemoryFlywheelService({
    repo: {
      create: async (r: Record<string, unknown>) => {
        rows.push({
          id: String(r.id),
          kind: String(r.kind),
          content: r.content as { title: string; content: string },
          status: String(r.status),
          confidence: Number(r.confidence),
        })
      },
      listActive: async () => rows.filter((r) => r.status === 'active') as never,
      listByStatus: async (s: string) => rows.filter((r) => r.status === s) as never,
    } as never,
    distill: async () => opts.distill,
    review: opts.review as never,
    clock: () => 1_000,
  })
  return { svc, rows }
}

const GOOD: MemoryCandidate = { kind: 'fact', title: '标题甲', content: '第一条可复用经验的内容描述', confidence: 0.9 }
const SECOND: MemoryCandidate = { kind: 'fact', title: '标题乙', content: '第二条完全不同主题的经验内容', confidence: 0.9 }

describe('飞轮落库前模型复核（闸门④）', () => {
  it('复核拒收的候选不入库，其余正常落 pending_review', async () => {
    const { svc, rows } = mkFlywheel({
      distill: [GOOD, SECOND],
      review: async () => [{ index: 1, accept: false, reason: '一次性任务细节，无复用价值' }],
    })
    const saved = await svc.distillFromTask({ goal: 'g', outputText: 'o' })
    expect(saved).toBe(1)
    expect(rows.map((r) => r.content.title)).toEqual(['标题甲'])
    expect(rows[0].status).toBe('pending_review')
  })

  it('复核分类纠偏：distiller 标 fact、复核改 sop → 按 sop 落库', async () => {
    const { svc, rows } = mkFlywheel({
      distill: [GOOD],
      review: async () => [{ index: 0, accept: true, kind: 'sop' }],
    })
    await svc.distillFromTask({ goal: 'g', outputText: 'o' })
    expect(rows[0].kind).toBe('sop')
  })

  it('复核器抛错 → 降级跳过，候选仍全部入库（人工闸门兜底）', async () => {
    const { svc } = mkFlywheel({
      distill: [GOOD, SECOND],
      review: async () => {
        throw new Error('review model down')
      },
    })
    const saved = await svc.distillFromTask({ goal: 'g', outputText: 'o' })
    expect(saved).toBe(2)
  })

  it('复核器未全部表态 → 未表态下标按通过', async () => {
    const { svc } = mkFlywheel({
      distill: [GOOD, SECOND],
      review: async () => [{ index: 1, accept: true }],
    })
    const saved = await svc.distillFromTask({ goal: 'g', outputText: 'o' })
    expect(saved).toBe(2)
  })

  it('未配置复核端口 → 行为与既有一致（全部入库）', async () => {
    const { svc, rows } = mkFlywheel({ distill: [GOOD] })
    const saved = await svc.distillFromTask({ goal: 'g', outputText: 'o' })
    expect(saved).toBe(1)
    expect(rows).toHaveLength(1)
  })
})
