/**
 * ImageService 生成边界能力校验 · 单元测试
 * @see src/core/services/image.service.ts
 *
 * 验证目标（design image-provider-capability-model-design §8 不隐瞒原则）：
 * 1. 未登记模型调用 generateImage：返回明确错误（含模型 id 与登记指引），不静默、不假成功
 * 2. 已登记模型：能力校验不阻断（继续走正常流程）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: vi.fn(),
}))
vi.mock('@core/interfaces/storage.interface', () => ({
  getSecureStorage: vi.fn(),
}))
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: () => {} }),
}))
vi.mock('@core/image-providers', () => ({
  createImageProvider: vi.fn(),
  getProviderDefinition: vi.fn(),
  IMAGE_PROVIDER_DEFINITIONS: {},
  isProviderImplemented: vi.fn(() => true),
}))

import { ImageService } from '@core/services/image.service'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'

function installMocks(templateId = 'image-dashscope') {
  const db = {
    images: { create: vi.fn() },
    providerConfigs: {
      getById: vi.fn().mockResolvedValue({
        id: 'cfg-1',
        templateId,
        name: '测试 Provider',
        apiKey: 'encrypted-key',
      }),
      getEnabled: vi.fn().mockResolvedValue([]),
    },
  }
  ;(getCoreDatabaseManager as ReturnType<typeof vi.fn>).mockReturnValue(db)
  ;(getSecureStorage as ReturnType<typeof vi.fn>).mockReturnValue({
    isInitialized: () => true,
    initialize: vi.fn(),
    decrypt: vi.fn(() => 'plain-key'),
  })
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateImage 能力边界', () => {
  it('未登记模型：返回明确错误（含模型 id 与登记位置指引）', async () => {
    installMocks()

    const r = await ImageService.generateImage({
      providerConfigId: 'cfg-1',
      model: 'some-unregistered-model-9',
      prompt: 'a cat',
      width: 1024,
      height: 1024,
    })

    expect(r.success).toBe(false)
    expect(r.error).toContain('some-unregistered-model-9')
    expect(r.error).toContain('model-capabilities.ts')
  })

  it('已登记模型：不被能力校验阻断（走到 Provider 创建阶段或之后）', async () => {
    installMocks()

    const r = await ImageService.generateImage({
      providerConfigId: 'cfg-1',
      model: 'wan2.6-image',
      prompt: 'a cat',
      width: 1024,
      height: 1024,
    })

    // 不因"未登记"报错（后续流程成败取决于 mock 深度，但不准是能力错误）
    expect(r.error ?? '').not.toContain('未登记生成能力')
  })
})
