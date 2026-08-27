/**
 * 应用图标工具（分类 → 美观 emoji）
 * @module renderer/utils/app-icons
 * @description 应用列表/详情展示 icon：应用自带的 icon 优先；为空时按分类自动匹配
 *              合适图标（用户自建应用发布时若未填 icon，自动带出工作流分类对应图标）；
 *              分类未命中回退通用 📦。内置应用自带图标不受影响。
 */

/** 应用分类 → 图标（应用列表显示；覆盖内置应用分类与常见自定义分类） */
export const APP_CATEGORY_ICONS: Record<string, string> = {
  新闻资讯: '📰',
  文案写作: '✍️',
  网页工具: '📄',
  图文设计: '🎨',
  视频处理: '🎬',
  办公效率: '📊',
  求职: '💼',
  调研: '🔍',
  电商: '🛍️',
  学习: '📚',
  知识: '📖',
  行业: '🏭',
  会议纪要: '📝',
  邮件: '✉️',
  数据分析: '📈',
  竞品分析: '🏆',
}

/** 工作流分类（英文短词，发布为应用时自动带出 icon 用）→ 图标 */
export const WORKFLOW_CATEGORY_ICONS: Record<string, string> = {
  news: '📰',
  writing: '✍️',
  research: '🔍',
  office: '📊',
  ecommerce: '🛍️',
  learning: '📚',
  career: '💼',
  media: '🎬',
  knowledge: '📄',
}

/** 通用回退图标 */
export const DEFAULT_APP_ICON = '📦'

/** 解析应用展示图标：应用 icon 优先 → 应用分类 → 默认 */
export function resolveAppIcon(icon: string | null | undefined, category: string | null | undefined): string {
  if (icon && icon.trim()) return icon.trim()
  if (category) {
    const hit = APP_CATEGORY_ICONS[category.trim()]
    if (hit) return hit
  }
  return DEFAULT_APP_ICON
}

/** 工作流分类 → 应用图标（发布为应用时未填 icon 自动带出；未命中默认） */
export function iconForWorkflowCategory(category: string | null | undefined): string {
  if (category) {
    const hit = WORKFLOW_CATEGORY_ICONS[category.trim().toLowerCase()]
    if (hit) return hit
  }
  return DEFAULT_APP_ICON
}
