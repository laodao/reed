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

          <!-- S-02 关键帧画廊（一致性修复 v2：assetRef 缺省路径下停用，仅 keyframe 回切时显示） -->
          <div class="kf-gallery" v-if="videoRenderPath === 'keyframe'">
            <span class="kf-title">关键帧</span>
            <span class="kf-empty">关键帧已暂停</span>
          </div>
          <div class="kf-gallery" v-else>
            <span class="kf-title">关键帧</span>
            <span class="kf-empty" title="提示词引用资产模式：资产主图经参考板直达视频模型，关键帧链路已暂停">已停用（提示词引用资产模式）</span>
          </div>
          <div class="kf-gallery" v-if="false">
            <span class="kf-title">关键帧</span>
            <template v-if="kfGalleryHasImage">
              <div v-for="kf in kfGalleryRows" :key="kf.id" class="kf-card">
                <div class="kf-thumb">
                  <el-image v-if="kf.imagePath" :src="toImageUrl(kf.imagePath)" fit="cover" class="thumb-img" />
                  <div v-else class="thumb-empty"><el-icon :size="14"><Picture /></el-icon></div>
                  <span class="kf-role">{{ kfRoleLabel(kf.frameRole) }}</span>
                  <span
                    v-if="kf.machineCheck && !kf.machineCheck.pass"
                    class="kf-mc-badge"
                    :title="`机器校验未过：${(kf.machineCheck.failures ?? []).map(f => f.detail).join('；')}`"
                  >机器校验未过</span>
                  <span
                    v-if="kf.review"
                    class="kf-review-badge"
                    :class="`review-${kf.review.status}`"
                    :title="kfReviewTitle(kf)"
                  >{{ kfReviewLabel(kf) }}</span>
                </div>
                <div v-if="kfIneffectiveRefs(kf).length > 0" class="kf-ref-warn" :title="`模型参考图上限，以下资产图未生效：${kfIneffectiveRefs(kf).join('、')}`">
                  ⚠ {{ kfIneffectiveRefs(kf).join('、') }} 的参考图未生效
                </div>
                <div class="kf-ops">
                  <button
                    class="kf-op-btn"
                    :disabled="!!kfRegenerating"
                    title="按当前提示词与参考图重新生成此帧"
                    @click="onRegenerateKeyframe(kf)"
                  >
                    <el-icon v-if="kfRegenerating === kf.id" class="is-loading"><Loading /></el-icon>
                    <span v-else>重新生成</span>
                  </button>
                  <button class="kf-op-btn" title="手动挑选该帧各资产的参考图" @click="openKfPicker(kf)">换参考图</button>
                  <button
                    class="kf-op-btn"
                    :disabled="!!kfReviewing"
                    title="用 VLM 校验该帧与参考图/提示词的一致性"
                    @click="onReviewKeyframe(kf)"
                  >
                    <el-icon v-if="kfReviewing === kf.id" class="is-loading"><Loading /></el-icon>
                    <span v-else>校验</span>
                  </button>
                </div>
              </div>
            </template>
            <span v-else class="kf-empty">
              未生成
              <button
                class="kf-op-btn"
                :disabled="!!kfGeneratingAll"
                title="按当前提示词与已确认定妆的资产图生成分镜关键帧"
                @click="onGenerateKeyframes"
              >
                <el-icon v-if="kfGeneratingAll" class="is-loading"><Loading /></el-icon>
                <span v-else>生成关键帧</span>
              </button>
            </span>
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
              <el-radio-button value="t2v" :disabled="isComfyUIProvider" :title="isComfyUIProvider ? 'ComfyUI 网关（H3）必须提供首帧参考图，文生视频不可用' : ''">文生视频</el-radio-button>
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
          <el-empty v-if="emptyKind === 'scene'" description="本场还没有分镜">
            <el-button type="primary" :loading="sceneCogenLoading" @click="onGenerateSceneStoryboards">生成本场分镜</el-button>
          </el-empty>
          <el-empty v-else-if="emptyKind === 'all'" description="还没有分镜">
            <el-button type="primary" @click="emit('go-back')">返回列表生成</el-button>
          </el-empty>
          <el-empty v-else description="左侧选择分镜" />
        </div>
      </main>
    </div>

    <!-- S-02：换参考图（复用既有挑图 dialog；保存/保存并重生后刷新画廊） -->
    <KeyframeReferencePicker
      v-model="kfPickerOpen"
      :keyframe-id="kfPickerKeyframe?.id ?? null"
      :assets="kfPickerAssets"
      :existing-references="kfPickerExistingReferences"
      :existing-overrides="kfPickerExistingOverrides"
      @saved="onKfPickerSaved"
    />
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, Loading, ArrowLeft, VideoCamera } from '@element-plus/icons-vue'
import AssetGalleryPicker from '@/components/episode-production/storyboard/AssetGalleryPicker.vue'
import KeyframeReferencePicker from '@/components/episode-production/storyboard/KeyframeReferencePicker.vue'
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
  /** agent 改数据后由 Studio 递增，触发本页重载 */
  refreshTick?: number
}>()
const emit = defineEmits<{ 'go-back': [] }>()

