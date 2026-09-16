<template>
  <div class="stage-storyboard">
    <!-- 工具条 -->
    <div class="sb-toolbar">
      <div class="tb-left">
        <span class="tb-title">分镜</span>
        <el-tag v-if="totalStoryboards" size="small" round effect="plain" type="info">共 {{ totalStoryboards }} 镜</el-tag>
        <el-tag v-if="segments.length" size="small" round effect="plain" type="success">{{ segments.length }} 个片段</el-tag>
      </div>
      <div class="tb-right">
        <span class="tb-label">时长预算</span>
        <el-input-number
          v-model="budgetSec"
          :min="5"
          :max="30"
          :step="1"
          size="small"
          controls-position="right"
          class="budget-input"
          @change="onBudgetChange"
        />
        <span class="tb-unit">s</span>
        <span class="tb-label">视频模型</span>
        <el-select v-model="videoProviderId" size="small" placeholder="视频服务" class="provider-select" @change="onVideoProviderChange">
          <el-option v-for="p in videoProviders" :key="p.providerConfigId" :label="p.name" :value="p.providerConfigId" :disabled="!p.ready" />
        </el-select>
        <el-select v-model="videoModelId" size="small" placeholder="模型" class="model-select">
          <el-option v-for="m in videoModels" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
        <el-button text size="small" :loading="recomputing" :disabled="totalStoryboards === 0" @click="onRecompute">
          <el-icon><Scissor /></el-icon>
          重新分段
        </el-button>
        <el-button text size="small" type="primary" :loading="generatingAll" :disabled="pendingSegments.length === 0" @click="onGenerateAll">
          <el-icon><VideoCamera /></el-icon>
          {{ generatingAll ? `生成中 ${genAllDone}/${genAllTotal}` : '全部生成' }}
        </el-button>
        <el-button text size="small" :disabled="scenes.length === 0" :loading="generating" @click="onGenerateAllStoryboards">
          <el-icon><MagicStick /></el-icon>
          批量生成分镜
        </el-button>
      </div>
    </div>

    <!-- 主体：左场次导航 + 中央分镜组（原样式；片段功能内嵌为片段操作条） -->
    <div class="sb-body">
      <aside class="sb-left">
        <SceneNav :scenes="scenes" :selected-scene-id="null" @select="onSelectScene" />
      </aside>
      <main class="sb-center">
        <!-- 空态：无场景 -->
        <div v-if="scenes.length === 0" class="no-scenes">
          <el-empty description="请先在「剧本」页拆分场景" />
        </div>

        <template v-else>
          <!-- 兼容存量：有分镜但尚未分段 → 引导重新分段 -->
          <el-alert
            v-if="segmentsLoaded && segments.length === 0 && totalStoryboards > 0"
            class="seg-hint"
            type="warning"
            :closable="false"
            show-icon
          >
            <template #title>
              该剧集尚未分段（视频片段制：一次生成多镜一段的视频）。点击右上角「重新分段」按场景 + 时长预算自动分段。
              <el-button size="small" type="warning" plain :loading="recomputing" @click="onRecompute">立即分段</el-button>
            </template>
          </el-alert>

          <!-- 按场次分组（原样式） -->
          <div class="sb-scenes">
            <div v-for="sc in scenes" :key="sc.id" class="sb-scene-group" :data-scene="sc.id">
              <div class="group-head" @click="onEnterScene(sc)">
                <span class="group-title">场次 {{ sc.sceneNumber }}：{{ sc.location }}</span>
                <span class="group-actions">
                  <span v-if="storyboards[sc.id]?.length" class="done-mark">制作中</span>
                  <span class="enter-link">进入制作 →</span>
                </span>
              </div>

              <!-- 已分段：一片段一格（原 tile 样式；一个片段多个分镜 → 一段视频，不再逐镜展示） -->
              <div v-if="segmentsByScene.get(sc.id)?.length" class="group-shots">
                <div
                  v-for="seg in segmentsByScene.get(sc.id)"
                  :key="seg.segmentId"
                  class="shot-tile seg-tile"
                  :data-segment="seg.segmentId"
                  :data-status="seg.status"
                >
                  <div class="tile-preview" @click="onEnterScene(sc)">
                    <video v-if="seg.videoPath" :src="toVideoUrl(seg.videoPath)" class="tile-img" muted preload="metadata" />
                    <el-image v-else-if="segFrameUrl(seg)" :src="segFrameUrl(seg)" fit="cover" class="tile-img" />
                    <div v-else class="tile-empty"><el-icon :size="18"><Picture /></el-icon></div>
                    <span class="tile-status" :class="`st-${seg.status}`">{{ segStatusLabel(seg.status) }}</span>
                  </div>
                  <div class="tile-meta" @click="onEnterScene(sc)">
                    <span class="tile-no">片段 {{ seg.seq }}</span>
                    <span class="tile-dur">{{ seg.shotCount }} 镜 · {{ durationLabel(Math.round(seg.duration ?? seg.estDuration)) }}</span>
                  </div>
                  <div class="tile-actions">
                    <el-button v-if="seg.videoPath" size="small" text type="success" @click="onPlay(seg)">
                      <el-icon><VideoPlay /></el-icon>
                      播放
                    </el-button>
                    <el-button
                      v-if="seg.status !== 'generating'"
                      size="small"
                      text
                      :type="seg.status === 'completed' ? 'info' : 'primary'"
                      :loading="generatingSegmentId === seg.segmentId"
                      :disabled="generatingAll"
                      @click="onGenerateSegment(seg)"
                    >
                      {{ seg.status === 'completed' ? '重新生成' : seg.status === 'error' ? '重试' : '生成视频' }}
                    </el-button>
                    <el-button v-else size="small" text loading disabled>生成中</el-button>
                  </div>
                </div>
              </div>

              <!-- 未入段分镜（自动分段失败时的兜底；正常会被 autoEnsureSegments 收编） -->
              <div v-if="unsegmentedShotsOf(sc.id).length || !(storyboards[sc.id] || []).length" class="group-shots">
                <div v-for="sb in unsegmentedShotsOf(sc.id)" :key="sb.id" class="shot-tile" @click="onEnterScene(sc)">
                  <div class="tile-preview">
                    <el-image v-if="frameUrl(sb)" :src="frameUrl(sb)" fit="cover" class="tile-img" />
                    <div v-else class="tile-empty"><el-icon :size="18"><Picture /></el-icon><span>待生成</span></div>
                  </div>
                  <div class="tile-meta">
                    <span class="tile-no">SHT-{{ String(sb.shotNumber).padStart(2, '0') }}</span>
                    <span class="tile-dur">{{ durationLabel(sb.duration) }}</span>
                  </div>
                </div>
                <!-- 无分镜时占位 -->
                <div v-if="!(storyboards[sc.id] || []).length" class="shot-tile empty-tile" @click="onEnterScene(sc)">
                  <div class="tile-empty"><el-icon :size="18"><Plus /></el-icon><span>进入制作</span></div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- 片段视频播放 -->
    <el-dialog
      v-model="playDialogVisible"
      :title="playSegment ? `片段 ${playSegment.seq} · ${playSegment.sceneLocation || ''}` : '播放'"
      width="720px"
      destroy-on-close
    >
      <video
        v-if="playSegment?.videoPath"
        :src="toVideoUrl(playSegment.videoPath)"
        class="play-video"
        controls
        autoplay
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * M4 分镜列表页（tab 宿主内的完整左+中央工作区，参照项目分镜列表页.png）。
 * 左：场次导航；中央：按场次分组的分镜格（SHT 卡 + 时间码 + 状态）。
 *
 * 视频片段制（tasks/2026-09-04-ep-video-segment-redesign §6）——2026-09-05 按用户反馈
 * 恢复原有按场次分组样式，且一片段一格（一个片段多个分镜 → 一段视频，不逐镜展示，
 * 镜数体现在格的 meta 里）：片段格 = 视频封面/状态角标 + 片段序号 + 镜数·时长 + 播放/生成。
 *   - 片段 = 制作/生成最小单元；分镜格保持原样式，占位文字跟随所属片段状态
 *   - 顶部：时长预算（写 video_projects.config.segmentDurationBudgetSec，5-30s）
 *     + 重新分段（ep:recompute-segments，确认后执行——会清未生成段，completed 段保留）
 *     + 全部生成（片段串行，单段失败不阻断，最后汇总）
 *   - 未分段的存量项目 → 提示"未分段"并引导重新分段
 *
 * 数据：getEpisode → scriptId → listScenes → listStoryboards(sceneId) + listSegments(episodeId)。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Picture, Plus, Scissor, VideoCamera, VideoPlay } from '@element-plus/icons-vue'
