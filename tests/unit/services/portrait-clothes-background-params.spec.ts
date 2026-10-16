/**
 * PortraitService 换衣/换背景可选参数（补充提示词 + 多参考图）单元测试
 * @see src/core/packs/portrait/services/portrait.service.ts
 *
 * 验证目标（spec 2026-07-24 新版人像设计 §5.2 D5b）：
 * 1. 不传新参数（prompt / referenceImages）时行为与现状一致 —— 存量行为锁定
 * 2. 传 prompt 时追加到现有拼装结果末尾
 * 3. 传 referenceImages 时与 base 参考图合并传入 generateImage
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

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => '/tmp',
    toAssetUrl: (p: string) => `local-image:///${p}`,
  }),
}))

// asset-path 的 resolveAssetPath 在测试环境直接透传（fs.existsSync 已 mock true）
vi.mock('@core/utils/asset-path', () => ({
  toAssetUrl: (p: string) => `local-image:///${p}`,
  resolveAssetPath: (p: string) => p,
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
    prompt: 'portrait of a man',
    config: { angles: ['front'], backgroundType: 'solid' },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as PortraitCharacter
}

function makeVariant(over: Partial<PortraitVariant> = {}): PortraitVariant {
  return {
    id: 'var-1',
    characterId: 'char-1',
    type: 'base',
    angle: 'front',
    imagePath: '/tmp/base.png',
    prompt: 'portrait of a man',
    config: { width: 768, height: 1024, seed: 42 },
    createdAt: 0,
    ...over,
  } as PortraitVariant
}

function installMockDb() {
  const db = {
    portraitCharacters: { getById: vi.fn() },
    portraitVariants: {
      getBaseVariants: vi.fn(),
      getFrontVariant: vi.fn(),
      getById: vi.fn(),
      create: vi.fn((input: Partial<PortraitVariant>) =>
        Promise.resolve({ id: 'var-new', createdAt: 1, ...input }),
      ),
      update: vi.fn(),
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
// changeClothes 可选参数
// ====================================================================

describe('changeClothes 可选参数', () => {
  const baseRequest = {
    characterId: 'char-1',
    clothesDescription: 'red shirt',
    angles: ['front' as const],
  }

  function setupClothes() {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([makeVariant()])
    return { db, genSpy }
  }

  it('不传新参数时 prompt 与现状一致（不含追加内容）', async () => {
    const { genSpy } = setupClothes()
    await PortraitService.changeClothes(baseRequest)

    const call = genSpy.mock.calls[0][0] as { prompt: string }
    expect(call.prompt).toContain('wearing red shirt')
    expect(call.prompt).not.toContain('fabric texture')
  })

  it('传 prompt 时追加到拼装结果末尾', async () => {
    const { genSpy } = setupClothes()
    await PortraitService.changeClothes({ ...baseRequest, prompt: 'fabric texture, slim fit' })

    const call = genSpy.mock.calls[0][0] as { prompt: string }
    expect(call.prompt).toContain('wearing red shirt')
    expect(call.prompt.endsWith('fabric texture, slim fit')).toBe(true)
  })

  it('传 referenceImages 时与 base 参考图合并传入', async () => {
    const { genSpy } = setupClothes()
    await PortraitService.changeClothes({
      ...baseRequest,
      referenceImages: ['data:image/png;base64,EXTRA1', 'data:image/png;base64,EXTRA2'],
    })

    const call = genSpy.mock.calls[0][0] as { referenceImages?: string[] }
    // base 参考图（从 baseVariant.imagePath 读出，fs mock 返回 'fake' buffer 的 base64）置首，追加参考随后
    expect(call.referenceImages?.length).toBe(3)
    expect(call.referenceImages?.[1]).toBe('data:image/png;base64,EXTRA1')
    expect(call.referenceImages?.[2]).toBe('data:image/png;base64,EXTRA2')
  })
})

// ====================================================================
// changeBackground 可选参数
// ====================================================================

describe('changeBackground 可选参数', () => {
  function setupBackground() {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([makeVariant()])
    return { db, genSpy }
  }

  it('传 prompt 时追加到拼装结果末尾', async () => {
    const { genSpy } = setupBackground()
    await PortraitService.changeBackground({
      characterId: 'char-1',
      backgroundType: 'custom',
      customDescription: 'beach sunset',
      angles: ['front'],
      prompt: 'soft bokeh, warm light',
    })

    const call = genSpy.mock.calls[0][0] as { prompt: string }
    expect(call.prompt).toContain('beach sunset')
    expect(call.prompt.endsWith('soft bokeh, warm light')).toBe(true)
  })

  it('不传新参数时 prompt 与现状一致', async () => {
    const { genSpy } = setupBackground()
    await PortraitService.changeBackground({
      characterId: 'char-1',
      backgroundType: 'custom',
      customDescription: 'beach sunset',
      angles: ['front'],
    })

    const call = genSpy.mock.calls[0][0] as { prompt: string }
    expect(call.prompt).toContain('beach sunset')
    expect(call.prompt).not.toContain('soft bokeh')
  })
})