const scenes = ref<any[]>([])
const shots = ref<any[]>([])
const selectedShot = ref<any>(null)
/** 空态类型：none=有分镜；scene=目标场无分镜；all=全剧无分镜 */
const emptyKind = ref<'none' | 'scene' | 'all'>('none')
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
// 一致性修复 v2（2026-09-21）：项目视频路径，缺省 assetRef（提示词引用资产；关键帧已暂停）
const videoRenderPath = ref<'assetRef' | 'keyframe'>('assetRef')
// 视频 provider / model（生成视频用）
const videoProviders = ref<Array<{ providerConfigId: string; name: string; type?: string; ready: boolean; models: Array<{ id: string; name: string }> }>>([])
const videoProviderId = ref('')
const videoModelId = ref('')
const videoModels = computed(() => videoProviders.value.find(p => p.providerConfigId === videoProviderId.value)?.models ?? [])

/** ComfyUI 网关的 H3 必须带参考图：文生视频必然失败（refs 为空直接报错），强制参考图模式 */
const isComfyUIProvider = computed(
  () => videoProviders.value.find(p => p.providerConfigId === videoProviderId.value)?.type === 'comfyui',
)
watch(isComfyUIProvider, (v) => {
  if (v) videoGenMode.value = 'ref'
})

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
    groups.push({ key: '__unsegmented__', title: '未分段镜头', status: null, statusLabel: '未分段（进入制作时自动分段）', isSegment: false, videoUrl: null, shots: unsegmented })
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
  if (!props.episodeId) { scenes.value = []; shots.value = []; promptText.value = ''; emptyKind.value = 'none'; return }
  const ep = await window.electronAPI.episodeProduction.getEpisode(props.episodeId)
  if (!ep.success || !ep.data?.scriptId) { scenes.value = []; shots.value = []; promptText.value = ''; emptyKind.value = 'none'; return }

  const scResp = await window.electronAPI.episodeProduction.listScenes(ep.data.scriptId)
  scenes.value = scResp.success ? (scResp.data || []) : []
  await loadSegments()
  emptyKind.value = 'none'
  // 指定了目标场次（来自列表页点击）：只加载该场；该场无分镜 → 本场空态，不串到别的场
  if (props.sceneId) {
    const target = scenes.value.find(s => s.id === props.sceneId)
    const sbResp = target
      ? await window.electronAPI.episodeProduction.listStoryboards(target.id)
      : null
    if (sbResp?.success && sbResp.data?.length) {
      shots.value = sbResp.data
      await ensureSegments()
      selectShot(shots.value[0])
      syncPrompt()
    } else {
      shots.value = []
      selectedShot.value = null
      promptText.value = ''
      emptyKind.value = 'scene'
    }
    return
  }
  // 未指定场次：取第一个有分镜的场次
  for (const sc of scenes.value) {
    const sbResp = await window.electronAPI.episodeProduction.listStoryboards(sc.id)
    if (sbResp.success && sbResp.data?.length) {
      shots.value = sbResp.data
      await ensureSegments()
      selectShot(shots.value[0])
      syncPrompt()
      return
    }
  }
  shots.value = []
  selectedShot.value = null
  promptText.value = ''
  emptyKind.value = 'all'
}

/** 有分镜但未分段 → 静默补齐分段（片段是制作页最小单元；completed 段后端保留） */
async function ensureSegments(): Promise<void> {
  if (!shots.value.some(sb => !segmentByShotId.value.get(sb.id))) return
  try {
    const r = await (window.electronAPI.episodeProduction as any).recomputeSegments(props.episodeId, {})
    if (r?.success) await loadSegments()
  } catch { /* 静默失败：保留未分段的单镜回退视图 */ }
}

