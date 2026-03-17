/**
 * 全局设置管理
 * @module composables/useSettings
 * @description 管理应用程序的全局设置
 */

import { ref, reactive, watch, onMounted } from 'vue'

/**
 * 字体大小配置
 */
export const fontSizeConfig = {
  small: {
    label: '小',
    baseSize: '13px',
    scale: 0.875
  },
  medium: {
    label: '中',
    baseSize: '14px',
    scale: 1
  },
  large: {
    label: '大',
    baseSize: '16px',
    scale: 1.14
  }
} as const

export type FontSize = keyof typeof fontSizeConfig

/**
 * 语言配置
 */
export const languageConfig = {
  'zh-CN': {
    label: '简体中文',
    locale: 'zh-CN'
  },
  'en-US': {
    label: 'English',
    locale: 'en-US'
  }
} as const

export type Language = keyof typeof languageConfig

/**
 * 全局设置状态
 */
const settings = reactive({
  language: 'zh-CN' as Language,
  fontSize: 'medium' as FontSize
})

const isLoaded = ref(false)

/**
 * 应用字体大小到 DOM
 */
const applyFontSize = (size: FontSize) => {
  const config = fontSizeConfig[size]
  if (!config) return

  const root = document.documentElement
  root.style.setProperty('--font-size-base', config.baseSize)
  root.setAttribute('data-font-size', size)
}

/**
 * 应用语言设置
 * 注：当前项目暂未实现 i18n，这里只是设置 HTML lang 属性
 */
const applyLanguage = (language: Language) => {
  const config = languageConfig[language]
  if (!config) return

  const root = document.documentElement
  root.setAttribute('lang', config.locale)
}

/**
 * 从存储加载设置
 */
const loadSettings = async () => {
  if (isLoaded.value) return

  try {
    if (window.electronAPI?.settings?.get) {
      const result = await window.electronAPI.settings.get()
      if (result.success && result.data) {
        settings.language = result.data.language || 'zh-CN'
        settings.fontSize = result.data.fontSize || 'medium'
      }
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }

  // 应用设置
  applyFontSize(settings.fontSize)
  applyLanguage(settings.language)

  isLoaded.value = true
}

/**
 * 保存设置到存储
 */
const saveSettings = async () => {
  try {
    if (window.electronAPI?.settings?.set) {
      await window.electronAPI.settings.set('language', settings.language)
      await window.electronAPI.settings.set('fontSize', settings.fontSize)
    }
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}

/**
 * 设置语言
 */
const setLanguage = async (language: Language) => {
  settings.language = language
  applyLanguage(language)
  await saveSettings()
}

/**
 * 设置字体大小
 */
const setFontSize = async (size: FontSize) => {
  settings.fontSize = size
  applyFontSize(size)
  await saveSettings()
}

/**
 * useSettings composable
 */
export function useSettings() {
  onMounted(() => {
    loadSettings()
  })

  return {
    settings,
    fontSizeConfig,
    languageConfig,
    loadSettings,
    saveSettings,
    setLanguage,
    setFontSize
  }
}

// 导出单例访问（用于在非组件中使用）
export { settings, applyFontSize, applyLanguage, loadSettings }
