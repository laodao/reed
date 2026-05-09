<template>
  <!--
    StageComposeViewV2 · ⑥ 合成（FU5-G1 / 原型 §9 · 全部真实功能）

    严格按对照表 §9 cell 表 11 条差异 + spec §5.3 实施：
    ✓ StageMainHeader 副标题（N 个分镜 · 累计 Ms · 即将合成 1080p MP4）+ 📥 导出 MP4
    ✓ 上半双栏 1fr / 320px：
      - 左 preview-area（16:9 + lastExport video 元素 + ▶ + timecode）
      - 右 导出参数常驻 panel（分辨率 / 烧入字幕 / 输出路径）
    ✓ 时间线 panel 含快捷键提示 + 时间标尺 + playhead
    ✓ 多轨：视频 V1 / 字幕 / 旁白 A1 / 对话 A2 / BGM A3
    ✓ 转场标记 ⇄ 在视频片段之间
    ✓ 时间线底部统计行（视频片段 / 转场 / 字幕 / 音轨 / 总时长）
    ✓ 完成 success-banner（接 stage-gate.canEnterStage('completed') 真实校验）
  -->
  <div class="stage-compose-v2">
    <StageMainHeader title="⑥ 合成成片" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          type="success"
          size="large"
          :loading="exporting"
          :disabled="!canExport"
          @click="onExportMp4"
        >
          <el-icon><Download /></el-icon>
          <span>📥 导出 MP4</span>
        </el-button>
      </template>
    </StageMainHeader>

    <div v-if="!episodeScriptId" class="empty-state">
      <el-empty description="该剧集还没有剧本，请先在 ③ 剧本 stage 完成。" />
    </div>

    <div v-else class="content-body">
      <!-- 上半双栏：预览 + 导出参数 -->
      <div class="upper-grid">
        <section class="preview-panel">
          <div class="preview-area">
            <video
              v-if="lastExport?.outputPath"
              :key="lastExport.outputPath"
              ref="videoRef"
              class="preview-video"
              :src="toFileUrl(lastExport.outputPath)"
              controls
              @timeupdate="onTimeupdate"
              @loadedmetadata="onVideoLoaded"
            />
            <div v-else class="preview-placeholder">
              <span class="placeholder-icon">🎬</span>
              <span class="placeholder-text">尚未导出 — 点右上角"导出 MP4"生成成片</span>
            </div>
            <span v-if="lastExport" class="preview-info">
              {{ currentSceneLabel }}
            </span>
            <span v-if="lastExport" class="timecode">
              {{ formatTime(currentSec) }} / {{ formatTime(totalSec) }}
            </span>
          </div>
        </section>

        <aside class="export-options-panel">
          <h4 class="opt-title">导出参数</h4>
          <el-form :model="exportForm" label-position="top" size="small">
            <el-form-item label="分辨率">
              <el-radio-group v-model="exportForm.resolution">
                <el-radio-button value="1280x720">720p</el-radio-button>
                <el-radio-button value="1920x1080">1080p</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="烧入字幕">
              <el-switch v-model="exportForm.burnSubtitles" />
            </el-form-item>
          </el-form>
          <div class="opt-meta">
            预估文件大小：~{{ estimatedSizeMb }} MB · 渲染时长 ~{{ estimatedRenderMin }} 分钟
          </div>
        </aside>
      </div>

      <!-- 时间线 panel -->
      <section class="timeline-panel">
        <header class="panel-header">
          <span class="panel-title">时间线</span>
          <span class="kbd-hints">
            <span class="kbd">Space</span> 播放
            <span class="kbd">←/→</span> 跳帧
            <span class="kbd">M</span> 标记
          </span>
        </header>

        <div v-if="loadingTimeline" class="te-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          加载时间线...
        </div>

        <div v-else-if="!timeline || cells.length === 0" class="te-empty">
          <el-empty description="尚无分镜数据" :image-size="60" />
        </div>

        <div v-else class="te-tracks-area">
          <!-- 时间标尺 -->
          <div class="te-row ruler-row">
            <div class="track-label-spacer" />
            <div class="track-content ruler-content">
              <span
                v-for="t in rulerTicks"
                :key="`tick-${t}`"
                class="ruler-tick"
                :style="{ left: `${(t / totalSec) * 100}%` }"
              >{{ t }}s</span>
            </div>
          </div>

          <!-- 视频 V1 -->
          <div class="te-row track-row">
            <div class="track-label">视频 V1</div>
            <div class="track-content video-track">
              <!-- 场景分隔符 + 场景级 ▶ 跳起点（P0） -->
              <div
                v-for="s in sceneDividers"
                :key="`sd-${s.sceneId}`"
                class="scene-divider"
                :style="{ left: `${(s.startSec / totalSec) * 100}%` }"
                :title="`场景 ${s.sceneNumber}：${s.title || ''} · 点 ▶ 跳到此场景`"
              >
                <button
                  class="scene-divider-btn"
                  :title="`跳到场景 ${s.sceneNumber} 起点（${s.startSec.toFixed(1)}s）`"
                  @click.stop="onJumpToScene(s.startSec)"
                >▶</button>
                <span class="scene-divider-label">
                  S{{ s.sceneNumber }}<span v-if="s.title">: {{ s.title }}</span>
                </span>
              </div>

              <!-- 分镜片段（同场景内可拖拽调序，P1） -->
              <template v-for="(cell, i) in cells" :key="`v-${cell.id}`">
                <div
                  class="clip video-clip"
                  :class="[
                    `scene-${cell.sceneNumber}`,
                    cell.hasVideo ? 'filled' : 'missing',
                    {
                      excluded: !cell.includeInFinal,
                      'is-dragging': dragging.from === cell.id,
                      'is-drop-target': dragging.target === cell.id,
                    },
                  ]"
                  :style="cellStyle(cell)"
                  :title="
                    `${cell.includeInFinal ? '✅ 入选' : '⊘ 不入选'} · ${formatGlobalShotId({ episodeNumber: episodeStore.currentEpisode?.episodeNumber, sceneIndex: cell.sceneNumber - 1, shotNumber: cell.shotNumber })} · ${cell.duration}s · 同场景内可拖拽调序`
                  "
                  draggable="true"
                  @dragstart="onCellDragStart($event, cell)"
                  @dragover.prevent="onCellDragOver($event, cell)"
                  @dragleave="onCellDragLeave(cell)"
                  @drop.prevent="onCellDrop($event, cell)"
                  @dragend="onCellDragEnd"
                >
                  <el-checkbox
                    :model-value="cell.includeInFinal"
                    class="clip-include"
                    :disabled="togglingShotIds.has(cell.id)"
                    @click.stop
                    @change="onToggleInclude(cell)"
                  />
                  <span class="clip-name">{{ formatGlobalShotId({ episodeNumber: episodeStore.currentEpisode?.episodeNumber, sceneIndex: cell.sceneNumber - 1, shotNumber: cell.shotNumber }) }} · {{ cell.duration }}s</span>
                </div>
                <div
                  v-if="i < cells.length - 1"
                  class="transition-marker"
                  :style="transitionMarkerStyle(cell)"
                  title="转场（淡入淡出 / 硬切）"
                >⇄</div>
              </template>
            </div>
          </div>

          <!-- 字幕 -->
          <div class="te-row track-row">
            <div class="track-label">字幕</div>
            <div class="track-content">
              <div
                v-for="(seg, i) in subtitleSegs"
                :key="`s-${i}`"
                class="clip subtitle-clip"
                :style="cellStyle(seg)"
                :title="seg.text"
              >
                <span class="clip-name">{{ seg.text.slice(0, 8) }}...</span>
              </div>
            </div>
          </div>

          <!-- 旁白 A1 -->
          <div class="te-row track-row">
            <div class="track-label">旁白 A1 🔊</div>
            <div class="track-content">
              <div
                v-for="(seg, i) in narrationSegs"
                :key="`n-${i}`"
                class="clip audio-clip"
                :style="cellStyle(seg)"
                :title="seg.text"
              >
                <span class="clip-name">{{ seg.text.slice(0, 16) }}</span>
              </div>
            </div>
          </div>

          <!-- 对话 A2 -->
          <div class="te-row track-row">
            <div class="track-label">对话 A2 🔊</div>
            <div class="track-content">
              <div
                v-for="(seg, i) in dialogueSegs"
                :key="`d-${i}`"
                class="clip audio-clip"
                :style="cellStyle(seg)"
                :title="`${seg.speaker}: ${seg.text}`"
              >
                <span class="clip-name">{{ seg.speaker }}: {{ seg.text.slice(0, 8) }}</span>
              </div>
            </div>
          </div>

          <!-- BGM A3（spec §5.3 · per-scene） -->
          <div class="te-row track-row">
            <div class="track-label">BGM A3 🔊</div>
            <div class="track-content">
              <div
                v-for="(seg, i) in bgmSegs"
                :key="`b-${i}`"
                class="clip bgm-clip"
                :style="cellStyle(seg)"
                :title="seg.label"
              >
                <span class="clip-name">{{ seg.label }} · {{ seg.volume }}%</span>
              </div>
            </div>
          </div>

          <!-- playhead -->
          <div
            v-if="lastExport"
            class="playhead"
            :style="{ left: `calc(${trackBodyOffset}px + ${(currentSec / totalSec) * 100}% * (1 - var(--label-pct, 0)))` }"
          />
        </div>

        <!-- 时间线底部统计行（§9.F） -->
        <div class="te-stats">
          <span>🎬 {{ cells.length }} 视频片段（{{ includedCells.length }} 入选）</span>
          <span>⇄ {{ Math.max(0, includedCells.length - 1) }} 个转场（淡入淡出 / 硬切）</span>
          <span>📄 {{ subtitleSegs.length }} 段字幕</span>
          <span>🔊 3 音轨（旁白 / 对话 / BGM）</span>
          <span class="stats-total">入选总时长 {{ includedDurationSec.toFixed(1) }}s</span>
        </div>
      </section>

      <!-- 完成 success-banner（§9.G P1） -->
      <section
        class="finish-banner"
        :class="{ ok: gateAllowed, blocking: !gateAllowed }"
      >
        <el-icon class="banner-icon" :size="24">
          <CircleCheckFilled v-if="gateAllowed" />
          <WarningFilled v-else />
        </el-icon>
        <div class="banner-text">
          <div class="banner-title">
            <template v-if="gateAllowed">
              所有素材就绪 — 可以导出
            </template>
            <template v-else>
              {{ gateBlockMessage }}
            </template>
          </div>
          <div class="banner-meta">
            {{ readyShotCount }}/{{ cells.length }} 分镜出片 ·
            字幕 / 旁白 / 对话 / BGM
            {{ gateAllowed ? '全部混音 · 转场配置完成' : '待 ⑤ 制作完成' }}
          </div>
        </div>
        <el-button
          v-if="gateAllowed && lastExport?.outputPath"
          size="default"
          @click="onPreviewFull"
        >
          <el-icon><VideoPlay /></el-icon>
          ▶ 完整预览
        </el-button>
        <el-button
          v-if="gateAllowed"
          type="success"
          :loading="exporting"
          @click="onExportMp4"
        >
          📥 导出 MP4
        </el-button>
      </section>

      <div v-if="exportResult" class="export-result-panel">
        <el-icon class="success-icon"><CircleCheckFilled /></el-icon>
        <div class="result-text">
          <div><strong>导出成功</strong></div>
          <div class="result-meta">
            时长 {{ formatTime(exportResult.durationSec) }}
            <span v-if="exportResult.srtPath"> · 含字幕</span>
          </div>
        </div>
        <el-button type="primary" size="small" @click="onDownloadExport">
          <el-icon><Download /></el-icon>
          下载 MP4
        </el-button>
      </div>

      <div v-if="exportError" class="error-banner">
        <el-icon><WarningFilled /></el-icon>
        导出失败：{{ exportError }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleCheckFilled,
  Download,
  Loading,
  VideoPlay,
  WarningFilled,
} from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import {
  useEpEpisodeStore,
  useEpProjectStore,
  useEpScriptStore,
} from '@/stores/episode-production'
import { formatGlobalShotId } from '@/utils/storyboard-id'

