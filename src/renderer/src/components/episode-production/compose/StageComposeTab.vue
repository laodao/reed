<template>
  <div class="stage-compose">
    <!-- 工具条 -->
    <div class="cp-toolbar">
      <div class="tb-left">
        <span class="tb-title">合成</span>
        <el-tag v-if="activeSegments.length" size="small" round effect="plain" type="info">{{ activeSegments.length }} 个片段</el-tag>
        <el-tag v-if="pendingCount > 0" size="small" round effect="plain" type="warning">{{ pendingCount }} 个待生成</el-tag>
        <el-tag v-else-if="activeSegments.length" size="small" round effect="plain" type="success">可导出</el-tag>
      </div>
      <div class="tb-right">
        <el-button
          size="small"
          :loading="qualityChecking"
          :disabled="!props.episodeId"
          @click="onQualityCheck"
        >
          <el-icon><CircleCheck /></el-icon>
          质量自检
        </el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="!scriptId || !composeReady"
          :title="composeReady ? '' : `暂不可导出：${composeMissing.join('；') || '片段未就绪'}`"
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
        <div v-if="activeSegments.length === 0" class="seg-empty">
          <el-empty description="暂无片段：请先在「分镜」页生成片段视频" :image-size="60" />
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
            <el-tooltip v-if="!seg.videoPath && seg.status !== 'superseded'" content="该片段还没有视频，导出会失败" placement="top">
              <el-icon class="seg-warn" :size="14"><Warning /></el-icon>
            </el-tooltip>
            <!-- S-07 片段排序：仅同场景内相邻交换 seq；跨场景/边界/生成中置灰 -->
            <el-button
              size="small"
              text
              :disabled="!canMove(seg, -1) || movingSegmentId !== null"
              @click="onMoveSegment(seg, 'up')"
            >
              上移
            </el-button>
            <el-button
              size="small"
              text
              :disabled="!canMove(seg, 1) || movingSegmentId !== null"
              @click="onMoveSegment(seg, 'down')"
            >
              下移
            </el-button>
            <el-button
              size="small"
              text
              type="danger"
              :disabled="seg.status === 'generating'"
              :loading="removingSegmentId === seg.segmentId"
              @click="onRemoveSegment(seg)"
            >
              移除
            </el-button>
          </div>
        </div>
      </div>

      <!-- 配音音频（2026-09-16 P0-CM1：活路径此前无任何音频入口，成片无声） -->
      <div class="seg-section">
        <div class="sec-title audio-sec-title">
          <span>
            配音音频
            <span class="sec-hint">对白/旁白 TTS；生成后导出时自动混入成片音轨</span>
          </span>
          <el-button
            size="small"
            type="primary"
            plain
            :loading="batchGeneratingAudio"
            :disabled="!scenes.length || generatingSceneId !== null || batchGeneratingAudio"
            @click="onGenerateAllAudio"
          >
            全部生成配音
          </el-button>
        </div>
        <div v-if="!scriptId || scenes.length === 0" class="seg-empty">
          <el-empty description="暂无场景：请先在「剧本」页生成场景" :image-size="60" />
        </div>
        <div v-else class="seg-rows">
          <div v-for="sc in scenes" :key="sc.id" class="seg-row audio-row">
            <span class="seg-name">场景 {{ sc.sceneNumber }}</span>
            <span class="seg-scene">{{ sc.location || '?' }}</span>
            <span class="seg-dur">
              对白 {{ audioCountOf(sc).dialogueDone }}/{{ sc.dialogues?.length ?? 0 }}
              <template v-if="hasNarrationText(sc)">· 旁白 {{ sc.narrationAudioPath ? '✓' : '待生成' }}</template>
            </span>
            <el-tag size="small" :type="audioTagType(sc)" effect="light">{{ audioLabelOf(sc) }}</el-tag>
            <el-button
              size="small"
              type="primary"
              plain
              :loading="generatingSceneId === sc.id"
              :disabled="generatingSceneId !== null || batchGeneratingAudio"
              @click="onGenerateAudio(sc)"
            >
              生成配音
            </el-button>
          </div>
        </div>
      </div>

      <!-- 时间线（read-only 预览） -->
      <TimelineEditor v-if="scriptId" :episode-script-id="scriptId" />

      <!-- S-08：质量自检结果面板（四项指标，红/黄/绿） -->
      <div v-if="qualityReport" class="seg-section qc-panel">
        <div class="sec-title">
          质量自检
          <span class="sec-hint">{{ formatCheckTime(qualityReport.checkedAt) }}</span>
        </div>
        <div class="qc-items">
          <div class="qc-item">
            <span class="qc-dot" :data-status="qualityReport.keyframeRefs.status" />
            <span class="qc-name">关键帧参考图覆盖</span>
            <span class="qc-detail">
              <template v-if="qualityReport.keyframeRefs.total === 0">暂无关键帧</template>
              <template v-else>
                有图 {{ qualityReport.keyframeRefs.withImage }}/{{ qualityReport.keyframeRefs.total }}
                · refs 记录 {{ qualityReport.keyframeRefs.withRefs }}/{{ qualityReport.keyframeRefs.total }}
                <template v-if="qualityReport.keyframeRefs.missingImage.length">
                  （缺图：{{ formatMissing(qualityReport.keyframeRefs.missingImage) }}）
                </template>
                <template v-else-if="qualityReport.keyframeRefs.missingRefs.length">
                  （缺 refs：{{ formatMissing(qualityReport.keyframeRefs.missingRefs) }}）
                </template>
              </template>
            </span>
          </div>
          <div class="qc-item">
            <span class="qc-dot" :data-status="qualityReport.subtitleMatch.status" />
            <span class="qc-name">字幕↔对白覆盖</span>
            <span class="qc-detail">
              <template v-if="qualityReport.subtitleMatch.coverage === null">无对白或未生成字幕</template>
              <template v-else>
                命中 {{ qualityReport.subtitleMatch.hitCount }}/{{ qualityReport.subtitleMatch.dialogueCount }}
                （{{ Math.round(qualityReport.subtitleMatch.coverage * 100) }}%）
                <template v-if="qualityReport.subtitleMatch.missed.length">
                  — 未命中：{{ qualityReport.subtitleMatch.missed.slice(0, 3).join('；') }}
                </template>
              </template>
            </span>
          </div>
          <div class="qc-item">
            <span class="qc-dot" :data-status="qualityReport.durationDrift.status" />
            <span class="qc-name">片段时长偏差</span>
            <span class="qc-detail">
              <template v-if="qualityReport.durationDrift.deviations.length === 0">
                {{ qualityReport.durationDrift.measured > 0 ? `${qualityReport.durationDrift.measured} 个片段均在 ±2s 内` : '暂无可测片段' }}
              </template>
              <template v-else>
                {{ qualityReport.durationDrift.deviations.length }} 个片段偏差超 2s：
                {{ qualityReport.durationDrift.deviations.map((d: any) => `片段${d.seq}（预估 ${d.estDuration}s / 实际 ${d.actualDuration}s）`).join('、') }}
              </template>
            </span>
          </div>
          <div class="qc-item">
            <span class="qc-dot" :data-status="qualityReport.vlmSimilarity.status" />
            <span class="qc-name">首帧↔定妆图相似度</span>
            <span class="qc-detail">
              <template v-if="qualityReport.vlmSimilarity.score !== null">
                {{ qualityReport.vlmSimilarity.score }}/5
                <template v-if="qualityReport.vlmSimilarity.reason">— {{ qualityReport.vlmSimilarity.reason }}</template>
                <span class="qc-model">（{{ qualityReport.vlmSimilarity.modelId }}）</span>
              </template>
              <template v-else>{{ qualityReport.vlmSimilarity.note || '未评分' }}</template>
            </span>
          </div>
        </div>
      </div>

      <!-- S-07 导出记录：最近 5 条导出留档（时间/路径/时长 + 打开文件夹） -->
      <div v-if="exportHistory.length" class="seg-section">
        <div class="sec-title">导出记录</div>
        <div class="seg-rows">
          <div v-for="h in exportHistory" :key="h.id" class="seg-row history-row">
            <span class="seg-name history-time">{{ formatTime(h.createdAt) }}</span>
            <span class="seg-scene history-path" :title="h.outputPath">{{ h.outputPath }}</span>
            <span class="seg-dur">时长 {{ formatSec(h.durationSec) }}</span>
            <el-button size="small" text type="primary" @click="onOpenHistoryFolder(h)">
              <el-icon><FolderOpened /></el-icon>
              打开文件夹
            </el-button>
          </div>
        </div>
      </div>

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
 * 导出结果展示与回放（toVideoUrl(relPath)，见 compose.handler 的 relPath 说明）、
 * S-07 全部生成配音（逐场景串行 + 汇总）/ 导出记录（最近 5 条 + 打开文件夹）/
 * 片段上移下移（同场景相邻交换 seq）。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
  status: 'pending' | 'generating' | 'completed' | 'error' | 'superseded'
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

