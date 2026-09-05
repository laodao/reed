<template>
  <div class="stage-compose">
    <!-- 工具条 -->
    <div class="cp-toolbar">
      <div class="tb-left">
        <span class="tb-title">合成</span>
        <el-tag v-if="segments.length" size="small" round effect="plain" type="info">{{ segments.length }} 个片段</el-tag>
        <el-tag v-if="pendingCount > 0" size="small" round effect="plain" type="warning">{{ pendingCount }} 个待生成</el-tag>
        <el-tag v-else-if="segments.length" size="small" round effect="plain" type="success">可导出</el-tag>
      </div>
      <div class="tb-right">
        <el-button
          type="primary"
          size="small"
          :disabled="!scriptId || segments.length === 0"
          @click="dialogVisible = true"
        >
          <el-icon><Download /></el-icon>
          导出 MP4
        </el-button>
      </div>
    </div>

    <div class="cp-body">
      <!-- 片段就绪清单：导出前确认每段都有视频（末端硬锁：缺视频导出会失败） -->
      <div class="seg-section">
        <div class="sec-title">视频片段</div>
        <div v-if="segments.length === 0" class="seg-empty">
          <el-empty description="暂无片段：请先在「分镜」页重新分段并生成片段视频" :image-size="60" />
        </div>
        <div v-else class="seg-rows">
          <div
            v-for="seg in segments"
            :key="seg.segmentId"
            class="seg-row"
            :data-status="seg.status"
          >
            <div class="seg-thumb">
              <video v-if="seg.videoPath" :src="toVideoUrl(seg.videoPath)" muted preload="metadata" />
              <el-icon v-else :size="16"><Picture /></el-icon>
            </div>
            <span class="seg-name">片段 {{ seg.seq }}</span>
            <span class="seg-scene">场景 {{ seg.sceneNumber }} · {{ seg.sceneLocation || '?' }}</span>
            <span class="seg-dur">{{ seg.shotCount }} 镜 · {{ formatSec(seg.duration ?? seg.estDuration) }}</span>
            <el-tag size="small" :type="statusTagType(seg.status)" effect="light">{{ statusLabel(seg.status) }}</el-tag>
            <el-tooltip v-if="!seg.videoPath" content="该片段还没有视频，导出会失败" placement="top">
              <el-icon class="seg-warn" :size="14"><Warning /></el-icon>
            </el-tooltip>
          </div>
        </div>
      </div>

      <!-- 时间线（read-only 预览） -->
      <TimelineEditor v-if="scriptId" :episode-script-id="scriptId" />

      <!-- 上次导出结果 -->
      <div v-if="lastExport" class="last-export">
        <div class="last-export-head">
          <el-icon><CircleCheck /></el-icon>
          <span>导出完成</span>
          <span class="le-duration">时长 {{ formatSec(lastExport.durationSec) }}</span>
          <el-button size="small" text type="primary" @click="onOpenFolder">
            <el-icon><FolderOpened /></el-icon>
            打开所在目录
          </el-button>
        </div>
        <video
          v-if="lastExportPlayUrl"
          :src="lastExportPlayUrl"
          class="le-video"
          controls
        />
        <div class="le-path">{{ lastExport.outputPath }}</div>
      </div>
    </div>

    <ExportDialog
      v-model="dialogVisible"
      :episode-script-id="scriptId"
      :project-id="projectId"
      @exported="onExported"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * ⑥ 合成 tab（EpisodeStudio 宿主）——整剧合成与导出。
 *
 * 复用 stage-compose（Workbench 路线）的 TimelineEditor + ExportDialog；
 * 本体负责：episodeId → scriptId 解析、片段就绪清单（导出硬锁前置提示）、
 * 导出结果展示与回放（toVideoUrl(relPath)，见 compose.handler 的 relPath 说明）。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Download, FolderOpened, Picture, Warning } from '@element-plus/icons-vue'
import TimelineEditor from '@/components/episode-production/stage-compose/TimelineEditor.vue'
import ExportDialog from '@/components/episode-production/stage-compose/ExportDialog.vue'
import { toVideoUrl } from '@/utils/asset-url'

