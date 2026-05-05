<template>
  <!--
    AudioPanel · 场景音频生成面板（spec §4.7 + P5-T21）

    展示当前场景的旁白 + 对话清单（来自 scene_scripts.dialogues JSON），
    并提供"生成全部音频"按钮，触发 V3 binding-aware 编排（spec §4.1）：
      - dialogue.voiceId（场景级覆盖）→ 用
      - 否则 character_binding.voiceId → 用
      - 否则 fallback 'Cherry'

    生成完成后展示每条对话/旁白的 audioPath（含试听 audio 标签）。
  -->
  <div class="audio-panel">
    <div class="panel-header">
      <h4>场景音频</h4>
      <el-button
        v-if="sceneId"
        size="small"
        type="primary"
        :loading="generating"
        @click="onGenerateAll"
      >
        <el-icon><MagicStick /></el-icon>
        生成全部音频
      </el-button>
    </div>

    <div v-if="!sceneId" class="empty-state">
      请先选择一个场景
    </div>

    <div v-else>
      <div v-if="narration?.text" class="row narration-row">
        <el-tag size="small" type="info">旁白</el-tag>
        <span class="text">{{ narration.text }}</span>
        <audio
          v-if="narration.audioPath"
          :src="toAudioUrl(narration.audioPath)"
          controls
          class="audio-player"
        />
      </div>

      <div
        v-for="d in dialogues"
        :key="d.id"
        class="row dialogue-row"
      >
        <el-tag size="small" :type="hasVoiceTagType(d)">{{ d.characterName || '?' }}</el-tag>
        <span class="text">{{ d.text }}</span>
        <span v-if="d.voiceId" class="voice-hint">voice={{ d.voiceId }}</span>
        <audio
          v-if="d.audioPath"
          :src="toAudioUrl(d.audioPath)"
          controls
          class="audio-player"
        />
      </div>

      <div v-if="result" class="result-summary">
        <el-icon><CircleCheck /></el-icon>
        生成完成 · {{ Object.keys(result.dialoguePaths).length }} 条对话
        <span v-if="result.fallbackDialogueCount > 0" class="warn">
          · {{ result.fallbackDialogueCount }} 条用了 fallback voice
        </span>
      </div>

      <div v-if="errorMessage" class="error-banner">
        <el-icon><Warning /></el-icon>
        {{ errorMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AudioPanel（P5-T21）
 *
 * Props：
 *   - sceneId：当前选中场景 ID
 *   - scene：可选场景对象（含 narration / dialogues），父组件已加载时传入避免重复 IPC
 *
 * Emits：
 *   - generated(result)：生成完成；父组件可触发刷新或进展状态
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, MagicStick, Warning } from '@element-plus/icons-vue'
import { toAssetUrl } from '@core/utils/asset-path'

interface Dialogue {
  id: string
  text: string
  characterName?: string
  characterBindingId?: string | null
  voiceId?: string | null
  audioPath?: string | null
}

interface SceneInput {
  narration?: string | null
  dialogues?: Dialogue[]
}

interface OrchestrateResult {
  narrationPath: string | null
  dialoguePaths: Record<string, string>
  fallbackDialogueCount: number
}

const props = defineProps<{
  sceneId: string | null
  scene?: SceneInput | null
}>()

const emit = defineEmits<{
  (e: 'generated', result: OrchestrateResult): void
}>()

const generating = ref(false)
const result = ref<OrchestrateResult | null>(null)
const errorMessage = ref<string | null>(null)

const narration = computed(() => {
  const text = props.scene?.narration ?? ''
  if (!text) return null
  return {
    text,
    audioPath: result.value?.narrationPath ?? null,
  }
})

const dialogues = computed<Dialogue[]>(() => {
  const arr = props.scene?.dialogues ?? []
  return arr.map((d) => ({
    ...d,
    audioPath: result.value?.dialoguePaths[d.id] ?? d.audioPath ?? null,
  }))
})

function hasVoiceTagType(d: Dialogue): 'success' | 'warning' | 'info' {
  if (d.voiceId) return 'success'
  if (d.characterBindingId) return 'info'
  return 'warning' // 都没绑定，会走 fallback
}

function toAudioUrl(p: string | null | undefined): string {
  if (!p) return ''
  return toAssetUrl(p, 'audio')
}

async function onGenerateAll(): Promise<void> {
  if (!props.sceneId) return
  generating.value = true
  errorMessage.value = null
  result.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateSceneAudioV3) {
      throw new Error('IPC generateSceneAudioV3 未暴露')
    }
    const resp = await api.generateSceneAudioV3(props.sceneId, {})
    if (!resp?.success) throw new Error(resp?.error || '生成失败')
    result.value = resp.data as OrchestrateResult
    emit('generated', result.value)
    ElMessage.success(
      `音频生成完成（${Object.keys(result.value.dialoguePaths).length} 条对话` +
        (result.value.fallbackDialogueCount > 0
          ? ` · ${result.value.fallbackDialogueCount} 条 fallback voice`
          : '') +
        '）',
    )
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    generating.value = false
  }
}

watch(
  () => props.sceneId,
  () => {
    result.value = null
    errorMessage.value = null
  },
)
</script>

<style scoped>
.audio-panel {
  padding: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
}

.empty-state {
  padding: 20px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 13px;
  flex-wrap: wrap;
}

.row:last-child {
  border-bottom: none;
}

.text {
  flex: 1;
  min-width: 200px;
}

.voice-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.audio-player {
  height: 32px;
  max-width: 240px;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  font-size: 13px;
  background: var(--el-color-success-light-9);
  border-radius: 4px;
  color: var(--el-color-success);
}

.warn {
  color: var(--el-color-warning);
  margin-left: 4px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
}
</style>
