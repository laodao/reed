/**
 * 资产中心分类标签构建（stats 响应 → 分类 tabs）
 * @module renderer/views/asset/category-tabs
 * @description 把 assets.stats() 的 { total, byCategory } 映射为分类筛选条：
 *              「全部」= total，各大类 = byCategory[c]。
 *
 *              历史上出现回归：调用方只把 byCategory 存进 state，导致
 *              「全部」恒为 0（stats.value.total 取不到）——统一走本函数，
 *              保证 total 与 byCategory 同时生效。
 */

import type { AssetCategory } from '@shared/types/asset.types'

/** 资产中心统计（与后端 AssetService.getStats 返回结构一致） */
export interface AssetStats {
  total: number
  byCategory: Record<string, number>
}

export interface CategoryTab {
  value: AssetCategory | ''
  label: string
  count: number
}

/**
 * stats 响应 → 分类标签列表：第一个是「全部」（count=total），
 * 其后按 categoryLabels 顺序输出各大类（count=byCategory，缺省 0）。
 */
export function buildCategoryTabs(
  stats: AssetStats | null | undefined,
  categoryLabels: Record<AssetCategory, string>,
): CategoryTab[] {
  const s: AssetStats = stats ?? { total: 0, byCategory: {} }
  return [
    { value: '', label: '全部', count: s.total },
    ...(Object.keys(categoryLabels) as AssetCategory[]).map(c => ({
      value: c,
      label: categoryLabels[c],
      count: s.byCategory[c] ?? 0,
    })),
  ]
}
