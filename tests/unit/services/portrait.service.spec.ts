/**
 * PortraitService 单元测试 —— 聚焦"图片尺寸选择"链路
 * @see src/core/packs/portrait/services/portrait.service.ts
 *
 * 验证目标（spec 2026-07-19 人像分辨率选择）：
 * 1. changeClothes / changeBackground / generateAngles / editImage 四个入口
 *    的尺寸取值统一为三级优先级：
 *      request.width/height  >  variant.config.width/height  >  DEFAULT_PORTRAIT_W/H
 * 2. changeClothes / changeBackground / generateAngles 新 variant 的 config 写回实际生效尺寸
 * 3. editImage update 回写 config（修复"改尺寸后下次编辑丢尺寸"的 bug），且保留原 seed
 *
 * 为聚焦尺寸逻辑，mock 掉 dbManager / ImageService / fs，不依赖真实 DB。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 模块级 mock：必须在 import service 之前声明 ----
vi.mock('@core/platform/services/image.service', () => ({
  ImageService: {
    generateImage: vi.fn(),
  },
}))

// fs 在 service 里用于读取参考图（fs.existsSync / fs.readFileSync）。
// generateAngles 在参考图不存在时会硬 return error，故让 existsSync 默认 true，
// readFileSync 返回假 buffer，使 service 走完整生成路径。
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => Buffer.from('fake')),
  }
})

// generateAngles 会调用 sendPortraitEvent → getEventEmitter().emit(...)，
// 测试环境无真实 emitter，mock 成空 emit。
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: () => {} }),
}))

import { ImageService } from '@core/platform/services/image.service'
import * as dbModule from '@core/database/database-manager.interface'
import { PortraitService } from '@core/packs/portrait/services/portrait.service'
import {
  DEFAULT_PORTRAIT_HEIGHT,
  DEFAULT_PORTRAIT_WIDTH,
} from '@shared/types/portrait.types'
import type { PortraitCharacter, PortraitVariant } from '@shared/types/portrait.types'
import { resetPortraitParams, setPortraitParams } from '@shared/utils/portrait-params'

// ====================================================================
// mock 工具
// ====================================================================

interface MockDb {
  portraitCharacters: {
    getById: ReturnType<typeof vi.fn>
  }
  portraitVariants: {
    getBaseVariants: ReturnType<typeof vi.fn>
    getFrontVariant: ReturnType<typeof vi.fn>
    getById: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

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

function makeVariant(over: Partial<PortraitVariant> = {}): PortraitVariant {
  return {
    id: 'var-1',
    characterId: 'char-1',
    type: 'base',
    angle: 'front',
    imagePath: '',
    prompt: '',
    config: {},
    createdAt: 0,
    ...over,
  } as PortraitVariant
}

/**
 * 安装一个 mock dbManager，并返回它，便于每个 case 覆盖 getBaseVariants/getById 等返回值。
 */
