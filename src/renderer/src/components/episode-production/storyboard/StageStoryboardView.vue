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

    <!-- 主体：左场次导航 + 中央片段卡/分镜组 -->
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

          <!-- 片段分组卡片（已分段） -->
          <div v-if="segments.length > 0" class="seg-cards">
            <div
              v-for="seg in segments"
              :key="seg.segmentId"
              class="seg-card"
              :data-segment="seg.segmentId"
              :data-status="seg.status"
            >
              <div class="seg-head" @click="toggleExpand(seg.segmentId)">
                <span class="seg-caret">{{ expandedIds.has(seg.segmentId) ? '▾' : '▸' }}</span>
                <span class="seg-title">片段 {{ seg.seq }}</span>
                <span class="seg-scene">场景 {{ seg.sceneNumber }} · {{ seg.sceneLocation || '?' }}</span>
                <span class="seg-meta">{{ seg.shotCount }} 镜</span>
                <span class="seg-meta">约 {{ formatSec(seg.estDuration) }}</span>
                <span v-if="seg.duration != null" class="seg-meta actual">实际 {{ formatSec(seg.duration) }}</span>
                <el-tag size="small" :type="segStatusTagType(seg.status)" effect="light" class="seg-status-tag">
                  {{ segStatusLabel(seg.status) }}
                </el-tag>
                <span class="seg-actions" @click.stop>
                  <el-button
                    v-if="seg.videoPath"
                    size="small"
                    text
                    type="success"
                    @click="onPlay(seg)"
                  >
                    <el-icon><VideoPlay /></el-icon>
                    播放
                  </el-button>
                  <el-button
                    v-if="seg.status !== 'generating'"
                    size="small"
                    :type="seg.status === 'completed' ? 'default' : 'primary'"
                    :loading="generatingSegmentId === seg.segmentId"
                    :disabled="generatingAll"
                    @click="onGenerateSegment(seg)"
                  >
                    {{ seg.status === 'completed' ? '重新生成' : seg.status === 'error' ? '重试生成' : '生成视频' }}
                  </el-button>
                  <el-button v-else size="small" loading disabled>生成中</el-button>
                </span>
              </div>
              <div v-if="expandedIds.has(seg.segmentId)" class="seg-shots">
                <div
                  v-for="sb in segmentShots(seg)"
                  :key="sb.id"
                  class="seg-shot-row"
                  :title="`${shotTitle(sb)}（点击进入制作页微调）`"
                  @click="onEnterSceneById(seg.sceneId)"
                >
                  <span class="shot-no">SHT-{{ String(sb.shotNumber).padStart(2, '0') }}</span>
                  <span class="shot-dur">{{ durationLabel(sb.duration) }}</span>
                  <span class="shot-desc">{{ shotExcerpt(sb) }}</span>
                </div>
                <div v-if="segmentShots(seg).length === 0" class="seg-shot-empty">（片段内分镜数据未加载）</div>
              </div>
            </div>
          </div>

          <!-- 未分段时回退：按场次分组的分镜格（保留原能力） -->
          <div v-else class="sb-scenes">
            <div v-for="sc in scenes" :key="sc.id" class="sb-scene-group" :data-scene="sc.id">
              <div class="group-head" @click="onEnterScene(sc)">
                <span class="group-title">场次 {{ sc.sceneNumber }}：{{ sc.location }}</span>
                <span class="group-actions">
                  <span v-if="storyboards[sc.id]?.length" class="done-mark">制作中</span>
                  <span class="enter-link">进入制作 →</span>
                </span>
              </div>
              <div class="group-shots">
                <div v-for="sb in (storyboards[sc.id] || [])" :key="sb.id" class="shot-tile" @click="onEnterScene(sc)">
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
 * 左：场次导航；中央：按视频片段分组的片段卡（视频片段制，2026-09-04 重构批次 B）。
 *
 * 视频片段制（tasks/2026-09-04-ep-video-segment-redesign §6）：
 *   - 片段 = 制作/生成最小单元；片段卡显示场景名/镜数/预估+实际时长/状态/生成/重新生成/播放
 *   - 顶部：时长预算（写 video_projects.config.segmentDurationBudgetSec，5-30s）
 *     + 重新分段（ep:recompute-segments，确认后执行——会清未生成段，completed 段保留）
 *     + 全部生成（片段串行，单段失败不阻断，最后汇总）
 *   - 未分段的存量项目 → 提示"未分段"并引导重新分段；下方回退原按场次分组视图
 *
 * 数据：getEpisode → scriptId → listScenes → listStoryboards(sceneId) + listSegments(episodeId)。
 */
import { ref, computed, onMounted, watch, reactive } from 'vue'
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
const expandedIds = reactive(new Set<string>())
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

/** storyboardId → storyboard 索引（片段卡镜头行展示用） */
const storyboardById = computed(() => {
  const map = new Map<string, any>()
  for (const arr of Object.values(storyboards.value)) {
    for (const sb of arr ?? []) map.set(sb.id, sb)
  }
  return map
})

