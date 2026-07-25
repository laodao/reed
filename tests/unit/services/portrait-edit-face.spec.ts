/**
 * PortraitService.editFace（只修改面部）单元测试
 * @see src/core/services/portrait.service.ts
 *
 * 验证目标（spec 2026-07-24 新版人像设计 §5.2 D5）：
 * 1. 模板（占位符解析）+ 指令叠加进 prompt；focusRegion 默认 face；strength 默认 0.5
 * 2. 产出独立 type='face' variant：继承源 framing/angle/seed，原图不变
 * 3. variantInfo 记录 faceDescription / faceTemplateId
 * 4. 源 variant / 角色不存在返回错误
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 模块级 mock：必须在 import service 之前声明 ----
vi.mock('@core/services/image.service', () => ({
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

import { ImageService } from '@core/services/image.service'
import * as dbModule from '@core/database/database-manager.interface'
import { PortraitService } from '@core/services/portrait.service'
import type { PortraitCharacter, PortraitVariant } from '@shared/types/portrait.types'

// ====================================================================
// mock 工具
// ====================================================================

function makeCharacter(over: Partial<PortraitCharacter> = {}): PortraitCharacter {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    name: '张三',
    gender: 'male',
    age: 32,
    height: 178,
    weight: 65,
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

function makeSource(over: Partial<PortraitVariant> = {}): PortraitVariant {
  return {
    id: 'v1',
    characterId: 'char-1',
    type: 'base',
    angle: 'front',
    framing: 'half',
    imagePath: '/tmp/half.png',
    prompt: 'portrait of a man',
    config: { width: 768, height: 1024, seed: 7 },
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
        Promise.resolve({ id: 'v9', createdAt: 1, ...input }),
      ),
      delete: vi.fn(),
    },
    portraitPromptTemplates: {
      getById: vi.fn(),
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
    images: [{ filePath: '/tmp/face.png', width: 0, height: 0 }],
  })
  return spy
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====================================================================

describe('editFace', () => {
  it('模板+指令叠加，产出 type=face variant，原图不变', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    db.portraitVariants.getById.mockResolvedValue(makeSource())
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitPromptTemplates.getById.mockResolvedValue({
      id: 't1',
      content: 'sharp jawline, thick eyebrows, {gender}',
      builtin: true,
    })

    const r = await PortraitService.editFace({
      characterId: 'char-1',
      variantId: 'v1',
      faceTemplateId: 't1',
      facePrompt: '眼神更坚毅',
    })

    expect(r.success).toBe(true)
    const call = genSpy.mock.calls[0][0] as {
      prompt: string
      strength?: number
      focusRegion?: string
      referenceImages?: string[]
    }
    // 模板内容（占位符已解析为角色 gender）+ 指令叠加
    expect(call.prompt).toContain('sharp jawline')
    expect(call.prompt).toContain('male')
    expect(call.prompt).toContain('眼神更坚毅')
    // 编辑指令式措辞（修改意图优先，不再用"完全同一个人"的强约束开头）
    expect(call.prompt).toContain('edit this portrait photo')
    expect(call.prompt).toContain('keeping the exact same person')
    // 保持面部以外不变
    expect(call.prompt).toContain('keep hair, clothing, body, pose and background exactly the same')
    expect(call.strength).toBe(0.5)
    expect(call.focusRegion).toBe('face')
    expect(call.referenceImages?.length).toBeGreaterThan(0)
    // design §5.3：人像一致性场景显式关闭提示词改写
    expect((call as { promptExtend?: boolean }).promptExtend).toBe(false)

    const created = db.portraitVariants.create.mock.calls[0][0]
    expect(created.type).toBe('face')
    expect(created.framing).toBe('half')            // 继承源 framing
    expect(created.angle).toBe('front')            // 继承源 angle
    expect(created.parentId).toBe('v1')            // 源无 parentId → 指向源自身
    expect(created.config.seed).toBe(7)            // 继承 seed
    expect(created.variantInfo.faceTemplateId).toBe('t1')
    expect(created.variantInfo.faceDescription).toBe('眼神更坚毅')
  })

  it('不用模板只写指令也可生成；focusRegion 可指定', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    db.portraitVariants.getById.mockResolvedValue(makeSource())
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())

    const r = await PortraitService.editFace({
      characterId: 'char-1',
      variantId: 'v1',
      facePrompt: '单眼皮',
      focusRegion: 'face_and_hair',
      strength: 0.65,
    })

    expect(r.success).toBe(true)
    const call = genSpy.mock.calls[0][0] as { prompt: string; strength?: number; focusRegion?: string }
    expect(call.prompt).toContain('单眼皮')
    expect(call.prompt).toContain('keep clothing, body, pose and background exactly the same')
    expect(call.strength).toBe(0.65)
    expect(call.focusRegion).toBe('face_and_hair')
    const created = db.portraitVariants.create.mock.calls[0][0]
    expect(created.variantInfo.faceTemplateId).toBeUndefined()
  })

  it('模板不存在时按无模板继续（不阻断）', async () => {
    const db = installMockDb()
    mockImageSuccess()
    db.portraitVariants.getById.mockResolvedValue(makeSource())
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitPromptTemplates.getById.mockResolvedValue(null)

    const r = await PortraitService.editFace({
      characterId: 'char-1',
      variantId: 'v1',
      faceTemplateId: 'nope',
      facePrompt: '浓眉',
    })

    expect(r.success).toBe(true)
  })

  it('源 variant 不存在返回错误', async () => {
    const db = installMockDb()
    db.portraitVariants.getById.mockResolvedValue(null)

    const r = await PortraitService.editFace({ characterId: 'char-1', variantId: 'nope' })
    expect(r.success).toBe(false)
  })

  it('角色不存在返回错误', async () => {
    const db = installMockDb()
    db.portraitVariants.getById.mockResolvedValue(makeSource())
    db.portraitCharacters.getById.mockResolvedValue(null)

    const r = await PortraitService.editFace({ characterId: 'char-1', variantId: 'v1' })
    expect(r.success).toBe(false)
  })
})
