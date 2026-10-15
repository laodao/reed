/**
 * image-provider-adapter · sentPrompt 回传单测（2026-09-24 一致性修复 Task 6 · K6）
 *
 * adapter 侧会把 label 拼成 `, variant: {label}` 尾追加到 prompt 发给 provider；
 * 拼尾后的最终串必须经返回值 sentPrompt 回传，调用方（keyframe-generation）落库
 * metadata.actualPrompt，保证「审的就是当时发出去的东西」可还原。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGalleryImageGenerator } from '@core/platform/episode-production/assets/services/image-provider-adapter'
import { ImageService } from '@core/platform/services/image.service'
import * as dbModule from '@core/database/database-manager.interface'

describe('createGalleryImageGenerator · sentPrompt 回传（K6）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('label 拼 `, variant: {label}` 尾后的最终串回传 sentPrompt，与发给 provider 的一致', async () => {
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [
          {
            id: 'pc1',
            templateId: 'comfyui',
            isEnabled: true,
            isDefault: true,
            models: [{ id: 'krea2', name: 'Krea2 文生图', type: 'image' }],
          },
        ]),
      },
    } as any)
    const genSpy = vi.spyOn(ImageService, 'generateImage').mockResolvedValue({
      success: true,
      images: [{ filePath: '/tmp/out_k6.png' }],
    } as any)

    const gen = createGalleryImageGenerator()
    const r = await gen.generate({
      referenceImagePaths: [],
      prompt: '基础 prompt',
      label: 'front_half',
      providerConfigId: 'pc1',
      modelId: 'krea2',
    })

    const sent = genSpy.mock.calls[0][0] as { prompt: string }
    expect(sent.prompt).toBe('基础 prompt, variant: front_half')
    expect(r.sentPrompt).toBe(sent.prompt)
  })

  it('无 label 时 sentPrompt 与传入 prompt 一致', async () => {
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [
          {
            id: 'pc1',
            templateId: 'comfyui',
            isEnabled: true,
            isDefault: true,
            models: [{ id: 'krea2', name: 'Krea2 文生图', type: 'image' }],
          },
        ]),
      },
    } as any)
    vi.spyOn(ImageService, 'generateImage').mockResolvedValue({
      success: true,
      images: [{ filePath: '/tmp/out_k6b.png' }],
    } as any)

    const gen = createGalleryImageGenerator()
    const r = await gen.generate({
      referenceImagePaths: [],
      prompt: '基础 prompt',
      label: '',
      providerConfigId: 'pc1',
      modelId: 'krea2',
    })
    expect(r.sentPrompt).toBe('基础 prompt')
  })
})