const props = defineProps<{
  episodeScriptId: string | null
  projectId?: string
}>()

const episodeStore = useEpEpisodeStore()
const scriptStore = useEpScriptStore()
const projectStore = useEpProjectStore()

const loadingTimeline = ref(false)
const timeline = ref<any>(null)
const exporting = ref(false)
const exportResult = ref<any>(null)
const exportError = ref<string | null>(null)
const lastExport = ref<{
  outputPath: string
  durationSec: number
  srtPath?: string
} | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const currentSec = ref(0)
const gateAllowed = ref(false)
const gateBlockMessage = ref('')

const exportForm = ref({
  resolution: '1920x1080',
  burnSubtitles: true,
})

/** 标记当前正在切换"入选"的 storyboardId（防双击 / 排队请求） */
const togglingShotIds = ref<Set<string>>(new Set())

const trackBodyOffset = 90 // 跟 .track-label 宽度一致

const cells = computed<Array<any>>(() => {
  if (!timeline.value) return []
  // buildTimeline 返回 scenes[].shots 嵌套；flatten 成单层 + 注入 sceneNumber + 字段映射
  const out: any[] = []
  for (const scene of timeline.value.scenes ?? []) {
    for (const sh of scene.shots ?? []) {
      out.push({
        id: sh.storyboardId,
        sceneScriptId: sh.sceneId,
        sceneNumber: scene.sceneNumber,
        shotNumber: sh.shotNumber,
        startSec: sh.startSec,
        endSec: sh.endSec,
        duration: sh.durationSec,
        videoPath: sh.videoPath,
        hasVideo: !!sh.videoPath,
        transition: sh.transition,
        includeInFinal: sh.includeInFinal !== false,
      })
    }
  }
  return out
})