async function load(): Promise<void> {
  if (!props.episodeId) { script.value = null; scenes.value = []; storyboards.value = {}; segments.value = []; segmentsLoaded.value = false; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { script.value = null; scenes.value = []; storyboards.value = []; segments.value = []; segmentsLoaded.value = false; return }
  script.value = ep.data

  const scResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  if (!scResp.success) { scenes.value = []; return }
  scenes.value = scResp.data || []
  await Promise.all([...scenes.value.map(s => loadStoryboards(s.id)), loadSegments(), loadProjectConfig()])
}

async function loadStoryboards(sceneId: string): Promise<void> {
  const r = await window.electronAPI.episodeProduction.listStoryboards(sceneId)
  storyboards.value[sceneId] = r.success ? (r.data || []) : []
}

async function loadSegments(): Promise<void> {
  segmentsLoaded.value = false
  try {
    const r = await (window.electronAPI.episodeProduction as any).listSegments(props.episodeId)
    segments.value = r?.success ? (r.data?.segments ?? []) : []
    if (r?.success && typeof r.data?.budgetSec === 'number') {
      budgetSec.value = Math.round(r.data.budgetSec)
    }
    // 新出现的片段默认展开
    for (const seg of segments.value) {
      if (!expandedIds.has(seg.segmentId)) expandedIds.add(seg.segmentId)
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

function toggleExpand(segmentId: string): void {
  if (expandedIds.has(segmentId)) expandedIds.delete(segmentId)
  else expandedIds.add(segmentId)
}

function segmentShots(seg: SegmentItem): any[] {
  return seg.storyboardIds
    .map(id => storyboardById.value.get(id))
    .filter(Boolean)
}

function shotTitle(sb: any): string {
  return `SHT-${String(sb.shotNumber).padStart(2, '0')} · ${sb.duration ?? 0}s`
}

function shotExcerpt(sb: any): string {
  const text = String(sb.frameDescription ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return '（无画面描述）'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function segStatusLabel(status: SegmentItem['status']): string {
  return ({ pending: '待生成', generating: '生成中', completed: '已完成', error: '失败' } as const)[status] ?? status
}

function segStatusTagType(status: SegmentItem['status']): 'info' | 'warning' | 'success' | 'danger' {
  return ({ pending: 'info', generating: 'warning', completed: 'success', error: 'danger' } as const)[status] ?? 'info'
}

function formatSec(n?: number | null): string {
  return `${(n ?? 0).toFixed(1)}s`
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

function onEnterSceneById(sceneId: string): void {
  emit('enter-scene', sceneId)
}

async function onGenerateAllStoryboards(): Promise<void> {
  // 注意：ep:generate-storyboards 需要的是剧本 id（episodeScriptId），不是 episode.id。
  // getEpisode 返回的是剧集对象，剧本 id 在其 scriptId 字段上（load() 已保证存在）。
  const scriptId = script.value?.scriptId
  if (!scriptId || generating.value) return
  generating.value = true
  try {
    const r = await window.electronAPI.episodeProduction.generateStoryboards(scriptId)
    if (r.success) {
      ElMessage.success('分镜已批量生成')
      await Promise.all(scenes.value.map(s => loadStoryboards(s.id)))
    } else {
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

/* ── 片段分组卡片 ── */
.seg-cards { display: flex; flex-direction: column; gap: 14px; max-width: 900px; }
.seg-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  &[data-status='completed'] { border-left: 3px solid var(--color-success); }
  &[data-status='error'] { border-left: 3px solid var(--color-danger); }
  &[data-status='generating'] { border-left: 3px solid var(--color-warning); }
  &[data-status='pending'] { border-left: 3px solid var(--border-color); }
}
.seg-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.seg-caret { color: var(--text-color-placeholder); font-size: 12px; }
.seg-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
.seg-scene { font-size: 12px; color: var(--text-color-secondary); }
.seg-meta { font-size: 12px; color: var(--text-color-placeholder); &.actual { color: var(--color-success); } }
.seg-status-tag { margin-left: 2px; }
.seg-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }

.seg-shots { margin-top: 10px; border-top: 1px dashed var(--border-color-lighter); padding-top: 8px; }
.seg-shot-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: var(--radius-md);
  cursor: pointer; font-size: 12px;
  &:hover { background: var(--fill-color-light); }
  .shot-no { font-weight: 600; color: var(--text-color-primary); flex-shrink: 0; }
  .shot-dur { color: var(--text-color-placeholder); flex-shrink: 0; }
  .shot-desc { color: var(--text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.seg-shot-empty { padding: 6px 8px; font-size: 12px; color: var(--text-color-placeholder); }

/* ── 未分段回退：按场次分组 ── */
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

.play-video { width: 100%; max-height: 60vh; background: #000; border-radius: var(--radius-md); }
</style>
