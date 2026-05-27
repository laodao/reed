/**
 * 音色选项 composable（第 5 批 review #2 · 消除写死 + 重复）
 *
 * 出现场景：ProjectInitWizard / CreateSubjectDialog 各写死一份音色 el-option
 * 列表（voice-1..voice-4 + voice-clone-laohe），违反 CLAUDE.md "严禁写死
 * 配置/选项" + "严禁复制粘贴"。
 *
 * 改为真调 ep:asset:voice:list-ready（用户已就绪的克隆音色），失败/空时
 * 退化为空列表（只留"无配音"选项 · 不再编造假官方音色）。
 */
import { ref, onMounted } from 'vue'

export interface VoiceOption {
  /** 音色 id（voiceId · 传给 TTS / 视频 AV provider） */
  value: string
  /** 展示名 */
  label: string
}

export function useVoiceOptions() {
  const voiceOptions = ref<VoiceOption[]>([])
  const loadingVoices = ref(false)

  async function loadVoices(): Promise<void> {
    loadingVoices.value = true
    try {
      const api = (window as any).electronAPI?.episodeProduction?.asset?.voice
      let list: any[] = []
      if (api?.listReady) {
        const r = await api.listReady()
        if (r?.success && Array.isArray(r.data)) list = r.data
      } else if (api?.list) {
        const r = await api.list()
        if (r?.success && Array.isArray(r.data)) list = r.data
      }
      voiceOptions.value = list.map((v) => ({
        value: v.id ?? v.voiceId ?? '',
        label: v.name ?? v.voiceName ?? '未命名音色',
      })).filter((o) => o.value)
    } catch (e) {
      console.warn('[useVoiceOptions] 加载音色失败', e)
    } finally {
      loadingVoices.value = false
    }
  }

  onMounted(() => { void loadVoices() })

  return { voiceOptions, loadingVoices, loadVoices }
}
