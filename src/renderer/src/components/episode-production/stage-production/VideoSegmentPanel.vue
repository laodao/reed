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

    <!-- 已生成视频播放器（取最新结果，回退到 storyboard.videoPath） -->
    <div v-if="storyboard && currentVideoPath" class="video-player-section">
      <video
        :key="currentVideoPath"
        :src="toVideoUrl(currentVideoPath)"
        controls
        preload="metadata"
        class="result-video"
      />
      <div class="video-player-meta">
        <span class="video-player-label">本分镜视频</span>
        <span class="video-player-path" :title="currentVideoPath">{{ currentVideoPath }}</span>
      </div>
    </div>

    <div v-if="storyboard" class="form-area">
      <!-- 提供商 + 模型 一行 -->
      <div class="form-row">
        <div class="form-cell">
          <label class="cell-label">提供商</label>
          <el-select
            v-model="selectedProviderConfigId"
            placeholder="选择已配置的视频提供商"
            :loading="loadingProviders"
            class="full-width"
            size="small"
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
        </div>
        <div class="form-cell">
          <label class="cell-label">模型</label>
          <el-select
            v-model="selectedModelId"
            :placeholder="selectedProvider ? '选择视频模型' : '请先选提供商'"
            :disabled="!selectedProvider || !(selectedProvider.models?.length)"
            class="full-width"
            size="small"
          >
            <el-option
              v-for="m in (selectedProvider?.models ?? [])"
              :key="m.id"
              :value="m.id"
              :label="m.name || m.id"
            />
          </el-select>
        </div>
      </div>

      <!-- 模式 + 时长 一行 -->
      <div class="form-row">
        <div class="form-cell">
          <label class="cell-label">模式</label>
          <el-radio-group v-model="modeChoice" size="small">
            <el-radio-button label="auto">自动</el-radio-button>
            <el-radio-button label="text2video">文生视频</el-radio-button>
            <el-radio-button label="image2video">图生视频</el-radio-button>
            <el-radio-button label="keyframes2video">关键帧序列</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-cell duration-cell">
          <label class="cell-label">时长</label>
          <el-input-number
            v-model="durationSec"
            :min="1"
            :max="10"
            :step="1"
            size="small"
          />
          <span class="form-hint">秒</span>
        </div>
      </div>

      <!-- 完整提示词预览 -->
      <div class="prompt-preview">
        <div class="prompt-preview-header">
          <el-icon><InfoFilled /></el-icon>
          最终提示词预览
        </div>
        <pre class="prompt-preview-body">{{ finalPromptPreview }}</pre>
      </div>

      <!-- 用户额外提示词：生成视频片段时一并影响 prompt -->
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

      <div class="form-actions">
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!canGenerate"
          @click="onGenerate"
        >
          <el-icon><MagicStick /></el-icon>
          {{ storyboard.videoPath ? '重新生成' : '生成视频片段' }}
        </el-button>
      </div>

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
  Warning,
} from '@element-plus/icons-vue'
import { toVideoUrl } from '@/utils/asset-url'
import { useEpAssetStore, useEpScriptStore } from '@/stores/episode-production'

interface Storyboard {
  id: string
  videoPath?: string | null
  keyframeCount?: number
  duration?: number
  frameDescription?: string | null
  shotType?: string | null
  cameraAngle?: string | null
  cameraMovement?: string | null
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
  const scenes = scriptStore.scenes
  if (!Array.isArray(scenes) || scenes.length === 0) return null
  // 注：scriptStore.scenes 不含 storyboards 字段；简化为返回第一个场景。
  // 完整 storyboard → scene 反查留 follow-up（需要 storyboardStore inject）
  return scenes[0] as any
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
    if (!Array.isArray(sceneChars)) return list
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
    speaker:
      d?.characterName ??
      d?.speaker ??
      (d?.characterBindingId ? lookupCharName(d.characterBindingId) : null) ??
      '?',
    tone: d?.tone ?? d?.emotion,
    text: d?.text ?? '',
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

/**
 * 当前可播放的视频路径：优先取本次生成结果，其次取 storyboard 已有的 videoPath。
 * 切换分镜时 lastResult 由父组件 :key 重置；storyboard.videoPath 来自 reload。
 */
const currentVideoPath = computed<string | null>(() => {
  return (
    lastResult.value?.output?.videoPath ||
    props.storyboard?.videoPath ||
    null
  )
})

/**
 * 最终提示词预览（前端拼接，与后端真实拼装可能略有差异，但覆盖所有用户能控的部分）：
 *   1) 画面描述（storyboard.frameDescription）
 *   2) 镜头语言（景别 / 角度 / 运镜）
 *   3) 资产引用（地点 / 角色 + 表情 / 物品）
 *   4) 对白与旁白
 *   5) 用户调整方向（userPrompt，⑤ 面板自定义）
 *   6) 时长 / 模式 / 提供商
 */
const finalPromptPreview = computed<string>(() => {
  const sb = props.storyboard
  if (!sb) return ''
  const parts: string[] = []

  if (sb.frameDescription) parts.push(`【画面描述】${sb.frameDescription.trim()}`)

  const cameraBits: string[] = []
  if (sb.shotType) cameraBits.push(sb.shotType)
  if (sb.cameraAngle) cameraBits.push(sb.cameraAngle)
  if (sb.cameraMovement) cameraBits.push(sb.cameraMovement)
  if (cameraBits.length) parts.push(`【镜头语言】${cameraBits.join(' · ')}`)

  const locName = currentScene.value?.location
  if (locName) parts.push(`【地点】${locName}`)

  if (characterChips.value.length > 0) {
    const charText = characterChips.value
      .map((c) => `${c.name}${c.expression ? `(${c.expression})` : ''}`)
      .join(' / ')
    parts.push(`【角色】${charText}`)
  }

  if (narration.value) parts.push(`【旁白】${narration.value.trim()}`)

  if (dialogues.value.length > 0) {
    const dlgText = dialogues.value
      .map((d) => `${d.speaker || '?'}: ${d.text || ''}`)
      .join(' | ')
    parts.push(`【对白】${dlgText}`)
  }

  if (userPrompt.value && userPrompt.value.trim()) {
    parts.push(`【调整方向】${userPrompt.value.trim()}`)
  }

  parts.push(`【时长】${durationSec.value}s`)
  if (modeChoice.value && modeChoice.value !== 'auto') {
    parts.push(`【模式】${modeChoice.value}`)
  }

  return parts.length > 0 ? parts.join('\n') : '（暂无内容；先在 ④ 分镜或 ⑤ 镜头描述卡填写画面描述）'
})

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

.video-player-section {
  margin-bottom: 12px;
  padding: 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.result-video {
  width: 100%;
  max-height: 360px;
  background: #000;
  border-radius: 4px;
  display: block;
  outline: none;
}

.video-player-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.video-player-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.video-player-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
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

/* 提供商+模型 / 模式+时长 一行两栏；每栏内 label 与控件水平并排 */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;
  align-items: center;
}

.form-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.cell-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  flex-shrink: 0;
  width: 56px;
  text-align: right;
}

.full-width {
  flex: 1;
  min-width: 0;
}

@media (max-width: 720px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

/* 最终提示词预览 */
.prompt-preview {
  margin: 12px 0;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}

.prompt-preview-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.prompt-preview-header .el-icon {
  color: var(--el-color-primary);
}

.prompt-preview-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  max-height: 200px;
  overflow: auto;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
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
