<template>
  <div v-loading="loading" class="voice-asset-editor">
    <div class="header">
      <el-button text @click="emit('close')">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回盘点</span>
      </el-button>
      <h2 class="title">{{ voice?.name ?? '加载中...' }}</h2>
      <el-tag v-if="voice" :type="statusType">
        {{ statusLabel }}
      </el-tag>
    </div>

    <div class="body-pane">
      <VoiceCardForm
        :voice-id="voiceId"
        class="form-pane"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 语音资产编辑器（P3a Task 14）
 * @module renderer/components/episode-production/stage-asset/voice/VoiceAssetEditor
 * @description 语音 editor 壳：单栏布局，仅嵌 VoiceCardForm（无图谱）。
 *              与 character / location / item editor 不同：
 *              - voiceId prop 是 ClonedVoice.id（不是 binding id）；
 *              - 没有保存按钮 — 声音 metadata 由 cloned_voice 模块管理，本编辑器只读 + 试听 + 查看绑定。
 *              IPC: episodeProduction.asset.voice.get(voiceId) → IpcResponse<ClonedVoiceEntity>。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import VoiceCardForm from './VoiceCardForm.vue'

const props = defineProps<{ voiceId: string }>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const loading = ref(false)
const voice = ref<any>(null)

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

async function load() {
  const api = (window as any).electronAPI?.episodeProduction?.asset
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
  } catch (e: any) {
    console.error('[VoiceAssetEditor] load 失败', e)
    ElMessage.error(e?.message || '加载声音失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.voiceId, load)
</script>

<style scoped>
.voice-asset-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body-pane {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
}

.form-pane {
  flex: 1;
  min-height: 0;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
  overflow: hidden;
}
</style>
