/**
 * 幻灯片主题（播客视频画面）
 * @module shared/types/slide-themes
 * @description 主题元数据的 shared 单一事实源：core 渲染（slide-svg）与
 *              编辑器表单（workflow-node-forms）共用，避免 shared 反向依赖 core。
 */

export interface SlideTheme {
  id: string
  label: string
  /** 页面背景 */
  bg: string
  /** 主标题/强调 */
  title: string
  /** 正文 */
  text: string
  /** 次要信息（页脚/导语） */
  sub: string
  /** 主题强调色（装饰条/要点标记） */
  accent: string
}

/** 内置主题（id 与 start.theme / slide-render.config.theme 对应） */
export const SLIDE_THEMES: SlideTheme[] = [
  { id: 'light', label: '简约白', bg: '#f7f9fc', title: '#1e293b', text: '#2b3a55', sub: '#94a3b8', accent: '#3b82f6' },
  { id: 'dark', label: '深色科技', bg: '#0f172a', title: '#f1f5f9', text: '#cbd5e1', sub: '#64748b', accent: '#38bdf8' },
  { id: 'warm', label: '暖色杂志', bg: '#fdf8f2', title: '#44403c', text: '#57534e', sub: '#a8a29e', accent: '#ea580c' },
  { id: 'green', label: '学术绿', bg: '#f0fdf4', title: '#14532d', text: '#1f4d33', sub: '#86b99b', accent: '#16a34a' },
]

export function getSlideTheme(id: string): SlideTheme {
  return SLIDE_THEMES.find(t => t.id === id) ?? SLIDE_THEMES[0]
}

/** 主题 select 选项（编辑器表单/开始节点共用） */
export const SLIDE_THEME_OPTIONS = SLIDE_THEMES.map(t => ({ label: t.label, value: t.id }))
