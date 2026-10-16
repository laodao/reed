/**
 * 步骤1 P4：context-token 测试（验收 1.3 / 1.7）
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: vi.fn(),
}))

import {
  estimateTokens,
  computeBudget,
  resolveModelWindow,
  DEFAULT_MODEL_WINDOW,
} from '@core/platform/services/longwriting/context/context-token'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

describe('estimateTokens', () => {
  it('ceil(字符数*1.5)', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abc')).toBe(5) // 3*1.5=4.5 → 5
    expect(estimateTokens('你好世界')).toBe(6) // 4*1.5=6
  })
})

describe('computeBudget（验收 1.3）', () => {
  it('targetWords=5000 → maxTokens≥10000', () => {
    const b = computeBudget(32000, 5000)
    expect(b.maxTokens).toBeGreaterThanOrEqual(10000)
    expect(b.reservedForGeneration).toBe(10000) // min(10000, 16000)
    expect(b.availableForContext).toBe(32000 - 10000 - 1000) // 21000
  })

  it('contextWindow=32000, targetWords=5000 → reserved=10000, available=21000', () => {
    const b = computeBudget(32000, 5000)
    expect(b.reservedForGeneration).toBe(10000)
    expect(b.availableForContext).toBe(21000)
  })

  it('小目标字数：reserved 不超过 window/2', () => {
    const b = computeBudget(8000, 1000)
    expect(b.reservedForGeneration).toBe(2000) // min(2000, 4000)
    expect(b.maxTokens).toBe(2000)
  })

  it('maxTokens 不再硬编码 8192 上限', () => {
    // 旧逻辑 min(5000*2, 8192)=8192；新逻辑放开
    const b = computeBudget(64000, 5000)
    expect(b.maxTokens).toBe(10000) // 不再是 8192
  })
})

describe('resolveModelWindow（验收 1.7）', () => {
  it('档①：命中 contextWindow', async () => {
    ;(getCoreDatabaseManager as any).mockReturnValue({
      providerConfigs: {
        getById: vi.fn(async () => ({ models: [{ id: 'm1', contextWindow: 32000 }] })),
      },
    })
    expect(await resolveModelWindow('p1', 'm1')).toBe(32000)
  })

  it('档②：无 contextWindow 有 maxOutputTokens → maxOutputTokens*4', async () => {
    ;(getCoreDatabaseManager as any).mockReturnValue({
      providerConfigs: {
        getById: vi.fn(async () => ({ models: [{ id: 'm1', maxOutputTokens: 4000 }] })),
      },
    })
    expect(await resolveModelWindow('p1', 'm1')).toBe(16000)
  })

  it('档③：无模型信息 → 16000', async () => {
    ;(getCoreDatabaseManager as any).mockReturnValue({
      providerConfigs: { getById: vi.fn(async () => ({ models: [] })) },
    })
    expect(await resolveModelWindow('p1', 'm1')).toBe(DEFAULT_MODEL_WINDOW)
    expect(DEFAULT_MODEL_WINDOW).toBe(16000)
  })

  it('无 providerConfigs → 16000', async () => {
    ;(getCoreDatabaseManager as any).mockReturnValue({})
    expect(await resolveModelWindow('p1', 'm1')).toBe(16000)
  })
})
