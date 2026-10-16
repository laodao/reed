// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enrichAssetSettings } from '@/api/asset-setting-enrichment'

describe('asset-setting-enrichment renderer api', () => {
  beforeEach(() => {
    ;(window as any).electronAPI = {
      episodeProduction: {
        asset: {
          enrichSettings: vi.fn().mockResolvedValue({
            success: true,
            data: {
              enrichedCount: { character: 2, location: 0, item: 0 },
              failures: [],
            },
          }),
        },
      },
    }
  })

  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('成功返回 enrichedCount', async () => {
    const out = await enrichAssetSettings('p1')
    expect(out.enrichedCount.character).toBe(2)
  })

  it('IPC API 不可用：抛错', async () => {
    delete (window as any).electronAPI
    await expect(enrichAssetSettings('p1')).rejects.toThrow(/不可用|未暴露/)
  })

  it('IPC 返回 success=false：抛错', async () => {
    ;(window as any).electronAPI.episodeProduction.asset.enrichSettings = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'AI 配置缺失' })
    await expect(enrichAssetSettings('p1')).rejects.toThrow(/AI 配置缺失/)
  })
})
