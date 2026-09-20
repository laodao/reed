/**
 * reference-image-selector 单测（P5-T6）
 * @module tests/unit/episode-production/render/reference-image-selector
 *
 * 覆盖 spec §3.4 + §4.5 三类资产打分 + 兜底规则：
 * - character: view +4 / expression +3 / outfit +2 / pose +1
 * - location:  angle +4 / time +2 / weather +1
 * - item:      view +3 / context +1
 * - 全 0 分 → 兜底返回主图（fellBackToMain=true）
 * - 无主图 → image=null
 * - metadata 解析容错（null / 非 JSON 字符串 / object 直接给）
 */

import { describe, it, expect, vi } from 'vitest'
import {
  pickReferenceImage,
  scoreVariant,
  type ReferencePickInput,
} from '@core/platform/episode-production/render/keyframe/reference-image-selector'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

function makeImg(opts: {
  id: string
  isMain?: number
  /** S-05 定妆确认标记；默认 1（等价于迁移回填后的存量主图/已确认图） */
  confirmed?: number
  meta?: Record<string, unknown> | string | null
}): AssetImageEntity {
  return {
    id: opts.id,
    userId: null,
    assetType: 'character',
    assetId: 'cb1',
    category: 'view',
    label: null,
    prompt: null,
    negativePrompt: null,
    imagePath: `/tmp/${opts.id}.png`,
    thumbnailPath: null,
    isMain: opts.isMain ?? 0,
    confirmed: opts.confirmed ?? 1,
    derivedFromImageId: null,
    sortOrder: 0,
    metadata:
      typeof opts.meta === 'string' || opts.meta === null
        ? opts.meta ?? null
        : JSON.stringify(opts.meta ?? {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any as AssetImageEntity
}

function fakeImageSvc(images: AssetImageEntity[]) {
  return {
    listByAsset: async () => images,
    getMainImage: async () => images.find((i) => i.isMain === 1) ?? null,
  }
}

describe('scoreVariant (pure)', () => {
  it('character：view+4 / expression+3 / outfit+2 / pose+1 命中累加', () => {
    const r = scoreVariant(
      {
        kind: 'character',
        bindingId: 'cb1',
        dims: { view: 'front', expression: 'happy', outfit: 'casual', pose: 'standing' },
      },
      { view: 'front', expression: 'happy', outfit: 'casual', pose: 'standing' },
    )
    expect(r.score).toBe(4 + 3 + 2 + 1)
    expect(r.matchedFields).toEqual(['view', 'expression', 'outfit', 'pose'])
  })

  it('location：angle+4 / time+2 / weather+1', () => {
    const r = scoreVariant(
      {
        kind: 'location',
        bindingId: 'lb1',
        dims: { angle: 'wide', time: 'morning', weather: 'sunny' },
      },
      { angle: 'wide', time: 'morning', weather: 'sunny' },
    )
    expect(r.score).toBe(7)
    expect(r.matchedFields).toEqual(['angle', 'time', 'weather'])
  })

  it('item：view+3 / context+1', () => {
    const r = scoreVariant(
      { kind: 'item', bindingId: 'ib1', dims: { view: 'front', context: 'held' } },
      { view: 'front', context: 'held' },
    )
    expect(r.score).toBe(4)
  })

  it('全部不匹配 → score=0', () => {
    const r = scoreVariant(
      { kind: 'character', bindingId: 'cb1', dims: { view: 'front' } },
      { view: 'left' },
    )
    expect(r.score).toBe(0)
    expect(r.matchedFields).toEqual([])
  })
})

describe('pickReferenceImage', () => {
  /*
   * B4 main 优先（2026-09-20 人物一致性修复）：character 在 confirmed 池内
   * 有可用主图（isMain=1 且有实际图片）时直接选主图，不再按维度评分挑变体——
   * 避免风格分叉的资产池里同角色不同关键帧选到 Q版 main / 写实 view 不同版本。
   */
  it('B4：character 有 confirmed 主图 → 主图优先，变体评分不参与', async () => {
    const imgs = [
      makeImg({ id: 'i1', meta: { view: 'left' } }),
      makeImg({ id: 'i4', meta: { view: 'front', expression: 'happy', outfit: 'casual' } }), // 9 分但不让选
      makeImg({ id: 'i_main', isMain: 1, meta: {} }),
    ]
    const input: ReferencePickInput = {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front', expression: 'happy', outfit: 'casual' },
    }
    const r = await pickReferenceImage(fakeImageSvc(imgs), input)
    expect(r.image?.id).toBe('i_main')
    expect(r.fellBackToMain).toBe(true)
    expect(r.score).toBe(0)
  })

  it('B4：character 无主图 → view 等变体作补充，多变体取最高分', async () => {
    const imgs = [
      makeImg({ id: 'i1', meta: { view: 'left' } }), // 0 分
      makeImg({ id: 'i2', meta: { view: 'front' } }), // 4 分
      makeImg({ id: 'i3', meta: { view: 'front', expression: 'happy' } }), // 7 分
      makeImg({ id: 'i4', meta: { view: 'front', expression: 'happy', outfit: 'casual' } }), // 9 分
    ]
    const input: ReferencePickInput = {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front', expression: 'happy', outfit: 'casual' },
    }
    const r = await pickReferenceImage(fakeImageSvc(imgs), input)
    expect(r.image?.id).toBe('i4')
    expect(r.score).toBe(9)
    expect(r.fellBackToMain).toBe(false)
  })

  it('B4：character 主图无实际图片（占位行 imagePath=\'\'）→ 变体评分兜底', async () => {
    const placeholder = makeImg({ id: 'i_main', isMain: 1, meta: {} })
    ;(placeholder as any).imagePath = ''
    const imgs = [
      makeImg({ id: 'i2', meta: { view: 'front' } }), // 4 分
      placeholder,
    ]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front' },
    })
    expect(r.image?.id).toBe('i2')
    expect(r.score).toBe(4)
    expect(r.fellBackToMain).toBe(false)
  })

  it('B4：location / item 不受 main 优先影响，维持维度评分', async () => {
    const locImgs = [
      makeImg({ id: 'loc_var', meta: { angle: 'wide' } }), // 4 分
      makeImg({ id: 'loc_main', isMain: 1, meta: {} }),
    ]
    const rl = await pickReferenceImage(fakeImageSvc(locImgs), {
      kind: 'location',
      bindingId: 'lb1',
      dims: { angle: 'wide' },
    })
    expect(rl.image?.id).toBe('loc_var')
    expect(rl.score).toBe(4)

    const itemImgs = [
      makeImg({ id: 'item_var', meta: { view: 'front' } }), // 3 分
      makeImg({ id: 'item_main', isMain: 1, meta: {} }),
    ]
    const ri = await pickReferenceImage(fakeImageSvc(itemImgs), {
      kind: 'item',
      bindingId: 'ib1',
      dims: { view: 'front' },
    })
    expect(ri.image?.id).toBe('item_var')
    expect(ri.score).toBe(3)
  })

  it('全部变体 0 分 → 兜底主图（fellBackToMain=true，score=0）', async () => {
    const imgs = [
      makeImg({ id: 'i1', meta: { view: 'left' } }),
      makeImg({ id: 'i_main', isMain: 1, meta: {} }),
    ]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front' },
    })
    expect(r.image?.id).toBe('i_main')
    expect(r.fellBackToMain).toBe(true)
    expect(r.score).toBe(0)
  })

  it('既无变体匹配又无主图 → image=null', async () => {
    const r = await pickReferenceImage(fakeImageSvc([]), {
      kind: 'character',
      bindingId: 'cb_empty',
      dims: { view: 'front' },
    })
    expect(r.image).toBeNull()
    expect(r.fellBackToMain).toBe(false)
  })

  it('metadata 解析容错：null / 非 JSON / object 直接传', async () => {
    const imgs = [
      makeImg({ id: 'i1', meta: null }),
      makeImg({ id: 'i2', meta: 'not-json{]' }),
      makeImg({ id: 'i_main', isMain: 1, meta: null }),
    ]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front' },
    })
    // 没有变体能命中 → 兜底主图
    expect(r.fellBackToMain).toBe(true)
  })

  it('location 维度（与现有 location-asset.pickBestVariant 一致评分）', async () => {
    const imgs = [
      makeImg({ id: 'a', meta: { angle: 'wide' } }), // 4
      makeImg({ id: 'b', meta: { angle: 'wide', time: 'morning' } }), // 6
      makeImg({ id: 'c', meta: { angle: 'wide', time: 'morning', weather: 'sunny' } }), // 7
      makeImg({ id: 'main', isMain: 1, meta: {} }),
    ]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'location',
      bindingId: 'lb1',
      dims: { angle: 'wide', time: 'morning', weather: 'sunny' },
    })
    expect(r.image?.id).toBe('c')
    expect(r.score).toBe(7)
  })

  /*
   * P-A（2026-09-16）：AssetGallery 派生槽位图把视角写在 label 列（front_half 等），
   * metadata.view 缺失时 selector 用 label 补齐 view 维度，dims.view 得以命中。
   */
  it('metadata.view 缺失时以 label 列对齐 view 维度（P-A 派生槽位图）', async () => {
    const withLabel = (opts: { id: string; label: string | null; isMain?: number; meta?: Record<string, unknown> | null }) => {
      const img = makeImg({ id: opts.id, isMain: opts.isMain, meta: opts.meta ?? null })
      ;(img as any).label = opts.label
      return img
    }
    const imgs = [
      withLabel({ id: 'i_half', label: 'front_half' }), // label 命中 view +4
      withLabel({ id: 'i_left', label: 'left_3q' }), // 0 分
    ]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front_half' },
    })
    expect(r.image?.id).toBe('i_half')
    expect(r.score).toBe(4)
    expect(r.matchedFields).toEqual(['view'])
  })

  it('metadata.view 有值时优先于 label（手工标注权威）', async () => {
    const img = makeImg({ id: 'i1', meta: { view: 'front' } })
    ;(img as any).label = 'left_3q'
    const r = await pickReferenceImage(fakeImageSvc([img]), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front' },
    })
    expect(r.image?.id).toBe('i1')
    expect(r.score).toBe(4)
  })

  /*
   * S-05 定妆确认闸门（2026-09-17）：
   * 只有 confirmed=1 的图参与选图；资产无 confirmed 图时回退 is_main 主图 + console.warn。
   */
  it('S-05：未 confirmed 的变体不参与评分（即使维度命中）', async () => {
    const imgs = [
      makeImg({ id: 'i_unconfirmed', confirmed: 0, meta: { view: 'front', expression: 'happy' } }), // 7 分但未确认
      makeImg({ id: 'i_confirmed', confirmed: 1, meta: {} }), // 0 分但已确认
      makeImg({ id: 'i_main', isMain: 1, confirmed: 1, meta: {} }),
    ]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front', expression: 'happy' },
    })
    // 未确认变体被排除；confirmed 变体 0 分 → 兜底 confirmed 主图
    expect(r.image?.id).toBe('i_main')
    expect(r.fellBackToMain).toBe(true)
  })

  it('S-05：资产无 confirmed 图 → 回退 is_main 主图并 console.warn（老数据兼容）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const imgs = [
        makeImg({ id: 'i1', confirmed: 0, meta: { view: 'front' } }),
        makeImg({ id: 'i_main', isMain: 1, confirmed: 0, meta: {} }),
      ]
      const r = await pickReferenceImage(fakeImageSvc(imgs), {
        kind: 'character',
        bindingId: 'cb1',
        dims: { view: 'front' },
      })
      expect(r.image?.id).toBe('i_main')
      expect(r.fellBackToMain).toBe(true)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('无 confirmed 定妆图'))
    } finally {
      warn.mockRestore()
    }
  })

  it('S-05：无 confirmed 图且无主图 → image=null（不注入参考）', async () => {
    const imgs = [makeImg({ id: 'i1', confirmed: 0, meta: { view: 'front' } })]
    const r = await pickReferenceImage(fakeImageSvc(imgs), {
      kind: 'character',
      bindingId: 'cb1',
      dims: { view: 'front' },
    })
    expect(r.image).toBeNull()
  })
})