const includedCells = computed(() => cells.value.filter((c) => c.includeInFinal))

const includedDurationSec = computed(() =>
  includedCells.value.reduce((acc, c) => acc + (c.duration ?? 0), 0),
)

/** P0：场景分隔符（每场起点 + ▶ 按钮） */
const sceneDividers = computed(() => {
  if (!timeline.value) return []
  return (timeline.value.scenes ?? []).map((s: any) => ({
    sceneId: s.sceneId,
    sceneNumber: s.sceneNumber,
    title: s.sceneTitle ?? s.title ?? '',
    startSec: s.startSec ?? 0,
  }))
})

function onJumpToScene(startSec: number) {
  const v = videoRef.value
  if (!v || !lastExport.value) {
    ElMessage.info('请先导出视频后再跳转预览')
    return
  }
  v.currentTime = Math.max(0, Math.min(v.duration || 0, startSec))
  v.play?.().catch(() => {})
}

// ===== P1：分镜拖拽调序（同场景内） =====
const dragging = reactive<{ from: string | null; target: string | null }>({
  from: null,
  target: null,
})
const reordering = ref(false)

function onCellDragStart(e: DragEvent, cell: any) {
  dragging.from = cell.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', cell.id)
  }
}

function onCellDragOver(e: DragEvent, cell: any) {
  if (!dragging.from || dragging.from === cell.id) return
  // 仅允许同场景内
  const fromCell = cells.value.find((c) => c.id === dragging.from)
  if (!fromCell || fromCell.sceneScriptId !== cell.sceneScriptId) {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    return
  }
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragging.target = cell.id
}