/** S-07 导出留档条目（ep:list-export-history） */
interface ExportHistoryItem {
  id: string
  episodeId: string
  outputPath: string
  durationSec: number | null
  createdAt: number
}

/** 场景（ep:list-scenes 返回；只取配音区关心的字段） */
interface SceneAudioItem {
  id: string
  sceneNumber: number
  location?: string
  narration?: string
  narrationAudioPath?: string | null
  dialogues?: Array<{ id: string; audioAsset?: { audioPath?: string } | null }>
}

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
  /** agent 改数据后由 Studio 递增，触发本页重载 */
  refreshTick?: number
}>()

const scriptId = ref<string | null>(null)
const segments = ref<SegmentItem[]>([])
const scenes = ref<SceneAudioItem[]>([])
const generatingSceneId = ref<string | null>(null)
const batchGeneratingAudio = ref(false)
const removingSegmentId = ref<string | null>(null)
const movingSegmentId = ref<string | null>(null)
const dialogVisible = ref(false)
const lastExport = ref<ExportResult | null>(null)
const exportHistory = ref<ExportHistoryItem[]>([])

/** S-01：合成阶段就绪状态（ep:episode-readiness），驱动「导出 MP4」硬锁 */
const composeReady = ref(false)
const composeMissing = ref<string[]>([])

