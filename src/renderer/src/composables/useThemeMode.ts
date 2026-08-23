/**
 * 主题模式管理（跟随系统颜色主题）
 * @module composables/useThemeMode
 *
 * themeMode: 'auto'（跟随系统 prefers-color-scheme）| 'light' | 'dark'
 * 切换 html.dark class（Element Plus dark css-vars 生效）+ data-theme-mode 属性。
 * 与 useTheme（主题色，data-theme）正交：主题色 + 深浅色可自由组合。
 * 持久化：settings 存储 themeMode 键。
 */

export type ThemeMode = 'auto' | 'light' | 'dark'

const THEME_MODE_KEY = 'themeMode'

// 模块级状态（单例，与 useAppSettings 同风格）
let mode: ThemeMode = 'auto'
let mql: MediaQueryList | null = null
let mqlListener: ((e: MediaQueryListEvent) => void) | null = null

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** 计算当前是否深色并应用到 html.dark */
export function applyThemeMode(m: ThemeMode): void {
  if (typeof document === 'undefined') return
  const dark = m === 'dark' || (m === 'auto' && systemIsDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.setAttribute('data-theme-mode', m)
}

function removeSystemListener(): void {
  if (mql && mqlListener) {
    mql.removeEventListener('change', mqlListener)
  }
  mql = null
  mqlListener = null
}

function setupSystemListener(): void {
  removeSystemListener()
  if (mode !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return
  mql = window.matchMedia('(prefers-color-scheme: dark)')
  mqlListener = () => applyThemeMode(mode)
  mql.addEventListener('change', mqlListener)
}

/** 从设置存储加载（应用启动时调用一次） */
export async function initThemeMode(): Promise<void> {
  try {
    if (window.electronAPI?.settings?.get) {
      const r = await window.electronAPI.settings.get()
      if (r.success && r.data && typeof r.data[THEME_MODE_KEY] === 'string') {
        mode = r.data[THEME_MODE_KEY] as ThemeMode
      }
    }
  } catch {
    /* 读取失败用默认 auto */
  }
  applyThemeMode(mode)
  setupSystemListener()
}

/** 设置主题模式并持久化 */
export async function setThemeMode(m: ThemeMode): Promise<void> {
  mode = m
  applyThemeMode(m)
  setupSystemListener()
  try {
    if (window.electronAPI?.settings?.set) {
      await window.electronAPI.settings.set(THEME_MODE_KEY, m)
    }
  } catch {
    /* 持久化失败不影响本次切换 */
  }
}

export function useThemeMode() {
  return {
    get mode(): ThemeMode {
      return mode
    },
    init: initThemeMode,
    set: setThemeMode,
    apply: applyThemeMode,
  }
}

/** 便捷单例（组件外使用） */
export const themeModeManager = {
  get mode(): ThemeMode {
    return mode
  },
  init: initThemeMode,
  set: setThemeMode,
  apply: applyThemeMode,
}
