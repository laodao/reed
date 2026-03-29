/**
 * 主题管理 Composable
 * 基于中国传统色设计的惊艳主题系列
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
  // ==================== 惊艳主题系列（中国传统色） ====================
  {
    id: 'palace-red',
    name: '故宫红墙',
    primary: '#c94043',
    gradient: 'linear-gradient(135deg, #c94043 0%, #e8886a 100%)',
    description: '朱砂配月白·大气华贵',
    category: '惊艳系列'
  },
  {
    id: 'blue-porcelain',
    name: '青花瓷韵',
    primary: '#2e4a62',
    gradient: 'linear-gradient(135deg, #2e4a62 0%, #5a7d9a 100%)',
    description: '钴蓝配月白·清雅脱俗',
    category: '惊艳系列'
  },
  {
    id: 'misty-rain',
    name: '烟雨江南',
    primary: '#4a5568',
    gradient: 'linear-gradient(135deg, #5a6878 0%, #7a8a9a 100%)',
    description: '黛蓝配藕粉·温婉诗意',
    category: '惊艳系列'
  },
  {
    id: 'bamboo-breeze',
    name: '竹影清风',
    primary: '#5d8a66',
    gradient: 'linear-gradient(135deg, #5d8a66 0%, #7db587 100%)',
    description: '竹青配米白·清新雅致',
    category: '惊艳系列'
  },
  {
    id: 'dawn-purple',
    name: '紫禁晨曦',
    primary: '#7d5a6a',
    gradient: 'linear-gradient(135deg, #7d5a6a 0%, #a08090 100%)',
    description: '紫檀配杏黄·高贵典雅',
    category: '惊艳系列'
  },
  {
    id: 'ginkgo-gold',
    name: '金秋银杏',
    primary: '#c9a04a',
    gradient: 'linear-gradient(135deg, #c9a04a 0%, #e0c070 100%)',
    description: '琥珀配墨绿·温暖醇厚',
    category: '惊艳系列'
  },
  {
    id: 'peach-blossom',
    name: '胭脂桃夭',
    primary: '#e07878',
    gradient: 'linear-gradient(135deg, #e07878 0%, #f0a8a0 100%)',
    description: '胭脂配柳绿·娇艳动人',
    category: '惊艳系列'
  },
  {
    id: 'pine-moon',
    name: '松风水月',
    primary: '#4a7570',
    gradient: 'linear-gradient(135deg, #4a7570 0%, #6a958f 100%)',
    description: '松绿配月白·幽静清远',
    category: '惊艳系列'
  },
  // ==================== 经典主题 ====================
  {
    id: 'sky-cyan',
    name: '天青色',
    primary: '#5b8c85',
    gradient: 'linear-gradient(135deg, #5b8c85 0%, #7ba39c 100%)',
    description: '雨过天青云破处·温润如玉',
    category: '经典主题'
  },
  {
    id: 'tech-blue',
    name: '科技蓝',
    primary: '#4a7cb8',
    gradient: 'linear-gradient(135deg, #4a7cb8 0%, #6a9cd8 100%)',
    description: '清新科技感·沉稳可靠',
    category: '经典主题'
  }
]

// 当前主题
const currentTheme = ref<string>('palace-red')

// 主题颜色映射（用于 Element Plus）
const themeColorMap: Record<string, { primary: string; light: string; dark: string }> = {
  // 惊艳系列
  'palace-red': { primary: '#c94043', light: '#e06567', dark: '#a32e31' },
  'blue-porcelain': { primary: '#2e4a62', light: '#4a6a85', dark: '#1e3548' },
  'misty-rain': { primary: '#4a5568', light: '#6b7a8f', dark: '#374151' },
  'bamboo-breeze': { primary: '#5d8a66', light: '#7aa384', dark: '#4a7052' },
  'dawn-purple': { primary: '#7d5a6a', light: '#9a7889', dark: '#5f4351' },
  'ginkgo-gold': { primary: '#c9a04a', light: '#ddb86a', dark: '#a88535' },
  'peach-blossom': { primary: '#e07878', light: '#f09898', dark: '#c85a5a' },
  'pine-moon': { primary: '#4a7570', light: '#6a9590', dark: '#3a5a56' },
  // 经典主题
  'sky-cyan': { primary: '#5b8c85', light: '#7ba39c', dark: '#4a7570' },
  'tech-blue': { primary: '#4a7cb8', light: '#6a9cd8', dark: '#3a6ca0' }
}

// 应用主题到 DOM
const applyTheme = (themeId: string) => {
  document.documentElement.setAttribute('data-theme', themeId)
  updateElementPlusTheme(themeId)
}

// 更新 Element Plus 主题变量
const updateElementPlusTheme = (themeId: string) => {
  const colors = themeColorMap[themeId] || themeColorMap['palace-red']
  if (!colors) return

  const root = document.documentElement
  if (!root) return

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