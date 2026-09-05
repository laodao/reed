/**
 * PortraitService.generateFullBody（基于半身扩展全身）单元测试
 * @see src/core/packs/portrait/services/portrait.service.ts
 *
 * 验证目标（spec 2026-07-24 新版人像设计 §5.2）：
 * 1. 以源半身 variant 为首参考图生成全身：prompt 含全身后缀与面部一致性约束
 * 2. 产出 variant：type=base、framing=full、parentId=源 variant、继承源 seed
 * 3. strength 默认 0.55 且可覆盖；尺寸三级优先级
 * 4. 源 variant / 角色不存在返回错误
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 模块级 mock：必须在 import service 之前声明 ----
vi.mock('@core/platform/services/image.service', () => ({
  ImageService: { generateImage: vi.fn() },
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
    providerId: 'p1',
    modelId: 'm1',
    config: { angles: ['front'], backgroundType: 'solid' },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as PortraitCharacter
}

function makeSourceHalf(over: Partial<PortraitVariant> = {}): PortraitVariant {
  return {
    id: 'v1',
    characterId: 'char-1',
    type: 'base',
    angle: 'front',
    framing: 'half',
    imagePath: '/tmp/half.png',
    prompt: 'portrait of a man, upper body shot',
    config: { width: 768, height: 1024, seed: 42 },
    createdAt: 0,
    ...over,
  } as PortraitVariant
}

function installMockDb() {
  const db = {
    portraitCharacters: { getById: vi.fn() },
    portraitVariants: {
      getById: vi.fn(),
      create: vi.fn((input: Partial<PortraitVariant>) =>
        Promise.resolve({ id: 'v2', createdAt: 1, ...input }),
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
    images: [{ filePath: '/tmp/full.png', width: 0, height: 0 }],
  })
  return spy
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====================================================================

describe('generateFullBody', () => {
  it('以源半身为参考产出 framing=full variant', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    db.portraitVariants.getById.mockResolvedValue(makeSourceHalf())
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())

    const r = await PortraitService.generateFullBody({
      characterId: 'char-1',
      sourceVariantId: 'v1',
    })

    expect(r.success).toBe(true)
    // prompt：全身后缀 + 面部一致性
    const call = genSpy.mock.calls[0][0] as {
      prompt: string
      referenceImages?: string[]
      strength?: number
      width: number
      height: number
    }
    expect(call.prompt).toContain('full body shot')
    expect(call.prompt).toContain('consistent face')
    // 源半身图（fs mock 的 'fake' buffer base64）置首参考
    expect(call.referenceImages?.length).toBeGreaterThan(0)
    expect(call.referenceImages?.[0]).toContain('data:image/png;base64,')
    // strength 默认 0.55；尺寸继承源 config
    expect(call.strength).toBe(0.55)
    expect(call.width).toBe(768)
    expect(call.height).toBe(1024)
    // design §5.3：人像一致性场景显式关闭提示词改写
    expect((call as { promptExtend?: boolean }).promptExtend).toBe(false)
    // 产出 variant：framing=full、parentId=v1、继承 seed
    const created = db.portraitVariants.create.mock.calls[0][0]
    expect(created.type).toBe('base')
    expect(created.framing).toBe('full')
    expect(created.parentId).toBe('v1')
    expect(created.config.seed).toBe(42)
  })

  it('strength 可覆盖；追加参考图排在源图之后', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    db.portraitVariants.getById.mockResolvedValue(makeSourceHalf())
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())

    await PortraitService.generateFullBody({
      characterId: 'char-1',
      sourceVariantId: 'v1',
      strength: 0.7,
      referenceImages: ['data:image/png;base64,EXTRA'],
    })

    const call = genSpy.mock.calls[0][0] as { strength?: number; referenceImages?: string[] }
    expect(call.strength).toBe(0.7)
    expect(call.referenceImages?.length).toBe(2)
    expect(call.referenceImages?.[1]).toBe('data:image/png;base64,EXTRA')
  })

  it('源 variant 不存在返回错误', async () => {
    const db = installMockDb()
    db.portraitVariants.getById.mockResolvedValue(null)

    const r = await PortraitService.generateFullBody({
      characterId: 'char-1',
      sourceVariantId: 'nope',
    })

    expect(r.success).toBe(false)
  })

  it('角色不存在返回错误', async () => {
    const db = installMockDb()
    db.portraitVariants.getById.mockResolvedValue(makeSourceHalf())
    db.portraitCharacters.getById.mockResolvedValue(null)

    const r = await PortraitService.generateFullBody({
      characterId: 'char-1',
      sourceVariantId: 'v1',
    })

    expect(r.success).toBe(false)
  })
})
