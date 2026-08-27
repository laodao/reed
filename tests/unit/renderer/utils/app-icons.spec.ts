/**
 * 应用图标工具测试
 * @module tests/renderer/utils/app-icons
 * @description resolveAppIcon：应用 icon 优先 → 应用分类映射 → 默认；
 *              iconForWorkflowCategory：工作流分类（英文）→ 图标。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveAppIcon,
  iconForWorkflowCategory,
  DEFAULT_APP_ICON,
} from '../../../../src/renderer/src/utils/app-icons'

describe('resolveAppIcon', () => {
  it('应用自带 icon 优先（含空白修剪）', () => {
    expect(resolveAppIcon('📰', '新闻资讯')).toBe('📰')
    expect(resolveAppIcon(' 🎬 ', '视频处理')).toBe('🎬')
  })

  it('icon 为空时按应用分类映射', () => {
    expect(resolveAppIcon('', '新闻资讯')).toBe('📰')
    expect(resolveAppIcon(null, '文案写作')).toBe('✍️')
    expect(resolveAppIcon(undefined, '电商')).toBe('🛍️')
  })

  it('icon 与分类都无 → 默认 📦', () => {
    expect(resolveAppIcon(null, null)).toBe(DEFAULT_APP_ICON)
    expect(resolveAppIcon('', '未知分类')).toBe(DEFAULT_APP_ICON)
  })
})

describe('iconForWorkflowCategory', () => {
  it('工作流分类（英文短词）→ 图标', () => {
    expect(iconForWorkflowCategory('news')).toBe('📰')
    expect(iconForWorkflowCategory('writing')).toBe('✍️')
    expect(iconForWorkflowCategory('office')).toBe('📊')
    expect(iconForWorkflowCategory('research')).toBe('🔍')
    expect(iconForWorkflowCategory('ecommerce')).toBe('🛍️')
  })

  it('大小写不敏感；未知/空 → 默认 📦', () => {
    expect(iconForWorkflowCategory('NEWS')).toBe('📰')
    expect(iconForWorkflowCategory('unknown')).toBe(DEFAULT_APP_ICON)
    expect(iconForWorkflowCategory(null)).toBe(DEFAULT_APP_ICON)
    expect(iconForWorkflowCategory(undefined)).toBe(DEFAULT_APP_ICON)
  })
})
