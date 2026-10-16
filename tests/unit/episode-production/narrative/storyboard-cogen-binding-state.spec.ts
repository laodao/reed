/**
 * storyboard-cogen buildBindingState 单测（2026-09-24 一致性修复 A2/A4）
 * @module tests/unit/episode-production/narrative/storyboard-cogen-binding-state
 *
 * buildBindingState 是 private 方法，这里 mock 三个资产 service 模块
 * （listByProject / getEffectiveData），不碰 DB / LLM，验证：
 *   1. linked_lw 资产（standaloneName/overrideName 均为 null）经 getEffectiveData
 *      投影后能建出索引（含 alias 候选名），不再被跳过；
 *   2. 快照 description 取投影后字段（角色 = description + appearance，对齐
 *      asset-roster-builder 口径），buildExistingAssets 注入的就是投影值；
 *   3. 单条资产投影失败跳过 + warn，不阻断其余资产；
 *   4. standalone 资产行为不变（回归）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { normalizeBindingName } from '@core/platform/episode-production/assets/services/binding-name-utils'

const mocks = vi.hoisted(() => ({
  charList: vi.fn(),
  charEff: vi.fn(),
  locList: vi.fn(),
  locEff: vi.fn(),
  itemList: vi.fn(),
  itemEff: vi.fn(),
}))

vi.mock('@core/platform/episode-production/assets/services/character-asset.service', () => ({
  CharacterAssetService: class {
    listByProject = mocks.charList
    getEffectiveData = mocks.charEff
  },
}))
vi.mock('@core/platform/episode-production/assets/services/location-asset.service', () => ({
  LocationAssetService: class {
    listByProject = mocks.locList
    getEffectiveData = mocks.locEff
  },
}))
vi.mock('@core/platform/episode-production/assets/services/item-asset.service', () => ({
  ItemAssetService: class {
    listByProject = mocks.itemList
    getEffectiveData = mocks.itemEff
  },
}))
vi.mock('@core/platform/episode-production/assets/services/asset-image.service', () => ({
  AssetImageService: class {},
}))

import { StoryboardCogenService } from '@core/platform/episode-production/narrative/services/storyboard-cogen.service'

function buildState() {
  const svc = new StoryboardCogenService({} as any)
  return (svc as any).buildBindingState('p1') as Promise<{
    charIndex: Map<string, { id: string; name: string; description: string | null }>
    locIndex: Map<string, { id: string; name: string; description: string | null }>
    itemIndex: Map<string, { id: string; name: string; description: string | null }>
    buildExistingAssets: () => Array<{ kind: string; id: string; name: string; description: string | null }>
  }>
}

beforeEach(() => {
  mocks.charList.mockResolvedValue([])
  mocks.locList.mockResolvedValue([])
  mocks.itemList.mockResolvedValue([])
  mocks.charEff.mockReset()
  mocks.locEff.mockReset()
  mocks.itemEff.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StoryboardCogenService buildBindingState（getEffectiveData 投影）', () => {
  it('linked_lw 角色（standalone/override 名均为 null）经投影建出索引，含 alias 候选', async () => {
    mocks.charList.mockResolvedValue([
      {
        id: 'cb_lw',
        sourceType: 'linked_lw',
        standaloneName: null,
        overrideName: null,
        alias: '三爷 / 云萝',
      },
    ])
    mocks.charEff.mockResolvedValue({
      name: '沈云萝',
      description: '月白锦袍的女捕快，行事利落',
      appearance: '眉眼清冷，束高马尾',
      source: 'linked_lw',
    })

    const state = await buildState()

    const key = normalizeBindingName('沈云萝')
    expect(state.charIndex.get(key)?.id).toBe('cb_lw')
    expect(state.charIndex.get(key)?.name).toBe('沈云萝')
    // alias 拆分候选也进索引
    expect(state.charIndex.get(normalizeBindingName('三爷'))?.id).toBe('cb_lw')
    expect(state.charIndex.get(normalizeBindingName('云萝'))?.id).toBe('cb_lw')
    // 描述口径对齐 asset-roster-builder：description + appearance
    expect(state.charIndex.get(key)?.description).toBe('月白锦袍的女捕快，行事利落 / 眉眼清冷，束高马尾')
    // prompt 注入的已有资产清单就是投影值
    expect(state.buildExistingAssets()).toEqual([
      {
        kind: 'character',
        id: 'cb_lw',
        name: '沈云萝',
        description: '月白锦袍的女捕快，行事利落 / 眉眼清冷，束高马尾',
      },
    ])
  })

  it('linked_lw 地点（仅有双轨列 locationName）经投影建出索引', async () => {
    mocks.locList.mockResolvedValue([
      {
        id: 'lb_lw',
        sourceType: 'linked_lw',
        standaloneName: null,
        overrideName: null,
        locationName: '雪麓山庄',
      },
    ])
    mocks.locEff.mockResolvedValue({
      name: '雪麓山庄',
      description: '依山而建的建筑群，院落层叠',
      source: 'linked_lw',
    })

    const state = await buildState()

    const snap = state.locIndex.get(normalizeBindingName('雪麓山庄'))
    expect(snap?.id).toBe('lb_lw')
    expect(snap?.description).toBe('依山而建的建筑群，院落层叠')
  })

  it('单条资产投影失败跳过 + warn，不阻断其余资产', async () => {
    mocks.charList.mockResolvedValue([
      { id: 'cb_bad', sourceType: 'standalone', standaloneName: '坏资产', overrideName: null, alias: null },
      { id: 'cb_ok', sourceType: 'standalone', standaloneName: '李四', overrideName: null, alias: null },
    ])
    mocks.charEff.mockImplementation(async (id: string) => {
      if (id === 'cb_bad') throw new Error('投影爆炸')
      return { name: '李四', description: '茶馆常客', appearance: undefined, source: 'standalone' }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const state = await buildState()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('cb_bad')
    expect(state.charIndex.has(normalizeBindingName('坏资产'))).toBe(false)
    expect(state.charIndex.get(normalizeBindingName('李四'))?.id).toBe('cb_ok')
  })

  it('standalone 资产行为不变（回归）：standaloneName 命中，描述取 standaloneDescription', async () => {
    mocks.itemList.mockResolvedValue([
      {
        id: 'ib_sword',
        sourceType: 'standalone',
        standaloneName: '青龙剑',
        standaloneDescription: '三尺青锋，剑鞘嵌绿松石',
        overrideName: null,
        itemName: null,
      },
    ])
    mocks.itemEff.mockResolvedValue({
      name: '青龙剑',
      description: '三尺青锋，剑鞘嵌绿松石',
      source: 'standalone',
    })

    const state = await buildState()

    const snap = state.itemIndex.get(normalizeBindingName('《青龙剑》'))
    expect(snap?.id).toBe('ib_sword')
    expect(snap?.description).toBe('三尺青锋，剑鞘嵌绿松石')
  })
})
