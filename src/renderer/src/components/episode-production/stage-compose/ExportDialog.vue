<template>
  <!--
    ExportDialog · 整剧 MP4 导出弹框（spec §6.2 + P6-T7）

    流程：
    1. 用户点 "导出 MP4" 按钮 → 打开本弹框
    2. 自动调 ep:build-timeline 加载时间线 + 显示概要
    3. 用户选分辨率 / 字幕烧入开关 / 输出路径
    4. 点"开始导出"→ 调 ep:export-mp4，等候返回
    5. 完成后展示输出路径 + 文件大小（外加"播放/打开所在目录"占位）

    时间线缺视频时禁用导出按钮 + 提示用户先完成 ⑤ 制作。
  -->
  <el-dialog
    v-model="visible"
    title="导出 MP4"
    width="520px"
    :close-on-click-modal="false"
    @close="onClose"
  >
    <div v-if="loadingTimeline" class="loading-row">
      <el-icon class="is-loading"><Loading /></el-icon>
      装配时间线...
    </div>

    <div v-else-if="timeline">
      <div class="timeline-summary">
        <div class="summary-row">
          <span class="label">总时长：</span>
          <span>{{ totalDurationLabel }}</span>
        </div>
        <div class="summary-row">
          <span class="label">分镜数：</span>
          <span>{{ totalShotsCount }}</span>
        </div>
        <div class="summary-row">
          <span class="label">缺失视频：</span>
          <el-tag
            size="small"
            :type="timeline.missingVideoStoryboardIds.length === 0 ? 'success' : 'danger'"
          >
            {{ timeline.missingVideoStoryboardIds.length }}
          </el-tag>
        </div>
      </div>

      <div v-if="timeline.missingVideoStoryboardIds.length > 0" class="warning-banner">
        <el-icon><Warning /></el-icon>
        有 {{ timeline.missingVideoStoryboardIds.length }} 个分镜尚未生成视频片段，
        请先回到 ⑤ 制作 阶段完成。
      </div>

      <el-form v-else :model="form" label-width="100px" class="export-form">
        <el-form-item label="分辨率">
          <el-radio-group v-model="form.resolution">
            <el-radio-button label="1280x720">720p</el-radio-button>
            <el-radio-button label="1920x1080">1080p</el-radio-button>
          </el-radio-group>
          <div class="form-hint">源分辨率由生成网关决定（当前 1248×704），1080p 为放大输出</div>
        </el-form-item>
        <el-form-item label="烧入字幕">
          <el-switch v-model="form.burnSubtitles" />
          <span class="form-hint">开启后字幕直接绘制到画面上；关闭则导出无字幕的成片</span>
        </el-form-item>
        <el-form-item label="输出路径">
          <el-input
            v-model="form.outputPath"
            placeholder="留空自动使用默认输出目录 + 时间戳文件名"
          />
          <span class="form-hint">绝对路径，含 .mp4 后缀；留空自动生成带时间戳的默认路径</span>
        </el-form-item>
      </el-form>
    </div>

    <div v-if="exporting" class="export-progress">
      <el-icon class="is-loading"><Loading /></el-icon>
      正在导出（用 fluent-ffmpeg 调 ffmpeg 拼接）...
    </div>

    <div v-if="exportResult" class="export-result">
      <el-icon class="success-icon"><CircleCheck /></el-icon>
      <div>
        <div>导出成功！</div>
        <div class="result-path">{{ exportResult.outputPath }}</div>
        <div class="result-meta">
          时长：{{ formatDuration(exportResult.durationSec) }}
          <span v-if="exportResult.srtPath">· 字幕已写入：{{ exportResult.srtPath }}</span>
        </div>
      </div>
    </div>

    <div v-if="errorMessage" class="error-banner">
      <el-icon><Warning /></el-icon>
      导出失败：{{ errorMessage }}
    </div>

    <template #footer>
      <el-button @click="onCancel" :disabled="exporting">关闭</el-button>
      <el-button
        type="primary"
        :loading="exporting"
        :disabled="!canExport"
        @click="onExport"
      >
        开始导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * ExportDialog（P6-T7）
 *
 * Props：
 *   - modelValue：v-model 控制可见
 *   - episodeScriptId：要导出的剧本 ID
 *   - projectId：用于 outputPath 默认推荐
 */
