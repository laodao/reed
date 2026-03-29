/**
 * 主题管理 Composable
 */

import { ref, watch, onMounted } from 'vue'

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
  // ==================== 淡雅系列（新增） ====================
  {
    id: 'sky-blue',
    name: '天空蓝',
    primary: '#6ba3d6',
    gradient: 'linear-gradient(135deg, #7bb0db 0%, #9ac0e8 100%)',
    description: '清新淡雅·宁静致远',
    category: '淡雅系列'
  },
  {
    id: 'mint-green',
    name: '薄荷绿',
    primary: '#5cb88f',
    gradient: 'linear-gradient(135deg, #68c49a 0%, #8fd4b4 100%)',
    description: '清新自然·沁人心脾',
    category: '淡雅系列'
  },
  {
    id: 'lavender',
    name: '淡紫罗兰',
    primary: '#9b8dc7',
    gradient: 'linear-gradient(135deg, #a898cd 0%, #c4b8df 100%)',
    description: '优雅浪漫·温柔恬静',
    category: '淡雅系列'
  },
  {
    id: 'coral-pink',
    name: '珊瑚粉',
    primary: '#e08a8a',
    gradient: 'linear-gradient(135deg, #e89898 0%, #f0b0b0 100%)',
    description: '温柔甜美·浪漫温馨',
    category: '淡雅系列'
  },
  {
    id: 'almond',
    name: '杏仁黄',
    primary: '#d4a574',
    gradient: 'linear-gradient(135deg, #dcb07e 0%, #e8c8a0 100%)',
    description: '温暖舒适·醇厚浓郁',
    category: '淡雅系列'
  },
  {
    id: 'foggy-gray',
    name: '雾霾灰',
    primary: '#8899aa',
    gradient: 'linear-gradient(135deg, #94a5b5 0%, #b0bfcc 100%)',
    description: '简约高级·低调内敛',
    category: '淡雅系列'
  },
  // ==================== 经典主题（柔和版） ====================
  {
    id: 'tech-blue',
    name: '科技蓝',
    primary: '#4a90d9',
    gradient: 'linear-gradient(135deg, #5a9bd4 0%, #7b8fc7 100%)',
    description: '清新科技感·沉稳可靠',
    category: '经典主题'
  },
  {
    id: 'emerald',
    name: '翡翠绿',
    primary: '#4ab88f',
    gradient: 'linear-gradient(135deg, #58c49a 0%, #7ad4b4 100%)',
    description: '自然清新·生机盎然',
    category: '经典主题'
  },
  {
    id: 'purple',
    name: '紫罗兰',
    primary: '#9b7ac4',
    gradient: 'linear-gradient(135deg, #a888cd 0%, #c4a8df 100%)',
    description: '优雅神秘·高贵典雅',
    category: '经典主题'
  },
  {
    id: 'flame',
    name: '火焰橙',
    primary: '#e08a60',
    gradient: 'linear-gradient(135deg, #e89870 0%, #f0b090 100%)',
    description: '热情活力·温暖明亮',
    category: '经典主题'
  },
  {
    id: 'cosmic',
    name: '深空紫',
    primary: '#8a6ad4',
    gradient: 'linear-gradient(135deg, #9880d8 0%, #b098ec 100%)',
    description: '深邃宇宙·神秘莫测',
    category: '经典主题'
  },
  {
    id: 'midnight',
    name: '暗夜黑',
    primary: '#7a8898',
    gradient: 'linear-gradient(135deg, #8898a8 0%, #a0b0c0 100%)',
    description: '沉稳内敛·低调奢华',
    category: '经典主题'
  },
  // ==================== 国风配色（柔和版） ====================
  {
    id: 'chinese-red',
    name: '朱砂红',
    primary: '#c87068',
    gradient: 'linear-gradient(135deg, #d08078 0%, #e09890 100%)',
    description: '朱砂点额·华贵吉祥',
    category: '国风配色'
  },
  {
    id: 'jade-green',
    name: '翡翠青',
    primary: '#5aa880',
    gradient: 'linear-gradient(135deg, #68b490 0%, #88d0a8 100%)',
    description: '翡翠如意·温润如玉',
    category: '国风配色'
  },
  {
    id: 'ink-blue',
    name: '黛蓝',
    primary: '#6078a0',
    gradient: 'linear-gradient(135deg, #7088b0 0%, #90a8c8 100%)',
    description: '远山如黛·宁静致远',
    category: '国风配色'
  },
  {
    id: 'gold-amber',
    name: '琥珀黄',
    primary: '#c8a050',
    gradient: 'linear-gradient(135deg, #d0a860 0%, #e8c080 100%)',
    description: '琥珀流光·温润典雅',
    category: '国风配色'
  },
  {
    id: 'plum-purple',
    name: '梅子青',
    primary: '#788878',
    gradient: 'linear-gradient(135deg, #889888 0%, #a0b0a0 100%)',
    description: '青梅煮酒·酸甜可口',
    category: '国风配色'
  }
]

