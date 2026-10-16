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
        <el-button
          text
          size="small"
          :disabled="scenes.length === 0"
          :loading="generating"
          title="批量生成分镜（cogen 联合生成：资产识别+分镜一次完成）"
          @click="onGenerateAllStoryboards"
        >
          <el-icon><MagicStick /></el-icon>
          <template v-if="generating && cogenProgress">场景 {{ cogenProgress.sceneNumber }}/{{ cogenProgress.totalScenes }}</template>
          <template v-else>生成分镜</template>
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
          <el-empty description="请先在「剧本」页拆分场景">
            <el-button type="primary" @click="emit('switch-tab', 'script')">去「剧本」页拆分场景</el-button>
          </el-empty>
        </div>

        <template v-else>
          <!-- 空态：有场景但全剧还没有分镜 → 主按钮走批量联合生成 -->
          <div v-if="totalStoryboards === 0" class="no-storyboards">
            <el-button
              type="primary"
              :loading="generating"
              title="批量生成分镜（cogen 联合生成：资产识别+分镜一次完成）"
              @click="onGenerateAllStoryboards"
            >
              <el-icon><MagicStick /></el-icon>
              <template v-if="generating && cogenProgress">场景 {{ cogenProgress.sceneNumber }}/{{ cogenProgress.totalScenes }}</template>
              <template v-else>生成全部分镜（自动识别并绑定资产）</template>
            </el-button>
          </div>

          <!-- 兼容存量：有分镜但尚未分段 → 引导重新分段 -->
          <el-alert
            v-if="segmentsLoaded && segments.length === 0 && totalStoryboards > 0"
            class="seg-hint"
            type="warning"
            :closable="false"
            show-icon
          >
            <template #title>
              该剧集尚未分段（视频片段制：一次生成多镜一段的视频）。点击右侧按钮按场景 + 时长预算自动分段。
              <el-button size="small" type="warning" plain :loading="recomputing" @click="onRecompute">立即分段</el-button>
            </template>
          </el-alert>

          <!-- 按场次分组（原样式） -->
          <div class="sb-scenes">
            <div v-for="sc in scenes" :key="sc.id" class="sb-scene-group" :data-scene="sc.id">
              <div class="group-head">
                <span class="group-title" @click="onEnterScene(sc)">场次 {{ sc.sceneNumber }}：{{ sc.location }}</span>
                <span class="group-actions">
                  <el-button
                    text
                    size="small"
                    title="查看该场次的剧本内容"
                    @click.stop="toggleSceneScript(sc.id)"
                  >
                    <el-icon><Document /></el-icon>
                  </el-button>
                  <el-button
                    text
                    size="small"
                    :loading="cogenSceneId === sc.id"
                    title="重新生成此场景分镜（替换式：该场现有分镜被删除重写）"
                    @click.stop="onCogenScene(sc)"
                  >
                    <el-icon><MagicStick /></el-icon>
                  </el-button>
                  <span v-if="storyboards[sc.id]?.length" class="done-mark">已有分镜</span>
                  <el-button
                    text
                    size="small"
                    title="进入制作（编辑提示词并生成视频）"
                    @click.stop="onEnterScene(sc)"
                  >
                    <el-icon><Right /></el-icon>
                  </el-button>
                </span>
              </div>
              <!-- 场次剧本（默认收起，Document 图标展开） -->
              <div v-if="expandedSceneScripts.has(sc.id)" class="scene-script">
                <div v-if="sc.sceneDescription" class="ss-block"><span class="ss-label">场景</span>{{ sc.sceneDescription }}</div>
                <div v-if="sc.narration" class="ss-block"><span class="ss-label">旁白</span>{{ sc.narration }}</div>
                <div v-for="(d, di) in sceneDialogues(sc)" :key="di" class="ss-block ss-dlg">
                  <span class="ss-label">{{ d.characterName || '台词' }}</span>{{ d.text }}
                </div>
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
                      title="参考图模式请进入制作页生成（自动带关键帧）"
                      @click="onGenerateSegment(seg)"
                    >
                      {{ seg.status === 'completed' ? '重新生成' : seg.status === 'error' ? '重试' : '生成视频' }}
                    </el-button>
                    <el-button v-else size="small" text loading disabled>生成中</el-button>
                    <!-- S-03 手动分段：拆分（选断点镜）/ 与下一段合并 -->
                    <el-button
                      size="small"
                      text
                      :disabled="seg.status === 'generating' || seg.shotCount < 2"
                      title="在指定镜头之后把片段拆成两段"
                      @click="openSplitDialog(seg)"
                    >
                      拆分
                    </el-button>
                    <el-button
                      v-if="nextSegmentOf(sc.id, seg)"
                      size="small"
                      text
                      :disabled="!canMergeWithNext(sc.id, seg)"
                      :title="mergeDisabledReason(sc.id, seg) || '与相邻下一片段合并为一段'"
                      @click="onMergeWithNext(sc.id, seg)"
                    >
                      合并
                    </el-button>
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
                <div v-if="!(storyboards[sc.id] || []).length" class="shot-tile empty-tile">
                  <div class="tile-empty"><el-icon :size="18"><Plus /></el-icon><span>尚未生成分镜</span></div>
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

    <!-- S-03 片段拆分：选断点镜（在该镜之后另起一段） -->
    <el-dialog
      v-model="splitDialogVisible"
      :title="splitTarget ? `拆分片段 ${splitTarget.seq}（选择断点镜）` : '拆分片段'"
      width="480px"
      destroy-on-close
    >
      <div v-if="splitTarget" class="split-body">
        <p class="split-hint">在选中的镜头之后拆分：该镜留在片段 {{ splitTarget.seq }}，后续镜头另起一段。</p>
        <el-radio-group v-model="splitAfterShotId" class="split-options">
          <el-radio
            v-for="(sb, i) in splitShots.slice(0, -1)"
            :key="sb.id"
            :value="sb.id"
            class="split-option"
          >
            第 {{ i + 1 }} 镜（SHT-{{ String(sb.shotNumber).padStart(2, '0') }} · {{ durationLabel(sb.duration) }}）之后
          </el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="splitDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!splitAfterShotId" :loading="splitting" @click="onConfirmSplit">
          确认拆分
        </el-button>
      </template>
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
 *   - 未分段的存量项目 → 提示"未分段"并引导重新分段
 *
 * 数据：getEpisode → scriptId → listScenes → listStoryboards(sceneId) + listSegments(episodeId)。
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Picture, Plus, VideoPlay, Document, Right } from '@element-plus/icons-vue'
import SceneNav from '@/components/episode-production/script/SceneNav.vue'
import { toImageUrl, toVideoUrl } from '@/utils/asset-url'
import type { EpStudioTab } from '@/composables/useEpStudioContext'

