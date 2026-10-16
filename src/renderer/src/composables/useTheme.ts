/**
 * 主题管理 Composable
 * 五类配色：淡雅（浅主色）/ 清新 / 鲜艳（深饱和辅色）/ 暖色 / 沉稳
 */

import { ref, watch, onMounted } from 'vue'
import { SETTINGS_KEYS, getSettingWithLegacyFallback } from '@shared/constants/settings-keys'

// 主题配置
export interface ThemeConfig {
  id: string
  name: string
  primary: string
  gradient: string
  description: string
  category?: string
}

// 可用主题列表
export const availableThemes: ThemeConfig[] = [
  // ==================== 淡雅系（主色调浅，整体柔和） ====================
  {
    id: 'cloud-blue',
    name: '云水蓝',
    primary: '#6fa8dc',
    gradient: 'linear-gradient(135deg, #6fa8dc 0%, #a8ccf0 100%)',
    description: '浅蓝如云·轻盈淡雅',
    category: '淡雅系'
  },
  {
    id: 'light-lavender',
    name: '淡雾紫',
    primary: '#9b8ad6',
    gradient: 'linear-gradient(135deg, #9b8ad6 0%, #bfb2ea 100%)',
    description: '薰衣薄雾·温柔恬静',
    category: '淡雅系'
  },
  // ==================== 清新系 ====================
  {
    id: 'ocean-blue',
    name: '海盐蓝',
    primary: '#4a7fbf',
    gradient: 'linear-gradient(135deg, #4a7fbf 0%, #7fb3e8 100%)',
    description: '海风拂面·清透辽阔',
    category: '清新系'
  },
  {
    id: 'mint-green',
    name: '薄荷青',
    primary: '#3fa88a',
    gradient: 'linear-gradient(135deg, #3fa88a 0%, #6fc9b0 100%)',
    description: '薄荷微凉·自然清新',
    category: '清新系'
  },
  // ==================== 鲜艳系（辅色深饱和） ====================
  {
    id: 'vivid-orange',
    name: '活力橙',
    primary: '#f26b2e',
    gradient: 'linear-gradient(135deg, #f26b2e 0%, #ff9d5c 100%)',
    description: '橙光跃动·明快热烈',
    category: '鲜艳系'
  },
  {
    id: 'electric-purple',
    name: '电光紫',
    primary: '#7c4df0',
    gradient: 'linear-gradient(135deg, #7c4df0 0%, #a97ff7 100%)',
    description: '电光流转·炫酷醒目',
    category: '鲜艳系'
  },
  // ==================== 暖色系 ====================
  {
    id: 'sunset-orange',
    name: '落日橘',
    primary: '#e2804e',
    gradient: 'linear-gradient(135deg, #e2804e 0%, #f5b07e 100%)',
    description: '落日余晖·温暖明亮',
    category: '暖色系'
  },
  {
    id: 'rose-pink',
    name: '玫瑰粉',
    primary: '#d96a8a',
    gradient: 'linear-gradient(135deg, #d96a8a 0%, #eda0b0 100%)',
    description: '玫瑰微醺·柔美浪漫',
    category: '暖色系'
  },
  // ==================== 沉稳系 ====================
  {
    id: 'deep-navy',
    name: '深海蓝',
    primary: '#3f5f9e',
    gradient: 'linear-gradient(135deg, #3f5f9e 0%, #6f8fc8 100%)',
    description: '深海静谧·深邃可靠',
    category: '沉稳系'
  },
  {
    id: 'slate-gray',
    name: '石墨灰',
    primary: '#5d6b7e',
    gradient: 'linear-gradient(135deg, #5d6b7e 0%, #8595aa 100%)',
    description: '石墨质感·简约高级',
    category: '沉稳系'
  }
]

// 当前主题
const currentTheme = ref<string>('cloud-blue')

// 主题颜色映射（用于 Element Plus）
const themeColorMap: Record<string, { primary: string; light: string; dark: string }> = {
  // 淡雅系
  'cloud-blue': { primary: '#6fa8dc', light: '#8fc0ea', dark: '#4f8ac4' },
  'light-lavender': { primary: '#9b8ad6', light: '#b4a6e6', dark: '#7c6ab8' },
  // 清新系
  'ocean-blue': { primary: '#4a7fbf', light: '#6fa3db', dark: '#35679e' },
  'mint-green': { primary: '#3fa88a', light: '#5fc0a3', dark: '#2f8a72' },
  // 鲜艳系
  'vivid-orange': { primary: '#f26b2e', light: '#f8946a', dark: '#cf4f14' },
  'electric-purple': { primary: '#7c4df0', light: '#9c7af5', dark: '#5f35c8' },
  // 暖色系
  'sunset-orange': { primary: '#e2804e', light: '#f0a37c', dark: '#c2653a' },
  'rose-pink': { primary: '#d96a8a', light: '#e88fa8', dark: '#b84f6f' },
  // 沉稳系
  'deep-navy': { primary: '#3f5f9e', light: '#6484bd', dark: '#2e4a80' },
  'slate-gray': { primary: '#5d6b7e', light: '#7d8da1', dark: '#45536a' }
}