function onCellDragLeave(cell: any) {
  if (dragging.target === cell.id) dragging.target = null
}

async function onCellDrop(_e: DragEvent, targetCell: any) {
  const fromId = dragging.from
  dragging.target = null
  dragging.from = null
  if (!fromId || fromId === targetCell.id) return
  const fromCell = cells.value.find((c) => c.id === fromId)
  if (!fromCell) return
  if (fromCell.sceneScriptId !== targetCell.sceneScriptId) {
    ElMessage.warning('暂不支持跨场景拖拽（语义复杂；先取消勾选 / 改场景顺序）')
    return
  }
  if (reordering.value) return

  // 计算同场景内新顺序：把 fromId 抽出来插到 targetId 位置
  const sceneCells = cells.value
    .filter((c) => c.sceneScriptId === fromCell.sceneScriptId)
    .map((c) => c.id)
  const fromIdx = sceneCells.indexOf(fromId)
  const toIdx = sceneCells.indexOf(targetCell.id)
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
  const next = sceneCells.slice()
  next.splice(fromIdx, 1)
  next.splice(toIdx, 0, fromId)

  reordering.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.reorderStoryboards) {
      ElMessage.error('reorderStoryboards IPC 未暴露')
      return
    }
    const resp = await api.reorderStoryboards(fromCell.sceneScriptId, next)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '调序失败')
      return
    }
    ElMessage.success('已调序')
    await loadTimeline()
  } catch (e: any) {
    ElMessage.error('调序失败：' + (e?.message ?? '未知错误'))
  } finally {
    reordering.value = false
  }
}

function onCellDragEnd() {
  dragging.from = null
  dragging.target = null
}

const totalSec = computed(() => {
  return timeline.value?.totalDurationSec ?? cells.value.reduce((acc, c) => acc + (c.duration ?? 0), 0)
})

