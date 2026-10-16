/**
 * 镜头真实场景词典测试
 * @module tests/unit/shared/video-scene-lexicon
 * @description 词典是配图相关性的数据底座，必须守纪律：
 *  - 每条都有主题簇 / 触发词 / 可拍场景 / 英文检索词（检索词只含英文与数字，素材库才搜得到）
 *  - 场景描述不得要求画面出现文字（允许"无文字/不可读"这类负向短语）
 *  - 用户点名的两类主题必须被覆盖：产业指数（工业制造）与进出口外贸（港口码头）
 *  - 命中排序稳定：命中词越多越长越靠前；无命中返回空
 */
import { describe, it, expect } from 'vitest'
import {
  SHOT_SCENE_LEXICON,
  SCENE_TEXT_FORBIDDEN_MARKERS,
  matchSceneRules,
  renderSceneLexiconText,
  findSceneRule,
} from '@shared/types/video-scene-lexicon'

describe('场景词典数据完整性', () => {
  it('条目规模与字段齐全', () => {
    expect(SHOT_SCENE_LEXICON.length).toBeGreaterThanOrEqual(30)
    for (const r of SHOT_SCENE_LEXICON) {
      expect(r.conceptClass.trim(), 'conceptClass 不能为空').not.toBe('')
      expect(r.match.length, `${r.conceptClass} 触发词不能为空`).toBeGreaterThan(0)
      expect(r.scene.length, `${r.conceptClass} 场景描述过短`).toBeGreaterThan(10)
      expect(r.searchQuery.trim(), `${r.conceptClass} 检索词不能为空`).not.toBe('')
    }
  })

  it('检索词是英文短语（素材库只认英文）', () => {
    for (const r of SHOT_SCENE_LEXICON) {
      expect(r.searchQuery, `${r.conceptClass} 检索词含中文：${r.searchQuery}`).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9\s'-]*$/)
      for (const alt of r.altQueries || []) {
        expect(alt, `${r.conceptClass} 备选检索词含中文：${alt}`).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9\s'-]*$/)
      }
    }
  })

  it('场景描述不得要求画面出现文字', () => {
    for (const r of SHOT_SCENE_LEXICON) {
      for (const m of SCENE_TEXT_FORBIDDEN_MARKERS) {
        expect(r.scene, `${r.conceptClass} 场景含禁用词「${m}」`).not.toContain(m)
      }
    }
  })

  it('主题簇名唯一（避免维护时重复）', () => {
    const names = SHOT_SCENE_LEXICON.map(r => r.conceptClass)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('用户点名的主题必须覆盖', () => {
  it('产业指数 → 工业厂房产线（非抽象图形）', () => {
    const rules = matchSceneRules('前8月产业指数回升，制造业产能利用率提高')
    expect(rules.length).toBeGreaterThan(0)
    const top = rules[0]
    expect(top.conceptClass).toContain('工业制造')
    expect(top.searchQuery).toMatch(/factory|manufactur|assembly/i)
  })

  it('进出口外贸 → 港口码头繁忙场景', () => {
    const rules = matchSceneRules('外贸进出口数据超预期，港口吞吐量创新高')
    expect(rules.length).toBeGreaterThan(0)
    expect(rules[0].conceptClass).toContain('进出口')
    expect(rules[0].searchQuery).toMatch(/port|container|shipping/i)
  })

  it('汇率与股市各自命中对应簇', () => {
    expect(matchSceneRules('人民币汇率大幅波动')[0].conceptClass).toContain('汇率')
    expect(matchSceneRules('A股指数午后跳水，市值蒸发')[0].conceptClass).toContain('股市')
  })
})

describe('检索与渲染', () => {
  it('无命中返回空数组（调用方据此走兜底）', () => {
    expect(matchSceneRules('')).toEqual([])
    expect(matchSceneRules('zzzz 无任何主题词')).toEqual([])
  })

  it('按命中词权重排序并受 limit 约束', () => {
    const rules = matchSceneRules('外贸出口与港口物流仓储', 2)
    expect(rules.length).toBe(2)
    expect(rules[0].conceptClass).toContain('进出口')
  })

  it('渲染文本含场景、检索词与备选检索词', () => {
    const text = renderSceneLexiconText([findSceneRule('进出口·外贸·港口')!])
    expect(text).toContain('集装箱码头')
    expect(text).toContain('container port terminal')
    expect(text).toContain('备选检索词')
  })

  it('省略参数时渲染全量词典', () => {
    const text = renderSceneLexiconText()
    for (const r of SHOT_SCENE_LEXICON) expect(text).toContain(r.searchQuery)
  })
})