import SceneNav from '@/components/episode-production/script/SceneNav.vue'
import { toImageUrl, toVideoUrl } from '@/utils/asset-url'

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()
const emit = defineEmits<{ 'enter-scene': [sceneId: string] }>()

/** 片段预览条目（与后端 EpSegmentationService.SegmentPreviewItem 对齐） */
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
  storyboardIds: string[]
}

const script = ref<any>(null)
const scenes = ref<any[]>([])
const storyboards = ref<Record<string, any[]>>({})
const generating = ref(false)

// ── 视频片段制：分段状态 ──
const segments = ref<SegmentItem[]>([])
const segmentsLoaded = ref(false)
const budgetSec = ref(15)
const recomputing = ref(false)
const generatingSegmentId = ref<string | null>(null)
const generatingAll = ref(false)
const genAllDone = ref(0)
const genAllTotal = ref(0)
const playDialogVisible = ref(false)
const playSegment = ref<SegmentItem | null>(null)

// 视频 provider / model（片段级生成用；默认取项目 config.videoModel，否则第一个可用 provider）
const videoProviders = ref<Array<{ providerConfigId: string; name: string; ready: boolean; models: Array<{ id: string; name: string }> }>>([])
const videoProviderId = ref('')
const videoModelId = ref('')
const videoModels = computed(() => videoProviders.value.find(p => p.providerConfigId === videoProviderId.value)?.models ?? [])

