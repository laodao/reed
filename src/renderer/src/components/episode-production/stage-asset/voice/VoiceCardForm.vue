<template>
  <el-card class="voice-card-form" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="header-title">🎙️ 声音卡</span>
        <el-tag :type="statusType" size="small">
          {{ statusLabel }}
        </el-tag>
      </div>
    </template>

    <div v-loading="loading" class="form-body">
      <el-empty v-if="!voice" description="未找到该声音" :image-size="80" />

      <template v-else>
        <!-- 复刻名（display only） -->
        <div class="form-row">
          <div class="form-label">复刻名</div>
          <div class="form-value name-value">{{ voice.name || '(未命名声音)' }}</div>
        </div>

        <!-- 状态 -->
        <div class="form-row">
          <div class="form-label">状态</div>
          <div class="form-value">
            <el-tag :type="statusType" size="small">{{ statusLabel }}</el-tag>
            <span v-if="voice.errorMessage" class="error-msg">{{ voice.errorMessage }}</span>
          </div>
        </div>

        <!-- voiceId（provider 侧） -->
        <div class="form-row">
          <div class="form-label">Voice ID</div>
          <div class="form-value mono">{{ voice.voiceId || '—' }}</div>
        </div>

        <!-- providerId -->
        <div class="form-row">
          <div class="form-label">Provider</div>
          <div class="form-value mono">{{ voice.providerId || '—' }}</div>
        </div>

        <!-- 样本时长 -->
        <div class="form-row">
          <div class="form-label">样本时长</div>
          <div class="form-value">{{ formatDuration(voice.sampleDuration) }}</div>
        </div>

        <!-- 试听 -->
        <div class="form-row">
          <div class="form-label">试听</div>
          <div class="form-value">
            <el-button size="small" :disabled="!canPreview" @click="onPreview">
              ▶ 试听
            </el-button>
            <span v-if="!canPreview" class="hint">声音未就绪</span>
          </div>
        </div>

        <!-- 绑定的角色 -->
        <div class="bindings-section">
          <div class="section-header">
            <span class="section-title">绑定的角色</span>
            <el-tag round size="small">{{ boundCharacters.length }}</el-tag>
            <el-button
              v-if="boundCharacters.length > 0"
              text
              size="small"
              type="primary"
              @click="bindingsExpanded = !bindingsExpanded"
            >
              {{ bindingsExpanded ? '收起' : '展开' }}
            </el-button>
          </div>

          <div v-if="boundCharacters.length === 0" class="empty-bindings">
            <el-empty description="暂无角色绑定该声音" :image-size="60" />
          </div>

          <ul v-else-if="bindingsExpanded" class="bindings-list">
            <li
              v-for="c in boundCharacters"
              :key="c.id"
              class="binding-item"
            >
              <span class="binding-name">{{ characterDisplayName(c) }}</span>
              <el-tag
                size="small"
                :type="c.sourceType === 'linked_lw' ? 'primary' : 'warning'"
                effect="plain"
              >
                {{ c.sourceType === 'linked_lw' ? 'linked_lw' : 'standalone' }}
              </el-tag>
              <!-- T11：解绑按钮（双向编辑）— 调 voice.bindToCharacter(charId, null) -->
              <el-button
                size="small"
                text
                type="danger"
                :loading="unbindingId === c.id"
                @click="onUnbind(c)"
              >
                解绑
              </el-button>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 语音设定卡（P3a Task 14）
 * @module renderer/components/episode-production/stage-asset/voice/VoiceCardForm
 * @description 显示 ClonedVoice 的元数据（只读）+ 试听 + 绑定角色列表：
 *   - 声音的 name / status / voiceId / providerId / sampleDuration 全部 display-only
 *     （声音 metadata 由 cloned_voice 模块管理，本编辑器不写）；
 *   - 试听：当前没有 voice.preview IPC，暂走 ElMessage.info 占位（spec 标记 P3a-final / P3b 接入）；
 *   - 绑定角色：调 api.voice.listCharacters(voiceId) 拿 character_binding 数组，
 *     仅展示数量 + 可展开列表，不实现"切换绑定"UI（spec 太复杂，留 P3b）。
 *
 * IPC：episodeProduction.asset.voice.get(voiceId) / .listCharacters(voiceId)。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps<{ voiceId: string }>()

const loading = ref(false)
const voice = ref<any>(null)
const boundCharacters = ref<any[]>([])
const bindingsExpanded = ref(false)
// T11 双向绑定：解绑某个角色时锁住该条按钮，避免重复点击
const unbindingId = ref<string>('')