/** S-08：质量自检（ep:episode-quality-check）结果与加载态 */
const qualityChecking = ref(false)
const qualityReport = ref<any | null>(null)

/** S-08：跑一次质量自检，结果渲染到下方四项面板 */
async function onQualityCheck(): Promise<void> {
  if (!props.episodeId || qualityChecking.value) return
  qualityChecking.value = true
  try {
    const r = await (window.electronAPI.episodeProduction as any).episodeQualityCheck(props.episodeId)
    if (!r?.success) {
      ElMessage.error(r?.error || '质量自检失败')
      return
    }
    qualityReport.value = r.data
  } catch (e: any) {
    ElMessage.error(e?.message || '质量自检失败')
  } finally {
    qualityChecking.value = false
  }
}

function formatCheckTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function formatMissing(list: Array<{ shotNumber: number; frameIndex: number }>): string {
  return list.slice(0, 5).map(m => `镜${m.shotNumber}帧${m.frameIndex}`).join('、')
    + (list.length > 5 ? ` 等 ${list.length} 处` : '')
}

/** 有效片段（superseded 不计入合成/导出语义，仅置灰展示可追溯、可移除） */
const activeSegments = computed(() =>
  segments.value.filter(s => s.status !== 'superseded'),
)

const pendingCount = computed(() =>
  activeSegments.value.filter(s => s.status === 'pending' || s.status === 'generating' || s.status === 'error').length,
)

/** 播放地址：relPath（dataPath 相对）优先；无则不提供应用内回放（路径出错了也还有"打开所在目录"） */
const lastExportPlayUrl = computed(() =>
  lastExport.value?.relPath ? toVideoUrl(lastExport.value.relPath) : null,
)

