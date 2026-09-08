/**
 * V3 通用视觉策略数据测试：visualPolicy / imageryMap / assetUse / 兜底意象
 * @module tests/unit/core/platform/workflow/video-preset-policy
 * @description 验证：
 *  - 六类预设均带 visualPolicy，且模式符合类型语义（财经/资讯/知识/文旅=imagery；
 *    电商/品牌=asset+required）
 *  - 意象表每条：主题簇/触发词/意象描述齐全，意象为"可拍物理场景、无文字"（铁律）
 *  - asset 模式带 assetUse 规则（首帧=素材、负向词），品牌允许少量氛围空镜
 *  - 通用兜底意象表齐全且守纪律；画面策略选项含 auto/imagery/asset
 */
import { describe, it, expect } from 'vitest'
import {
  VIDEO_TYPE_PRESETS,
  VIDEO_IMAGERY_FALLBACK,
  VISUAL_STRATEGY_OPTIONS,
  IMAGERY_NO_TEXT_MARKERS,
  type VideoPresetSpec,
} from '@shared/types/video-presets'

const IMAGERY_IDS = ['financial-deep', 'news-talk', 'knowledge', 'travel']
const ASSET_IDS = ['ecommerce', 'brand']

function expectNoText(imagery: string): void {
  for (const m of IMAGERY_NO_TEXT_MARKERS) {
    expect(imagery, `意象含禁用词「${m}」`).not.toContain(m)
  }
}

describe('V3 visualPolicy 数据完整性', () => {
  it('六类预设均带 visualPolicy：mode/assetDependency 合法', () => {
    expect(VIDEO_TYPE_PRESETS.length).toBeGreaterThanOrEqual(6)
    for (const p of VIDEO_TYPE_PRESETS) {
      const pol = p.visualPolicy
      expect(pol, `${p.id} 缺 visualPolicy`).toBeTruthy()
      expect(['imagery', 'asset']).toContain(pol.mode)
      expect(['none', 'optional', 'required']).toContain(pol.assetDependency)
      expect(Array.isArray(pol.imageryMap)).toBe(true)
    }
  })

  it('叙事抽象类（财经/资讯/知识/文旅）默认 imagery；电商/品牌默认 asset+required', () => {
    for (const id of IMAGERY_IDS) {
      const p = getPreset(id)
      expect(p.visualPolicy.mode).toBe('imagery')
      expect(p.visualPolicy.imageryMap.length).toBeGreaterThanOrEqual(8)
    }
    for (const id of ASSET_IDS) {
      const p = getPreset(id)
      expect(p.visualPolicy.mode).toBe('asset')
      expect(p.visualPolicy.assetDependency).toBe('required')
    }
  })

  it('意象表纪律：每类意象 ≥8 条且 imagery 均为可拍场景、无文字', () => {
    for (const p of VIDEO_TYPE_PRESETS) {
      expect(p.visualPolicy.imageryMap.length, `${p.id} 意象表为空`).toBeGreaterThan(0)
      for (const rule of p.visualPolicy.imageryMap) {
        expect(rule.conceptClass).toBeTruthy()
        expect(rule.match.length).toBeGreaterThan(0)
        expect(rule.imagery.length).toBeGreaterThan(15)
        expectNoText(rule.imagery)
      }
    }
  })

  it('asset 类带 assetUse：首帧=素材；电商禁生成补位并带负向词；品牌允许氛围空镜', () => {
    const ec = getPreset('ecommerce')
    const br = getPreset('brand')
    expect(ec.visualPolicy.assetUse).toBeTruthy()
    expect(ec.visualPolicy.assetUse!.requireFirstFrame).toBe(true)
    expect(ec.visualPolicy.assetUse!.allowGeneratedScene).toBe(false)
    expect(Array.isArray(ec.visualPolicy.assetUse!.negative) && ec.visualPolicy.assetUse!.negative!.length > 0).toBe(true)
    expect(br.visualPolicy.assetUse).toBeTruthy()
    expect(br.visualPolicy.assetUse!.requireFirstFrame).toBe(true)
    expect(br.visualPolicy.assetUse!.allowGeneratedScene).toBe(true)
  })

  it('通用兜底意象表非空且守纪律', () => {
    expect(VIDEO_IMAGERY_FALLBACK.length).toBeGreaterThanOrEqual(6)
    for (const rule of VIDEO_IMAGERY_FALLBACK) {
      expect(rule.conceptClass).toBeTruthy()
      expect(rule.match.length).toBeGreaterThan(0)
      expectNoText(rule.imagery)
    }
  })

  it('画面策略选项含 auto / imagery / asset', () => {
    const vals = VISUAL_STRATEGY_OPTIONS.map(o => o.value)
    expect(vals).toContain('auto')
    expect(vals).toContain('imagery')
    expect(vals).toContain('asset')
  })
})

function getPreset(id: string): VideoPresetSpec {
  const p = VIDEO_TYPE_PRESETS.find(x => x.id === id)
  if (!p) throw new Error(`无预设 ${id}`)
  return p
}