const rulerTicks = computed(() => {
  const interval = totalSec.value <= 30 ? 5 : totalSec.value <= 120 ? 10 : 30
  const ticks: number[] = []
  for (let t = 0; t <= totalSec.value; t += interval) ticks.push(t)
  return ticks
})

const readyShotCount = computed(() => cells.value.filter((c: any) => c.hasVideo).length)

// 旁白 / 对话 / 字幕段（按场景遍历 scene.narration / dialogues + storyboard.duration 累加 startSec）
const narrationSegs = computed(() => collectNarrationSegs())
const dialogueSegs = computed(() => collectDialogueSegs())
const subtitleSegs = computed(() => collectSubtitleSegs())
const bgmSegs = computed(() => collectBgmSegs())

function collectNarrationSegs(): any[] {
  const segs: any[] = []
  let acc = 0
  for (const cell of cells.value) {
    const scene = scriptStore.scenes?.find((s) => s.id === cell.sceneScriptId)
    if (scene?.narration && cell.shotNumber === 1) {
      segs.push({ startSec: acc, duration: cell.duration, text: scene.narration })
    }
    acc += cell.duration ?? 0
  }
  return segs
}

function collectDialogueSegs(): any[] {
  const segs: any[] = []
  let acc = 0
  for (const cell of cells.value) {
    const scene = scriptStore.scenes?.find((s) => s.id === cell.sceneScriptId)
    if (scene && Array.isArray(scene.dialogues) && cell.shotNumber === 1) {
      const each = (cell.duration ?? 0) / Math.max(1, scene.dialogues.length)
      scene.dialogues.forEach((d: any, i: number) => {
        segs.push({
          startSec: acc + i * each,
          duration: each,
          speaker: d.characterName ?? '?',
          text: d.text ?? '',
        })
      })
    }
    acc += cell.duration ?? 0
  }
  return segs
}

function collectSubtitleSegs(): any[] {
  const all = [...narrationSegs.value, ...dialogueSegs.value]
  return all
    .map((s) => ({ ...s, text: s.text ?? s.speaker ?? '' }))
    .sort((a, b) => a.startSec - b.startSec)
}

/*
 * FU8-H4 BGM 段落真实数据（spec §5.3 / FU5 §11 L5 决策）：
 *   旧实现 label/volume 全写死。改成：
 *   - label：从 scriptStore.scenes 找对应 scene，拼"BGM · {location}（{mood}）"
 *   - volume：用项目配置 audio.bgmVolume（无则保留 30 作为默认，并在 label 标注"默认"）
 *   - 仍按 sceneScriptId 切段（每场一段 BGM 是合成层的稳定假设）。
 */
function collectBgmSegs(): any[] {
  const projectVolume: number | undefined =
    (projectStore.currentProject?.config as any)?.audio?.bgmVolume
  const defaultVol = projectVolume ?? 30
  const usingDefault = projectVolume === undefined

  const segs: any[] = []
  let acc = 0
  let curSceneId: string | null = null
  let curStart = 0
  let curDur = 0

  function pushSeg(): void {
    if (curSceneId === null) return
    const scene: any = scriptStore.scenes?.find((s: any) => s.id === curSceneId)
    const loc = scene?.location?.trim() || `场景 ${segs.length + 1}`
    const mood = scene?.mood?.trim()
    const label = mood
      ? `BGM · ${loc}（${mood}）${usingDefault ? ' · 默认音量' : ''}`
      : `BGM · ${loc}${usingDefault ? ' · 默认音量' : ''}`
    segs.push({
      startSec: curStart,
      duration: curDur,
      label,
      volume: defaultVol,
      sceneScriptId: curSceneId,
    })
  }

  for (const cell of cells.value) {
    if (cell.sceneScriptId !== curSceneId) {
      pushSeg()
      curSceneId = cell.sceneScriptId
      curStart = acc
      curDur = cell.duration ?? 0
    } else {
      curDur += cell.duration ?? 0
    }
    acc += cell.duration ?? 0
  }
  pushSeg()
  return segs
}

const canExport = computed(() => gateAllowed.value && cells.value.length > 0)

const headerSubtitle = computed(() => {
  if (cells.value.length === 0) return '加载中...'
  return `${cells.value.length} 个分镜 · 已出片 ${readyShotCount.value}/${cells.value.length} · 累计 ${totalSec.value.toFixed(1)}s · 即将合成 ${exportForm.value.resolution.split('x')[1]}p MP4`
})