const props = defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
  /** agent 改数据后由 Studio 递增，触发本页重载 */
  refreshTick?: number
}>()
const emit = defineEmits<{ 'enter-scene': [sceneId: string]; 'switch-tab': [tab: EpStudioTab] }>()

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
const playDialogVisible = ref(false)
const playSegment = ref<SegmentItem | null>(null)

// S-06：单场景分镜重拆（ep:cogen-scene-storyboards）进行中的场景
const cogenSceneId = ref<string | null>(null)

/** 场次剧本展开状态（分镜列表每个场次的剧本内容，默认收起） */
const expandedSceneScripts = ref<Set<string>>(new Set())
function toggleSceneScript(sceneId: string): void {
  const s = new Set(expandedSceneScripts.value)
  if (s.has(sceneId)) s.delete(sceneId)
  else s.add(sceneId)
  expandedSceneScripts.value = s
}
/** 场次对白（scene.dialogues 为 JSON 字符串或数组，统一成数组） */
function sceneDialogues(sc: any): Array<{ characterName?: string; text?: string }> {
  const d = sc?.dialogues
  if (Array.isArray(d)) return d
  if (typeof d === 'string') {
    try {
      const parsed = JSON.parse(d)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  return []
}

// S-03 手动分段：拆分弹窗状态
const splitDialogVisible = ref(false)
const splitTarget = ref<SegmentItem | null>(null)
const splitAfterShotId = ref('')
const splitting = ref(false)
/** 拆分目标片段内的分镜（按段内顺序） */
const splitShots = computed(() =>
  (splitTarget.value?.storyboardIds ?? [])
    .map(id => storyboardById.value.get(id))
    .filter(Boolean),
)

/**
 * H13 cogen 进度（ep:cogen-progress 事件，负载 { sceneNumber, totalScenes, status }）：
 * 「批量生成分镜」按钮 loading 期间显示"场景 x/N"。主进程逐场景推送。
 */
const cogenProgress = ref<{ sceneNumber: number; totalScenes: number; status: 'start' | 'done' | 'error' } | null>(null)
let unsubscribeCogenProgress: (() => void) | null = null

// 视频 provider / model（片段级生成用；默认取项目 config.videoModel，否则第一个可用 provider）
const videoProviders = ref<Array<{ providerConfigId: string; name: string; ready: boolean; models: Array<{ id: string; name: string }> }>>([])
const videoProviderId = ref('')
const videoModelId = ref('')
const videoModels = computed(() => videoProviders.value.find(p => p.providerConfigId === videoProviderId.value)?.models ?? [])

const totalStoryboards = computed(() =>
  Object.values(storyboards.value).reduce((acc, arr) => acc + (arr?.length || 0), 0),
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

/** 片段级生成（不传 forceMode：由后端 pickVideoMode 按关键帧数自动选 text2video/参考图模式） */
async function onGenerateSegment(seg: SegmentItem): Promise<void> {
  if (!videoProviderId.value || !videoModelId.value) {
    ElMessage.warning('未找到可用的视频服务：请在顶栏「设置」中配置视频服务/模型')
    return
  }
  generatingSegmentId.value = seg.segmentId
  try {
    const r = await (window.electronAPI.episodeProduction as any).generateSegmentVideo(seg.segmentId, {
      providerConfigId: videoProviderId.value,
      modelId: videoModelId.value,
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
  if (generating.value) return
  // S-01 gating：剧本未就绪时给出明确提示，不再静默返回/等 LLM 报错
  try {
    const rd = await window.electronAPI.episodeProduction.episodeReadiness(props.episodeId)
    if (rd?.success && rd.data && !rd.data.script?.ready) {
      const missing = (rd.data.script.missing ?? []).join('；') || '剧本尚未生成'
      ElMessage.warning(`剧本未就绪：${missing}。请先到「剧本」页完成剧本，再批量生成分镜`)
      return
    }
  } catch { /* readiness 拉取失败不阻断，走原有 scriptId 守卫 */ }
  if (!script.value?.scriptId) {
    ElMessage.warning('剧本未就绪：请先到「剧本」页生成剧本并拆分场景，再批量生成分镜')
    return
  }
  generating.value = true
  cogenProgress.value = null
  try {
    const r = await window.electronAPI.episodeProduction.cogenStoryboards(props.episodeId, { force: true })
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
    cogenProgress.value = null
  }
}

function frameUrl(sb: any): string | null {
  const img = sb.frameImage
  const p = img?.filePath || img?.url || (sb as any).frameImagePath
  return p ? toImageUrl(p) : null
}

/** S-06：重新生成此场景分镜（ep:cogen-scene-storyboards，替换式重写该场分镜） */
async function onCogenScene(sc: any): Promise<void> {
  if (cogenSceneId.value) return
  try {
    await ElMessageBox.confirm(
      `将重新生成场次 ${sc.sceneNumber} 的分镜：该场现有分镜会被删除重写，` +
        '其所属视频片段将失效（需重新分段/生成视频）。其它场景不受影响。继续？',
      '重新生成此场景分镜',
      { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' },
    )
  } catch { return }
  cogenSceneId.value = sc.id
  try {
    const r = await (window.electronAPI.episodeProduction as any).cogenSceneStoryboards(sc.id)
    if (r?.success) {
      ElMessage.success(`场次 ${sc.sceneNumber} 分镜已重新生成（${r.data?.shotCount ?? 0} 镜）`)
      await loadStoryboards(sc.id)
      // 新分镜未入段 → 触发自动分段收编（旧片段由后端 superseded/重排收敛）
      autoSegDoneFor = null
      await autoEnsureSegments()
      await loadSegments()
    } else {
      ElMessage.error(r?.error || '重新生成场景分镜失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成场景分镜失败')
  } finally {
    cogenSceneId.value = null
  }
}

/** S-03：同场景内按 seq 相邻的下一片段（合并目标） */
function nextSegmentOf(sceneId: string, seg: SegmentItem): SegmentItem | null {
  const list = segmentsByScene.value.get(sceneId) ?? []
  const idx = list.findIndex(s => s.segmentId === seg.segmentId)
  return idx >= 0 ? (list[idx + 1] ?? null) : null
}

/** S-03 合并禁用原因（可合并返回空串） */
function mergeDisabledReason(sceneId: string, seg: SegmentItem): string {
  const next = nextSegmentOf(sceneId, seg)
  if (!next) return ''
  if (seg.status === 'generating' || next.status === 'generating') return '片段正在生成中，不能合并'
  if (seg.estDuration + next.estDuration > budgetSec.value) {
    return `合并后预估时长 ${seg.estDuration + next.estDuration}s 超过 ${budgetSec.value}s 上限`
  }
  return ''
}

function canMergeWithNext(sceneId: string, seg: SegmentItem): boolean {
  return mergeDisabledReason(sceneId, seg) === ''
}

/** S-03：与相邻下一片段合并（内容变化 → 合并结果重置为待生成，需重新生成视频） */
async function onMergeWithNext(sceneId: string, seg: SegmentItem): Promise<void> {
  const next = nextSegmentOf(sceneId, seg)
  if (!next) return
  try {
    await ElMessageBox.confirm(
      `将片段 ${seg.seq} 与片段 ${next.seq} 合并为一段。合并后需重新生成视频（已有视频产出作废，磁盘文件保留）。继续？`,
      '合并片段',
      { type: 'warning', confirmButtonText: '合并', cancelButtonText: '取消' },
    )
  } catch { return }
  const r = await (window.electronAPI.episodeProduction as any).mergeSegments(seg.segmentId, next.segmentId)
  if (r?.success) {
    ElMessage.success('片段已合并')
    await loadSegments()
  } else {
    ElMessage.error(r?.error || '合并片段失败')
  }
}

/** S-03：打开拆分弹窗（选断点镜，在该镜之后另起一段） */
function openSplitDialog(seg: SegmentItem): void {
  splitTarget.value = seg
  splitAfterShotId.value = ''
  splitDialogVisible.value = true
}

async function onConfirmSplit(): Promise<void> {
  const seg = splitTarget.value
  if (!seg || !splitAfterShotId.value || splitting.value) return
  splitting.value = true
  try {
    const r = await (window.electronAPI.episodeProduction as any).splitSegments(seg.segmentId, splitAfterShotId.value)
    if (r?.success) {
      ElMessage.success(`片段 ${seg.seq} 已拆分为两段`)
      splitDialogVisible.value = false
      await loadSegments()
    } else {
      ElMessage.error(r?.error || '拆分片段失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '拆分片段失败')
  } finally {
    splitting.value = false
  }
}

function durationLabel(d?: number): string {
  const s = d || 0
  return `00:${String(Math.min(99, s)).padStart(2, '0')}`
}

watch(() => props.episodeId, () => void load())
watch(() => props.refreshTick, () => void load())
onMounted(async () => {
  // H13：订阅 cogen 逐场景进度（ep:cogen-progress；onCogenProgress 返回退订函数，同 onStoryboardsProgress 写法）
  const api = window.electronAPI?.episodeProduction as any
  if (typeof api?.onCogenProgress === 'function') {
    unsubscribeCogenProgress = api.onCogenProgress(
      (_event: any, data: { sceneNumber: number; totalScenes: number; status: 'start' | 'done' | 'error' }) => {
        cogenProgress.value = data
      },
    )
  }
  // 先等 provider 列表就绪再 load（load 内的 loadProjectConfig 要按 providers 校验项目 config.videoModel）
  await loadVideoProviders()
  await load()
})
onUnmounted(() => {
  unsubscribeCogenProgress?.()
  unsubscribeCogenProgress = null
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

.scene-script {
  padding: 8px 12px;
  margin: 0 8px 8px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-regular);
  line-height: 1.7;
  .ss-block { margin-bottom: 6px; }
  .ss-label {
    display: inline-block;
    margin-right: 8px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--color-info-light-9, #ecf5ff);
    color: var(--text-color-secondary);
    font-size: 11px;
  }
  .ss-dlg .ss-label { color: var(--color-primary); }
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
}

.sb-body { flex: 1; min-height: 0; display: flex; }
.sb-left {
  width: 250px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
}
.sb-center { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 20px 24px; }

.no-scenes { height: 100%; display: flex; align-items: center; justify-content: center; }
.no-storyboards { display: flex; justify-content: center; padding: 24px 0 8px; }

.seg-hint { max-width: 900px; margin-bottom: 14px; }

/* ── 按场次分组（原样式） ── */
.sb-scenes { display: flex; flex-direction: column; gap: 22px; max-width: 900px; }
.sb-scene-group { background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: var(--radius-lg); padding: 16px 18px; }
.group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.group-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
.done-mark { font-size: 12px; color: var(--color-success); }

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
  &.empty-tile {
    cursor: default;
    &:hover { border-color: var(--border-color-lighter); box-shadow: none; }
    .tile-preview { height: 110px; }
  }
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

/* S-03 拆分弹窗 */
.split-body {
  .split-hint { font-size: 12px; color: var(--text-color-secondary); margin: 0 0 10px; }
  .split-options { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .split-option { margin-right: 0; }
}
</style>