// 应用主题到 DOM
const applyTheme = (themeId: string) => {
  document.documentElement.setAttribute('data-theme', themeId)
  updateElementPlusTheme(themeId)
}

// 更新 Element Plus 主题变量
const updateElementPlusTheme = (themeId: string) => {
  const colors = themeColorMap[themeId] || themeColorMap['cloud-blue']
  if (!colors) return

  const root = document.documentElement
  if (!root) return

  // Element Plus 变量
  root.style.setProperty('--el-color-primary', colors.primary)
  root.style.setProperty('--el-color-primary-light-3', colors.light)
  root.style.setProperty('--el-color-primary-light-5', mixColor(colors.primary, '#ffffff', 0.5))
  root.style.setProperty('--el-color-primary-light-7', mixColor(colors.primary, '#ffffff', 0.7))
  root.style.setProperty('--el-color-primary-light-8', mixColor(colors.primary, '#ffffff', 0.8))
  root.style.setProperty('--el-color-primary-light-9', mixColor(colors.primary, '#ffffff', 0.9))
  root.style.setProperty('--el-color-primary-dark-2', colors.dark)
  root.style.setProperty('--el-color-primary-dark-1', colors.primary)

  // 应用风格变量（与 Element Plus 同步）
  root.style.setProperty('--color-primary-light-3', colors.light)
  root.style.setProperty('--color-primary-light-5', mixColor(colors.primary, '#ffffff', 0.5))
  root.style.setProperty('--color-primary-light-7', mixColor(colors.primary, '#ffffff', 0.7))
  root.style.setProperty('--color-primary-light-8', mixColor(colors.primary, '#ffffff', 0.8))
  root.style.setProperty('--color-primary-light-9', mixColor(colors.primary, '#ffffff', 0.9))
}

// 颜色混合辅助函数
const mixColor = (color1: string, color2: string, weight: number): string => {
  const hex1 = color1.replace('#', '')
  const hex2 = color2.replace('#', '')

  const r1 = parseInt(hex1.substring(0, 2), 16)
  const g1 = parseInt(hex1.substring(2, 4), 16)
  const b1 = parseInt(hex1.substring(4, 6), 16)

  const r2 = parseInt(hex2.substring(0, 2), 16)
  const g2 = parseInt(hex2.substring(2, 4), 16)
  const b2 = parseInt(hex2.substring(4, 6), 16)

  const r = Math.round(r1 * (1 - weight) + r2 * weight)
  const g = Math.round(g1 * (1 - weight) + g2 * weight)
  const b = Math.round(b1 * (1 - weight) + b2 * weight)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// 从本地存储加载主题
const loadTheme = async () => {
  try {
    if (window.electronAPI?.settings?.get) {
      // 键名走注册表（旧键 theme 兜底）
      const raw = await getSettingWithLegacyFallback(
        { get: async (k) => (await window.electronAPI.settings.get(k))?.data ?? null },
        SETTINGS_KEYS.uiTheme,
      )
      if (typeof raw === 'string' && availableThemes.some(t => t.id === raw)) {
        currentTheme.value = raw
        applyTheme(raw)
        return
      }
    }
  } catch (error) {
    console.error('加载主题失败:', error)
  }
  applyTheme(currentTheme.value)
}

// 保存主题
const saveTheme = async (themeId: string) => {
  try {
    if (window.electronAPI?.settings?.set) {
      await window.electronAPI.settings.set(SETTINGS_KEYS.uiTheme, themeId)
    }
  } catch (error) {
    console.error('保存主题失败:', error)
  }
}

// 切换主题
const setTheme = async (themeId: string) => {
  if (!availableThemes.some(t => t.id === themeId)) {
    return
  }
  currentTheme.value = themeId
  applyTheme(themeId)
  await saveTheme(themeId)
}

// 获取当前主题配置
const getThemeConfig = (themeId?: string): ThemeConfig | undefined => {
  return availableThemes.find(t => t.id === (themeId || currentTheme.value))
}

// 按分类获取主题
const getThemesByCategory = () => {
  const categories: Record<string, ThemeConfig[]> = {}
  for (const theme of availableThemes) {
    const category = theme.category || '其他'
    if (!categories[category]) {
      categories[category] = []
    }
    categories[category].push(theme)
  }
  return categories
}

// 监听主题变化
watch(currentTheme, (newTheme) => {
  applyTheme(newTheme)
})

export function useTheme() {
  onMounted(() => {
    loadTheme()
  })

  return {
    currentTheme,
    availableThemes,
    setTheme,
    getThemeConfig,
    loadTheme,
    getThemesByCategory
  }
}