interface SegmentItem {
  segmentId: string
  seq: number
  sceneId: string
  sceneNumber: number
  sceneLocation: string
  status: 'pending' | 'generating' | 'completed' | 'error'
  shotCount: number
  estDuration: number
  duration: number | null
  videoPath: string | null
}

interface ExportResult {
  outputPath: string
  durationSec: number
  srtPath?: string
  relPath?: string
}

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()

const scriptId = ref<string | null>(null)
const segments = ref<SegmentItem[]>([])
const dialogVisible = ref(false)
const lastExport = ref<ExportResult | null>(null)

const pendingCount = computed(() =>
  segments.value.filter(s => s.status === 'pending' || s.status === 'generating' || s.status === 'error').length,
)

/** 播放地址：relPath（dataPath 相对）优先；无则不提供应用内回放（路径出错了也还有"打开所在目录"） */
const lastExportPlayUrl = computed(() =>
  lastExport.value?.relPath ? toVideoUrl(lastExport.value.relPath) : null,
)

async function load(): Promise<void> {
  if (!props.episodeId) { scriptId.value = null; segments.value = []; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  scriptId.value = ep.success ? (ep.data?.scriptId ?? null) : null
  await loadSegments()
}

async function loadSegments(): Promise<void> {
  try {
    const r = await (window.electronAPI.episodeProduction as any).listSegments(props.episodeId)
    segments.value = r?.success ? (r.data?.segments ?? []) : []
  } catch {
    segments.value = []
  }
}

function statusLabel(s: SegmentItem['status']): string {
  return ({ pending: '待生成', generating: '生成中', completed: '已完成', error: '失败' } as const)[s] ?? s
}

function statusTagType(s: SegmentItem['status']): 'info' | 'warning' | 'success' | 'danger' {
  return ({ pending: 'info', generating: 'warning', completed: 'success', error: 'danger' } as const)[s] ?? 'info'
}

function formatSec(n?: number | null): string {
  return `${(n ?? 0).toFixed(1)}s`
}

function onExported(result: ExportResult): void {
  lastExport.value = result
}

async function onOpenFolder(): Promise<void> {
  if (!lastExport.value?.outputPath) return
  const r = await (window.electronAPI.episodeProduction as any).openExportFolder(lastExport.value.outputPath)
  if (!r?.success) ElMessage.error(r?.error || '打开目录失败')
}

watch(() => props.episodeId, () => void load())
onMounted(() => void load())
</script>

<style lang="scss" scoped>
.stage-compose {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.cp-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .tb-left { display: flex; align-items: center; gap: 8px; }
  .tb-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
  .tb-right { display: flex; align-items: center; gap: 6px; }
}

.cp-body {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 16px 20px;
  display: flex; flex-direction: column; gap: 16px;
}

.seg-section {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  .sec-title { font-size: 13px; font-weight: 600; color: var(--text-color-primary); margin-bottom: 10px; }
}
.seg-empty { padding: 8px 0; }
.seg-rows { display: flex; flex-direction: column; gap: 6px; }
.seg-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  font-size: 12px;
  &[data-status='completed'] { border-left: 3px solid var(--color-success); }
  &[data-status='error'] { border-left: 3px solid var(--color-danger); }
  &[data-status='generating'] { border-left: 3px solid var(--color-warning); }
  &[data-status='pending'] { border-left: 3px solid var(--border-color); }
  .seg-thumb {
    width: 48px; height: 30px; flex-shrink: 0;
    background: #111; border-radius: 4px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-color-placeholder);
    video { width: 100%; height: 100%; object-fit: cover; }
  }
  .seg-name { font-weight: 600; color: var(--text-color-primary); flex-shrink: 0; }
  .seg-scene { color: var(--text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg-dur { color: var(--text-color-placeholder); flex-shrink: 0; margin-left: auto; }
  .seg-warn { color: var(--color-warning); }
}

.last-export {
  background: var(--color-success-light-9);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  .last-export-head {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--color-success); margin-bottom: 10px;
    .le-duration { color: var(--text-color-secondary); font-size: 12px; }
  }
  .le-video { width: 100%; max-height: 50vh; background: #000; border-radius: var(--radius-md); }
  .le-path { margin-top: 8px; font-family: monospace; font-size: 12px; color: var(--text-color-secondary); word-break: break-all; }
}
</style>