async function load(): Promise<void> {
  if (!props.episodeId) { scriptId.value = null; segments.value = []; scenes.value = []; composeReady.value = false; composeMissing.value = []; exportHistory.value = []; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  scriptId.value = ep.success ? (ep.data?.scriptId ?? null) : null
  await Promise.all([loadSegments(), loadScenes(), loadReadiness(), loadExportHistory()])
}

/** S-07 导出留档：最近 5 条 */
async function loadExportHistory(): Promise<void> {
  try {
    const r = await (window.electronAPI.episodeProduction as any).listExportHistory(props.episodeId)
    exportHistory.value = r?.success ? (r.data ?? []) : []
  } catch {
    exportHistory.value = []
  }
}

/** S-01 readiness：合成未就绪（无片段/有片段未 completed/缺 video_path）时禁用导出 */
async function loadReadiness(): Promise<void> {
  try {
    const r = await (window.electronAPI.episodeProduction as any).episodeReadiness(props.episodeId)
    if (r?.success && r.data) {
      composeReady.value = !!r.data.compose?.ready
      composeMissing.value = r.data.compose?.missing ?? []
    }
  } catch { /* 拉取失败保持现状（按钮维持禁用），不阻断页面 */ }
}

async function loadScenes(): Promise<void> {
  try {
    const r = await (window.electronAPI.episodeProduction as any).listScenes(scriptId.value)
    scenes.value = r?.success ? (r.data ?? []) : []
  } catch {
    scenes.value = []
  }
}

function audioCountOf(sc: SceneAudioItem): { dialogueDone: number } {
  const list = sc.dialogues ?? []
  return {
    dialogueDone: list.filter(d => !!d?.audioAsset?.audioPath).length,
  }
}

function hasNarrationText(sc: SceneAudioItem): boolean {
  return !!(sc.narration ?? '').trim()
}

function audioLabelOf(sc: SceneAudioItem): string {
  const total = (sc.dialogues?.length ?? 0) + (hasNarrationText(sc) ? 1 : 0)
  if (total === 0) return '无内容'
  const done = audioCountOf(sc).dialogueDone + (sc.narrationAudioPath && hasNarrationText(sc) ? 1 : 0)
  if (done === 0) return '待生成'
  return done >= total ? '已配音' : `${done}/${total}`
}

function audioTagType(sc: SceneAudioItem): 'info' | 'success' | 'warning' {
  const label = audioLabelOf(sc)
  if (label === '已配音') return 'success'
  if (label === '无内容') return 'info'
  return 'warning'
}

/** 单场景配音调用：不 toast，返回分级结果供单场景/批量两种入口消费（TTS 不可用等明确报错语义保持不变） */
async function invokeSceneAudio(sc: SceneAudioItem): Promise<{ level: 'success' | 'warning' | 'error'; message: string }> {
  try {
    const r = await (window.electronAPI.episodeProduction as any).generateSceneAudioV3(sc.id)
    if (!r?.success) {
      return { level: 'error', message: r?.error || '生成配音失败' }
    } else if (r.data?.persistFailed) {
      // 生成成功但落库失败——导出器读不到产物，成片仍会无声，必须醒目提示
      return { level: 'error', message: '配音已生成但保存到场景失败，导出将无法混入，请重试或检查数据库' }
    } else if (r.data?.partial) {
      const parts: string[] = []
      if (r.data?.narrationFailed) parts.push('旁白合成失败')
      if ((r.data?.dialogueFailCount ?? 0) > 0) parts.push(`${r.data.dialogueFailCount} 条对白合成失败`)
      return { level: 'warning', message: `配音部分生成：${parts.join('、')}；失败部分导出时将无声，可重试补齐` }
    }
    const fallbackCount = r.data?.fallbackDialogueCount ?? 0
    return {
      level: 'success',
      message: fallbackCount > 0
        ? `配音已生成（${fallbackCount} 条对白使用了系统默认音色，可在资产页为角色绑定音色）`
        : '配音已生成，导出时将自动混入',
    }
  } catch (e: any) {
    return { level: 'error', message: e?.message || '生成配音失败' }
  }
}

async function onGenerateAudio(sc: SceneAudioItem): Promise<void> {
  generatingSceneId.value = sc.id
  try {
    const r = await invokeSceneAudio(sc)
    ElMessage({ type: r.level, message: r.message })
  } finally {
    generatingSceneId.value = null
    await loadScenes()
  }
}

/** S-07「全部生成配音」：串行逐场景调配音编排服务；单场景失败不阻断，最后汇总 toast */
async function onGenerateAllAudio(): Promise<void> {
  batchGeneratingAudio.value = true
  const stats: Record<'success' | 'warning' | 'error', number> = { success: 0, warning: 0, error: 0 }
  try {
    for (const sc of scenes.value) {
      generatingSceneId.value = sc.id
      const r = await invokeSceneAudio(sc)
      stats[r.level]++
    }
    const parts: string[] = []
    if (stats.success) parts.push(`${stats.success} 个场景完成`)
    if (stats.warning) parts.push(`${stats.warning} 个场景部分生成`)
    if (stats.error) parts.push(`${stats.error} 个场景失败`)
    ElMessage({
      type: stats.error > 0
        ? (stats.success + stats.warning > 0 ? 'warning' : 'error')
        : (stats.warning > 0 ? 'warning' : 'success'),
      message: `全部配音处理完毕：${parts.join('，') || '无可处理场景'}`,
    })
  } finally {
    generatingSceneId.value = null
    batchGeneratingAudio.value = false
    await loadScenes()
  }
}

async function loadSegments(): Promise<void> {
  try {
    // includeSuperseded：已废弃片段置灰展示以便追溯/手动移除；计数与导出入口只看 activeSegments
    const r = await (window.electronAPI.episodeProduction as any).listSegments(props.episodeId, { includeSuperseded: true })
    segments.value = r?.success ? (r.data?.segments ?? []) : []
  } catch {
    segments.value = []
  }
}

async function onRemoveSegment(seg: SegmentItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认移除片段 ${seg.seq}？片段行将被删除（磁盘上的视频文件保留），不可恢复。`,
      '移除片段',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  removingSegmentId.value = seg.segmentId
  try {
    const r = await (window.electronAPI.episodeProduction as any).deleteSegment(seg.segmentId)
    if (!r?.success) {
      ElMessage.error(r?.error || '移除片段失败')
    } else {
      ElMessage.success('片段已移除')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '移除片段失败')
  } finally {
    removingSegmentId.value = null
    await Promise.all([loadSegments(), loadReadiness()])
  }
}

/**
 * S-07 片段排序可动性：仅同场景内相邻交换（segments 已按 seq 升序）。
 * 边界、相邻片段跨场景、任一方 superseded/generating 时置灰。
 */
function canMove(seg: SegmentItem, delta: -1 | 1): boolean {
  if (seg.status === 'generating' || seg.status === 'superseded') return false
  const idx = segments.value.findIndex(s => s.segmentId === seg.segmentId)
  if (idx < 0) return false
  const neighbor = segments.value[idx + delta]
  if (!neighbor) return false
  if (neighbor.sceneId !== seg.sceneId) return false
  if (neighbor.status === 'generating' || neighbor.status === 'superseded') return false
  return true
}

async function onMoveSegment(seg: SegmentItem, direction: 'up' | 'down'): Promise<void> {
  movingSegmentId.value = seg.segmentId
  try {
    const r = await (window.electronAPI.episodeProduction as any).moveSegment(seg.segmentId, direction)
    if (!r?.success) {
      ElMessage.error(r?.error || '移动片段失败')
    } else {
      // 服务端返回交换后的分段预览，直接套用（避免再拉一次）
      segments.value = r.data?.segments ?? segments.value
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '移动片段失败')
  } finally {
    movingSegmentId.value = null
  }
}

function statusLabel(s: SegmentItem['status']): string {
  return ({ pending: '待生成', generating: '生成中', completed: '已完成', error: '失败', superseded: '已废弃' } as const)[s] ?? s
}

function statusTagType(s: SegmentItem['status']): 'info' | 'warning' | 'success' | 'danger' {
  return ({ pending: 'info', generating: 'warning', completed: 'success', error: 'danger', superseded: 'info' } as const)[s] ?? 'info'
}

function formatSec(n?: number | null): string {
  return `${(n ?? 0).toFixed(1)}s`
}

function onExported(result: ExportResult): void {
  lastExport.value = result
  void loadExportHistory()
}

async function onOpenFolder(): Promise<void> {
  if (!lastExport.value?.outputPath) return
  const r = await (window.electronAPI.episodeProduction as any).openExportFolder(lastExport.value.outputPath)
  if (!r?.success) ElMessage.error(r?.error || '打开目录失败')
}

/** S-07：导出记录行的「打开文件夹」（复用 ep:open-export-folder） */
async function onOpenHistoryFolder(h: ExportHistoryItem): Promise<void> {
  const r = await (window.electronAPI.episodeProduction as any).openExportFolder(h.outputPath)
  if (!r?.success) ElMessage.error(r?.error || '打开目录失败')
}

function formatTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

watch(() => props.episodeId, () => void load())
watch(() => props.refreshTick, () => void load())
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
  .sec-hint { margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--text-color-placeholder); }
}
.seg-empty { padding: 8px 0; }

.qc-panel {
  .qc-items { display: flex; flex-direction: column; gap: 8px; }
  .qc-item { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .qc-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; align-self: center;
    &[data-status='green'] { background: var(--color-success); }
    &[data-status='yellow'] { background: var(--color-warning); }
    &[data-status='red'] { background: var(--color-danger); }
    &[data-status='skipped'] { background: var(--color-info); }
  }
  .qc-name { font-weight: 600; color: var(--text-color-primary); flex-shrink: 0; }
  .qc-detail { color: var(--text-color-secondary); word-break: break-all; }
  .qc-model { color: var(--text-color-placeholder); }
}
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
  &[data-status='superseded'] { border-left: 3px solid var(--border-color); opacity: 0.55; }
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
  .audio-row .el-button { margin-left: 8px; flex-shrink: 0; }
}

.audio-sec-title {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}

.history-row {
  .history-time { flex-shrink: 0; font-weight: 400; color: var(--text-color-secondary); }
  .history-path { font-family: monospace; font-size: 11px; }
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
