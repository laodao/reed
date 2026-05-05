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
      <el-form label-width="80px" size="small">
        <el-form-item label="Provider">
          <el-select
            v-model="selectedProvider"
            placeholder="选择视频 provider"
            :loading="loadingProviders"
          >
            <el-option
              v-for="p in availableProviders"
              :key="p.type"
              :value="p.type"
              :label="p.name"
              :disabled="!p.implemented"
            >
              <span>{{ p.name }}</span>
              <span class="opt-meta">
                {{ formatCapabilities(p.capabilities) }}
                <el-tag v-if="!p.implemented" size="small" type="info">未实现</el-tag>
              </span>
            </el-option>
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
import { MagicStick, Warning } from '@element-plus/icons-vue'

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
  type: string
  name: string
  description: string
  implemented: boolean
  capabilities: ProviderCapabilities
  ready: boolean
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

const availableProviders = ref<ProviderInfo[]>([])
const selectedProvider = ref<string>('')
const modeChoice = ref<'auto' | 'text2video' | 'image2video' | 'keyframes2video'>(
  'auto',
)
const durationSec = ref(4)
const loadingProviders = ref(false)
const generating = ref(false)
const lastResult = ref<VideoSegmentResult | null>(null)
const errorMessage = ref<string | null>(null)

const canGenerate = computed(
  () =>
    !generating.value &&
    selectedProvider.value !== '' &&
    props.storyboard !== null,
)

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
    // 默认选中第一个 implemented
    if (!selectedProvider.value) {
      const first = availableProviders.value.find((p) => p.implemented)
      if (first) selectedProvider.value = first.type
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
    }
    if (modeChoice.value !== 'auto') opts.forceMode = modeChoice.value
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
