<template>
  <!--
    TimelineEditor · 多轨时间线（P6-T6 · spec §2.1 / §5.3）

    显示分镜片段 + 旁白 + 对话 + 字幕的时间轴预览（read-only V1）。
    用户能直观看到整剧的时间结构、缺片段的位置、字幕分布。

    完整编辑能力（拖拽剪辑、转场调整、音频混合）留 P6 真 follow-up。
  -->
  <div class="timeline-editor">
    <div class="te-header">
      <h4>多轨时间线（spec §2.1 / §5.3）</h4>
      <div class="te-meta">
        <el-tag size="small" type="info">总时长 {{ totalDurationLabel }}</el-tag>
        <el-tag size="small" :type="missingCount === 0 ? 'success' : 'warning'">
          {{ missingCount === 0 ? '全部分镜已出片' : `缺 ${missingCount} 段` }}
        </el-tag>
      </div>
    </div>

    <div v-if="loading" class="te-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      加载时间线...
    </div>

    <div v-else-if="errorMessage" class="te-error">
      <el-icon><Warning /></el-icon>
      {{ errorMessage }}
    </div>

    <div v-else-if="!timeline || cells.length === 0" class="te-empty">
      <el-empty description="尚无分镜数据，请先在 ④ 分镜 stage 生成" :image-size="60" />
    </div>

    <div v-else class="te-tracks">
      <!-- 时间标尺 -->
      <div class="te-ruler">
        <span
          v-for="t in rulerTicks"
          :key="`tick-${t}`"
          class="ruler-tick"
          :style="{ left: `${(t / totalSec) * 100}%` }"
        >
          {{ t }}s
        </span>
      </div>

      <!-- 视频轨（分镜片段） -->
      <div class="te-track video-track">
        <div class="track-label">
          <el-icon><VideoCamera /></el-icon>
          <span>视频</span>
        </div>
        <div class="track-body">
          <div
            v-for="cell in cells"
            :key="`v-${cell.id}`"
            class="cell video-cell"
            :class="{ filled: cell.hasVideo, missing: !cell.hasVideo }"
            :style="cellStyle(cell)"
            :title="`场景 ${cell.sceneNumber} 镜 ${cell.shotNumber} · ${cell.duration}s · ${cell.hasVideo ? '已出片' : '未出片'}`"
          >
            <span class="cell-label">{{ cell.sceneNumber }}.{{ cell.shotNumber }}</span>
          </div>
        </div>
      </div>

      <!-- 音频轨（旁白） -->
      <div class="te-track audio-track">
        <div class="track-label">
          <el-icon><Microphone /></el-icon>
          <span>旁白</span>
        </div>
        <div class="track-body">
          <div
            v-for="(seg, i) in narrationSegs"
            :key="`n-${i}`"
            class="cell narration-cell"
            :style="cellStyle(seg)"
            :title="seg.text"
          >
            <span class="cell-label">{{ seg.text.slice(0, 20) }}...</span>
          </div>
        </div>
      </div>

      <!-- 音频轨（对话） -->
      <div class="te-track audio-track">
        <div class="track-label">
          <el-icon><ChatDotRound /></el-icon>
          <span>对话</span>
        </div>
        <div class="track-body">
          <div
            v-for="(seg, i) in dialogueSegs"
            :key="`d-${i}`"
            class="cell dialogue-cell"
            :style="cellStyle(seg)"
            :title="`${seg.speaker}: ${seg.text}`"
          >
            <span class="cell-label">{{ seg.speaker }}</span>
          </div>
        </div>
      </div>

      <!-- 字幕轨（read-only） -->
      <div class="te-track subtitle-track">
        <div class="track-label">
          <el-icon><Document /></el-icon>
          <span>字幕</span>
        </div>
        <div class="track-body">
          <div
            v-for="(seg, i) in subtitleSegs"
            :key="`s-${i}`"
            class="cell subtitle-cell"
            :style="cellStyle(seg)"
          >
            <span class="cell-label">{{ seg.text.slice(0, 10) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TimelineEditor (P6-T6 V1 read-only)
 *
 * Props：
 *   - episodeScriptId：当前剧集的 episode_script.id
 *
 * 数据来源：
 *   - 视频轨：ep:build-timeline IPC（P6-T1）
 *   - 旁白/对话/字幕轨：scriptStore.scenes 字段计算（按 storyboard duration 累加 startSec）
 *
 * 编辑能力（拖拽剪辑、转场参数、音频混合）= P6 真 follow-up，本 V1 仅展示。
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  ChatDotRound,
  Document,
  Loading,
  Microphone,
  VideoCamera,
  Warning,
} from '@element-plus/icons-vue'
import { useEpScriptStore } from '@/stores/episode-production'

interface TimelineShot {
  storyboardId: string
  shotNumber: number
  videoPath: string | null
  durationSec: number
}

interface TimelineScene {
  sceneScriptId: string
  shots: TimelineShot[]
}

interface BuildTimelineResult {
  episodeScriptId: string
  scenes: TimelineScene[]
  totalDurationSec: number
  missingVideoStoryboardIds: string[]
}

interface VideoCell {
  id: string
  startSec: number
  duration: number
  sceneNumber: number
  shotNumber: number
  hasVideo: boolean
}

interface AudioSeg {
  startSec: number
  duration: number
  text: string
  speaker?: string
}

const props = defineProps<{ episodeScriptId: string | null }>()

const scriptStore = useEpScriptStore()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const timeline = ref<BuildTimelineResult | null>(null)

const totalSec = computed(() => timeline.value?.totalDurationSec ?? 0)
const totalDurationLabel = computed(() => {
  const s = totalSec.value
  if (s === 0) return '0s'
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(0)
  return `${m}m ${sec}s`
})
const missingCount = computed(
  () => timeline.value?.missingVideoStoryboardIds.length ?? 0,
)

const cells = computed<VideoCell[]>(() => {
  if (!timeline.value) return []
  const list: VideoCell[] = []
  let cursor = 0
  for (let sIdx = 0; sIdx < timeline.value.scenes.length; sIdx++) {
    const scene = timeline.value.scenes[sIdx]
    for (const shot of scene.shots) {
      list.push({
        id: shot.storyboardId,
        startSec: cursor,
        duration: shot.durationSec,
        sceneNumber: sIdx + 1,
        shotNumber: shot.shotNumber,
        hasVideo: !!shot.videoPath,
      })
      cursor += shot.durationSec
    }
  }
  return list
})

const narrationSegs = computed<AudioSeg[]>(() => {
  // scriptStore.scenes[i].narration 跨整个 scene 的所有 storyboards 时长
  if (!timeline.value) return []
  const out: AudioSeg[] = []
  let cursor = 0
  for (let sIdx = 0; sIdx < timeline.value.scenes.length; sIdx++) {
    const tlScene = timeline.value.scenes[sIdx]
    const sceneSec = tlScene.shots.reduce((sum, sh) => sum + sh.durationSec, 0)
    const scriptScene = scriptStore.scenes[sIdx] as any
    const narration = scriptScene?.narration?.trim?.()
    if (narration) {
      out.push({ startSec: cursor, duration: sceneSec, text: narration })
    }
    cursor += sceneSec
  }
  return out
})

const dialogueSegs = computed<AudioSeg[]>(() => {
  // 简化：每个 scene 的 dialogues 平均分配到该 scene 时长内
  if (!timeline.value) return []
  const out: AudioSeg[] = []
  let cursor = 0
  for (let sIdx = 0; sIdx < timeline.value.scenes.length; sIdx++) {
    const tlScene = timeline.value.scenes[sIdx]
    const sceneSec = tlScene.shots.reduce((sum, sh) => sum + sh.durationSec, 0)
    const scriptScene = scriptStore.scenes[sIdx] as any
    const dlgs = (scriptScene?.dialogues ?? []) as any[]
    if (dlgs.length > 0) {
      const each = sceneSec / dlgs.length
      for (let i = 0; i < dlgs.length; i++) {
        out.push({
          startSec: cursor + i * each,
          duration: each,
          text: dlgs[i]?.text ?? '',
          speaker: dlgs[i]?.characterName ?? '?',
        })
      }
    }
    cursor += sceneSec
  }
  return out
})

const subtitleSegs = computed<AudioSeg[]>(() => {
  // 字幕 = 旁白 + 对话（合并）；spec §5.3 SubtitleService 把两者合并
  return [...narrationSegs.value, ...dialogueSegs.value].sort(
    (a, b) => a.startSec - b.startSec,
  )
})

const rulerTicks = computed<number[]>(() => {
  const total = totalSec.value
  if (total === 0) return []
  // 等距 5 个刻度
  const step = total / 4
  return [0, step, step * 2, step * 3, total].map((t) =>
    Math.round(t * 10) / 10,
  )
})

function cellStyle(cell: { startSec: number; duration: number }) {
  const total = totalSec.value
  if (total === 0) return {}
  return {
    left: `${(cell.startSec / total) * 100}%`,
    width: `${(cell.duration / total) * 100}%`,
  }
}

async function loadTimeline(): Promise<void> {
  if (!props.episodeScriptId) return
  loading.value = true
  errorMessage.value = null
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.buildTimeline) throw new Error('IPC buildTimeline 未暴露')
    const resp = await api.buildTimeline(props.episodeScriptId)
    if (!resp?.success) throw new Error(resp?.error || '加载时间线失败')
    timeline.value = resp.data as BuildTimelineResult
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.episodeScriptId, () => loadTimeline())
onMounted(loadTimeline)

