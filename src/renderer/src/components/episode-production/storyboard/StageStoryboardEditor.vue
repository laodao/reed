<template>
  <div class="stage-sb-editor">
    <!-- 顶部工具条 -->
    <div class="edit-toolbar">
      <div class="tb-left">
        <el-button text size="small" @click="emit('go-back')">
          <el-icon><ArrowLeft /></el-icon> 返回分镜列表
        </el-button>
        <span v-if="currentScene" class="tb-title">场次 {{ currentScene.sceneNumber }}：{{ currentScene.location }}</span>
        <el-tag size="small" round effect="plain" type="info">{{ shots.length }} 镜</el-tag>
      </div>
      <div class="tb-right">
        <span class="tb-label">画面风格</span>
        <el-select v-model="styleName" size="small" placeholder="画面风格" class="style-select">
          <el-option v-for="s in stylePresets" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <span class="tb-label">视频模型</span>
        <el-select v-model="videoProviderId" size="small" placeholder="视频服务" class="provider-select" @change="onVideoProviderChange">
          <el-option v-for="p in videoProviders" :key="p.providerConfigId" :label="p.name" :value="p.providerConfigId" :disabled="!p.ready" />
        </el-select>
        <el-select v-model="videoModelId" size="small" placeholder="模型" class="model-select">
          <el-option v-for="m in videoModels" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
      </div>
    </div>

    <!-- 主体：左资产图集选择器 + 中左 SHT 列表 + 中央编辑器 -->
    <div class="edit-body">
      <!-- 左：资产图集（点击看所有图，拖图到提示词框 @ 引用） -->
      <aside class="edit-assets">
        <AssetGalleryPicker :project-id="projectId" />
      </aside>

      <aside class="edit-left">
        <div class="shot-list">
          <template v-for="group in shotGroups" :key="group.key">
            <!-- 片段卡片：左侧唯一条目（视频缩略图挂在片段上）；分镜脚本已在提示词中逐行展示，不再单列 -->
            <div
              v-if="group.isSegment"
              class="seg-card-item"
              :class="{ active: group.shots.some(s => s.id === selectedShot?.id) }"
              :data-status="group.status"
              @click="selectShot(group.shots[0])"
            >
              <div class="seg-card-thumb">
                <video v-if="group.videoUrl" :src="group.videoUrl" class="thumb-img" muted preload="metadata" />
                <div v-else class="thumb-empty"><el-icon :size="16"><Picture /></el-icon><span>{{ group.statusLabel }}</span></div>
              </div>
              <div class="seg-card-info">
                <span class="seg-group-title">{{ group.title }}</span>
                <span class="seg-group-status" :class="`st-${group.status}`">{{ group.statusLabel }}</span>
              </div>
            </div>
            <!-- 未分段提示头（未分段的存量项目仍按镜头列出，保留单镜生成入口） -->
            <template v-else>
              <div class="seg-group-head">
                <span class="seg-group-title">{{ group.title }}</span>
                <span class="seg-group-status st-none">{{ group.statusLabel }}</span>
              </div>
              <div
                v-for="shot in group.shots"
                :key="shot.id"
                class="shot-item"
                :class="{ active: selectedShot?.id === shot.id }"
                @click="selectShot(shot)"
              >
                <div v-if="frameUrl(shot)" class="shot-thumb">
                  <el-image :src="frameUrl(shot)" fit="cover" class="thumb-img" />
                </div>
                <div class="shot-meta">
                  <span class="shot-no">SHT-{{ pad(shot.shotNumber) }}</span>
                  <span class="shot-dur">{{ durationLabel(shot.duration) }}</span>
                  <button
                    class="shot-gen-btn"
                    title="单镜生成（仅该镜头一段视频）"
                    :disabled="generating"
                    @click.stop="onGenerateSingle(shot)"
                  >
                    🎬
                  </button>
                </div>
              </div>
            </template>
          </template>
        </div>
      </aside>

      <main class="edit-center">
        <template v-if="selectedShot">
          <!-- 预览区 -->
          <div class="preview-area">
            <video
              v-if="previewVideoUrl"
              :src="previewVideoUrl"
              class="preview-video"
              controls
              autoplay
              loop
              muted
            />
            <el-image v-else-if="frameUrl(selectedShot)" :src="frameUrl(selectedShot)" fit="contain" class="preview-img" />
            <div v-else class="preview-empty">
              <el-icon :size="40"><VideoCamera /></el-icon>
              <span class="pe-text">编辑提示词 + 生成片段视频</span>
            </div>
            <div v-if="generating" class="gen-overlay"><el-icon class="is-loading" :size="28"><Loading /></el-icon></div>
            <span v-if="previewIsSegmentVideo" class="seg-video-badge">片段视频 · {{ selectedShotSegment?.shotCount ?? '?' }} 镜一段</span>
          </div>

          <!-- 提示词富文本（一个整体框，一行一个镜头；提示词本体就是一个字符串字段） -->
          <ShotPromptEditor
            v-model="promptText"
            :entities="mentionEntities"
            :style-options="styleOptions"
            @update:model-value="dirty = true"
          />

          <!-- 操作 -->
          <div class="edit-actions">
            <el-radio-group v-model="videoGenMode" size="small" class="gen-mode">
              <el-radio-button value="t2v">文生视频</el-radio-button>
              <el-radio-button value="ref">参考图模式</el-radio-button>
            </el-radio-group>
            <el-button type="primary" :loading="generating" @click="onGenerate">
              <el-icon><VideoCamera /></el-icon>
              生成片段视频
            </el-button>
            <el-button :disabled="!dirty" @click="onSave">保存</el-button>
          </div>
        </template>

        <div v-else class="no-shot">
          <el-empty description="左侧选择分镜" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M5 分镜制作页（tab 宿主内的完整左+中央工作区，参照项目分镜制作页.png）。
 * 左：SHT 分镜列表按视频片段分组（视频片段制，2026-09-04 重构批次 B）；中：大预览 + 片段提示词富文本。
 *
 * 生成入口：主按钮「生成片段视频」走片段级（ep:generate-segment-video，多镜一段，
 * 默认 text2video）；单镜生成保留在镜头行 🎬 按钮（ep:generate-video-segment，行为不动）。
 * 预览：镜头自身视频优先，无则回退所属片段视频。
 *
 * 数据模型：编辑单位 = 视频片段（一段待生成视频，含多个镜头）。提示词本体就是一
 * 个字符串字段（一行一个镜头），富文本只做展示/交互。本组件把当前场次全部镜头的
 * 参数（shotType/cameraMovement/duration/style）与描述（frameDescription）拼成一个
 * 多行字符串传给 ShotPromptEditor；保存时把字符串解析回逐镜写回各自 frameDescription，
 * 并同步 shotType/cameraMovement/duration 列，供下游消费。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, Loading, ArrowLeft, VideoCamera } from '@element-plus/icons-vue'
