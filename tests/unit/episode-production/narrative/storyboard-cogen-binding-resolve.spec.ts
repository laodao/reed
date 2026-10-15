/**
 * storyboard-cogen D2 绑定构造单测（2026-09-21 去重归一）
 * @module tests/unit/episode-production/narrative/storyboard-cogen-binding-resolve
 *
 * resolveCharacterBindings / resolveLocationBinding / resolveItemBindings 是
 * private 方法，这里用 mock service 直接调（不碰 LLM / DB），验证：
 *   1. 名字索引用归一化 key（全角空格差异也命中）；
 *   2. 索引未命中 → svc.findByName 兜底（命中则复用，不再 createStandalone）；
 *   3. 地点索引走前缀归一（"雪麓山庄书房" 命中已有 "书房"）；
 *   4. 全部未命中 → createStandalone 新建并写入索引（归一化 key）。
 */

import { describe, it, expect, vi } from 'vitest'
import { StoryboardCogenService } from '@core/platform/episode-production/narrative/services/storyboard-cogen.service'
import { normalizeBindingName } from '@core/platform/episode-production/assets/services/binding-name-utils'

function buildSvc(overrides: Record<string, unknown> = {}) {
  return {
    findByName: vi.fn().mockResolvedValue(null),
    createStandalone: vi.fn().mockImplementation(async (input: { name: string }) => ({
      id: `new_${input.name}`,
    })),
    updateStandalone: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

function buildResult() {
  return { sceneId: 'ss1', sceneNumber: 1, shotCount: 0, createdBindings: [], reusedBindings: [] } as any
}

/** 描述足够厚（≥30 字且含服饰关键词），避免触发 O3 富化回填干扰断言 */
const FAT_DESC = '一袭月白色暗云纹锦袍，腰束墨色丝绦，衣摆绣缠枝莲纹，足蹬薄底快靴'

function cogenOutput(overrides: Record<string, unknown> = {}): any {
  return {
    assets: {
      characters: [{ name: '沈云萝', description: FAT_DESC, outfit: '月白锦袍' }],
      location: { name: '书房', description: FAT_DESC },
      items: [],
    },
    shots: [],
    ...overrides,
  }
}

describe('StoryboardCogenService D2 绑定构造（归一化）', () => {
  const svc = new StoryboardCogenService({} as any)

  it('索引 key 归一化：全角空格差异直接命中，不走 findByName', async () => {
    const index = new Map([
      [normalizeBindingName('沈云萝'), { id: 'cb1', name: '沈云萝', description: FAT_DESC }],
    ])
    const mock = buildSvc()
    const result = buildResult()
    await (svc as any).resolveCharacterBindings(
      cogenOutput({ assets: { characters: [{ name: '沈　云萝', description: FAT_DESC }], location: { name: '书房', description: FAT_DESC }, items: [] } }),
      index, mock, 'p1', null, result, [],
    )
    expect(mock.findByName).not.toHaveBeenCalled()
    expect(mock.createStandalone).not.toHaveBeenCalled()
    expect(result.reusedBindings).toEqual([{ kind: 'character', id: 'cb1', name: '沈　云萝' }])
  })

  it('索引未命中 → findByName 兜底命中 → 复用并写入索引', async () => {
    const index = new Map()
    const mock = buildSvc({
      findByName: vi.fn().mockResolvedValue({
        id: 'cb_found',
        standaloneDescription: FAT_DESC,
        overrideDescription: null,
      }),
    })
    const result = buildResult()
    const resolved = await (svc as any).resolveCharacterBindings(
      cogenOutput(), index, mock, 'p1', null, result, [],
    )
    expect(mock.findByName).toHaveBeenCalledWith('p1', '沈云萝')
    expect(mock.createStandalone).not.toHaveBeenCalled()
    expect(result.reusedBindings).toEqual([{ kind: 'character', id: 'cb_found', name: '沈云萝' }])
    expect(index.get(normalizeBindingName('沈云萝'))?.id).toBe('cb_found')
    expect(resolved.get('沈云萝')?.id).toBe('cb_found')
  })

  it('全部未命中 → createStandalone 新建，索引按归一化 key 写入', async () => {
    const index = new Map()
    const mock = buildSvc()
    const result = buildResult()
    await (svc as any).resolveCharacterBindings(
      cogenOutput(), index, mock, 'p1', 'user1', result, [],
    )
    expect(mock.createStandalone).toHaveBeenCalledTimes(1)
    expect(result.createdBindings).toEqual([{ kind: 'character', id: 'new_沈云萝', name: '沈云萝' }])
    expect(index.get(normalizeBindingName('沈云萝'))?.id).toBe('new_沈云萝')
  })

  it('地点：索引前缀归一（"雪麓山庄书房" 命中 "书房"），不走 findByName', async () => {
    const index = new Map([
      [normalizeBindingName('雪麓山庄'), { id: 'lb_manor', name: '雪麓山庄', description: FAT_DESC }],
      [normalizeBindingName('书房'), { id: 'lb_study', name: '书房', description: FAT_DESC }],
    ])
    const mock = buildSvc()
    const result = buildResult()
    const snap = await (svc as any).resolveLocationBinding(
      cogenOutput({ assets: { characters: [], location: { name: '雪麓山庄书房', description: FAT_DESC }, items: [] } }),
      index, mock, 'p1', null, result, [],
    )
    expect(mock.findByName).not.toHaveBeenCalled()
    expect(snap.id).toBe('lb_study')
    expect(result.reusedBindings).toEqual([{ kind: 'location', id: 'lb_study', name: '雪麓山庄书房' }])
  })

  it('物品：索引未命中 → findByName 兜底命中 → 复用', async () => {
    const index = new Map()
    const mock = buildSvc({
      findByName: vi.fn().mockResolvedValue({
        id: 'ib_found',
        standaloneDescription: FAT_DESC,
        overrideDescription: null,
      }),
    })
    const result = buildResult()
    await (svc as any).resolveItemBindings(
      cogenOutput({ assets: { characters: [], location: { name: '书房', description: FAT_DESC }, items: [{ name: '青龙剑', description: FAT_DESC }] } }),
      index, mock, 'p1', null, result, [],
    )
    expect(mock.createStandalone).not.toHaveBeenCalled()
    expect(result.reusedBindings).toEqual([{ kind: 'item', id: 'ib_found', name: '青龙剑' }])
  })
})

/**
 * O3 富化回填污染守卫（2026-09-21 v3 实测）：
 * 宏观尺度地点（雪麓山庄）描述过薄时，cogen 把子场景"掌门书房内景"的
 * 室内尺度描述回填进去，导致平面图 prompt 用室内尺度。
 * 守卫：宏观地点名 + 新描述含室内词 → 跳过回填。
 */
describe('StoryboardCogenService O3 富化回填污染守卫', () => {
  const svc = new StoryboardCogenService({} as any)

  /** 过薄的原描述（触发富化路径） */
  const THIN = '雪麓山庄'
  /** 室内尺度的污染描述（书房/内景） */
  const POLLUTED =
    '掌门书房内景，正中一张紫檀书案，案上堆叠账本与烛台，四壁书架直达房梁，室内陈设雅致'
  /** 正常宏观描述（无室内词） */
  const MACRO_DESC =
    '雪麓山庄依山而建，整座建筑群错落分布于山腰，山门巍峨，院落层叠，远处雪峰环抱'

  function callEnrich(name: string, newDescription: string) {
    const mock = buildSvc()
    const enriched: any[] = []
    const snap = { id: 'lb_root', name, description: THIN }
    return (svc as any)
      .enrichBindingIfThin(mock, 'location', snap, newDescription, enriched)
      .then(() => ({ mock, enriched, snap }))
  }

  it('宏观地点 + 室内尺度描述 → 跳过回填（updateStandalone 不调）', async () => {
    const { mock, enriched, snap } = await callEnrich('雪麓山庄', POLLUTED)
    expect(mock.updateStandalone).not.toHaveBeenCalled()
    expect(enriched).toEqual([])
    expect(snap.description).toBe(THIN)
  })

  it('宏观地点 + 宏观尺度描述 → 正常回填', async () => {
    const { mock, enriched, snap } = await callEnrich('雪麓山庄', MACRO_DESC)
    expect(mock.updateStandalone).toHaveBeenCalledWith('lb_root', { description: MACRO_DESC })
    expect(enriched).toEqual([{ kind: 'location', id: 'lb_root', name: '雪麓山庄' }])
    expect(snap.description).toBe(MACRO_DESC)
  })

  it('名称本身含室内词（掌门书房）+ 室内描述 → 正常回填（守卫不误伤）', async () => {
    const { mock, enriched } = await callEnrich('掌门书房', POLLUTED)
    expect(mock.updateStandalone).toHaveBeenCalled()
    expect(enriched).toHaveLength(1)
  })
})

describe('location-constraints 尺度判定导出（O3 守卫共用）', () => {
  it('isMacroScaleLocationName / containsInteriorScaleWord', async () => {
    const { isMacroScaleLocationName, containsInteriorScaleWord } = await import(
      '@core/platform/episode-production/assets/prompts/location-constraints'
    )
    expect(isMacroScaleLocationName('雪麓山庄')).toBe(true)
    // "掌门书房"的"门"命中宏观词表，但"房"是室内词——守卫以室内词优先（见上组用例）
    expect(isMacroScaleLocationName('掌门书房')).toBe(true)
    expect(containsInteriorScaleWord('掌门书房')).toBe(true)
    expect(isMacroScaleLocationName(null)).toBe(false)
    expect(containsInteriorScaleWord('掌门书房内景，室内陈设雅致')).toBe(true)
    expect(containsInteriorScaleWord('依山而建的建筑群，院落层叠')).toBe(false)
    expect(containsInteriorScaleWord('')).toBe(false)
  })
})