import { computed, ref, watch } from 'vue'
import {
  CircleCheck,
  Loading,
  Warning,
} from '@element-plus/icons-vue'

interface Timeline {
  episodeScriptId: string
  totalDurationSec: number
  scenes: Array<{ shots: Array<{ storyboardId: string }> }>
  missingVideoStoryboardIds: string[]
}

interface ExportResult {
  outputPath: string
  durationSec: number
  srtPath?: string
}

const props = defineProps<{
  modelValue: boolean
  episodeScriptId: string | null
  projectId?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'exported', result: ExportResult): void
}>()

const visible = ref(false)
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) onOpen()
  },
)
watch(visible, (v) => emit('update:modelValue', v))

const loadingTimeline = ref(false)
const timeline = ref<Timeline | null>(null)
const exporting = ref(false)
const exportResult = ref<ExportResult | null>(null)
const errorMessage = ref<string | null>(null)

const form = ref({
  resolution: '1920x1080',
  burnSubtitles: true,
  outputPath: '',
})

const totalDurationLabel = computed(() =>
  timeline.value ? formatDuration(timeline.value.totalDurationSec) : '0:00',
)
const totalShotsCount = computed(() =>
  timeline.value
    ? timeline.value.scenes.reduce((acc, s) => acc + s.shots.length, 0)
    : 0,
)
const canExport = computed(
  () =>
    !exporting.value &&
    timeline.value !== null &&
    timeline.value.missingVideoStoryboardIds.length === 0,
    // S-07：输出路径允许留空——主进程 resolveOutputPath 自动落默认目录 + 时间戳文件名
)

async function onOpen(): Promise<void> {
  exportResult.value = null
  errorMessage.value = null
  if (!props.episodeScriptId) return
  loadingTimeline.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.buildTimeline) throw new Error('IPC buildTimeline 未暴露')
    const resp = await api.buildTimeline(props.episodeScriptId)
    if (!resp?.success) throw new Error(resp?.error || '装配时间线失败')
    timeline.value = resp.data as Timeline

    // 默认 outputPath 推荐
    if (!form.value.outputPath) {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      form.value.outputPath = `~/Movies/episode-${props.episodeScriptId}-${stamp}.mp4`
    }
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
    timeline.value = null
  } finally {
    loadingTimeline.value = false
  }
}

async function onExport(): Promise<void> {
  if (!props.episodeScriptId || !timeline.value) return
  exporting.value = true
  errorMessage.value = null
  exportResult.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.exportMp4) throw new Error('IPC exportMp4 未暴露')

    const [w, h] = form.value.resolution.split('x').map(Number)
    const resp = await api.exportMp4(
      props.episodeScriptId,
      form.value.outputPath.trim(),
      {
        width: w,
        height: h,
        burnSubtitles: form.value.burnSubtitles,
        projectId: props.projectId,
      },
    )
    if (!resp?.success) throw new Error(resp?.error || '导出失败')
    exportResult.value = resp.data as ExportResult
    emit('exported', exportResult.value)
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    exporting.value = false
  }
}

function onCancel(): void {
  visible.value = false
}

function onClose(): void {
  timeline.value = null
  exportResult.value = null
  errorMessage.value = null
  exporting.value = false
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.loading-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px;
  color: var(--el-text-color-secondary);
}

.timeline-summary {
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  margin-bottom: 12px;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 6px;
}

.summary-row:last-child {
  margin-bottom: 0;
}

.summary-row .label {
  color: var(--el-text-color-secondary);
  width: 70px;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
  font-size: 13px;
}

.export-form {
  margin-top: 8px;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.export-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  margin-top: 8px;
  color: var(--el-color-primary);
  font-size: 13px;
}

.export-result {
  display: flex;
  gap: 12px;
  padding: 12px;
  margin-top: 8px;
  background: var(--el-color-success-light-9);
  border-radius: 6px;
  align-items: flex-start;
}

.success-icon {
  font-size: 24px;
  color: var(--el-color-success);
  margin-top: 2px;
}

.result-path {
  margin-top: 4px;
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.result-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-top: 8px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
  font-size: 13px;
}
</style>
