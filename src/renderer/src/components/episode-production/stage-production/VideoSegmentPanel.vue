<template>
  <!--
    VideoSegmentPanel · 分镜视频片段生成面板（spec §4.4 + P5-T20）

    用户在 ⑤ 制作 阶段选中一个分镜后，本面板列出：
    - 分镜信息（视频路径状态 / 时长 / 已选 provider）
    - Provider 选择器（来自 ep:list-video-providers，含 capabilities）
    - 模式选择（自动 / 强制 text2video / image2video / keyframes2video）
    - 生成按钮 → 调 ep:generate-video-segment
    - 完成后显示 result（videoPath / mode / 是否降级）

    Provider 缺失或未 ready 时禁用 + 提示用户去 settings 配 provider。
  -->
  <div class="video-segment-panel">
    <div class="panel-header">
      <h4>视频片段生成</h4>
      <el-tag v-if="storyboard?.videoPath" type="success" size="small">
        已生成
      </el-tag>
      <el-tag v-else type="warning" size="small">未生成</el-tag>
    </div>

    <div v-if="!storyboard" class="empty-state">
      请先选择一个分镜
    </div>

    <div v-else class="form-area">
      <!-- P5-T29 spec §4.7：分镜元信息 panel -->
      <div class="meta-section">
        <h5 class="meta-title">分镜元信息（spec §4.7）</h5>

        <!-- 关键帧序列预览（spec §4.5.4 九宫格） -->
        <div v-if="keyframes.length > 0" class="keyframe-strip">
          <div
            v-for="kf in keyframes"
            :key="kf.id"
            class="strip-cell"
            :title="`镜头 #${kf.frameIndex} · ${kf.frameRole}`"
          >
            <img v-if="kf.imagePath" :src="toImageUrl(kf.imagePath)" alt="kf" />
            <el-icon v-else><Picture /></el-icon>
            <span class="strip-idx">#{{ kf.frameIndex }}</span>
          </div>
        </div>
        <div v-else class="meta-empty">尚未生成关键帧</div>

        <!-- 角色清单 -->
        <div class="meta-row">
          <span class="meta-label">角色</span>
          <span v-if="characterChips.length === 0" class="meta-empty-inline">
            未配置（spec §4.5.3 回退场景级）
          </span>
          <el-tag
            v-for="c in characterChips"
            :key="c.id"
            size="small"
            type="info"
            effect="plain"
          >
            {{ c.name }}<span v-if="c.expression"> · {{ c.expression }}</span>
          </el-tag>
        </div>

        <!-- 旁白 -->
        <div v-if="narration" class="meta-row">
          <span class="meta-label">旁白</span>
          <span class="meta-text">{{ narration }}</span>
        </div>

        <!-- 对话清单 -->
        <div v-if="dialogues.length > 0" class="meta-row">
          <span class="meta-label">对话 ({{ dialogues.length }})</span>
          <div class="dialogue-list">
            <div
              v-for="(d, i) in dialogues"
              :key="`d-${i}`"
              class="dialogue-item"
            >
              <span class="dlg-speaker">{{ d.speaker }}</span>
              <span v-if="d.tone" class="dlg-tone">{{ d.tone }}</span>
              <span class="dlg-text">{{ d.text }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- P5-T29 spec §4.5.7：用户额外提示词（生成视频片段时一并影响 prompt） -->
      <div class="user-prompt-section">
        <label class="prompt-label">
          <el-icon><EditPen /></el-icon>
          调整方向（可选）
          <el-tooltip
            content="影响视频片段生成的 prompt（如'动作更慢'、'镜头平稳'）。批量重生成关键帧时也会带上。"
            placement="top"
          >
            <el-icon class="hint-icon"><InfoFilled /></el-icon>
          </el-tooltip>
        </label>
        <el-input
          v-model="userPrompt"
          type="textarea"
          :rows="2"
          placeholder="例如：动作更慢一些 / 镜头保持平稳 / 整体偏暖色调"
          :maxlength="200"
          show-word-limit
          resize="none"
        />
      </div>

      <el-form label-width="80px" size="small">
        <el-form-item label="Provider">
          <el-select
            v-model="selectedProviderConfigId"
            placeholder="选择已配置的视频 provider"
            :loading="loadingProviders"
            @change="onProviderChange"
          >
            <el-option
              v-for="p in availableProviders"
              :key="p.providerConfigId"
              :value="p.providerConfigId"
              :label="p.name"
              :disabled="!p.ready"
            >
              <span>{{ p.name }}</span>
              <span class="opt-meta">
                {{ formatCapabilities(p.capabilities) }}
                <el-tag v-if="!p.ready" size="small" type="warning">未就绪</el-tag>
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item v-if="selectedProvider && selectedProvider.models.length > 0" label="模型">
          <el-select v-model="selectedModelId" placeholder="选择视频 model">
            <el-option
              v-for="m in selectedProvider.models"
              :key="m.id"
              :value="m.id"
              :label="m.name || m.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="模式">
          <el-radio-group v-model="modeChoice">
            <el-radio-button label="auto">自动</el-radio-button>
            <el-radio-button label="text2video">text2video</el-radio-button>
            <el-radio-button label="image2video">image2video</el-radio-button>
            <el-radio-button label="keyframes2video">keyframes2video</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="时长">
          <el-input-number v-model="durationSec" :min="1" :max="10" :step="1" />
          <span class="form-hint">秒</span>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            :loading="generating"
            :disabled="!canGenerate"
            @click="onGenerate"
          >
            <el-icon><MagicStick /></el-icon>
            {{ storyboard.videoPath ? '重新生成' : '生成视频片段' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="lastResult" class="result-card">
        <div class="result-row">
          <span class="label">实际模式：</span>
          <el-tag size="small">{{ lastResult.match.mode }}</el-tag>
          <el-tag v-if="lastResult.match.degraded" size="small" type="warning">
            已降级
          </el-tag>
        </div>
        <div v-if="lastResult.match.degraded" class="degrade-trace">
          降级路径：{{ lastResult.match.trace.join(' → ') }}
        </div>
        <div class="result-row">
          <span class="label">视频路径：</span>
          <span class="path">{{ lastResult.output.videoPath }}</span>
        </div>
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
 * VideoSegmentPanel（P5-T20）
 *
 * Props：
 *   - storyboard：当前分镜（含 id / videoPath / keyframeCount）
 *
 * Emits：
 *   - generated(videoPath)：生成完成；父组件可 reload storyboardStore
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  EditPen,
  InfoFilled,
  MagicStick,
  Picture,
  Warning,
} from '@element-plus/icons-vue'
import { toImageUrl } from '@/utils/asset-url'
import { useEpAssetStore, useEpScriptStore } from '@/stores/episode-production'

interface Storyboard {
  id: string
  videoPath?: string | null
  keyframeCount?: number
  duration?: number
}

interface ProviderCapabilities {
  text: boolean
  image: boolean
  keyframes: boolean
  maxKeyframes: number
  maxDurationSec: number
}

interface ProviderInfo {
  providerConfigId: string
  type: string
  name: string
  description: string
  implemented: boolean
  capabilities: ProviderCapabilities
  ready: boolean
  models: Array<{ id: string; name?: string }>
}

interface VideoSegmentResult {
  storyboardId: string
  match: {
    mode: 'text2video' | 'image2video' | 'keyframes2video' | null
    degraded: boolean
    trace: string[]
  }
  output: {
    videoPath: string
    durationSec: number
    width: number
    height: number
  }
}

const props = defineProps<{
  storyboard: Storyboard | null
  /** 用户配置好的 video providerConfigId（来自 settings；不传则用 type 默认） */
  providerConfigId?: string | null
  modelId?: string | null
}>()

const emit = defineEmits<{
  (e: 'generated', videoPath: string): void
}>()

// P5-T29 spec §4.7：分镜元信息状态
const assetStore = useEpAssetStore()
const scriptStore = useEpScriptStore()
const userPrompt = ref('')

interface KeyframeLite {
  id: string
  frameIndex: number
  frameRole: string
  imagePath: string | null
}
const keyframes = ref<KeyframeLite[]>([])

interface CharOverride {
  characterId: string
  expression?: string
  action?: string
  facing?: string
}
const sbCharOverrides = ref<CharOverride[]>([])

const currentScene = computed(() => {
  if (!props.storyboard) return null
  return scriptStore.scenes.find((s: any) =>
    (s.storyboards ?? []).some((sb: any) => sb.id === props.storyboard?.id),
  )
})

const characterChips = computed(() => {
  const list: Array<{ id: string; name: string; expression: string }> = []
  if (sbCharOverrides.value.length > 0) {
    for (const sc of sbCharOverrides.value) {
      list.push({
        id: sc.characterId,
        name: lookupCharName(sc.characterId),
        expression: sc.expression ?? '',
      })
    }
  } else {
    const sceneChars = (currentScene.value?.characters ?? []) as any[]
    for (const sc of sceneChars) {
      const id = sc.characterBindingId ?? sc.characterId ?? ''
      if (!id) continue
      list.push({
        id,
        name: lookupCharName(id) || sc.characterName || sc.name || '?',
        expression: sc.expression ?? '',
      })
    }
  }
  return list
})

const narration = computed<string>(() => {
  return (currentScene.value as any)?.narration ?? ''
})

interface DialogueItem {
  speaker: string
  tone?: string
  text: string
}
const dialogues = computed<DialogueItem[]>(() => {
  const scene = currentScene.value as any
  const raw = scene?.dialogues
  if (!Array.isArray(raw)) return []
  return raw.map((d: any) => ({
    speaker: d.characterName ?? d.speaker ?? lookupCharName(d.characterBindingId ?? '') ?? '?',
    tone: d.tone ?? d.emotion,
    text: d.text ?? '',
  }))
})

function lookupCharName(id: string): string {
  if (!id) return ''
  const cand = (assetStore.epAssetCharacters as any[]).find(
    (c) => (c.id ?? c.bindingId) === id,
  )
  return cand?.name ?? cand?.standaloneName ?? id.slice(0, 8)
}

async function loadMeta(): Promise<void> {
  if (!props.storyboard) return
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (api?.listKeyframes) {
      const respKf = await api.listKeyframes(props.storyboard.id)
      if (respKf?.success && Array.isArray(respKf.data)) {
        keyframes.value = respKf.data as KeyframeLite[]
      } else {
        keyframes.value = []
      }
    }
    if (api?.listStoryboardCharacters) {
      const respSc = await api.listStoryboardCharacters(props.storyboard.id)
      if (respSc?.success && Array.isArray(respSc.data)) {
        sbCharOverrides.value = respSc.data as CharOverride[]
      } else {
        sbCharOverrides.value = []
      }
    }
  } catch {
    // 静默：UI 上 empty state 已能反映
  }
}

watch(() => props.storyboard?.id, () => loadMeta(), { immediate: true })

const availableProviders = ref<ProviderInfo[]>([])
const selectedProviderConfigId = ref<string>('')
const selectedModelId = ref<string>('')
const modeChoice = ref<'auto' | 'text2video' | 'image2video' | 'keyframes2video'>(
  'auto',
)
const durationSec = ref(4)
const loadingProviders = ref(false)
const generating = ref(false)
const lastResult = ref<VideoSegmentResult | null>(null)
const errorMessage = ref<string | null>(null)

const selectedProvider = computed(() =>
  availableProviders.value.find(
    (p) => p.providerConfigId === selectedProviderConfigId.value,
  ),
)

const canGenerate = computed(
  () =>
    !generating.value &&
    selectedProviderConfigId.value !== '' &&
    selectedModelId.value !== '' &&
    props.storyboard !== null,
)

function onProviderChange(): void {
  // 切 provider 时自动选第一个 model
  const p = selectedProvider.value
  if (p && p.models.length > 0 && !p.models.find((m) => m.id === selectedModelId.value)) {
    selectedModelId.value = p.models[0].id
  }
}

watch(
  () => props.storyboard?.duration,
  (v) => {
    if (v && v > 0 && v !== durationSec.value) durationSec.value = Math.round(v)
  },
  { immediate: true },
)

async function loadProviders(): Promise<void> {
  loadingProviders.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listVideoProviders) {
      throw new Error('IPC listVideoProviders 未暴露')
    }
    const resp = await api.listVideoProviders()
    if (!resp?.success) throw new Error(resp?.error || '列 provider 失败')
    availableProviders.value = resp.data as ProviderInfo[]
    // 默认选中第一个 ready 的
    if (!selectedProviderConfigId.value) {
      const first = availableProviders.value.find((p) => p.ready)
      if (first) {
        selectedProviderConfigId.value = first.providerConfigId
        if (first.models.length > 0) selectedModelId.value = first.models[0].id
      }
    }
  } catch (e: any) {
    ElMessage.error(`加载 provider 列表失败：${e?.message ?? e}`)
  } finally {
    loadingProviders.value = false
  }
}

