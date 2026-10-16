/**
 * 剧集制作视图层共享 UI 工具
 * @module views/episode-production-ui
 */

// ==================== 项目 tab 标题（2026-10-14 用户需求） ====================

/**
 * 项目 tab 标题：显示项目名而非统一的「剧集制作」；
 * 超 6 字截断加省略号（tab 宽度有限，项目名往往很长）。
 * 空名兜底回 meta.title 的默认值。首页 / 项目列表 / 导入卡的 preloadTab 与
 * 工作台、创建页自身的 updateTabTitle 共用这一份截断口径。
 */
export function epTabTitleOf(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return '剧集制作'
  return n.length > 6 ? `${n.slice(0, 6)}...` : n
}