import AssetGalleryPicker from '@/components/episode-production/storyboard/AssetGalleryPicker.vue'
import ShotPromptEditor, {
  type MentionEntity,
  type ParamOption,
} from '@/components/episode-production/storyboard/ShotPromptEditor.vue'
import { toImageUrl, toVideoUrl } from '@/utils/asset-url'
import { buildPromptText, splitPromptText, type PromptLine } from '@/components/episode-production/storyboard/storyboard-prompt-format'

const props = defineProps<{
  episodeId: string
  projectId: string
  /** 指定编辑的场次（来自列表页点击）；为空则取第一个有分镜的场次 */
  sceneId?: string | null
  contextHint?: string | null
}>()
const emit = defineEmits<{ 'go-back': [] }>()

const scenes = ref<any[]>([])
const shots = ref<any[]>([])
const selectedShot = ref<any>(null)
const promptText = ref('')
const generating = ref(false)
const dirty = ref(false)
const styleName = ref('cinematic')
const stylePresets = ref<Array<{ id: string; name: string }>>([])
const mentionEntities = ref<MentionEntity[]>([])
/**
 * 视频生成模式：
 *  - t2v 文生视频（默认，向后兼容：forceMode=text2video，提示词直喂视频模型）
 *  - ref 参考图模式：先确保关键帧存在（关键帧生成会吃提示词里的 @资产引用图），
 *    然后不传 forceMode，由后端 pickVideoMode 按关键帧数量自动选
 *    image2video / keyframes2video。
 */
