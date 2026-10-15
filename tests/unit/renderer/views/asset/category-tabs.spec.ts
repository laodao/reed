import { describe, expect, it } from 'vitest'
import {
  buildCategoryTabs,
  type AssetStats,
} from '../../../../../src/renderer/src/views/asset/category-tabs'

/** 与 ASSET_CATEGORY_LABELS 同构的标签表（测试聚焦映射逻辑，避免引入共享类型依赖） */
const LABELS: Record<string, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
  document: '文档',
  template: '模板',
  text: '文本',
  json: '数据',
  other: '其他',
}

describe('buildCategoryTabs', () => {
  it('「全部」取 stats.total，各大类取 byCategory——不再出现全部=0 的回归', () => {
    const stats: AssetStats = {
      total: 18,
      byCategory: { image: 15, audio: 3 },
    }
    const tabs = buildCategoryTabs(stats, LABELS as never)
    // 第一个是「全部」，计数 = total
    expect(tabs[0]).toEqual({ value: '', label: '全部', count: 18 })
    // 各大类按标签表顺序、取 byCategory 计数
    expect(tabs.find(t => t.value === 'image')?.count).toBe(15)
    expect(tabs.find(t => t.value === 'audio')?.count).toBe(3)
    // 没有计数的分类补 0（而不是 undefined）
    expect(tabs.find(t => t.value === 'video')?.count).toBe(0)
  })

  it('stats 为 null/undefined 时全为 0（兜底）', () => {
    const empty = buildCategoryTabs(undefined, LABELS as never)
    expect(empty[0]).toEqual({ value: '', label: '全部', count: 0 })
    for (const t of empty.slice(1)) expect(t.count).toBe(0)
    expect(empty).toHaveLength(1 + Object.keys(LABELS).length)
  })
})