const totalStoryboards = computed(() =>
  Object.values(storyboards.value).reduce((acc, arr) => acc + (arr?.length || 0), 0),
)

/** 待生成/失败的片段（全部生成的目标集） */
const pendingSegments = computed(() =>
  segments.value.filter(s => s.status === 'pending' || s.status === 'error'),
)

/** storyboardId → storyboard 索引（片段内分镜格展示用） */
const storyboardById = computed(() => {
  const map = new Map<string, any>()
  for (const arr of Object.values(storyboards.value)) {
    for (const sb of arr ?? []) map.set(sb.id, sb)
  }
  return map
})

/** sceneId → 该场景的片段（按 seq 排序；分段永不跨场景） */
const segmentsByScene = computed(() => {
  const map = new Map<string, SegmentItem[]>()
  for (const seg of [...segments.value].sort((a, b) => a.seq - b.seq)) {
    const arr = map.get(seg.sceneId) ?? []
    arr.push(seg)
    map.set(seg.sceneId, arr)
  }
  return map
})

async function load(): Promise<void> {
  if (!props.episodeId) { script.value = null; scenes.value = []; storyboards.value = {}; segments.value = []; segmentsLoaded.value = false; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { script.value = null; scenes.value = []; storyboards.value = {}; segments.value = []; segmentsLoaded.value = false; return }
  script.value = ep.data

  const scResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  if (!scResp.success) { scenes.value = []; return }
  scenes.value = scResp.data || []
  await Promise.all([...scenes.value.map(s => loadStoryboards(s.id)), loadSegments(), loadProjectConfig()])
  await autoEnsureSegments()
}

async function loadStoryboards(sceneId: string): Promise<void> {
  const r = await window.electronAPI.episodeProduction.listStoryboards(sceneId)
  storyboards.value[sceneId] = r.success ? (r.data || []) : []
}

/** 已入段的分镜 id 集 */
const segmentedShotIds = computed(() => {
  const set = new Set<string>()
  for (const seg of segments.value) for (const id of seg.storyboardIds) set.add(id)
  return set
})

/** 存在未入段的分镜（新生成的分镜未分段 / 部分分段存量）→ 需要自动补齐分段 */
const hasUnsegmentedShots = computed(() => {
  for (const arr of Object.values(storyboards.value)) {
    for (const sb of arr ?? []) if (!segmentedShotIds.value.has(sb.id)) return true
  }
  return false
})

/**
 * 自动补齐分段（幂等，每剧集每次会话最多一次）：
 * 片段是分镜页的最小单元，未入段的分镜对用户不可见且无法片段级生成，
 * 故加载后发现未入段分镜时静默重算（completed 段由后端保留，不受影响）。
 */
let autoSegDoneFor: string | null = null
async function autoEnsureSegments(): Promise<void> {
  if (!hasUnsegmentedShots.value || autoSegDoneFor === props.episodeId) return
  autoSegDoneFor = props.episodeId
  try {
    const r = await (window.electronAPI.episodeProduction as any).recomputeSegments(props.episodeId, {})
    if (r?.success) await loadSegments()
  } catch { /* 静默失败：保留"立即分段"引导条兜底 */ }
}

async function loadSegments(): Promise<void> {
  segmentsLoaded.value = false
  try {
    const r = await (window.electronAPI.episodeProduction as any).listSegments(props.episodeId)
    segments.value = r?.success ? (r.data?.segments ?? []) : []
    if (r?.success && typeof r.data?.budgetSec === 'number') {
      budgetSec.value = Math.round(r.data.budgetSec)
    }
  } finally {
    segmentsLoaded.value = true
  }
}

/** 读项目 config（时长预算 + 视频模型默认选择） */
async function loadProjectConfig(): Promise<void> {
  if (!props.projectId) return
  const r = await window.electronAPI.episodeProduction.getProject(props.projectId)
  if (!r?.success || !r.data) return
  const cfg = r.data.config ?? {}
  if (typeof cfg.segmentDurationBudgetSec === 'number') {
    budgetSec.value = Math.min(30, Math.max(5, Math.round(cfg.segmentDurationBudgetSec)))
  }
  const vm = cfg.videoModel
  if (vm?.providerConfigId && videoProviders.value.some(p => p.providerConfigId === vm.providerConfigId)) {
    videoProviderId.value = vm.providerConfigId
    const models = videoModels.value
    videoModelId.value = models.some(m => m.id === vm.modelId) ? vm.modelId : (models[0]?.id ?? '')
  }
}

async function loadVideoProviders(): Promise<void> {
  try {
    const r = await window.electronAPI.episodeProduction.listVideoProviders()
    const list = (r.success ? r.data : []) || []
    videoProviders.value = list
    const firstReady = list.find((p: any) => p.ready && p.models.length > 0) ?? list[0]
    if (firstReady && !videoProviderId.value) {
      videoProviderId.value = firstReady.providerConfigId
      videoModelId.value = firstReady.models[0]?.id ?? ''
    }
  } catch (e: any) {
    console.error('[StageStoryboardView] 加载视频模型失败', e)
  }
}

function onVideoProviderChange(): void {
  videoModelId.value = videoModels.value[0]?.id ?? ''
}

/** 时长预算变更 → 写 video_projects.config.segmentDurationBudgetSec（合并其他 config 键） */
async function onBudgetChange(val: number | undefined): Promise<void> {
  if (!val || !props.projectId) return
  const clamped = Math.min(30, Math.max(5, Math.round(val)))
  budgetSec.value = clamped
  const r = await window.electronAPI.episodeProduction.getProject(props.projectId)
  if (!r?.success || !r.data) return
  const cfg = { ...(r.data.config ?? {}), segmentDurationBudgetSec: clamped }
  const u = await window.electronAPI.episodeProduction.updateProject(props.projectId, { config: cfg })
  if (!u?.success) ElMessage.error(u?.error || '保存时长预算失败')
}

/** 重新分段（确认后执行：会清掉未生成的片段，completed 段保留） */
async function onRecompute(): Promise<void> {
  if (recomputing.value) return
  try {
    await ElMessageBox.confirm(
      `将按时长预算 ${budgetSec.value}s 重新分段：未生成的片段会被清除重排，已完成的片段及其视频保留。继续？`,
      '重新分段',
      { type: 'warning', confirmButtonText: '重新分段', cancelButtonText: '取消' },
    )
  } catch { return }
  recomputing.value = true
  try {
    const r = await (window.electronAPI.episodeProduction as any).recomputeSegments(
      props.episodeId,
      { budgetSec: budgetSec.value },
    )
    if (r?.success) {
      const d = r.data
      ElMessage.success(`分段完成：${d.sceneCount} 个场景 → ${d.segments.length} 个片段 / 共 ${d.totalShotCount} 镜`)
      await loadSegments()
    } else {
      ElMessage.error(r?.error || '重新分段失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '重新分段失败')
  } finally {
    recomputing.value = false
  }
}

/** 片段级生成（默认 text2video；单段失败后状态写回 error，可重试） */
async function onGenerateSegment(seg: SegmentItem): Promise<void> {
  if (!videoProviderId.value || !videoModelId.value) {
    ElMessage.warning('请先在右上角选择视频模型')
    return
  }
  generatingSegmentId.value = seg.segmentId
  try {
    const r = await (window.electronAPI.episodeProduction as any).generateSegmentVideo(seg.segmentId, {
      providerConfigId: videoProviderId.value,
      modelId: videoModelId.value,
      forceMode: 'text2video',
    })
    if (r?.success) {
      ElMessage.success(`片段 ${seg.seq} 视频已生成`)
      await Promise.all([loadSegments(), ...scenes.value.map(s => loadStoryboards(s.id))])
    } else {
      ElMessage.error(`片段 ${seg.seq} 生成失败：${r?.error || '未知错误'}`)
      await loadSegments()
    }
  } catch (e: any) {
    ElMessage.error(`片段 ${seg.seq} 生成失败：${e?.message || e}`)
    await loadSegments()
  } finally {
    generatingSegmentId.value = null
  }
}

/** 全部生成：按片段串行，单段失败不阻断后续，最后汇总报告 */
async function onGenerateAll(): Promise<void> {
  if (generatingAll.value) return
  if (!videoProviderId.value || !videoModelId.value) {
    ElMessage.warning('请先在右上角选择视频模型')
    return
  }
  const targets = pendingSegments.value
  if (targets.length === 0) return
  generatingAll.value = true
  genAllDone.value = 0
  genAllTotal.value = targets.length
  const results: Array<{ seq: number; ok: boolean; error?: string }> = []
  for (const seg of targets) {
    try {
      const r = await (window.electronAPI.episodeProduction as any).generateSegmentVideo(seg.segmentId, {
        providerConfigId: videoProviderId.value,
        modelId: videoModelId.value,
        forceMode: 'text2video',
      })
      results.push({ seq: seg.seq, ok: !!r?.success, error: r?.success ? undefined : (r?.error || '未知错误') })
    } catch (e: any) {
      results.push({ seq: seg.seq, ok: false, error: e?.message || String(e) })
    }
    genAllDone.value++
    await loadSegments()
  }
  generatingAll.value = false
  await Promise.all([loadSegments(), ...scenes.value.map(s => loadStoryboards(s.id))])
  const okCnt = results.filter(r => r.ok).length
  const lines = results.map(r => `片段 ${r.seq}：${r.ok ? '✅ 成功' : `❌ ${r.error}`}`).join('\n')
  await ElMessageBox.alert(`全部生成完成：${okCnt}/${results.length} 个片段成功\n\n${lines}`, '生成汇总', {
    confirmButtonText: '知道了',
  })
}

/** 该场景下未入段的分镜（兜底显示；正常会被自动分段收编为空） */
function unsegmentedShotsOf(sceneId: string): any[] {
  return (storyboards.value[sceneId] ?? []).filter(sb => !segmentedShotIds.value.has(sb.id))
}

/** 片段封面：首镜关键帧（无视频时的预览图） */
function segFrameUrl(seg: SegmentItem): string | null {
  const first = seg.storyboardIds.map(id => storyboardById.value.get(id)).find(Boolean)
  return first ? frameUrl(first) : null
}

function segStatusLabel(status: SegmentItem['status']): string {
  return ({ pending: '待生成', generating: '生成中', completed: '已完成', error: '失败' } as const)[status] ?? status
}

function onPlay(seg: SegmentItem): void {
  playSegment.value = seg
  playDialogVisible.value = true
}

/** 场景导航点击 → 突出显示该场（滚动到分组），不做跳转 */
function onSelectScene(sc: any): void {
  const el = document.querySelector(`[data-scene="${sc.id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** 点击场次 → 进入该场分镜制作 */
function onEnterScene(sc: any): void {
  emit('enter-scene', sc.id)
}

async function onGenerateAllStoryboards(): Promise<void> {
  // 2026-09-16 联合生成（D8）：改走 ep:cogen-storyboards（分镜 + 资产识别一次 LLM 调用，
  // 绑定 ID 由代码侧构造回填）。参数是 episode.id（service 内部自解析 scriptId）。
  if (!script.value?.scriptId || generating.value) return
  generating.value = true
  try {
    const r = await window.electronAPI.episodeProduction.cogenStoryboards(props.episodeId)
    if (r.success) {
      const results = (r.data?.results ?? []) as Array<{ sceneNumber: number; shotCount: number; error?: string }>
      const failed = results.filter(s => s.error)
      if (failed.length > 0) {
        ElMessage.warning(
          `联合生成完成：${results.length - failed.length} 个场景成功，${failed.length} 个失败` +
          `（场景 ${failed[0].sceneNumber}：${failed[0].error}）`,
        )
      } else {
        ElMessage.success('分镜已批量生成（含资产绑定）')
      }
      await Promise.all(scenes.value.map(s => loadStoryboards(s.id)))
      // 新生成的分镜立即自动分段（片段是分镜页最小单元，不允许出现裸分镜）
      autoSegDoneFor = null
      await autoEnsureSegments()
    } else {
      // 失败消息原样展示（含"去项目设置配置模型"引导）
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

function frameUrl(sb: any): string | null {
  const img = sb.frameImage
  const p = img?.filePath || img?.url || (sb as any).frameImagePath
  return p ? toImageUrl(p) : null
}

function durationLabel(d?: number): string {
  const s = d || 0
  return `00:${String(Math.min(99, s)).padStart(2, '0')}`
}

watch(() => props.episodeId, () => void load())
onMounted(() => {
  void loadVideoProviders()
  void load()
})
</script>

<style lang="scss" scoped>
.stage-storyboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.sb-toolbar {
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
  .tb-label { font-size: 12px; color: var(--text-color-secondary); }
  .tb-unit { font-size: 12px; color: var(--text-color-placeholder); }
  .budget-input { width: 72px; }
  .provider-select { width: 120px; }
  .model-select { width: 140px; }
}

.sb-body { flex: 1; min-height: 0; display: flex; }
.sb-left {
  width: 250px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
}
.sb-center { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 20px 24px; }

.no-scenes { height: 100%; display: flex; align-items: center; justify-content: center; }

.seg-hint { max-width: 900px; margin-bottom: 14px; }

/* ── 按场次分组（原样式） ── */
.sb-scenes { display: flex; flex-direction: column; gap: 22px; max-width: 900px; }
.sb-scene-group { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: var(--radius-lg); padding: 16px 18px; }
.group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.group-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
.done-mark { font-size: 12px; color: var(--color-danger); }

.group-shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
.shot-tile {
  background: var(--bg-color-page);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); box-shadow: var(--shadow-card-hover); }
  .tile-preview {
    height: 90px; background: var(--fill-color-lighter);
    display: flex; align-items: center; justify-content: center;
    .tile-img { width: 100%; height: 100%; object-fit: cover; }
    .tile-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text-color-placeholder); font-size: 11px; }
  }
  .tile-meta { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; }
  .tile-no { font-size: 12px; font-weight: 600; color: var(--text-color-primary); }
  .tile-dur { font-size: 11px; color: var(--text-color-placeholder); }
  &.empty-tile .tile-preview { height: 110px; }
}

/* ── 片段格（原 tile 样式；一片段一格，状态角标 + 操作行） ── */
.seg-tile {
  .tile-preview { position: relative; }
  .tile-status {
    position: absolute; left: 6px; top: 6px;
    font-size: 10px; padding: 1px 6px; border-radius: 8px;
    background: rgba(0, 0, 0, .55); color: #fff;
    &.st-completed { background: var(--color-success); }
    &.st-error { background: var(--color-danger); }
    &.st-generating { background: var(--color-warning); }
  }
  &[data-status='completed'] { border-color: var(--color-success-light-5); }
  &[data-status='error'] { border-color: var(--color-danger-light-5); }
  .tile-actions {
    display: flex; align-items: center; justify-content: center; gap: 2px;
    padding: 2px 6px 4px; border-top: 1px dashed var(--border-color-lighter);
  }
}

.play-video { width: 100%; max-height: 60vh; background: #000; border-radius: var(--radius-md); }
</style>