const currentSceneLabel = computed(() => {
  if (!cells.value || cells.value.length === 0) return ''
  // 按 currentSec 找当前播放到哪个 cell
  let acc = 0
  for (const cell of cells.value) {
    if (currentSec.value < acc + (cell.duration ?? 0)) {
      const scene = scriptStore.scenes?.find((s) => s.id === cell.sceneScriptId)
      return `分镜 ${cell.sceneNumber}.${cell.shotNumber} · ${scene?.location ?? '?'} · ${scene?.timeOfDay ?? ''}`
    }
    acc += cell.duration ?? 0
  }
  return ''
})

const estimatedSizeMb = computed(() => {
  // 1080p 大约 0.7 MB/s（H.264 ~6Mbps）；720p 0.4 MB/s
  const bps = exportForm.value.resolution === '1920x1080' ? 0.7 : 0.4
  return Math.max(1, Math.round(totalSec.value * bps))
})

const estimatedRenderMin = computed(() => {
  // 视频拼接 ~ 2x 实时
  return Math.max(1, Math.ceil((totalSec.value * 2) / 60))
})

function cellStyle(cell: any): Record<string, string> {
  const startPct = totalSec.value === 0 ? 0 : (cell.startSec / totalSec.value) * 100
  const widthPct = totalSec.value === 0 ? 0 : ((cell.duration ?? 0) / totalSec.value) * 100
  return {
    left: `${startPct}%`,
    width: `${widthPct}%`,
  }
}

function transitionMarkerStyle(cell: any): Record<string, string> {
  // 转场放在 cell 末尾位置
  const endPct =
    totalSec.value === 0
      ? 0
      : ((cell.startSec + (cell.duration ?? 0)) / totalSec.value) * 100
  return {
    left: `${endPct}%`,
  }
}

function formatTime(sec: number): string {
  const total = Math.max(0, Math.round(sec * 100) / 100)
  const m = Math.floor(total / 60)
  const s = (total - m * 60).toFixed(2)
  return `${String(m).padStart(2, '0')}:${s.padStart(5, '0')}`
}

function toFileUrl(p: string): string {
  if (!p) return ''
  if (p.startsWith('/api/') || p.startsWith('http')) return p
  // Web 端：通过 assets-router 访问；PC 端：file:// 协议
  return `/api/assets/file?path=${encodeURIComponent(p)}`
}

function onTimeupdate(): void {
  if (videoRef.value) currentSec.value = videoRef.value.currentTime ?? 0
}

function onVideoLoaded(): void {
  if (videoRef.value) currentSec.value = 0
}

async function loadTimeline(): Promise<void> {
  if (!props.episodeScriptId) return
  loadingTimeline.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.buildTimeline?.(props.episodeScriptId)
    if (resp?.success) {
      timeline.value = resp.data
    } else {
      timeline.value = null
    }
  } finally {
    loadingTimeline.value = false
  }
}

async function refreshGate(): Promise<void> {
  const ep = episodeStore.currentEpisode
  if (!ep) return
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.canEnterStage) return
  const resp = await api.canEnterStage(ep.id, ep.status, 'completed')
  if (resp?.success) {
    gateAllowed.value = !!resp.data.allowed
    if (!gateAllowed.value) {
      const gaps = (resp.data.gaps ?? []) as any[]
      gateBlockMessage.value = gaps.length > 0 ? gaps[0].message : '前置条件未满足'
    } else {
      gateBlockMessage.value = ''
    }
  }
}

async function onExportMp4(): Promise<void> {
  if (!props.episodeScriptId) return
  exporting.value = true
  exportError.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const opts = {
      width: parseInt(exportForm.value.resolution.split('x')[0], 10),
      height: parseInt(exportForm.value.resolution.split('x')[1], 10),
      burnSubtitles: exportForm.value.burnSubtitles,
      projectId: props.projectId,
    }
    // outputPath 留空 → 后端 resolveOutputPath 自动落到 user data 默认目录
    const resp = await api.exportMp4(props.episodeScriptId, '', opts)
    if (!resp?.success) {
      exportError.value = resp?.error || '导出失败'
      ElMessage.error(exportError.value)
      return
    }
    exportResult.value = resp.data
    lastExport.value = {
      outputPath: resp.data.outputPath,
      durationSec: resp.data.durationSec,
      srtPath: resp.data.srtPath,
    }
    ElMessage.success('已导出')
    await refreshGate()
  } catch (e: any) {
    exportError.value = e?.message ?? '导出失败'
    ElMessage.error(exportError.value)
  } finally {
    exporting.value = false
  }
}