async function onGenerate(): Promise<void> {
  if (!props.storyboard) return
  generating.value = true
  errorMessage.value = null
  lastResult.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateVideoSegment) {
      throw new Error('IPC generateVideoSegment 未暴露')
    }
    const opts: Record<string, unknown> = {
      durationSec: durationSec.value,
      providerConfigId: selectedProviderConfigId.value,
      modelId: selectedModelId.value,
    }
    if (modeChoice.value !== 'auto') opts.forceMode = modeChoice.value
    // P5-T29 spec §4.5.7：用户额外提示词
    if (userPrompt.value.trim()) {
      opts.userPrompt = userPrompt.value.trim()
    }
    // props 覆盖（外部父组件强制指定时）
    if (props.providerConfigId) opts.providerConfigId = props.providerConfigId
    if (props.modelId) opts.modelId = props.modelId

    const resp = await api.generateVideoSegment(props.storyboard.id, opts)
    if (!resp?.success) throw new Error(resp?.error || '生成失败')
    lastResult.value = resp.data as VideoSegmentResult
    emit('generated', lastResult.value.output.videoPath)
    ElMessage.success(
      `已生成视频（${lastResult.value.match.mode}${
        lastResult.value.match.degraded ? '，已降级' : ''
      }）`,
    )
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    generating.value = false
  }
}

