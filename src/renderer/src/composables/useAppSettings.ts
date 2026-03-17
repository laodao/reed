/**
 * 应用全局设置管理
 * @module composables/useAppSettings
 * @description 管理应用的全局设置（语言、字体大小等）
 */

import { ref, reactive, watch } from 'vue'

/**
 * 字体大小配置
 */
export const fontSizeConfig = {
  small: {
    label: '小',
    baseSize: 13,
    lineHeight: 1.5,
    scale: 0.875
  },
  medium: {
    label: '中',
    baseSize: 14,
    lineHeight: 1.6,
    scale: 1
  },
  large: {
    label: '大',
    baseSize: 16,
    lineHeight: 1.7,
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
 * 应用设置状态
 */
const settings = reactive({
  language: 'zh-CN' as Language,
  fontSize: 'medium' as FontSize
})

/**
 * 是否已初始化
 */
const initialized = ref(false)

/**
 * 应用字体大小到界面
 * @param fontSize - 字体大小
 */
const applyFontSize = (fontSize: FontSize) => {
  const config = fontSizeConfig[fontSize]
  if (!config) return

  const root = document.documentElement

  // 设置全局 CSS 变量
  root.style.setProperty('--font-size-base', `${config.baseSize}px`)
  root.style.setProperty('--line-height-base', `${config.lineHeight}`)

  // 设置 Element Plus 的字体大小变量
  root.style.setProperty('--el-font-size-base', `${config.baseSize}px`)
  root.style.setProperty('--el-font-size-small', `${config.baseSize - 2}px`)
  root.style.setProperty('--el-font-size-extra-small', `${config.baseSize - 4}px`)

  // 设置缩放比例，用于其他需要相对缩放的元素
  root.style.setProperty('--font-scale', `${config.scale}`)

  // 更新 data 属性
  root.setAttribute('data-font-size', fontSize)

  // 更新 body 字体大小（确保全局生效）
  document.body.style.fontSize = `${config.baseSize}px`
}

/**
 * 应用语言到界面
 * @param language - 语言代码
 */
const applyLanguage = (language: Language) => {
  const root = document.documentElement
  root.setAttribute('lang', language)
  root.setAttribute('data-language', language)

  // 更新 i18n 语言
  // 注意：i18n 实例在 composable 外部，需要通过其他方式处理
  // 这里先存储设置，实际的 i18n 切换在 useAppSettings composable 中处理
}

/**
 * 从存储加载设置
 */
const loadSettings = async () => {
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
  initialized.value = true
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
 * 设置字体大小
 */
const setFontSize = async (fontSize: FontSize) => {
  settings.fontSize = fontSize
  applyFontSize(fontSize)
  await saveSettings()
}

/**
 * 设置语言
 */
const setLanguage = async (language: Language) => {
  settings.language = language
  applyLanguage(language)
  await saveSettings()
}

// 监听设置变化
watch(
  () => settings.fontSize,
  (val) => {
    if (initialized.value) {
      applyFontSize(val)
    }
  }
)

watch(
  () => settings.language,
  (val) => {
    if (initialized.value) {
      applyLanguage(val)
    }
  }
)

/**
 * 导出 composable
 */
export function useAppSettings() {
  return {
    settings,
    initialized,
    loadSettings,
    saveSettings,
    setFontSize,
    setLanguage,
    fontSizeConfig,
    languageConfig
  }
}

// 默认导出单例方法
export const appSettings = {
  settings,
  loadSettings,
  saveSettings,
  setFontSize,
  setLanguage,
  applyFontSize,
  applyLanguage
}