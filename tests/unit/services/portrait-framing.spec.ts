/**
 * PortraitService framing（取景范围 half/full）链路单元测试
 * @see src/core/packs/portrait/services/portrait.service.ts
 *
 * 验证目标（spec 2026-07-24 新版人像设计 §5.2）：
 * 1. buildPortraitPrompt：framing 决定取景后缀；overrides 可覆盖默认片段（不写死）
 * 2. generatePortrait 不传 framing 时行为与现状一致（full 后缀）——存量行为锁定
 * 3. generatePortrait 传 framing='half' 时用半身后缀，产出 variant 落库 framing='half'
 *
 * mock 模式与 tests/unit/services/portrait.service.spec.ts 一致。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 模块级 mock：必须在 import service 之前声明 ----
vi.mock('@core/platform/services/image.service', () => ({
  ImageService: {
    generateImage: vi.fn(),
  },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => Buffer.from('fake')),
  }
})

vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: () => {} }),
}))

// generatePortrait 会调用 getPathProvider().getDataPath() 与 toAssetUrl，测试环境无注册，mock 掉
vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => '/tmp',
    toAssetUrl: (p: string) => `local-image:///${p}`,
  }),
}))

import { ImageService } from '@core/platform/services/image.service'
import * as dbModule from '@core/database/database-manager.interface'
import { PortraitService } from '@core/packs/portrait/services/portrait.service'
import type { PortraitCharacter, PortraitVariant } from '@shared/types/portrait.types'

// ====================================================================
// mock 工具
// ====================================================================

function makeCharacter(over: Partial<PortraitCharacter> = {}): PortraitCharacter {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    name: '测试人物',
    gender: 'male',
    age: 25,
    height: 170,
    weight: 60,
    race: 'asian',
    referenceImages: [],
    config: { angles: ['front'], backgroundType: 'solid' },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as PortraitCharacter
}

function installMockDb() {
  const db = {
    portraitCharacters: { getById: vi.fn() },
    portraitVariants: {
      getById: vi.fn(),
      create: vi.fn((input: Partial<PortraitVariant>) =>
        Promise.resolve({ id: 'var-new', createdAt: 1, ...input }),
      ),
    },
  }
  vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue(db as never)
  return db
}

function mockImageSuccess() {
  const spy = ImageService.generateImage as ReturnType<typeof vi.fn>
  spy.mockReset()
  spy.mockResolvedValue({
    success: true,
    images: [{ filePath: '/tmp/fake.png', width: 0, height: 0 }],
  })
  return spy
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====================================================================
// buildPortraitPrompt（纯函数）
// ====================================================================

describe('buildPortraitPrompt', () => {
  it('framing=half 使用半身后缀', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      anglePrompt: 'front view',
      framing: 'half',
    })
    expect(p).toContain('upper body shot, bust portrait')
    expect(p).not.toContain('full body shot')
  })

  it('framing=full 使用全身后缀', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      anglePrompt: 'front view',
      framing: 'full',
    })
    expect(p).toContain('full body shot')
  })

  it('framing 缺省按 full 处理', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
    })
    expect(p).toContain('full body shot')
  })

  it('调用方可覆盖默认后缀（不写死）', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      anglePrompt: 'front view',
      framing: 'half',
      overrides: { framingSuffix: 'custom framing words' },
    })
    expect(p).toContain('custom framing words')
    expect(p).not.toContain('bust portrait')
  })

  it('consistencyPrefix=true 时加一致性前缀', () => {
    const p = PortraitService.buildPortraitPrompt({
      basePrompt: 'portrait of a man',
      consistencyPrefix: true,
    })
    expect(p).toContain('generate the exact same person')
  })
})

// ====================================================================
// generatePortrait framing 参数
// ====================================================================

describe('generatePortrait framing 参数', () => {
  const baseRequest = {
    characterId: 'char-1',
    prompt: 'portrait of a man',
    providerId: 'p1',
    modelId: 'm1',
    config: { angles: ['front' as const], backgroundType: 'solid' as const, width: 768, height: 1024 },
  }

  it('不传 framing 时行为与现状一致（full 后缀）', async () => {
    const db = installMockDb()
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    const imageSpy = mockImageSuccess()

    const r = await PortraitService.generatePortrait(baseRequest)

    expect(r.success).toBe(true)
    const call = imageSpy.mock.calls[0][0] as { prompt: string }
    expect(call.prompt).toContain('full body shot')
    expect(call.prompt).not.toContain('bust portrait')
    // 落库 variant 不传 framing 参数时由 repo 默认 full —— service 传 'full'
    expect(db.portraitVariants.create.mock.calls[0][0].framing).toBe('full')
  })

  it('传 framing=half 时用半身后缀，产出 variant framing=half', async () => {
    const db = installMockDb()
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    const imageSpy = mockImageSuccess()

    const r = await PortraitService.generatePortrait({ ...baseRequest, framing: 'half' })

    expect(r.success).toBe(true)
    const call = imageSpy.mock.calls[0][0] as { prompt: string }
    expect(call.prompt).toContain('upper body shot, bust portrait')
    expect(call.prompt).not.toContain('full body shot')
    expect(db.portraitVariants.create.mock.calls[0][0].framing).toBe('half')
  })
})