// 当前主题
const currentTheme = ref<string>('sky-blue')

// 主题颜色映射（用于 Element Plus）
const themeColorMap: Record<string, { primary: string; light: string; dark: string }> = {
  // 淡雅系列
  'sky-blue': { primary: '#6ba3d6', light: '#8fbde8', dark: '#5a8fc4' },
  'mint-green': { primary: '#5cb88f', light: '#7dd4a8', dark: '#4a9a78' },
  'lavender': { primary: '#9b8dc7', light: '#b5a8d8', dark: '#8677b3' },
  'coral-pink': { primary: '#e08a8a', light: '#efa8a8', dark: '#d06c6c' },
  'almond': { primary: '#d4a574', light: '#e4bc8c', dark: '#c08a5a' },
  'foggy-gray': { primary: '#8899aa', light: '#a0b0bf', dark: '#708090' },
  // 经典主题
  'tech-blue': { primary: '#4a90d9', light: '#6ba8eb', dark: '#3a7bc8' },
  'emerald': { primary: '#4ab88f', light: '#6ad4a8', dark: '#3a9a78' },
  'purple': { primary: '#9b7ac4', light: '#b598d8', dark: '#8660a8' },
  'flame': { primary: '#e08a60', light: '#f0a880', dark: '#c87048' },
  'cosmic': { primary: '#8a6ad4', light: '#a888e8', dark: '#7050b8' },
  'midnight': { primary: '#7a8898', light: '#98a8b8', dark: '#606878' },
  // 国风配色
  'chinese-red': { primary: '#c87068', light: '#e09088', dark: '#a85850' },
  'jade-green': { primary: '#5aa880', light: '#78c498', dark: '#489068' },
  'ink-blue': { primary: '#6078a0', light: '#8098c0', dark: '#486088' },
  'gold-amber': { primary: '#c8a050', light: '#e0b870', dark: '#a88840' },
  'plum-purple': { primary: '#788878', light: '#98a898', dark: '#607060' }
}

// 应用主题到 DOM
const applyTheme = (themeId: string) => {
  document.documentElement.setAttribute('data-theme', themeId)

  // 更新 Element Plus CSS 变量
  updateElementPlusTheme(themeId)
}

// 更新 Element Plus 主题变量
const updateElementPlusTheme = (themeId: string) => {
  const colors = themeColorMap[themeId] || themeColorMap['sky-blue']
  if (!colors) return

  const root = document.documentElement
  if (!root) return

  // 主要颜色
  root.style.setProperty('--el-color-primary', colors.primary)
  root.style.setProperty('--el-color-primary-light-3', colors.light)
  root.style.setProperty('--el-color-primary-light-5', mixColor(colors.primary, '#ffffff', 0.5))
  root.style.setProperty('--el-color-primary-light-7', mixColor(colors.primary, '#ffffff', 0.7))
  root.style.setProperty('--el-color-primary-light-8', mixColor(colors.primary, '#ffffff', 0.8))
  root.style.setProperty('--el-color-primary-light-9', mixColor(colors.primary, '#ffffff', 0.9))
  root.style.setProperty('--el-color-primary-dark-2', colors.dark)
  root.style.setProperty('--el-color-primary-dark-1', colors.primary)
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
      const result = await window.electronAPI.settings.get('theme')
      if (result.success && result.data && availableThemes.some(t => t.id === result.data)) {
        currentTheme.value = result.data
        applyTheme(result.data)
        return
      }
    }
  } catch (error) {
    console.error('加载主题失败:', error)
  }

  // 默认主题
  applyTheme(currentTheme.value)
}

// 保存主题
const saveTheme = async (themeId: string) => {
  try {
    if (window.electronAPI?.settings?.set) {
      await window.electronAPI.settings.set('theme', themeId)
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