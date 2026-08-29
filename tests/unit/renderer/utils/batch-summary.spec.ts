/**
 * 批量结果聚合测试（评审 #56）
 */
import { describe, it, expect } from 'vitest'
import { summarizeBatchResults } from '@/utils/batch-summary'

describe('summarizeBatchResults', () => {
  it('全部成功 → success', () => {
    const r = summarizeBatchResults([{ ok: true }, { ok: true }])
    expect(r.level).toBe('success')
    expect(r.message).toContain('2 张')
  })

  it('全失败 → error 且带首个失败原因（不再假成功）', () => {
    const r = summarizeBatchResults([{ ok: false, error: '模型超时' }, { ok: false, error: '额度不足' }])
    expect(r.level).toBe('error')
    expect(r.message).toContain('全部失败')
    expect(r.message).toContain('模型超时')
  })

  it('部分失败 → warning 带成功/失败计数', () => {
    const r = summarizeBatchResults([{ ok: true }, { ok: false, error: '额度不足' }])
    expect(r.level).toBe('warning')
    expect(r.message).toContain('成功 1 张')
    expect(r.message).toContain('失败 1 张')
  })
})
