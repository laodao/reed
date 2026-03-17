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
}

// 可用主题列表
export const availableThemes: ThemeConfig[] = [
  {
    id: 'tech-blue',
    name: '科技蓝',
    primary: '#3b82f6',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    description: '清新科技感'
  },
  {
    id: 'emerald',
    name: '翡翠绿',
    primary: '#10b981',
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    description: '自然清新'
  },
  {
    id: 'purple',
    name: '紫罗兰',
    primary: '#9c27b0',
    gradient: 'linear-gradient(135deg, #9c27b0 0%, #ce93d8 100%)',
    description: '优雅神秘'
  },
  {
    id: 'flame',
    name: '火焰橙',
    primary: '#ff6b35',
    gradient: 'linear-gradient(135deg, #ff6b35 0%, #f79f5f 100%)',
    description: '热情活力'
  },
  {
    id: 'cosmic',
    name: '深空紫',
    primary: '#7c3aed',
    gradient: 'linear-gradient(135deg, #1a1a2a 0%, #7c3aed 100%)',
    description: '深邃宇宙'
  },
  {
    id: 'midnight',
    name: '暗夜黑',
    primary: '#64748b',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #485561 100%)',
    description: '沉稳内敛'
  },
  // ==================== 国风配色 ====================
  {
    id: 'chinese-red',
    name: '朱砂红',
    primary: '#c0392b',
    gradient: 'linear-gradient(135deg, #c0392b 0%, #e91e63 100%)',
    description: '朱砂点额·华贵吉祥'
  },
  {
    id: 'jade-green',
    name: '翡翠青',
    primary: '#2e8b57',
    gradient: 'linear-gradient(135deg, #2e8b57 0%, #3cb371 100%)',
    description: '翡翠如意·温润如玉'
  },
  {
    id: 'ink-blue',
    name: '黛蓝',
    primary: '#3d5a80',
    gradient: 'linear-gradient(135deg, #3d5a80 0%, #5b7db1 100%)',
    description: '远山如黛·宁静致远'
  },
  {
    id: 'gold-amber',
    name: '琥珀黄',
    primary: '#ca8a04',
    gradient: 'linear-gradient(135deg, #ca8a04 0%, #f59e0b 100%)',
    description: '琥珀流光·温润典雅'
  },
  {
    id: 'plum-purple',
    name: '梅子青',
    primary: '#4a5043',
    gradient: 'linear-gradient(135deg, #4a5043 0%, #6b7f6a 100%)',
    description: '青梅煮酒·酸甜可口'
  }
]

// 当前主题
const currentTheme = ref<string>('tech-blue')

// 主题颜色映射（用于 Element Plus）
const themeColorMap: Record<string, { primary: string; light: string; dark: string }> = {
  'tech-blue': { primary: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
  'emerald': { primary: '#10b981', light: '#34d399', dark: '#047857' },
  'purple': { primary: '#9c27b0', light: '#ba68c8', dark: '#7b1fa2' },
  'flame': { primary: '#ff6b35', light: '#ff8c42', dark: '#e65100' },
  'cosmic': { primary: '#7c3aed', light: '#a78bfa', dark: '#5b21b6' },
  'midnight': { primary: '#64748b', light: '#94a3b8', dark: '#334155' },
  'chinese-red': { primary: '#c0392b', light: '#e74c3c', dark: '#922b21' },
  'jade-green': { primary: '#2e8b57', light: '#48bb8a', dark: '#1e5e3c' },
  'ink-blue': { primary: '#3d5a80', light: '#5b7db1', dark: '#2c4a66' },
  'gold-amber': { primary: '#ca8a04', light: '#fbbf24', dark: '#a16207' },
  'plum-purple': { primary: '#4a5043', light: '#6b7f6a', dark: '#3b3f35' }
}

// 应用主题到 DOM
const applyTheme = (themeId: string) => {
  document.documentElement.setAttribute('data-theme', themeId)

  // 更新 Element Plus CSS 变量
  updateElementPlusTheme(themeId)
}

// 更新 Element Plus 主题变量
const updateElementPlusTheme = (themeId: string) => {
  const colors = themeColorMap[themeId] || themeColorMap['tech-blue']
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
    loadTheme
  }
}