const videoGenMode = ref<'t2v' | 'ref'>('t2v')
// 视频 provider / model（生成视频用）
const videoProviders = ref<Array<{ providerConfigId: string; name: string; ready: boolean; models: Array<{ id: string; name: string }> }>>([])
const videoProviderId = ref('')
const videoModelId = ref('')
const videoModels = computed(() => videoProviders.value.find(p => p.providerConfigId === videoProviderId.value)?.models ?? [])

const styleOptions = computed<ParamOption[]>(() =>
  stylePresets.value.map((p) => ({ value: p.id, label: p.name })),
)

const currentScene = computed(() => scenes.value.find(s => s.id === selectedShot.value?.sceneScriptId) || null)

// ── 视频片段制（2026-09-04 重构批次 B）：左侧列表按片段分组，默认生成入口走片段级 ──
/** 片段预览条目（与后端 SegmentPreviewItem 对齐，只取本页需要的字段） */
interface SegmentInfo {
  segmentId: string
  seq: number
  sceneId: string
  status: 'pending' | 'generating' | 'completed' | 'error'
  shotCount: number
  estDuration: number
  videoPath: string | null
  storyboardIds: string[]
}
const segments = ref<SegmentInfo[]>([])

/** storyboardId → 所属片段 */
const segmentByShotId = computed(() => {
  const map = new Map<string, SegmentInfo>()
  for (const seg of segments.value) {
    for (const id of seg.storyboardIds) map.set(id, seg)
  }
  return map
})

/** 左侧列表：主条目 = 片段卡片（含视频缩略图）；分镜为片段下的脚本行；未分段镜头归入"未分段"组（置顶提示） */
const shotGroups = computed(() => {
  const groups: Array<{ key: string; title: string; status: SegmentInfo['status'] | null; statusLabel: string; isSegment: boolean; videoUrl: string | null; shots: any[] }> = []
  const bySeg = new Map<string, any[]>()
  const unsegmented: any[] = []
  for (const shot of shots.value) {
    const seg = segmentByShotId.value.get(shot.id)
    if (!seg) { unsegmented.push(shot); continue }
    const arr = bySeg.get(seg.segmentId) ?? []
    arr.push(shot)
    bySeg.set(seg.segmentId, arr)
  }
  if (unsegmented.length > 0) {
    groups.push({ key: '__unsegmented__', title: '未分段镜头', status: null, statusLabel: '回列表页点「重新分段」', isSegment: false, videoUrl: null, shots: unsegmented })
  }
  const statusLabelOf = (s: SegmentInfo['status']) =>
    ({ pending: '待生成', generating: '生成中', completed: '已完成', error: '失败' } as const)[s]
  const segsSorted = [...segments.value]
    .filter(seg => bySeg.has(seg.segmentId))
    .sort((a, b) => a.seq - b.seq)
  for (const seg of segsSorted) {
    groups.push({
      key: seg.segmentId,
      title: `片段 ${seg.seq} · ${seg.shotCount} 镜 · 约${(seg.estDuration ?? 0).toFixed(0)}s`,
      status: seg.status,
      statusLabel: statusLabelOf(seg.status),
      isSegment: true,
      videoUrl: seg.videoPath ? toVideoUrl(seg.videoPath) : null,
      shots: bySeg.get(seg.segmentId)!,
    })
  }
  return groups
})

/** 当前选中镜头所属片段 */
const selectedShotSegment = computed<SegmentInfo | null>(() =>
  selectedShot.value ? (segmentByShotId.value.get(selectedShot.value.id) ?? null) : null,
)

/** 预览视频：镜头自身视频优先；无则回退所属片段的视频（片段级生成不写 shot.videoPath） */
const previewVideoUrl = computed<string | null>(() => {
  if (!selectedShot.value) return null
  return videoUrl(selectedShot.value)
    ?? (selectedShotSegment.value?.videoPath ? toVideoUrl(selectedShotSegment.value.videoPath) : null)
})
const previewIsSegmentVideo = computed(() =>
  !!selectedShot.value && !videoUrl(selectedShot.value) && !!selectedShotSegment.value?.videoPath,
)

