/**
 * 设置状态管理
 * @module stores/settings
 * @description 管理应用程序的全局设置（主题 / 语言 / 字体大小）。
 *              FU5-A6 落地实现：之前 9 个方法全是 `throw Error('Not implemented')` —
 *              这次按 spec G1（UI 必须支持主题切换）真实实现。
 */

import { ref, onUnmounted } from 'vue'
import { defineStore } from 'pinia'
import type { ThemeMode, Language, FontSize } from '../../../shared/types/settings.types'
import { fontSizeMap } from '../../../shared/types/settings.types'

/** 系统主题变化监听器引用（auto 模式时跟随系统） */
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('auto')
  const language = ref<Language>('zh-CN')
  const fontSize = ref<FontSize>('medium')
  const dataPath = ref<string>('')
  /** 当前实际生效的暗色态（auto 模式下随系统） */
  const isDark = ref<boolean>(false)

  // ─── settings IPC 适配（PC + Web 双端共用 electronAPI.settings.get/set） ──
  async function ipcGet(key: string): Promise<any> {
    try {
      const api = (window as any).electronAPI?.settings
      if (!api?.get) return null
      const resp = await api.get(key)
      return resp?.success ? resp.data : null
    } catch {
      return null
    }
  }

  async function ipcSet(key: string, value: any): Promise<void> {
    try {
      const api = (window as any).electronAPI?.settings
      if (!api?.set) return
      await api.set(key, value)
    } catch (e) {
      console.warn(`[settings] set ${key} 失败`, e)
    }
  }

  /**
   * 加载设置（启动时调用）。
   * 1. 从 settings:get 拉取 theme / language / fontSize
   * 2. 设置响应式状态
   * 3. 应用主题 + 字体大小到 DOM
   * 4. auto 模式注册系统主题监听
   */
  async function loadSettings(): Promise<void> {
    const [savedTheme, savedLang, savedFs] = await Promise.all([
      ipcGet('theme'),
      ipcGet('language'),
      ipcGet('fontSize'),
    ])
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') {
      theme.value = savedTheme as ThemeMode
    }
    if (savedLang === 'zh-CN' || savedLang === 'en-US') {
      language.value = savedLang as Language
    }
    if (savedFs === 'small' || savedFs === 'medium' || savedFs === 'large') {
      fontSize.value = savedFs as FontSize
    }

    // 应用
    const dark = theme.value === 'dark' || (theme.value === 'auto' && getSystemTheme())
    applyTheme(dark)
    applyFontSize(fontSize.value)
    if (theme.value === 'auto') setupSystemThemeListener()
    else removeSystemThemeListener()
  }

  /**
   * 切换主题模式（用户主动）。
   */
  async function setTheme(mode: ThemeMode): Promise<void> {
    theme.value = mode
    if (mode === 'auto') {
      setupSystemThemeListener()
      applyTheme(getSystemTheme())
    } else {
      removeSystemThemeListener()
      applyTheme(mode === 'dark')
    }
    await ipcSet('theme', mode)
  }

  /**
   * 应用主题：toggle html.dark + 暴露 isDark ref（element-plus 暗主题 css 自动接管）。
   */
  function applyTheme(dark: boolean): void {
    isDark.value = dark
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  /**
   * 检测系统主题偏好（prefers-color-scheme）。
   */
  function getSystemTheme(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    )
  }

  /**
   * auto 模式监听系统主题切换。
   */
  function setupSystemThemeListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return
    removeSystemThemeListener()
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    systemThemeListener = (e: MediaQueryListEvent) => {
      if (theme.value === 'auto') applyTheme(e.matches)
    }
    // 兼容老 API（Safari < 14 用 addListener）
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', systemThemeListener)
    } else if (typeof (mql as any).addListener === 'function') {
      ;(mql as any).addListener(systemThemeListener)
    }
  }

  function removeSystemThemeListener(): void {
    if (!systemThemeListener || typeof window === 'undefined' || !window.matchMedia) {
      systemThemeListener = null
      return
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', systemThemeListener)
    } else if (typeof (mql as any).removeListener === 'function') {
      ;(mql as any).removeListener(systemThemeListener)
    }
    systemThemeListener = null
  }

  async function setLanguage(lang: Language): Promise<void> {
    if (lang !== 'zh-CN' && lang !== 'en-US') return
    language.value = lang
    await ipcSet('language', lang)
  }

  async function setFontSize(size: FontSize): Promise<void> {
    if (size !== 'small' && size !== 'medium' && size !== 'large') return
    fontSize.value = size
    applyFontSize(size)
    await ipcSet('fontSize', size)
  }

  /** 应用字体大小到 :root font-size（全局 rem 跟随）。 */
  function applyFontSize(size: FontSize): void {
    const fs = fontSizeMap[size] ?? fontSizeMap.medium
    document.documentElement.style.fontSize = fs
  }

  /** 启动一次（App.vue 内调） */
  async function initSettings(): Promise<void> {
    await loadSettings()
  }

  onUnmounted(() => {
    removeSystemThemeListener()
  })

  return {
    // 状态
    theme,
    language,
    fontSize,
    dataPath,
    isDark,
    // 方法
    initSettings,
    loadSettings,
    setTheme,
    setLanguage,
    setFontSize,
    // 常量
    fontSizeMap,
  }
})