const statusType = computed<'success' | 'info' | 'danger' | ''>(() => {
  const s = voice.value?.status
  if (s === 'ready') return 'success'
  if (s === 'training') return 'info'
  if (s === 'failed') return 'danger'
  return ''
})

const statusLabel = computed(() => {
  const s = voice.value?.status
  if (s === 'ready') return '已就绪'
  if (s === 'training') return '训练中'
  if (s === 'failed') return '失败'
  return s || '未知'
})

const canPreview = computed(() => voice.value?.status === 'ready')

function getApi() {
  return (window as any).electronAPI?.episodeProduction?.asset
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m} 分` : `${m} 分 ${r} 秒`
}

function characterDisplayName(c: any): string {
  if (!c) return '(未知角色)'
  // standalone 优先取 standaloneName；linked_lw 取 overrideName
  if (c.sourceType === 'standalone') {
    return c.standaloneName || '(未命名角色)'
  }
  return c.overrideName || c.characterName || '(未命名 lw 角色)'
}

async function load() {
  const api = getApi()
  if (!api) return
  if (!props.voiceId) return
  loading.value = true
  try {
    const resp = await api.voice.get(props.voiceId)
    if (!resp || !resp.success) {
      ElMessage.error(resp?.error || '加载声音失败')
      voice.value = null
    } else {
      voice.value = resp.data
    }

    const bindResp = await api.voice.listCharacters(props.voiceId)
    if (bindResp && bindResp.success && Array.isArray(bindResp.data)) {
      boundCharacters.value = bindResp.data
    } else {
      boundCharacters.value = []
      if (bindResp && !bindResp.success) {
        // 仅 console，不 toast 干扰主流程
        console.warn('[VoiceCardForm] listCharacters 失败', bindResp.error)
      }
    }
  } catch (e: any) {
    console.error('[VoiceCardForm] load 失败', e)
    ElMessage.error(e?.message || '加载声音失败')
  } finally {
    loading.value = false
  }
}

async function onPreview(): Promise<void> {
  // 2026-05-08 T11：voice:preview 已真实现 — 调 service.previewClonedVoice
  // 该方法读 cloned_voices.preview_audio_path 缓存，未缓存时调 query_voice 拿 demo
  // 下载到本地后写回 DB。试听音频通过 toAssetUrl 包成可播放 URL。
  const previewApi = (window as any).electronAPI?.voice?.preview
  if (typeof previewApi !== 'function') {
    ElMessage.error('试听 IPC 未就绪')
    return
  }
  if (!voice.value?.id) return
  try {
    const resp = await previewApi(voice.value.id)
    if (!resp?.success || !resp.data?.audioPath) {
      ElMessage.error(resp?.error || '试听失败')
      return
    }
    const audio = new Audio(resp.data.audioPath)
    audio.play().catch((err: any) => {
      ElMessage.error(`音频播放失败：${err?.message ?? err}`)
    })
  } catch (e: any) {
    console.error('[VoiceCardForm] preview 失败', e)
    ElMessage.error(e?.message || '试听异常')
  }
}

/**
 * T11：解绑某个角色对当前音色的绑定。
 * 调 episodeProduction.asset.voice.bindToCharacter(charBindingId, null)
 * 成功后 reload 列表 — 反向视图自动刷新。
 */
async function onUnbind(c: any): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认解除角色 "${characterDisplayName(c)}" 与本音色的绑定？\n该角色将变为 "未绑定音色" 状态。`,
      '解除绑定',
      { type: 'warning', confirmButtonText: '解绑', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const api = getApi()
  if (!api?.voice?.bindToCharacter) {
    ElMessage.error('voice.bindToCharacter IPC 未就绪')
    return
  }
  unbindingId.value = c.id
  try {
    const resp = await api.voice.bindToCharacter(c.id, null)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '解绑失败')
      return
    }
    ElMessage.success('已解绑')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '解绑异常')
  } finally {
    unbindingId.value = ''
  }
}

onMounted(load)
watch(() => props.voiceId, load)

defineExpose({ reload: load })
</script>

<style scoped>
.voice-card-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.voice-card-form :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--el-text-color-primary);
}

.header-title {
  font-weight: 600;
  font-size: 14px;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
}

.form-label {
  width: 80px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  padding-top: 4px;
}

.form-value {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--el-text-color-primary);
}

.name-value {
  font-weight: 500;
  font-size: 14px;
}

.mono {
  font-family: var(--el-font-family-monospace, monospace);
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.error-msg {
  font-size: 12px;
  color: var(--el-color-danger);
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.bindings-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.section-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.empty-bindings {
  padding: 8px 0;
}

.bindings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.binding-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 13px;
}

.binding-name {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