function formatCapabilities(c: ProviderCapabilities): string {
  const parts: string[] = []
  if (c.text) parts.push('text')
  if (c.image) parts.push('image')
  if (c.keyframes) parts.push(`kf×${c.maxKeyframes}`)
  parts.push(`${c.maxDurationSec}s`)
  return parts.join(' · ')
}

onMounted(loadProviders)
</script>

<style scoped>
.video-segment-panel {
  padding: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
  flex: 1;
}

.empty-state {
  padding: 20px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.opt-meta {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.form-hint {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.result-card {
  margin-top: 8px;
  padding: 10px;
  background: var(--el-color-success-light-9);
  border-radius: 4px;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
}

.result-row .label {
  color: var(--el-text-color-secondary);
  width: 70px;
}

.result-row .path {
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
}

.degrade-trace {
  margin: 4px 0;
  padding-left: 76px;
  font-size: 11px;
  color: var(--el-color-warning);
}

/* P5-T29 spec §4.7：分镜元信息 */
.meta-section {
  margin-bottom: 12px;
  padding: 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .meta-title {
    margin: 0 0 4px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }
}

.keyframe-strip {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 2px 0;

  .strip-cell {
    flex-shrink: 0;
    width: 64px;
    height: 36px;
    position: relative;
    border: 1px solid var(--el-border-color-light);
    border-radius: 3px;
    overflow: hidden;
    background: var(--el-fill-color);
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .strip-idx {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      font-size: 9px;
      text-align: center;
      padding: 1px 0;
    }
  }
}

.meta-empty {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
  padding: 4px 0;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
}

.meta-label {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  width: 50px;
}

.meta-text {
  flex: 1;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.meta-empty-inline {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.dialogue-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.dialogue-item {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;

  .dlg-speaker {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .dlg-tone {
    font-size: 10px;
    color: var(--el-color-info);
    background: var(--el-color-info-light-9);
    padding: 0 4px;
    border-radius: 2px;
  }

  .dlg-text {
    flex: 1;
    color: var(--el-text-color-regular);
  }
}

.user-prompt-section {
  margin-bottom: 12px;
  padding: 10px;
  background: var(--el-color-info-light-9);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .prompt-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--el-text-color-primary);
    font-weight: 500;

    .hint-icon {
      color: var(--el-text-color-secondary);
      cursor: help;
    }
  }
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
}
</style>