function onPreviewFull(): void {
  videoRef.value?.play?.().catch(() => {})
}

watch(() => props.episodeScriptId, () => void loadTimeline(), { immediate: true })
watch(() => episodeStore.currentEpisode?.id, () => void refreshGate(), { immediate: true })

onMounted(() => {
  void refreshGate()
})

// ===== ⑥ 时间线"入选" toggle =====
async function onToggleInclude(cell: { id: string; includeInFinal: boolean }) {
  if (togglingShotIds.value.has(cell.id)) return
  const next = !cell.includeInFinal
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.updateStoryboard) {
    ElMessage.error('updateStoryboard IPC 未暴露')
    return
  }
  togglingShotIds.value = new Set([...togglingShotIds.value, cell.id])
  try {
    const resp = await api.updateStoryboard(cell.id, { includeInFinal: next })
    if (!resp?.success) {
      ElMessage.error(resp?.error || '切换失败')
      return
    }
    await loadTimeline()
  } catch (e: any) {
    ElMessage.error('切换失败：' + (e?.message ?? '未知错误'))
  } finally {
    const s = new Set(togglingShotIds.value)
    s.delete(cell.id)
    togglingShotIds.value = s
  }
}

// ===== ⑥ 下载已合成视频 =====
async function onDownloadExport() {
  if (!lastExport.value?.outputPath) return
  const url = toFileUrl(lastExport.value.outputPath)
  const fileName = lastExport.value.outputPath.split('/').pop() || 'episode.mp4'
  const isWeb =
    (window as any).__APP_PLATFORM__ === 'web' ||
    !(window as any).electronAPI?.file?.saveFile

  if (!isWeb) {
    try {
      const saveResult = await (window as any).electronAPI.file.saveFile({
        defaultPath: fileName,
        filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
      })
      if (!saveResult?.success || !saveResult.filePath) return
      const abs = url.startsWith('local-file:///')
        ? url.replace('local-file:///', '')
        : lastExport.value.outputPath
      const copyResult = await (window as any).electronAPI.file.copyFile(
        abs,
        saveResult.filePath,
      )
      if (copyResult?.success) ElMessage.success('已保存')
      else ElMessage.error(copyResult?.error || '保存失败')
    } catch (e: any) {
      ElMessage.error('下载失败：' + (e?.message ?? '未知错误'))
    }
    return
  }

  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (e: any) {
    ElMessage.error('下载失败：' + (e?.message ?? '未知错误'))
  }
}
</script>

<style scoped lang="scss">
.stage-compose-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── 上半双栏 ── */
.upper-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 14px;
}

.preview-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
}