async function loadSegments(): Promise<void> {
  if (!props.episodeId) { segments.value = []; return }
  try {
    const r = await (window.electronAPI.episodeProduction as any).listSegments(props.episodeId)
    segments.value = r?.success ? (r.data?.segments ?? []) : []
  } catch {
    segments.value = []
  }
}

function pad(n?: number): string {
  return String(n || 0).padStart(2, '0')
}
function durationLabel(d?: number): string {
  return `00:${String(Math.min(99, d || 0)).padStart(2, '0')}`
}
function frameUrl(sb: any): string | null {
  const img = sb.frameImage
  const p = img?.filePath || img?.url || (sb as any).frameImagePath
  return p ? toImageUrl(p) : null
}
function videoUrl(sb: any): string | null {
  const vp = sb.videoPath
  return vp ? toVideoUrl(vp) : null
}

async function load(): Promise<void> {
  if (!props.episodeId) { scenes.value = []; shots.value = []; promptText.value = ''; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { scenes.value = []; shots.value = []; promptText.value = ''; return }

  const scResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  scenes.value = scResp.success ? (scResp.data || []) : []
  void loadSegments()
  // 优先加载指定场次（来自列表页点击）；否则取第一个有分镜的场次
  const target = props.sceneId ? scenes.value.find(s => s.id === props.sceneId) : null
  const order = target ? [target, ...scenes.value.filter(s => s.id !== target.id)] : scenes.value
  for (const sc of order) {
    const sbResp = await window.electronAPI.episodeProduction.listStoryboards(sc.id)
    if (sbResp.success && sbResp.data?.length) {
      shots.value = sbResp.data
      selectShot(shots.value[0])
      syncPrompt()
      return
    }
  }
  shots.value = []
  selectedShot.value = null
  promptText.value = ''
}

function selectShot(shot: any): void {
  selectedShot.value = shot
}

/** 由 shots 构建提示词字符串（一行一个镜头） */
function syncPrompt(): void {
  promptText.value = buildPromptText(shots.value, styleName.value)
}

/**
 * 默认生成入口：片段级生成（视频片段制 §5——一次视频调用产出多镜一段）。
 * 选中镜头须已分段；未分段时引导回列表页「重新分段」（单镜生成走镜头行 🎬 按钮）。
 */
async function onGenerate(): Promise<void> {
  if (!selectedShot.value || generating.value) return
  const seg = selectedShotSegment.value
  if (!seg) {
    ElMessage.warning('该镜头尚未分段：请返回分镜列表点「重新分段」（或用镜头行 🎬 单镜生成）')
    return
  }
  if (!videoProviderId.value || !videoModelId.value) {
    ElMessage.warning('请先在右上角选择视频模型')
    return
  }
  generating.value = true
  try {
    // 先保存字段（含提示词 → frameDescription），片段提示词由后端按 segment_seq 聚合
    await doSave()
    const opts: Record<string, unknown> = {
      providerConfigId: videoProviderId.value,
      modelId: videoModelId.value,
    }
    if (videoGenMode.value === 'ref') {
      // 参考图模式：片段级 V1 首帧=首镜头关键帧（§5）。确保首镜头有带图关键帧后不传
      // forceMode，由后端 pickVideoMode 自动选 image2video / text2video。
      const firstShotId = seg.storyboardIds[0]
      if (firstShotId) {
        const kfResp = await window.electronAPI.episodeProduction
          .listKeyframes(firstShotId)
          .catch(() => null)
        const hasKeyframeImage = (((kfResp as any)?.data || []) as any[]).some(
          (k) => k.imagePath || k.imageAssetId,
        )
        if (!hasKeyframeImage) {
          ElMessage.info('参考图模式：正在为片段首镜头生成关键帧（@引用图作为参考），可能需要 1-2 分钟…')
          const g = await window.electronAPI.episodeProduction.generateKeyframes(
            firstShotId,
            styleName.value,
          )
          if (!g?.success) {
            ElMessage.error(g?.error || '关键帧生成失败')
            return
          }
        }
      }
    } else {
      // 文生视频（默认）：片段级默认走 text2video
      opts.forceMode = 'text2video'
    }
    const r = await (window.electronAPI.episodeProduction as any).generateSegmentVideo(
      seg.segmentId,
      opts,
    )
    if (r?.success) {
      ElMessage.success(`片段 ${seg.seq} 视频已生成（${seg.shotCount} 镜一段）`)
      await Promise.all([loadSegments(), reloadShots()])
    } else {
      ElMessage.error(r?.error || '生成失败')
      await loadSegments()
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

/** 单镜生成（保留既有能力）：仅该镜头一段视频，写 storyboard.video_path */
async function onGenerateSingle(shot: any): Promise<void> {
  if (!shot || generating.value) return
  if (!videoProviderId.value || !videoModelId.value) {
    ElMessage.warning('请先在右上角选择视频模型')
    return
  }
  selectShot(shot)
  generating.value = true
  try {
    // 先保存字段（含提示词 → frameDescription），再用提示词直接生成视频
    await doSave()
    const opts: Record<string, unknown> = {
      providerConfigId: videoProviderId.value,
      modelId: videoModelId.value,
    }
    if (videoGenMode.value === 'ref') {
      // 参考图模式：确保有带图关键帧（@资产引用图在关键帧生成时作为参考图进入），
      // 之后不传 forceMode，让后端 pickVideoMode 按关键帧数量自动选模式。
      const kfResp = await window.electronAPI.episodeProduction
        .listKeyframes(shot.id)
        .catch(() => null)
      const hasKeyframeImage = (((kfResp as any)?.data || []) as any[]).some(
        (k) => k.imagePath || k.imageAssetId,
      )
      if (!hasKeyframeImage) {
        ElMessage.info('参考图模式：正在生成关键帧（@引用图作为参考），可能需要 1-2 分钟…')
        const g = await window.electronAPI.episodeProduction.generateKeyframes(
          shot.id,
          styleName.value,
        )
        if (!g?.success) {
          ElMessage.error(g?.error || '关键帧生成失败')
          return
        }
      }
      // 不设置 opts.forceMode —— 后端按关键帧数量自动 pickVideoMode
    } else {
      // 文生视频（默认）：保持原有行为
      opts.forceMode = 'text2video'
    }
    const r = await window.electronAPI.episodeProduction.generateVideoSegment(
      shot.id,
      opts,
    )
    if (r.success) {
      ElMessage.success('视频已生成')
      await reloadShot(shot.id)
    } else {
      ElMessage.error(r.error || '生成失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

/** 重新拉取当前场次镜头列表（片段级生成后 shots status 联动置 completed） */
async function reloadShots(): Promise<void> {
  const sceneId = selectedShot.value?.sceneScriptId ?? currentScene.value?.id
  if (!sceneId) return
  const r = await window.electronAPI.episodeProduction.listStoryboards(sceneId)
  if (r?.success && r.data?.length) {
    shots.value = r.data
    const cur = r.data.find((s: any) => s.id === selectedShot.value?.id)
    if (cur) selectedShot.value = cur
  }
}

/** 加载可用的视频 provider（带模型的），默认选第一个可用的 */
async function loadVideoProviders(): Promise<void> {
  try {
    const r = await window.electronAPI.episodeProduction.listVideoProviders()
    const list = (r.success ? r.data : []) || []
    videoProviders.value = list
    const firstReady = list.find(p => p.ready && p.models.length > 0) ?? list[0]
    if (firstReady) {
      videoProviderId.value = firstReady.providerConfigId
      videoModelId.value = firstReady.models[0]?.id ?? ''
    }
  } catch (e: any) {
    console.error('[StageStoryboardEditor] 加载视频模型失败', e)
  }
}

function onVideoProviderChange(): void {
  // 切换服务时选中其第一个模型
  videoModelId.value = videoModels.value[0]?.id ?? ''
}

async function onSave(): Promise<void> {
  await doSave()
}

/** 把提示词字符串解析回逐镜写回 frameDescription（并同步各列） */
async function doSave(): Promise<void> {
  if (!promptText.value || !shots.value.length) return
  const parsed = splitPromptText(promptText.value)
  // 按「镜头N」编号对齐写回，而不是按下标位置：用户在编辑器里删/插行后，
  // 位置对齐会把后续镜头的描述整体前移/后移写错对象（串镜污染）。
  // 编号缺失的行（非标准行）不会命中任何镜头 → 跳过，不覆盖。
  const byShotNo = new Map<number, PromptLine>()
  for (const line of parsed) byShotNo.set(line.shotNumber, line)
  let saved = 0
  let failed = 0
  let unmatched = 0
  for (const sb of shots.value) {
    const no = sb.shotNumber || 0
    const line = byShotNo.get(no)
    if (!line) {
      unmatched++
      continue
    }
    const shotType = line.params['景别']
    const cameraMovement = line.params['运镜']
    const duration = Number(line.params['时长']) || sb.duration || 4
    const patch: Record<string, unknown> = {
      frameDescription: line.description,
    }
    if (shotType) patch.shotType = shotType
    if (cameraMovement) patch.cameraMovement = cameraMovement
    if (duration) patch.duration = duration
    const r = await window.electronAPI.episodeProduction.updateStoryboard(sb.id, patch)
    if (r.success) {
      saved++
      const idx = shots.value.findIndex((s) => s.id === sb.id)
      if (idx !== -1) shots.value[idx] = { ...shots.value[idx], ...patch }
    } else {
      failed++
    }
  }
  // 行数与镜头数不一致时明确提示（防静默串镜/漏镜）
  if (parsed.length !== shots.value.length) {
    ElMessage.warning(
      `提示词行数（${parsed.length}）与镜头数（${shots.value.length}）不一致，已按镜头编号对齐保存${unmatched > 0 ? `，${unmatched} 个镜头无对应行未改动` : ''}；请检查是否有遗漏`,
    )
  }
  if (failed > 0) {
    ElMessage.error(`保存失败 ${failed} 处`)
  } else if (saved > 0) {
    ElMessage.success(`已保存 ${saved} 个镜头`)
    dirty.value = false
  }
}

async function reloadShot(shotId: string): Promise<void> {
  const r = await window.electronAPI.episodeProduction.getStoryboard(shotId)
  if (r.success) {
    const idx = shots.value.findIndex(s => s.id === shotId)
    if (idx !== -1) shots.value[idx] = r.data
    selectedShot.value = r.data
  }
}

watch(() => [props.episodeId, props.sceneId] as const, () => void load())
watch(styleName, () => {
  // 页面级风格变化 → 同步每行风格参数
  if (!promptText.value) return
  promptText.value = promptText.value.split('\n').map((line) => {
    const m = line.match(/^镜头(\d+)\s*\[([^\]]*)\]\s*(.*)$/)
    if (!m) return line
    const params = m[2].split('|').filter(Boolean).map((seg) => {
      const idx = seg.indexOf('=')
      const key = idx > 0 ? seg.slice(0, idx) : ''
      return key === '风格' ? `风格=${styleName.value}` : seg
    })
    return `镜头${m[1]} [${params.join('|')}] ${m[3]}`
  }).join('\n')
  dirty.value = true
})
onMounted(async () => {
  const sp = await window.electronAPI.episodeProduction.getStylePresets()
  if (sp.success && sp.data?.length) stylePresets.value = sp.data
  void loadVideoProviders()
  await loadMentionEntities()
  void load()
})

async function loadMentionEntities(): Promise<void> {
  if (!props.projectId) { mentionEntities.value = []; return }
  try {
    const root = (window as any).electronAPI?.episodeProduction?.asset
    const r = await root.projectSummary(props.projectId)
    if (r?.success && r.data) {
      const base: Array<{ id: string; name: string; kind: 'character' | 'location' | 'item' }> = []
      const build = (list: any[], kind: 'character' | 'location' | 'item') =>
        (list || []).forEach((a: any) => base.push({ id: a.bindingId || a.id, name: a.name, kind }))
      build(r.data.characters || [], 'character')
      build(r.data.locations || [], 'location')
      build(r.data.items || [], 'item')
      // 并行取每个资产的图集（用于 @[名字@索引] 精确引用）
      const withImages = await Promise.all(base.map(async (e) => {
        try {
          const imgResp = await root.image.listByAsset(e.kind, e.id)
          const imgs = (imgResp?.success ? imgResp.data : []) || []
          return { ...e, images: imgs.map((im: any) => ({ id: im.id, path: im.imagePath || im.url || '' })) }
        } catch {
          return { ...e, images: [] }
        }
      }))
      mentionEntities.value = withImages as MentionEntity[]
    }
  } catch (e: any) {
    console.error('[StageStoryboardEditor] 加载资产失败', e)
  }
}
</script>

<style lang="scss" scoped>
.stage-sb-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.edit-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  .tb-left { display: flex; align-items: center; gap: 8px; }
  .tb-title { font-size: 14px; font-weight: 600; color: var(--text-color-primary); }
  .tb-right { display: flex; align-items: center; gap: 8px; }
  .tb-label { font-size: 12px; color: var(--text-color-secondary); }
  .style-select { width: 140px; }
  .provider-select { width: 130px; }
  .model-select { width: 140px; }
}

.edit-body { flex: 1; min-height: 0; display: flex; }
.edit-assets {
  width: 260px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
  overflow: hidden;
}
.edit-left {
  width: 200px; flex-shrink: 0;
  border-right: 1px solid var(--border-color-lighter);
  background: var(--bg-color); min-height: 0;
  overflow-y: auto; padding: 8px;
}
.shot-list { display: flex; flex-direction: column; gap: 8px; }
.seg-group-head {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 4px 6px; margin-top: 4px;
  font-size: 11px; color: var(--text-color-secondary);
  border-bottom: 1px dashed var(--border-color-lighter);
  &:first-child { margin-top: 0; }
  .seg-group-title { font-weight: 600; color: var(--text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg-group-status { flex-shrink: 0; color: var(--text-color-placeholder); }
}
/* 片段卡片：左侧列表主条目（视频缩略图唯一挂载点） */
.seg-card-item {
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); }
  &.active { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light-9); }
  &[data-status='completed'] { border-left: 3px solid var(--color-success); }
  &[data-status='error'] { border-left: 3px solid var(--color-danger); }
  &[data-status='generating'] { border-left: 3px solid var(--color-warning); }
  .seg-card-thumb {
    height: 90px; background: #111;
    display: flex; align-items: center; justify-content: center;
    .thumb-img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-empty { display: flex; flex-direction: column; align-items: center; gap: 3px; color: var(--text-color-placeholder); font-size: 10px; }
  }
  .seg-card-info { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 10px; }
  .seg-group-title { font-size: 11px; font-weight: 600; color: var(--text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg-group-status { flex-shrink: 0; font-size: 11px; color: var(--text-color-placeholder); &.st-completed { color: var(--color-success); } &.st-error { color: var(--color-danger); } &.st-generating { color: var(--color-warning); } }
}
.shot-gen-btn {
  border: none; background: transparent; cursor: pointer; font-size: 12px;
  padding: 0 2px; border-radius: 4px; line-height: 1.4;
  &:hover { background: var(--fill-color); }
  &:disabled { cursor: not-allowed; opacity: .4; }
}
.seg-video-badge {
  position: absolute; left: 10px; top: 10px;
  background: rgba(0, 0, 0, .55); color: #fff;
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
}
.shot-item {
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); }
  &.active { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light-9); }
  .shot-thumb {
    height: 80px; background: var(--fill-color-lighter);
    display: flex; align-items: center; justify-content: center;
    .thumb-img { width: 100%; height: 100%; object-fit: cover; }
    .thumb-empty { display: flex; flex-direction: column; align-items: center; gap: 3px; color: var(--text-color-placeholder); font-size: 10px; }
  }
  .shot-meta { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; }
  .shot-no { font-size: 12px; font-weight: 600; color: var(--text-color-primary); }
  .shot-dur { font-size: 11px; color: var(--text-color-placeholder); }
}

.edit-center { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 16px 20px; }
.preview-area {
  position: relative;
  flex: 1; min-height: 0;
  background: #111;
  border-radius: var(--radius-lg);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  .preview-img { max-width: 100%; max-height: 100%; }
  .preview-video { max-width: 100%; max-height: 100%; object-fit: contain; }
  .preview-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-color-placeholder); .pe-text { font-size: 13px; } }
  .gen-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 26px; }
}

.edit-actions { display: flex; gap: 8px; margin-top: 12px; }
.no-shot { flex: 1; display: flex; align-items: center; justify-content: center; }
</style>