/** 空态主按钮：生成本场分镜（ep:cogen-scene-storyboards），成功后重载 */
const sceneCogenLoading = ref(false)
async function onGenerateSceneStoryboards(): Promise<void> {
  const sc = scenes.value.find(s => s.id === props.sceneId)
  if (!sc || sceneCogenLoading.value) return
  sceneCogenLoading.value = true
  try {
    const r = await (window.electronAPI.episodeProduction as any).cogenSceneStoryboards(sc.id)
    if (r?.success) {
      ElMessage.success(`场次 ${sc.sceneNumber} 分镜已生成（${r.data?.shotCount ?? 0} 镜）`)
      await load()
    } else {
      ElMessage.error(r?.error || '生成场景分镜失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成场景分镜失败')
  } finally {
    sceneCogenLoading.value = false
  }
}

function selectShot(shot: any): void {
  selectedShot.value = shot
  void loadKeyframesForShot(shot?.id)
}

/** 由 shots 构建提示词字符串（一行一个镜头） */
function syncPrompt(): void {
  promptText.value = buildPromptText(shots.value, styleName.value)
}

/**
 * 默认生成入口：片段级生成（视频片段制 §5——一次视频调用产出多镜一段）。
 * 选中镜头须已分段；未分段时提示返回分镜列表自动分段（单镜生成走镜头行 🎬 按钮）。
 */
async function onGenerate(): Promise<void> {
  if (!selectedShot.value || generating.value) return
  const seg = selectedShotSegment.value
  if (!seg) {
    ElMessage.warning('该镜头尚未分段：请返回分镜列表（会自动分段），或用镜头行 🎬 单镜生成')
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
    if (videoGenMode.value === 'ref' && videoRenderPath.value !== 'assetRef') {
      // 旧关键帧路径（renderPath='keyframe' 回切换时才走）：片段级取首镜头首尾关键帧。
      // assetRef 路径（缺省）不走这里——参考图由后端从资产绑定解析，无需生成关键帧。
      // generateKeyframes 一次调用即产出 start+end（含 middle），故此处只需确保首镜头有带图关键帧；
      // 之后不传 forceMode，由后端 pickVideoMode 按 refs 数自动选 keyframes2video / image2video / text2video。
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
    } else if (videoRenderPath.value === 'keyframe') {
      // 旧路径回切时的纯文生入口；assetRef 缺省路径不传 forceMode（后端自动走资产参考）
      opts.forceMode = 'text2video'
    }
    const r = await (window.electronAPI.episodeProduction as any).generateSegmentVideo(
      seg.segmentId,
      opts,
    )
    if (r?.success) {
      ElMessage.success(`片段 ${seg.seq} 视频已生成（${seg.shotCount} 镜一段）`)
      await Promise.all([loadSegments(), reloadShots(), loadKeyframesForShot(selectedShot.value?.id)])
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

// ── S-02 关键帧画廊（2026-09-16）：当前镜头首尾关键帧 + 重新生成 / 换参考图 ──
interface KeyframeReviewInfo {
  status: 'pass' | 'issues' | 'error' | 'skipped'
  issues: string[]
  summary: string
  model: string
  reviewedAt: string
}

/** E2：机器校验结果（image_assets.metadata.machineCheck；未校验 → null） */
interface KeyframeMachineCheckInfo {
  pass: boolean
  failures?: Array<{ code: string; detail: string }>
}

interface KeyframeRow {
  id: string
  storyboardId: string
  frameIndex: number
  frameRole: 'start' | 'middle' | 'end' | 'extra'
  imagePath?: string | null
  /** handler join image_assets.metadata.referenceImageIds 后返回的真实参考图列表 */
  references?: Array<{
    id: string
    assetType: 'character' | 'location' | 'item' | string
    assetId: string
    assetName: string
    /** 是否实际被模型消费（能力截断后生效）；老数据恒 true */
    effective?: boolean
  }>
  /** 一致性校验结果（image_assets.metadata.review；未校验 → null） */
  review?: KeyframeReviewInfo | null
  /** 机器校验结果（image_assets.metadata.machineCheck；老数据 → null） */
  machineCheck?: KeyframeMachineCheckInfo | null
  /** 用户挑图覆盖（keyframe.referenceOverrides） */
  referenceOverrides?: Array<{ kind: 'character' | 'location' | 'item'; bindingId: string; imageId: string }>
}
const keyframes = ref<KeyframeRow[]>([])
const kfRegenerating = ref<string | null>(null)
const kfReviewing = ref<string | null>(null)
const kfGeneratingAll = ref(false)

/** 整批生成当前镜头关键帧（空态入口；生成后自动一致性校验由后端完成） */
async function onGenerateKeyframes(): Promise<void> {
  const shot = selectedShot.value
  if (!shot || kfGeneratingAll.value) return
  kfGeneratingAll.value = true
  try {
    ElMessage.info('正在生成关键帧（含自动一致性校验），可能需要 1-2 分钟…')
    const g = await window.electronAPI.episodeProduction.generateKeyframes(shot.id, styleName.value)
    if (!g?.success) {
      ElMessage.error(g?.error || '关键帧生成失败')
      return
    }
    ElMessage.success('关键帧已生成')
    await Promise.all([loadKeyframesForShot(shot.id), reloadShot(shot.id)])
  } catch (e: any) {
    ElMessage.error(e?.message || '关键帧生成失败')
  } finally {
    kfGeneratingAll.value = false
  }
}

/** 该帧被模型能力截断而未生效的参考图资产名（参考图适配 2026-09-19） */
function kfIneffectiveRefs(kf: KeyframeRow): string[] {
  return (kf.references ?? []).filter(r => r.effective === false).map(r => r.assetName)
}

function kfReviewLabel(kf: KeyframeRow): string {
  const s = kf.review?.status
  return s === 'pass'
    ? '✓ 一致'
    : s === 'issues'
      ? '⚠ 存疑'
      : s === 'skipped'
        ? '－ 未审核'
        : '校验失败'
}

function kfReviewTitle(kf: KeyframeRow): string {
  const r = kf.review
  if (!r) return ''
  const lines = [
    `校验模型：${r.model}`,
    r.summary,
    ...(r.issues ?? []).map(i => `· ${i}`),
    r.reviewedAt ? `时间：${new Date(r.reviewedAt).toLocaleString()}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

/** 手动触发单帧一致性校验（VLM），完成后刷新画廊 */
async function onReviewKeyframe(kf: KeyframeRow): Promise<void> {
  if (kfReviewing.value) return
  kfReviewing.value = kf.id
  try {
    const r = await (window.electronAPI.episodeProduction as any).reviewKeyframe(kf.id)
    if (!r?.success) {
      ElMessage.error(r?.error || '校验失败')
      return
    }
    const review = r.data as KeyframeReviewInfo
    if (review.status === 'pass') ElMessage.success('校验通过：与参考图/提示词一致')
    else if (review.status === 'issues') ElMessage.warning(`发现 ${review.issues.length} 处不一致，详见徽章悬浮提示`)
    else if (review.status === 'skipped') ElMessage.info(review.summary || '审核模型非多模态，已跳过（仅机器校验）')
    else ElMessage.error('校验调用失败（详见徽章悬浮提示）')
    await loadKeyframesForShot(kf.storyboardId)
  } catch (e: any) {
    ElMessage.error(e?.message || '校验失败')
  } finally {
    kfReviewing.value = null
  }
}

/** 画廊只展示首尾帧（start/end），按 frameIndex 升序 */
const kfGalleryRows = computed(() =>
  keyframes.value
    .filter(k => k.frameRole === 'start' || k.frameRole === 'end')
    .sort((a, b) => a.frameIndex - b.frameIndex),
)
/** 有任一帧带图才展示画廊；否则显示"未生成（生成视频时自动创建）" */
const kfGalleryHasImage = computed(() => kfGalleryRows.value.some(k => !!k.imagePath))

async function loadKeyframesForShot(shotId: string | null | undefined): Promise<void> {
  if (!shotId) { keyframes.value = []; return }
  try {
    const r = await window.electronAPI.episodeProduction.listKeyframes(shotId).catch(() => null)
    keyframes.value = (r as any)?.success ? ((r as any).data ?? []) : []
  } catch {
    keyframes.value = []
  }
}

function kfRoleLabel(role: string): string {
  return role === 'start' ? '开始帧' : role === 'end' ? '结束帧' : role === 'middle' ? '中间帧' : '附加帧'
}

/** 重新生成单帧（沿用页面级风格），完成后刷新画廊与镜头数据 */
async function onRegenerateKeyframe(kf: KeyframeRow): Promise<void> {
  if (kfRegenerating.value) return
  kfRegenerating.value = kf.id
  try {
    const r = await window.electronAPI.episodeProduction.regenerateKeyframe(kf.id, styleName.value)
    if (!r?.success) {
      ElMessage.error((r as any)?.error || '重新生成关键帧失败')
      return
    }
    ElMessage.success('关键帧已重新生成')
    await Promise.all([loadKeyframesForShot(kf.storyboardId), reloadShot(kf.storyboardId)])
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成关键帧失败')
  } finally {
    kfRegenerating.value = null
  }
}

// 换参考图：复用 KeyframeReferencePicker（保存/保存并重生后刷新画廊）
const kfPickerOpen = ref(false)
const kfPickerKeyframe = ref<KeyframeRow | null>(null)

/**
 * 该帧出场资产清单（kind/bindingId/name，picker props 契约）：
 * 角色来自本分镜 characters JSON（characterId → mentionEntities 查名字）；
 * 地点来自当前场次 locationBindingId。
 */
const kfPickerAssets = computed(() => {
  const list: Array<{ kind: 'character' | 'location' | 'item'; bindingId: string; name: string }> = []
  const chars = Array.isArray(selectedShot.value?.characters) ? selectedShot.value.characters : []
  for (const c of chars as any[]) {
    const id = typeof c?.characterId === 'string' ? c.characterId : ''
    if (!id) continue
    const ent = mentionEntities.value.find(e => e.kind === 'character' && e.id === id)
    list.push({ kind: 'character', bindingId: id, name: ent?.name ?? c.characterName ?? id.slice(0, 8) })
  }
  const locBindingId = (currentScene.value as any)?.locationBindingId
  if (locBindingId) {
    const ent = mentionEntities.value.find(e => e.kind === 'location' && e.id === locBindingId)
    list.push({ kind: 'location', bindingId: locBindingId, name: ent?.name ?? (currentScene.value as any)?.location ?? '地点' })
  }
  return list
})

const kfPickerExistingReferences = computed(() =>
  (kfPickerKeyframe.value?.references ?? []).map(r => ({
    bindingId: r.assetId,
    assetType: r.assetType,
    id: r.id,
    assetName: r.assetName,
  })),
)
const kfPickerExistingOverrides = computed(() => kfPickerKeyframe.value?.referenceOverrides ?? [])

function openKfPicker(kf: KeyframeRow): void {
  kfPickerKeyframe.value = kf
  kfPickerOpen.value = true
}

async function onKfPickerSaved(_: { regenerated: boolean }): Promise<void> {
  // 关键帧图/引用变化后同步刷新画廊引用
  await loadKeyframesForShot(selectedShot.value?.id)
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

/** 读项目 config.videoModel 作为默认视频模型（provider 未配置则保留第一个可用项） */
async function loadProjectConfig(): Promise<void> {
  if (!props.projectId) return
  const r = await window.electronAPI.episodeProduction.getProject(props.projectId)
  if (!r?.success || !r.data) return
  videoRenderPath.value = r.data.config?.renderPath === 'keyframe' ? 'keyframe' : 'assetRef'
  const vm = r.data.config?.videoModel
  if (vm?.providerConfigId && videoProviders.value.some(p => p.providerConfigId === vm.providerConfigId)) {
    videoProviderId.value = vm.providerConfigId
    const models = videoModels.value
    videoModelId.value = models.some(m => m.id === vm.modelId) ? vm.modelId : (models[0]?.id ?? '')
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
  // 2026-09-19：记录 frameDescription 实际变化的镜头，保存后提示是否重生关键帧
  const descChangedShots: any[] = []
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
      if ((sb.frameDescription ?? '') !== line.description) descChangedShots.push(sb)
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
  await promptStaleKeyframeRegen(descChangedShots)
}

/**
 * 改提示词提示重生关键帧（2026-09-19 复盘整改）：
 * 提示词变了但关键帧还是旧提示词画的，视频会继续吃旧帧 → 内容漂移且无人察觉。
 * 这里只做"检测 + 提示"，重生由用户确认（生成成本不低，不擅自触发）。
 */
async function promptStaleKeyframeRegen(changedShots: any[]): Promise<void> {
  if (changedShots.length === 0) return
  // 只提示已有带图关键帧的镜头（没生成过关键帧的无需重生）
  const stale: any[] = []
  for (const shot of changedShots) {
    const r = await window.electronAPI.episodeProduction
      .listKeyframes(shot.id)
      .catch(() => null)
    const hasImage = (((r as any)?.data || []) as any[]).some(k => k.imagePath || k.imageAssetId)
    if (hasImage) stale.push(shot)
  }
  if (stale.length === 0) return
  const labels = stale.map(s => `镜头${s.shotNumber || '?'}`).join('、')
  try {
    await ElMessageBox.confirm(
      `${labels} 的提示词已修改，但其关键帧仍基于旧提示词生成，继续使用会让视频内容与提示词脱节。是否立即重新生成关键帧？`,
      '关键帧待更新',
      { confirmButtonText: '重新生成', cancelButtonText: '暂不', type: 'warning' },
    )
  } catch {
    return // 用户选"暂不"
  }
  for (const shot of stale) {
    ElMessage.info(`正在重新生成 镜头${shot.shotNumber || '?'} 的关键帧…`)
    const g = await window.electronAPI.episodeProduction.generateKeyframes(shot.id, styleName.value)
    if (!g?.success) {
      ElMessage.error(g?.error || `镜头${shot.shotNumber || '?'} 关键帧重生失败`)
      continue
    }
    ElMessage.success(`镜头${shot.shotNumber || '?'} 关键帧已重新生成`)
  }
  await Promise.all([loadKeyframesForShot(selectedShot.value?.id), reloadShots()])
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
watch(() => props.refreshTick, () => void load())
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
  // 先 provider 列表、再应用项目 config.videoModel 默认项（顺序不能反）
  await loadVideoProviders()
  await loadProjectConfig()
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
          // 注意：不过滤 floor_plan——后端 parse-asset-refs 按未过滤 listByAsset 解析
          // @[名字@索引]，两侧列表必须逐张对齐，否则索引错位引错图
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

/* S-02 关键帧画廊 */
.kf-gallery {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  margin-top: 10px; padding: 6px 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  .kf-title { flex-shrink: 0; font-size: 12px; font-weight: 600; color: var(--text-color-secondary); }
  .kf-empty { font-size: 12px; color: var(--text-color-placeholder); display: inline-flex; align-items: center; gap: 8px; }
  .kf-card { display: flex; align-items: center; gap: 8px; }
  .kf-thumb {
    position: relative;
    width: 96px; height: 54px;
    background: #111; border-radius: 4px; overflow: hidden;
    .thumb-img { width: 100%; height: 100%; }
    .thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-color-placeholder); }
    .kf-role {
      position: absolute; left: 4px; top: 4px;
      background: rgba(0, 0, 0, .55); color: #fff;
      font-size: 10px; padding: 1px 6px; border-radius: 8px;
    }
    .kf-review-badge {
      position: absolute; right: 4px; top: 4px;
      font-size: 10px; padding: 1px 6px; border-radius: 8px;
      background: rgba(0, 0, 0, .55); color: #fff; cursor: default;
      white-space: pre-line;
      &.review-pass { background: rgba(34, 139, 34, .75); }
      &.review-issues { background: rgba(204, 132, 0, .85); }
      &.review-error { background: rgba(178, 34, 34, .8); }
      &.review-skipped { background: rgba(90, 90, 90, .7); }
    }
    .kf-mc-badge {
      position: absolute; left: 4px; bottom: 4px;
      font-size: 10px; padding: 1px 6px; border-radius: 8px;
      background: rgba(178, 34, 34, .85); color: #fff; cursor: default;
    }
  }
  .kf-ref-warn {
    max-width: 140px; font-size: 10px; line-height: 1.3;
    color: #cc8400; cursor: default;
  }
  .kf-ops { display: flex; flex-direction: column; gap: 4px; }
  .kf-op-btn {
    border: 1px solid var(--border-color-lighter); background: transparent; cursor: pointer;
    font-size: 11px; color: var(--text-color-secondary);
    padding: 2px 8px; border-radius: 4px; line-height: 1.4;
    display: inline-flex; align-items: center; gap: 4px;
    &:hover { border-color: var(--color-primary); color: var(--color-primary); }
    &:disabled { cursor: not-allowed; opacity: .5; }
  }
}
</style>