.preview-area {
  position: relative;
  aspect-ratio: 16 / 9;
  /*
   * FU5-A6 G1：视频预览区视觉规范上保持深色（无论亮/暗主题），
   * 但 placeholder 文字使用 var(--el-color-white) 而非写死 #fff，
   * 让 element-plus 主题切换时背景明暗对比仍合理。
   */
  background: var(--el-color-black, #000);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--el-color-black, #000);
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  /* 视频区固定深色背景 → 文字白色（不需主题变量切换） */
  color: var(--el-color-white, #fff);
  opacity: 0.7;
}

.placeholder-icon {
  font-size: 60px;
}

.placeholder-text {
  font-size: 13px;
}

.preview-info {
  position: absolute;
  top: 10px;
  left: 12px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 11px;
}

.timecode {
  position: absolute;
  bottom: 10px;
  left: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 3px 10px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}

.export-options-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.opt-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.opt-meta {
  margin-top: 8px;
  padding: 6px 10px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

/* ── 时间线 ── */
.timeline-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.kbd-hints {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.kbd {
  display: inline-block;
  padding: 1px 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
  color: var(--el-text-color-primary);
}

.te-loading,
.te-empty {
  text-align: center;
  padding: 24px;
  color: var(--el-text-color-placeholder);
}

.te-tracks-area {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.te-row {
  display: flex;
  align-items: center;
}

.track-label-spacer,
.track-label {
  width: 90px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding-right: 6px;
}

.track-content {
  flex: 1;
  position: relative;
  height: 36px;
  background: var(--el-fill-color-lighter);
  border-radius: 3px;
}

.ruler-row {
  height: 18px;
}

.ruler-content {
  height: 18px !important;
  background: transparent;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ruler-tick {
  position: absolute;
  top: 0;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  border-left: 1px solid var(--el-border-color);
  height: 100%;
  padding-left: 3px;
}

.clip {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #fff;
  cursor: pointer;
  overflow: hidden;
  user-select: none;
}

.clip-name {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  padding: 0 4px;
}

.video-clip {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
}

.video-clip.scene-2 {
  background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-dark-2));
}

.video-clip.scene-3 {
  background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-dark-2));
}

.video-clip.missing {
  background: var(--el-fill-color);
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color);
}

.video-clip.excluded {
  filter: grayscale(80%);
  opacity: 0.45;
  border-style: dashed;
}

.video-clip.is-dragging {
  opacity: 0.5;
}

.video-clip.is-drop-target {
  outline: 2px dashed var(--el-color-primary);
  outline-offset: 1px;
}

/* 场景分隔符（P0） */
.scene-divider {
  position: absolute;
  top: -20px;
  bottom: -2px;
  border-left: 2px dashed var(--el-color-warning);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  z-index: 1;
  pointer-events: none;
}

.scene-divider-btn {
  pointer-events: auto;
  margin-left: 2px;
  padding: 0;
  width: 18px;
  height: 18px;
  font-size: 10px;
  background: var(--el-color-primary);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
}

.scene-divider-btn:hover {
  transform: scale(1.15);
}

.scene-divider-label {
  pointer-events: auto;
  margin-left: 4px;
  margin-top: 1px;
  padding: 0 4px;
  font-size: 10px;
  color: var(--el-color-warning);
  background: var(--el-bg-color);
  border-radius: 2px;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-include {
  position: absolute;
  top: 2px;
  left: 4px;
  z-index: 2;
}

.clip-include :deep(.el-checkbox__inner) {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

.clip-include :deep(.el-checkbox__inner::after) {
  height: 7px;
  left: 4px;
  top: 1px;
}

.video-clip .clip-name {
  padding-left: 22px;
}

.subtitle-clip {
  background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-dark-2));
}

.audio-clip {
  background: linear-gradient(135deg, var(--el-text-color-secondary), var(--el-text-color-regular));
}

.bgm-clip {
  background: linear-gradient(135deg, var(--el-fill-color-darker), var(--el-fill-color-dark));
  color: var(--el-text-color-secondary);
}

.transition-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 12px;
  transform: translateX(-6px);
  /* FU5-A6 G1：用主题色 light-5（亮/暗主题各自语义色） */
  background: var(--el-color-danger-light-5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--el-color-danger);
  pointer-events: none;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--el-color-danger);
  pointer-events: none;
}

.playhead::before {
  content: '';
  position: absolute;
  top: -6px;
  left: -4px;
  width: 10px;
  height: 10px;
  background: var(--el-color-danger);
  border-radius: 50%;
}

.te-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stats-total {
  margin-left: auto;
}

/* ── 完成 banner ── */
.finish-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--el-color-info-light-9);
  border-left: 3px solid var(--el-color-info);
  border-radius: 0 4px 4px 0;
}

.finish-banner.ok {
  background: var(--el-color-success-light-9);
  border-left-color: var(--el-color-success);
}

.finish-banner.blocking {
  background: var(--el-color-warning-light-9);
  border-left-color: var(--el-color-warning);
}

.banner-icon {
  flex-shrink: 0;
  color: var(--el-color-info);
}

.finish-banner.ok .banner-icon {
  color: var(--el-color-success);
}

.finish-banner.blocking .banner-icon {
  color: var(--el-color-warning);
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.banner-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.export-result-panel {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--el-color-success-light-9);
  border-left: 3px solid var(--el-color-success);
  border-radius: 0 4px 4px 0;
}

.export-result-panel .success-icon {
  color: var(--el-color-success);
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.result-text {
  flex: 1;
  min-width: 0;
}

.result-path {
  font-family: monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  margin-top: 4px;
}

.result-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--el-color-danger-light-9);
  border-left: 3px solid var(--el-color-danger);
  border-radius: 0 4px 4px 0;
  color: var(--el-color-danger);
  font-size: 13px;
}

@media (max-width: 1024px) {
  .upper-grid {
    grid-template-columns: 1fr;
  }
}
</style>