defineExpose({ reload: loadTimeline })
</script>

<style scoped lang="scss">
.timeline-editor {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.te-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .te-meta {
    display: flex;
    gap: 6px;
  }
}

.te-loading,
.te-error,
.te-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: var(--el-text-color-secondary);
  gap: 6px;
  font-size: 12px;
}

.te-tracks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.te-ruler {
  position: relative;
  height: 16px;
  margin-left: 80px;
  border-bottom: 1px dashed var(--el-border-color);

  .ruler-tick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--el-text-color-secondary);
  }
}

.te-track {
  display: flex;
  align-items: center;
  gap: 6px;

  .track-label {
    width: 80px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .track-body {
    flex: 1;
    height: 28px;
    position: relative;
    background: var(--el-fill-color-lighter);
    border-radius: 3px;
    overflow: hidden;
  }
}

.cell {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  overflow: hidden;
  cursor: default;
  transition: transform 0.1s;

  &:hover {
    transform: scaleY(1.05);
    z-index: 2;
  }

  .cell-label {
    padding: 0 4px;
    color: #fff;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
}

.video-cell.filled {
  background: var(--el-color-success);
}

.video-cell.missing {
  background: repeating-linear-gradient(
    45deg,
    var(--el-color-danger-light-7),
    var(--el-color-danger-light-7) 4px,
    var(--el-color-danger-light-9) 4px,
    var(--el-color-danger-light-9) 8px
  );
  border: 1px solid var(--el-color-danger);

  .cell-label {
    color: var(--el-color-danger);
  }
}

.narration-cell {
  background: var(--el-color-warning);
}

.dialogue-cell {
  background: var(--el-color-primary);
}

.subtitle-cell {
  background: var(--el-color-info);
  font-size: 9px;
}
</style>
