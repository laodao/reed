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

import { describe, it, expect } from 'vitest'
import {
  pickReferenceImage,
  scoreVariant,
  type ReferencePickInput,
} from '@core/modules/episode-production/render/keyframe/reference-image-selector'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

function makeImg(opts: {
  id: string
  isMain?: number
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
  it('多变体取最高分；相同分数取查询顺序第一个', async () => {
    const imgs = [
      makeImg({ id: 'i1', meta: { view: 'left' } }), // 0 分
      makeImg({ id: 'i2', meta: { view: 'front' } }), // 4 分
      makeImg({ id: 'i3', meta: { view: 'front', expression: 'happy' } }), // 7 分
      makeImg({ id: 'i4', meta: { view: 'front', expression: 'happy', outfit: 'casual' } }), // 9 分
      makeImg({ id: 'i_main', isMain: 1, meta: {} }),
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
})
