/**
 * 界面皮肤管理 Composable
 * @module composables/useSkin
 * @description data-skin 双皮肤（classic / modern）切换与持久化。
 *              与 useTheme（颜色主题）正交：颜色 × 皮肤自由组合。
 *              皮肤方案：docs/design/theme-skin-system-design.md §D2
 */
import { ref, onMounted } from 'vue'
import { SETTINGS_KEYS, getSettingWithLegacyFallback } from '@shared/constants/settings-keys'

export type SkinId = 'classic' | 'modern'

export const SKIN_OPTIONS: { id: SkinId; name: string; description: string }[] = [
  { id: 'classic', name: '经典', description: '当前界面风格（默认）' },
  { id: 'modern', name: '现代', description: '深色侧栏 · 克制动效 · 细腻阴影' }
]

const currentSkin = ref<SkinId>('classic')

function applySkin(skin: SkinId): void {
  document.documentElement.setAttribute('data-skin', skin)
}

async function loadSkin(): Promise<void> {
  try {
    if (window.electronAPI?.settings?.get) {
      // 键名走注册表（旧键 skin 兜底）
      const raw = await getSettingWithLegacyFallback(
        { get: async (k) => (await window.electronAPI.settings.get(k))?.data ?? null },
        SETTINGS_KEYS.uiSkin,
      )
      const skin: SkinId = raw === 'modern' ? 'modern' : 'classic'
      currentSkin.value = skin
      applySkin(skin)
      return
    }
  } catch (error) {
    console.error('[useSkin] 加载皮肤失败:', error)
  }
  applySkin(currentSkin.value)
}

async function setSkin(skin: SkinId): Promise<void> {
  currentSkin.value = skin
  applySkin(skin)
  try {
    if (window.electronAPI?.settings?.set) {
      await window.electronAPI.settings.set(SETTINGS_KEYS.uiSkin, skin)
    }
  } catch (error) {
    console.error('[useSkin] 保存皮肤失败:', error)
  }
}

export function useSkin() {
  onMounted(() => {
    loadSkin()
  })

  return {
    currentSkin,
    setSkin,
    loadSkin
  }
}