function installMockDb(): MockDb {
  const db: MockDb = {
    portraitCharacters: { getById: vi.fn() },
    portraitVariants: {
      getBaseVariants: vi.fn(),
      getFrontVariant: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }
  vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue(db as any)
  return db
}

/**
 * 让 ImageService.generateImage 成功返回一张图片，并返回捕获入参的 spy。
 */
function mockImageSuccess() {
  const spy = ImageService.generateImage as ReturnType<typeof vi.fn>
  spy.mockReset()
  spy.mockResolvedValue({
    success: true,
    images: [{ filePath: '/tmp/fake.png', width: 0, height: 0 }],
  })
  return spy
}

/** 让 create / update 原样回传（带 id），便于 service 继续执行。 */
function mockVariantCreateUpdate(db: MockDb) {
  db.portraitVariants.create.mockImplementation(async (data: any) => ({
    id: 'new-var',
    createdAt: 0,
    ...data,
  }))
  db.portraitVariants.update.mockImplementation(async (id: string, data: any) => ({
    id,
    createdAt: 0,
    ...data,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ====================================================================
// changeClothes —— 尺寸优先级 + config 写回
// ====================================================================
describe('PortraitService.changeClothes 尺寸优先级', () => {
  it('优先使用 request.width/height', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([
      makeVariant({ id: 'base-front', angle: 'front', config: { width: 512, height: 512, seed: 1 } }),
    ])

    await PortraitService.changeClothes({
      characterId: 'char-1',
      clothesDescription: 'red shirt',
      angles: ['front'],
      width: 896,
      height: 1152,
    })

    expect(genSpy).toHaveBeenCalledTimes(1)
    const arg = genSpy.mock.calls[0][0]
    expect(arg.width).toBe(896)
    expect(arg.height).toBe(1152)
    // 新 variant 的 config 写回实际生效尺寸（保留原 seed）
    const created = db.portraitVariants.create.mock.calls[0][0]
    expect(created.config).toMatchObject({ width: 896, height: 1152, seed: 1 })
  })

  it('request 不传尺寸时回退 baseVariant.config', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([
      makeVariant({ angle: 'front', config: { width: 768, height: 1024, seed: 9 } }),
    ])

    await PortraitService.changeClothes({
      characterId: 'char-1',
      clothesDescription: 'blue shirt',
      angles: ['front'],
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.width).toBe(768)
    expect(arg.height).toBe(1024)
    expect(db.portraitVariants.create.mock.calls[0][0].config).toMatchObject({
      width: 768,
      height: 1024,
      seed: 9,
    })
  })

  it('request 与 config 都无尺寸时回退默认常量', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([
      makeVariant({ angle: 'front', config: { seed: 3 } }),
    ])

    await PortraitService.changeClothes({
      characterId: 'char-1',
      clothesDescription: 'green shirt',
      angles: ['front'],
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.width).toBe(DEFAULT_PORTRAIT_WIDTH)
    expect(arg.height).toBe(DEFAULT_PORTRAIT_HEIGHT)
    expect(db.portraitVariants.create.mock.calls[0][0].config).toMatchObject({
      width: DEFAULT_PORTRAIT_WIDTH,
      height: DEFAULT_PORTRAIT_HEIGHT,
      seed: 3,
    })
  })

  /**
   * 2026-09-13「参数设置 → 画像」：默认尺寸不再写死，改读运行时持有者。
   * （生成强度只在 `generateFullBody`/`editFace` 两条路径上有缺省值，其证明见
   *  `portrait-edit-face.spec.ts` 的「editFace 读取参数设置」用例。）
   */
  it('注入画像参数后，默认尺寸按设置走（不再写死 768×1024）', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([
      makeVariant({ angle: 'front', config: { seed: 3 } }),
    ])

    setPortraitParams({ image: { width: 1024, height: 1536 } })
    try {
      await PortraitService.changeClothes({
        characterId: 'char-1',
        clothesDescription: 'green shirt',
        angles: ['front'],
      })
      expect(genSpy.mock.calls[0][0].width).toBe(1024)
      expect(genSpy.mock.calls[0][0].height).toBe(1536)
    } finally {
      resetPortraitParams()
    }

    // 复位后回到默认（768×1024）——证明"读的是持有者"而不是常量被换成了别的常量
    const genSpy2 = mockImageSuccess()
    mockVariantCreateUpdate(db)
    db.portraitVariants.getBaseVariants.mockResolvedValue([makeVariant({ angle: 'front', config: { seed: 4 } })])
    await PortraitService.changeClothes({
      characterId: 'char-1',
      clothesDescription: 'red shirt',
      angles: ['front'],
    })
    expect(genSpy2.mock.calls[0][0].width).toBe(DEFAULT_PORTRAIT_WIDTH)
    expect(genSpy2.mock.calls[0][0].height).toBe(DEFAULT_PORTRAIT_HEIGHT)
  })
})

// ====================================================================
// changeBackground —— 尺寸优先级
// ====================================================================
describe('PortraitService.changeBackground 尺寸优先级', () => {
  it('优先使用 request.width/height，并写回 config', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([
      makeVariant({ angle: 'front', config: { width: 512, height: 512, seed: 1 } }),
    ])

    await PortraitService.changeBackground({
      characterId: 'char-1',
      backgroundType: 'solid',
      backgroundColor: '#fff',
      angles: ['front'],
      width: 1024,
      height: 1792,
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.width).toBe(1024)
    expect(arg.height).toBe(1792)
    expect(db.portraitVariants.create.mock.calls[0][0].config).toMatchObject({
      width: 1024,
      height: 1792,
      seed: 1,
    })
  })

  it('无尺寸时回退默认常量', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getBaseVariants.mockResolvedValue([
      makeVariant({ angle: 'front', config: {} }),
    ])

    await PortraitService.changeBackground({
      characterId: 'char-1',
      backgroundType: 'solid',
      backgroundColor: '#fff',
      angles: ['front'],
    })

    expect(genSpy.mock.calls[0][0].width).toBe(DEFAULT_PORTRAIT_WIDTH)
    expect(genSpy.mock.calls[0][0].height).toBe(DEFAULT_PORTRAIT_HEIGHT)
  })
})

// ====================================================================
// generateAngles —— 尺寸优先级（参考图无法读取时提前返回 error，
// 用 request.variantId + imagePath='' 仍会触发"参考图不存在"分支。
// 故此处用 getById 命中一个有 imagePath 的 variant，并 mock fs 存在）
// ====================================================================
describe('PortraitService.generateAngles 提示词参数（追加式）', () => {
  function setupAngles() {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)
    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getById.mockResolvedValue(
      makeVariant({
        id: 'ref-var',
        angle: 'front',
        imagePath: 'images/ref.png',
        config: { width: 768, height: 1024, seed: 1 },
      }),
    )
    return { db, genSpy }
  }

  it('prompt 追加到一致性提示词末尾', async () => {
    const { genSpy } = setupAngles()
    await PortraitService.generateAngles({
      characterId: 'char-1',
      angles: ['left'],
      variantId: 'ref-var',
      prompt: 'clean solid white studio background',
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.prompt).toContain('Keep the same facial features')
    expect(arg.prompt.endsWith('clean solid white studio background')).toBe(true)
  })

  it('negativePrompt 置于默认反向词之前', async () => {
    const { genSpy } = setupAngles()
    await PortraitService.generateAngles({
      characterId: 'char-1',
      angles: ['left'],
      variantId: 'ref-var',
      negativePrompt: 'noise, grain, jpeg artifacts',
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.negativePrompt.startsWith('noise, grain, jpeg artifacts, ')).toBe(true)
    expect(arg.negativePrompt).toContain('low quality')
  })

  it('不传新参数时行为与现状一致', async () => {
    const { genSpy } = setupAngles()
    await PortraitService.generateAngles({
      characterId: 'char-1',
      angles: ['left'],
      variantId: 'ref-var',
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.prompt).not.toContain('clean solid white studio background')
    expect(arg.negativePrompt).not.toContain('noise, grain')
  })
})

describe('PortraitService.generateAngles 尺寸优先级', () => {
  it('优先使用 request.width/height，并写回 config', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getById.mockResolvedValue(
      makeVariant({
        id: 'ref-var',
        angle: 'front',
        imagePath: 'images/ref.png',
        config: { width: 512, height: 512, seed: 1 },
      }),
    )

    await PortraitService.generateAngles({
      characterId: 'char-1',
      angles: ['left'],
      variantId: 'ref-var',
      width: 1024,
      height: 1024,
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.width).toBe(1024)
    expect(arg.height).toBe(1024)
    expect(db.portraitVariants.create.mock.calls[0][0].config).toMatchObject({
      width: 1024,
      height: 1024,
      seed: 1,
    })
  })

  it('无尺寸时回退默认常量（不再用旧的 768×1024 硬编码不一致值）', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getById.mockResolvedValue(
      makeVariant({ id: 'ref-var', angle: 'front', imagePath: 'images/ref.png', config: {} }),
    )

    await PortraitService.generateAngles({
      characterId: 'char-1',
      angles: ['left'],
      variantId: 'ref-var',
    })

    expect(genSpy.mock.calls[0][0].width).toBe(DEFAULT_PORTRAIT_WIDTH)
    expect(genSpy.mock.calls[0][0].height).toBe(DEFAULT_PORTRAIT_HEIGHT)
  })
})

// ====================================================================
// editImage —— 尺寸优先级 + config 回写回归（核心修复）
// ====================================================================
describe('PortraitService.editImage 尺寸优先级与 config 回写', () => {
  it('优先 request 尺寸，并回写 config（保留原 seed）', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getById.mockResolvedValue(
      makeVariant({
        id: 'edit-var',
        angle: 'front',
        config: { width: 512, height: 512, seed: 7 },
      }),
    )

    await PortraitService.editImage({
      characterId: 'char-1',
      variantId: 'edit-var',
      editPrompt: 'wear a hat',
      width: 896,
      height: 1152,
    })

    const arg = genSpy.mock.calls[0][0]
    expect(arg.width).toBe(896)
    expect(arg.height).toBe(1152)

    // update 第二参数必须回写 config，且保留原 seed（simple-json 整列替换）
    const [, updateData] = db.portraitVariants.update.mock.calls[0]
    expect(updateData.config).toMatchObject({ width: 896, height: 1152, seed: 7 })
  })

  it('无 request 尺寸时回退 variant.config（不丢尺寸）', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getById.mockResolvedValue(
      makeVariant({ id: 'edit-var', angle: 'front', config: { width: 768, height: 1024, seed: 2 } }),
    )

    await PortraitService.editImage({
      characterId: 'char-1',
      variantId: 'edit-var',
      editPrompt: 'change hair',
    })

    expect(genSpy.mock.calls[0][0].width).toBe(768)
    expect(genSpy.mock.calls[0][0].height).toBe(1024)
    const [, updateData] = db.portraitVariants.update.mock.calls[0]
    expect(updateData.config).toMatchObject({ width: 768, height: 1024, seed: 2 })
  })

  it('request 与 config 都无尺寸时回退默认常量', async () => {
    const db = installMockDb()
    const genSpy = mockImageSuccess()
    mockVariantCreateUpdate(db)

    db.portraitCharacters.getById.mockResolvedValue(makeCharacter())
    db.portraitVariants.getById.mockResolvedValue(
      makeVariant({ id: 'edit-var', angle: 'front', config: {} }),
    )

    await PortraitService.editImage({
      characterId: 'char-1',
      variantId: 'edit-var',
      editPrompt: 'change background',
    })

    expect(genSpy.mock.calls[0][0].width).toBe(DEFAULT_PORTRAIT_WIDTH)
    expect(genSpy.mock.calls[0][0].height).toBe(DEFAULT_PORTRAIT_HEIGHT)
  })
})
