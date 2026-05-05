<template>
  <div class="video-project-editor">
    <!-- 顶部导航 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="project-title">{{ projectStore.currentProject?.name || '加载中...' }}</span>
      </div>
      <div class="header-center">
        <!-- 剧集选择器（替代原左侧剧集列表 · spec §2.1 形态 D 左侧给资产侧栏） -->
        <el-select
          v-if="episodeStore.episodes.length > 0"
          :model-value="episodeStore.currentEpisode?.id ?? ''"
          @change="onEpisodeSelectChange"
          placeholder="选择剧集"
          size="default"
          class="episode-selector"
        >
          <el-option
            v-for="ep in episodeStore.episodes"
            :key="ep.id"
            :value="ep.id"
            :label="`第 ${ep.episodeNumber} 集 · ${ep.title}`"
          >
            <span>第 {{ ep.episodeNumber }} 集 · {{ ep.title }}</span>
            <el-tag size="small" :type="getEpisodeStatusType(ep.status)" class="episode-status-tag">
              {{ getEpisodeStatusLabel(ep.status) }}
            </el-tag>
          </el-option>
        </el-select>
        <el-button size="small" @click="openCreateEpisodeDialog" :icon="Plus" title="新建剧集" />
        <el-button
          v-if="episodeStore.currentEpisode"
          size="small"
          @click="openEditEpisodeDialog(episodeStore.currentEpisode)"
          :icon="Edit"
          title="编辑当前剧集"
        />
      </div>
      <div class="header-right">
        <el-button @click="dialogs.settings = true">
          <el-icon><Setting /></el-icon>
          项目设置
        </el-button>
      </div>
    </div>

    <!-- P6-T13 顶部 6 段阶段进度条（spec §2.1 + §2.2） -->
    <StageProgressBar
      v-if="episodeStore.currentEpisode"
      ref="progressBarRef"
      :episode-id="episodeStore.currentEpisode.id"
      @navigate-stage="onNavigateStage"
    />

    <!-- 主要内容区（spec §2.1 形态 D：左侧资产侧栏 + 主区域） -->
    <div class="editor-content">
      <!-- 左侧资产侧栏（P6-T14 · spec §2.1 第 414-418 行） -->
      <AssetSidebar
        v-if="projectId"
        :project-id="projectId"
        @select-character="(id: string) => onOpenAsset('character', id)"
        @select-location="(id: string) => onOpenAsset('location', id)"
        @select-item="(id: string) => onOpenAsset('item', id)"
        @select-voice="(id: string) => onOpenAsset('voice', id)"
        @add-character="onAddAsset('character')"
        @add-location="onAddAsset('location')"
        @add-item="onAddAsset('item')"
        @add-voice="onAddAsset('voice')"
      />

      <!-- 中间区域 - V3 stage tab -->
      <div class="center-panel">
        <template v-if="episodeStore.currentEpisode">
          <el-tabs v-model="activeTab" class="editor-tabs">
            <!--
              【已隐藏】V2 老 4 tab（剧本 / 角色绑定 / 物品绑定 / 地点绑定）
              理由：与新业务流程（spec §2.1 形态 D 6 stage）不匹配；功能已分别迁到
              ② 资产 (AssetStageView) + 后续 ③ 剧本 stage (P6-T19) + ④ 分镜 stage
              (P6-T20) + ⑤ 制作 (StageProductionTabContent)。
              彻底删除时机：P6-T17 主区域 stage 切换框架完成 + P6-T19/T20 新 stage
              view 完成 + P6-T21 数据迁移验证后。届时一并移除 import 与 dialog 依赖。
            -->

            <!-- ② 资产（P3a Task 11 · 新版资产盘点页 + Task 12/13/14 角色 / 地点 / 物品 / 语音 编辑器） -->
            <el-tab-pane label="② 资产" name="asset-v2">
              <AssetStageView
                v-if="!selectedAsset"
                :project-id="projectId"
                @open-character="(id: string) => (selectedAsset = { type: 'character', id })"
                @open-location="(id: string) => (selectedAsset = { type: 'location', id })"
                @open-item="(id: string) => (selectedAsset = { type: 'item', id })"
                @open-voice="(id: string) => (selectedAsset = { type: 'voice', id })"
                @complete="onCompleteAssetStage"
              />
              <CharacterAssetEditor
                v-else-if="selectedAsset.type === 'character'"
                :binding-id="selectedAsset.id"
                @close="selectedAsset = null"
                @saved="onAssetSaved"
              />
              <LocationAssetEditor
                v-else-if="selectedAsset.type === 'location'"
                :binding-id="selectedAsset.id"
                @close="selectedAsset = null"
                @saved="onAssetSaved"
              />
              <ItemAssetEditor
                v-else-if="selectedAsset.type === 'item'"
                :binding-id="selectedAsset.id"
                @close="selectedAsset = null"
                @saved="onAssetSaved"
              />
              <VoiceAssetEditor
                v-else-if="selectedAsset.type === 'voice'"
                :voice-id="selectedAsset.id"
                @close="selectedAsset = null"
                @saved="onAssetSaved"
              />
            </el-tab-pane>

            <!-- ⑤ 制作（P5-T23 · 多关键帧 + 重生成） -->
            <el-tab-pane label="⑤ 制作" name="production">
              <StageProductionTabContent
                :storyboards="productionStoryboards"
              />
            </el-tab-pane>

            <!-- ⑥ 合成（P6-T8/T12 · 整剧导出 MP4） -->
            <el-tab-pane label="⑥ 合成" name="compose">
              <StageComposeView
                :episode-script-id="scriptStore.currentScript?.id ?? null"
                :project-id="projectId"
              />
            </el-tab-pane>
          </el-tabs>
        </template>

        <el-empty v-else description="请选择或创建剧集" :image-size="120" />
      </div>

      <!--
        【已隐藏】右侧分镜列表（V2 path · frameImage 单图模型）
        理由：与 V3 多关键帧模型（StoryboardKeyframe 表）不匹配；分镜浏览/选择
        功能已迁到 ⑤ 制作 tab 内的 StageProductionTabContent（含分镜选择器 +
        KeyframeGrid 多关键帧网格）。
        彻底删除时机：P6-T20 ④ 分镜 stage view 完成 + P6-T17 主区域 stage 切换
        重构后，一并清理 right-panel + 相关 dialog（regenerate / synthesis /
        storyboardEdit）+ 相关方法（selectStoryboard / generateStoryboards /
        synthesizeVideo / regenerateStoryboardImage 等）。
      -->
    </div>

    <!-- P6-T15 底部迷你时间线（spec §2.1 第 420-421 行） -->
    <BottomTimeline
      v-if="episodeStore.currentEpisode"
      :episode-script-id="scriptStore.currentScript?.id ?? null"
      @preview="onPreviewEpisode"
      @select-storyboard="onSelectStoryboard"
    />

    <!-- ===== 14 个 Dialogs ===== -->

    <!-- 创建剧集 -->
    <CreateEpisodeDialog
      v-model="dialogs.createEpisode"
      :project-id="projectId"
      :initial-episode-number="episodeStore.episodes.length + 1"
      :outline-tree-data="outlineTreeData"
      @created="onEpisodeCreated"
    />

    <!-- 编辑剧集 -->
    <EditEpisodeDialog
      v-model="dialogs.editEpisode"
      :episode-id="dialogs.editingEpisodeId"
      :initial-number="dialogs.editingEpisodeNumber"
      :initial-title="dialogs.editingEpisodeTitle"
      @updated="onEpisodeUpdated"
    />

    <!-- 项目设置 -->
    <SettingsDialog
      v-model="dialogs.settings"
      :all-lw-projects="allLwProjects"
      :provider-configs="providerConfigs"
      :provider-templates="providerTemplates"
      @saved="onSettingsSaved"
    />

    <!-- 绑定角色 -->
    <BindCharacterDialog
      v-model="dialogs.bindCharacter"
      :project-id="projectId"
      :available-characters="availableCharacters"
      @bound="onAssetBound"
    />

    <!-- 绑定物品 -->
    <BindItemDialog
      v-model="dialogs.bindItem"
      :project-id="projectId"
      :available-items="availableItems"
      @bound="onAssetBound"
    />

    <!-- 绑定地点 -->
    <BindLocationDialog
      v-model="dialogs.bindLocation"
      :project-id="projectId"
      :available-locations="availableLocations"
      @bound="onAssetBound"
    />

    <!-- 生成分镜画面 -->
    <GenerateImagesDialog
      v-model="dialogs.generateImages"
      :storyboard="selectedStoryboard"
      :generating="generatingImage"
      @submit="generateSingleStoryboardImage"
    />

    <!-- 视频合成 -->
    <SynthesisDialog
      v-model="dialogs.synthesis"
      :storyboard-count="storyboardStore.storyboards.length"
      :synthesis-progress="synthesisProgress"
      @submit="synthesizeVideo"
    />

    <!-- 分镜编辑 -->
    <StoryboardEditDialog
      v-model="dialogs.storyboardEdit"
      :storyboard="dialogs.editingStoryboard"
      @saved="onStoryboardSaved"
    />

    <!-- 角色详情 -->
    <CharacterDetailDialog
      v-model="dialogs.characterDetail"
      :character-id="dialogs.detailId"
    />

    <!-- 物品详情 -->
    <ItemDetailDialog
      v-model="dialogs.itemDetail"
      :item-id="dialogs.detailId"
    />

    <!-- 地点详情 -->
    <LocationDetailDialog
      v-model="dialogs.locationDetail"
      :location-id="dialogs.detailId"
    />

    <!-- 图片预览 -->
    <ImagePreviewDialog
      v-model="dialogs.imagePreview"
      :image-url="dialogs.previewImageUrl"
    />

    <!-- 重新生成画面 -->
    <RegenerateDialog
      v-model="dialogs.regenerate"
      :storyboard="dialogs.regeneratingStoryboard"
      @submit="regenerateStoryboardImage"
    />

    <!-- 实体编辑 -->
    <EntityEditDialog
      v-model:visible="dialogs.entityEdit"
      :entity-type="dialogs.editingEntityType"
      :entity-id="dialogs.editingEntityId"
      :entity-data="dialogs.editingEntityData"
      :project-id="projectId"
      @saved="onEntitySaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Setting, Plus, MagicStick, Picture, VideoPlay,
  Delete, ZoomIn, RefreshRight, Edit
} from '@element-plus/icons-vue'
import {
  useEpWorkbenchStore,
  useEpProjectStore,
  useEpEpisodeStore,
  useEpAssetStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProductionStore,
  useEpComposeStore
} from '@/stores/episode-production'
import { useTabsStore } from '@/stores/tabs'
import type {
  VideoEpisode, Storyboard, CharacterBinding, LocationBinding, ItemBinding
} from '../../../shared/types/story-to-video.types'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'
import type { StoryCharacter, StoryLocation, StoryItem } from '../../../shared/types/longwriting.types'

import { getShotTypeLabel, getCameraAngleLabel, getCameraMovementLabel } from '@/components/episode-production/shared/shot-labels'
import { truncateTitle } from '@/components/episode-production/shared/model-config'
import { buildOutlineTree, type OutlineTreeNode } from '@/components/episode-production/shared/outline-utils'

// V3 stage tab 内容组件（保留中）
import StageProductionTabContent from '@/components/episode-production/stage-production/StageProductionTabContent.vue'
import StageComposeView from '@/components/episode-production/stage-compose/StageComposeView.vue'
// P6-T13 顶部 6 段阶段进度条（spec §2.1）
import StageProgressBar from '@/components/episode-production/workbench/StageProgressBar.vue'
// P6-T14 左侧资产侧栏（spec §2.1 第 414-418 行）
import AssetSidebar from '@/components/episode-production/workbench/AssetSidebar.vue'
// P6-T15 底部迷你时间线（spec §2.1 第 420-421 行）
import BottomTimeline from '@/components/episode-production/workbench/BottomTimeline.vue'
import type { EpisodeStatus, VideoEpisode as _VE } from '../../../shared/types/episode-production'
// V2 老 tab（剧本 / 角色绑定 / 物品绑定 / 地点绑定）已从 template 移除
// import 也跟着删除；P6-T19/T20 新 stage view 完成后会彻底删源文件
// P3a Task 11 · 资产盘点新页面（追加在原 4 tab 之后，不替换老 tab）
import AssetStageView from '@/components/episode-production/stage-asset/AssetStageView.vue'
// P3a Task 12 · 角色资产编辑器（双栏：设定卡 + 图谱）
import CharacterAssetEditor from '@/components/episode-production/stage-asset/character/CharacterAssetEditor.vue'
// P3a Task 13 · 地点资产编辑器（双栏：设定卡 + 图谱）
import LocationAssetEditor from '@/components/episode-production/stage-asset/location/LocationAssetEditor.vue'
// P3a Task 14 · 物品资产编辑器（双栏：设定卡 + 图谱 view+context）
import ItemAssetEditor from '@/components/episode-production/stage-asset/item/ItemAssetEditor.vue'
// P3a Task 14 · 语音资产编辑器（单栏：声音卡，无图谱）
import VoiceAssetEditor from '@/components/episode-production/stage-asset/voice/VoiceAssetEditor.vue'

// Dialogs
import CreateEpisodeDialog from '@/components/episode-production/dialogs/CreateEpisodeDialog.vue'
import EditEpisodeDialog from '@/components/episode-production/dialogs/EditEpisodeDialog.vue'
import SettingsDialog from '@/components/episode-production/dialogs/SettingsDialog.vue'
import BindCharacterDialog from '@/components/episode-production/dialogs/BindCharacterDialog.vue'
import BindItemDialog from '@/components/episode-production/dialogs/BindItemDialog.vue'
import BindLocationDialog from '@/components/episode-production/dialogs/BindLocationDialog.vue'
import GenerateImagesDialog from '@/components/episode-production/dialogs/GenerateImagesDialog.vue'
import SynthesisDialog from '@/components/episode-production/dialogs/SynthesisDialog.vue'
import StoryboardEditDialog from '@/components/episode-production/dialogs/StoryboardEditDialog.vue'
import CharacterDetailDialog from '@/components/episode-production/dialogs/CharacterDetailDialog.vue'
import ItemDetailDialog from '@/components/episode-production/dialogs/ItemDetailDialog.vue'
import LocationDetailDialog from '@/components/episode-production/dialogs/LocationDetailDialog.vue'
import ImagePreviewDialog from '@/components/episode-production/dialogs/ImagePreviewDialog.vue'
import RegenerateDialog from '@/components/episode-production/dialogs/RegenerateDialog.vue'
import EntityEditDialog from '@/components/episode-production/dialogs/EntityEditDialog.vue'

const route = useRoute()
const router = useRouter()
const workbenchStore = useEpWorkbenchStore()
const projectStore = useEpProjectStore()
const episodeStore = useEpEpisodeStore()
const assetStore = useEpAssetStore()
const scriptStore = useEpScriptStore()
const storyboardStore = useEpStoryboardStore()
const productionStore = useEpProductionStore()
const composeStore = useEpComposeStore()
const tabsStore = useTabsStore()

const projectId = computed(() => route.params.projectId as string)
// V2 老 tab 已隐藏；默认 ② 资产（新流程起点，P6-T18 ① 内容 stage 完成后改为 'pending'）
const activeTab = ref('asset-v2')

// P6-T13 顶部进度条引用（用于剧集状态变化后主动 reload）
const progressBarRef = ref<{ reload: () => Promise<void> } | null>(null)

/**
 * P6-T13 顶部进度条点击 → 跳到对应 tab / 提示。
 *
 * 当前 V2 老 tab 已隐藏，V3 新 stage view 部分尚未实现：
 *   - ① 内容 → P6-T18 待实现，提示
 *   - ② 资产 → 'asset-v2' tab（已可用）
 *   - ③ 剧本 → P6-T19 待实现，提示
 *   - ④ 分镜 → P6-T20 待实现，提示
 *   - ⑤ 制作 → 'production' tab（已可用）
 *   - ⑥ 合成 → 'compose' tab（已可用）
 *
 * 真正的 6 stage 主区域切换框架由 P6-T17 实现，届时本函数和 activeTab 一起重构。
 */
function onNavigateStage(status: EpisodeStatus): void {
  const map: Partial<Record<EpisodeStatus, string>> = {
    asset_prep: 'asset-v2',
    producing: 'production',
    composing: 'compose',
  }
  const target = map[status]
  if (target) {
    activeTab.value = target
    return
  }
  const todoMap: Partial<Record<EpisodeStatus, string>> = {
    pending: '① 内容 stage 待 P6-T18 实现',
    scripting: '③ 剧本 stage 待 P6-T19 实现',
    storyboarding: '④ 分镜 stage 待 P6-T20 实现',
  }
  if (todoMap[status]) {
    ElMessage.info(todoMap[status])
  } else if (status === 'completed') {
    ElMessage.info('剧集已完成')
  }
}

/**
 * P6-T14 顶部 episode dropdown change → 切换当前剧集（替代原左侧剧集列表）。
 */
async function onEpisodeSelectChange(episodeId: string): Promise<void> {
  const ep = episodeStore.episodes.find((e) => e.id === episodeId)
  if (!ep) return
  await selectEpisode(ep)
}

/**
 * P6-T14 左侧资产侧栏点击单条资产 → 跳到 ② 资产 tab + 打开对应 editor。
 */
function onOpenAsset(kind: 'character' | 'location' | 'item' | 'voice', id: string): void {
  activeTab.value = 'asset-v2'
  selectedAsset.value = { type: kind, id }
}

/**
 * P6-T14 左侧资产侧栏"+ 添加 X" → 跳到 ② 资产 tab，由 AssetStageView 处理添加。
 *
 * 当前 AssetStageView 暂不支持外部触发"添加"，本函数先跳 tab；
 * 后续 P6 follow-up 时再让 AssetStageView 暴露 addX 入口。
 */
function onAddAsset(kind: 'character' | 'location' | 'item' | 'voice'): void {
  activeTab.value = 'asset-v2'
  selectedAsset.value = null
  ElMessage.info(`${kind === 'voice' ? '语音' : kind === 'item' ? '物品' : kind === 'location' ? '地点' : '角色'}添加入口在 ② 资产 stage 中（待 P6 follow-up 接入）`)
}

/**
 * P6-T15 底部时间线"⏵ 试播" → 跳到 ⑥ 合成 stage（让用户看上次 export
 * 或直接 export 一份）。
 *
 * 真正的 in-page 视频播放器留 P6 后续 follow-up（需要 episode 级 lastExport
 * 持久化 + 视频播放器组件）。
 */
function onPreviewEpisode(): void {
  activeTab.value = 'compose'
  ElMessage.info('已跳到 ⑥ 合成 stage — 请点"导出 MP4"获得最新成片')
}

/**
 * P6-T15 底部时间线点击单个分镜 cell → 跳 ⑤ 制作 tab 选中该分镜。
 *
 * StageProductionTabContent 暂未支持外部 prop 选中具体分镜（默认选第一个）；
 * 此函数先跳 tab，待 P6 后续 follow-up 暴露 selectedStoryboardId prop。
 */
function onSelectStoryboard(storyboardId: string): void {
  void storyboardId // 保留参数；P6 后续传给 StageProductionTabContent
  activeTab.value = 'production'
}

/** P5-T23：⑤ 制作 tab 用的分镜列表（精简映射 + keyframeCount 透传） */
const productionStoryboards = computed(() =>
  storyboardStore.storyboards.map((s: any) => ({
    id: s.id,
    shotNumber: s.shotNumber,
    frameDescription: s.frameDescription,
    keyframeCount: s.keyframeCount ?? 3,
  })),
)

// ===== 数据状态 =====

// 大纲树数据
const outlineTreeData = ref<OutlineTreeNode[]>([])

// 提供商配置
const providerConfigs = ref<UserProviderConfig[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])

// 长文实体数据
const longWritingCharacters = ref<Array<{ id: string; name: string; portraitId?: string }>>([])
const longWritingItems = ref<Array<{ id: string; name: string }>>([])
const longWritingLocations = ref<Array<{ id: string; name: string }>>([])

// 人像预览图映射
const portraitPreviews = ref<Map<string, string>>(new Map())

// 所有长文项目
const allLwProjects = ref<Array<{ id: string; name: string }>>([])

// 当前选中的分镜
const selectedStoryboard = ref<Storyboard | null>(null)

// 图像生成状态
const generatingImage = ref(false)

// 合成进度
const synthesisProgress = reactive({
  phase: '',
  progress: 0
})

// ===== Dialog 状态集中管理 =====
const dialogs = reactive({
  // 创建剧集
  createEpisode: false,
  // 编辑剧集
  editEpisode: false,
  editingEpisodeId: '',
  editingEpisodeNumber: 1,
  editingEpisodeTitle: '',
  // 项目设置
  settings: false,
  // 绑定资产
  bindCharacter: false,
  bindItem: false,
  bindLocation: false,
  // 生成画面
  generateImages: false,
  // 视频合成
  synthesis: false,
  // 分镜编辑
  storyboardEdit: false,
  editingStoryboard: null as Storyboard | null,
  // 详情
  characterDetail: false,
  itemDetail: false,
  locationDetail: false,
  detailId: '',
  // 实体编辑
  entityEdit: false,
  editingEntityType: 'character' as 'character' | 'location' | 'item',
  editingEntityId: '',
  editingEntityData: null as StoryCharacter | StoryLocation | StoryItem | null,
  // 图片预览
  imagePreview: false,
  previewImageUrl: '',
  // 重新生成
  regenerate: false,
  regeneratingStoryboard: null as Storyboard | null,
})

// ===== 可绑定资产（排除已绑定的） =====

const availableCharacters = computed(() => {
  const boundIds = assetStore.characterBindings.map((b: CharacterBinding) => b.longWritingCharacterId)
  return longWritingCharacters.value.filter(c => !boundIds.includes(c.id))
})

const availableItems = computed(() => {
  const boundIds = assetStore.itemBindings.map((b: ItemBinding) => b.longWritingItemId)
  return longWritingItems.value.filter(item => !boundIds.includes(item.id))
})

const availableLocations = computed(() => {
  const boundIds = assetStore.locationBindings.map((b: LocationBinding) => b.longWritingLocationId)
  return longWritingLocations.value.filter(loc => !boundIds.includes(loc.id))
})

// ===== 子组件 open-dialog 路由 =====

function handleOpenDialog(name: string, payload?: any) {
  switch (name) {
    case 'bindCharacter':
      dialogs.bindCharacter = true
      break
    case 'bindItem':
      dialogs.bindItem = true
      break
    case 'bindLocation':
      dialogs.bindLocation = true
      break
    case 'characterDetail':
      dialogs.detailId = payload?.id || ''
      dialogs.characterDetail = true
      break
    case 'itemDetail':
      dialogs.detailId = payload?.id || ''
      dialogs.itemDetail = true
      break
    case 'locationDetail':
      dialogs.detailId = payload?.id || ''
      dialogs.locationDetail = true
      break
    case 'entityEdit':
      dialogs.editingEntityType = payload?.type || 'character'
      dialogs.editingEntityId = payload?.id || ''
      dialogs.editingEntityData = payload?.data || null
      dialogs.entityEdit = true
      break
  }
}

// ===== Dialog 触发方法 =====

function openCreateEpisodeDialog() {
  dialogs.createEpisode = true
}

function openEditEpisodeDialog(episode: VideoEpisode) {
  dialogs.editingEpisodeId = episode.id
  dialogs.editingEpisodeNumber = episode.episodeNumber
  dialogs.editingEpisodeTitle = episode.title
  dialogs.editEpisode = true
}

function openImagePreview(url: string) {
  if (url) {
    dialogs.previewImageUrl = url
    dialogs.imagePreview = true
  }
}

function openRegenerateDialog(storyboard: Storyboard) {
  dialogs.regeneratingStoryboard = storyboard
  dialogs.regenerate = true
}

function openStoryboardEditDialog(storyboard: Storyboard) {
  dialogs.editingStoryboard = storyboard
  dialogs.storyboardEdit = true
}

// ===== 分镜操作 =====

function selectStoryboard(storyboard: Storyboard) {
  if (selectedStoryboard.value?.id === storyboard.id) {
    selectedStoryboard.value = null
  } else {
    selectedStoryboard.value = storyboard
  }
}

async function generateStoryboards() {
  if (!scriptStore.currentScript) {
    ElMessage.warning('请先生成剧本')
    return
  }
  if (scriptStore.scenes.length === 0) {
    ElMessage.warning('请先拆分场景')
    return
  }

  const storyboardModel = projectStore.currentProject?.config?.storyboardModel
  if (!storyboardModel?.providerConfigId || !storyboardModel?.modelId) {
    ElMessage.warning('请先在项目设置中配置分镜生成模型')
    return
  }

  try {
    const confirm = await ElMessageBox.confirm(
      `将为 ${scriptStore.scenes.length} 个场景生成分镜，是否继续？`,
      '生成分镜',
      { confirmButtonText: '生成', cancelButtonText: '取消', type: 'info' }
    ).catch(() => false)
    if (!confirm) return

    ElMessage.info('正在生成分镜，请稍候...')
    const result = await storyboardStore.generateStoryboards(
      scriptStore.currentScript.id,
      storyboardModel.providerConfigId,
      storyboardModel.modelId
    )
    if (result) {
      ElMessage.success(`分镜生成成功，共 ${result.length} 个镜头`)
    } else {
      ElMessage.error(workbenchStore.error || '生成分镜失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成分镜失败')
  }
}

async function generateSingleStoryboardImage(styleName: string) {
  if (!selectedStoryboard.value) {
    ElMessage.warning('请先选择一个分镜')
    return
  }

  const imageModel = projectStore.currentProject?.config?.imageModel
  if (!imageModel?.providerConfigId || !imageModel?.modelId) {
    ElMessage.warning('请先在项目设置中配置画面生成模型')
    return
  }

  try {
    generatingImage.value = true
    dialogs.generateImages = false
    ElMessage.info(`正在生成镜头 ${selectedStoryboard.value.shotNumber} 的画面，请稍候...`)

    const result = await productionStore.generateStoryboardImage(
      selectedStoryboard.value.id,
      styleName,
      imageModel.providerConfigId,
      imageModel.modelId
    )

    if (result) {
      ElMessage.success('画面生成成功')
      selectedStoryboard.value = result
    } else {
      ElMessage.error(workbenchStore.error || '生成画面失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成画面失败')
  } finally {
    generatingImage.value = false
  }
}

async function regenerateStoryboardImage(styleName: string, additionalPrompt: string) {
  if (!dialogs.regeneratingStoryboard) return

  try {
    const result = await productionStore.generateStoryboardImage(
      dialogs.regeneratingStoryboard.id,
      styleName,
      undefined,
      undefined,
      additionalPrompt
    )
    if (result) {
      ElMessage.success('画面生成成功')
      dialogs.regenerate = false
    } else {
      ElMessage.error('画面生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '画面生成失败')
  }
}

async function confirmDeleteStoryboardImage(storyboard: Storyboard) {
  try {
    await ElMessageBox.confirm('确定要删除这个画面吗？删除后可以重新生成。', '删除画面', {
      type: 'warning'
    })
    // TODO: 实现删除画面逻辑
    ElMessage.success('画面已删除')
  } catch {
    // 用户取消
  }
}

async function synthesizeVideo(quality: string) {
  if (!scriptStore.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }

  try {
    synthesisProgress.phase = 'shots'
    synthesisProgress.progress = 0

    const result = await composeStore.synthesizeSceneVideo(
      scriptStore.currentScene.id,
      quality,
      (phase, progress) => {
        synthesisProgress.phase = phase
        synthesisProgress.progress = Math.round(progress)
      }
    )

    if (result) {
      ElMessage.success(`视频合成成功，时长 ${result.duration} 秒`)
      dialogs.synthesis = false
    } else {
      ElMessage.error(workbenchStore.error || '视频合成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '视频合成失败')
  } finally {
    synthesisProgress.phase = ''
    synthesisProgress.progress = 0
  }
}

// ===== 剧集操作 =====

function getEpisodeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    pending: '待处理',
    script_completed: '剧本完成',
    storyboard_completed: '分镜完成',
    production: '制作中',
    completed: '完成'
  }
  return labels[status] || status
}

function getEpisodeStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    script_completed: 'warning',
    storyboard_completed: '',
    production: '',
    completed: 'success'
  }
  return types[status] || 'info'
}

async function selectEpisode(episode: VideoEpisode) {
  await episodeStore.selectEpisode(episode)
}

async function confirmDeleteEpisode(episode: VideoEpisode) {
  try {
    await ElMessageBox.confirm(
      `确定要删除「第${episode.episodeNumber}集：${episode.title}」吗？删除后可在数据库中恢复。`,
      '删除剧集',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const success = await episodeStore.deleteEpisode(episode.id)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error(workbenchStore.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

function goBack() {
  router.push('/episode-production')
}

function goToVideoProduction() {
  if (!scriptStore.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }
  router.push(`/episode-production/${projectId.value}/production/${scriptStore.currentScene.id}`)
}

// ===== Dialog 事件回调 =====

async function onEpisodeCreated() {
  // 刷新绑定数据（主进程已经自动绑定了角色、地点、物品）
  await assetStore.loadCharacterBindings(projectId.value)
  await assetStore.loadLocationBindings(projectId.value)
  await assetStore.loadItemBindings(projectId.value)

  // 选中新创建的剧集（最后一个）
  if (episodeStore.episodes.length > 0) {
    await selectEpisode(episodeStore.episodes[episodeStore.episodes.length - 1])
  }
}

async function onEpisodeUpdated() {
  // 剧集已更新，store 中数据由 EditEpisodeDialog 内部刷新
}

async function onAssetBound() {
  // 刷新绑定列表
  await assetStore.loadCharacterBindings(projectId.value)
  await assetStore.loadLocationBindings(projectId.value)
  await assetStore.loadItemBindings(projectId.value)
}

async function onEntitySaved() {
  await assetStore.loadCharacterBindings(projectId.value)
  await assetStore.loadLocationBindings(projectId.value)
  await assetStore.loadItemBindings(projectId.value)
}

function onStoryboardSaved() {
  dialogs.editingStoryboard = null
}

async function onSettingsSaved(newLwProjectId: string, oldLwProjectId: string) {
  if (newLwProjectId !== oldLwProjectId) {
    if (newLwProjectId) {
      await loadLongWritingData(newLwProjectId)
    } else {
      outlineTreeData.value = []
      longWritingCharacters.value = []
      longWritingItems.value = []
      longWritingLocations.value = []
    }
  }
}

// ===== 数据加载 =====

async function loadProject() {
  await loadProviderConfigs()
  await loadAllLwProjects()

  await projectStore.loadProject(projectId.value)
  if (projectStore.currentProject) {
    const projectName = truncateTitle(projectStore.currentProject.name)
    tabsStore.updateTabTitle(route.path, projectName)

    await episodeStore.loadEpisodes(projectId.value)
    await assetStore.loadCharacterBindings(projectId.value)

    if (projectStore.currentProject.longWritingProjectId) {
      await loadLongWritingData(projectStore.currentProject.longWritingProjectId)
    }

    if (episodeStore.episodes.length === 1) {
      await selectEpisode(episodeStore.episodes[0])
    }
  }
}

async function loadAllLwProjects() {
  try {
    const response = await window.electronAPI.longwriting.getProjects()
    if (response.success && response.data) {
      allLwProjects.value = response.data.map((p: any) => ({ id: p.id, name: p.name }))
    }
  } catch (error) {
    console.error('加载长文项目列表失败:', error)
  }
}

async function loadLongWritingData(longWritingProjectId: string) {
  try {
    const outlineResponse = await window.electronAPI.longwriting.getOutlineTree(longWritingProjectId)
    if (outlineResponse.success && outlineResponse.data) {
      outlineTreeData.value = buildOutlineTree(outlineResponse.data)
    }

    const charResponse = await window.electronAPI.longwriting.getCharacters(longWritingProjectId)
    if (charResponse.success && charResponse.data) {
      longWritingCharacters.value = charResponse.data.map((c: any) => ({
        id: c.id, name: c.name, portraitId: c.portraitId
      }))
      await loadPortraitPreviews(charResponse.data)
    }

    const itemResponse = await window.electronAPI.longwriting.getItems(longWritingProjectId)
    if (itemResponse.success && itemResponse.data) {
      longWritingItems.value = itemResponse.data.map((item: any) => ({ id: item.id, name: item.name }))
    }

    const locationResponse = await window.electronAPI.longwriting.getLocations(longWritingProjectId)
    if (locationResponse.success && locationResponse.data) {
      longWritingLocations.value = locationResponse.data.map((loc: any) => ({ id: loc.id, name: loc.name }))
    }
  } catch (error) {
    console.error('加载长文数据失败:', error)
  }
}

async function loadPortraitPreviews(characters: Array<{ id: string; name: string; portraitId?: string }>) {
  portraitPreviews.value = new Map()
  for (const char of characters) {
    if (char.portraitId) {
      try {
        const variantResult = await window.electronAPI.portrait.getVariant(char.portraitId)
        if (variantResult.success && variantResult.data) {
          portraitPreviews.value.set(char.portraitId, variantResult.data.imagePath)
        }
      } catch (e) {
        console.error('加载人像预览失败:', e)
      }
    }
  }
}

async function loadProviderConfigs(): Promise<void> {
  try {
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// ===== P3a Task 11 / Task 12 / Task 13 / Task 14 · ② 资产 tab handlers =====
// Task 11 引入 AssetStageView 资产盘点页；
// Task 12 接入 CharacterAssetEditor，Task 13 接入 LocationAssetEditor，
// Task 14 接入 ItemAssetEditor + VoiceAssetEditor（4 类资产 editor 全覆盖）；
// 通过 selectedAsset 状态在 stage view ↔ editor 切换。

const selectedAsset = ref<{ type: 'character' | 'location' | 'item' | 'voice'; id: string } | null>(null)

function onAssetSaved() {
  ElMessage.success('保存成功')
}

function onCompleteAssetStage() {
  ElMessage.success('阶段完成（暂未持久化）')
}

// ===== 监听 =====

watch(projectId, () => {
  loadProject()
}, { immediate: true })
</script>

<style scoped lang="scss">
.video-project-editor {
  height: 100vh;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  height: 40px;
  min-height: 40px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    min-width: 100px;
  }

  .header-right {
    justify-content: flex-end;
  }

  .header-center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .project-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.editor-content {
  flex: 1;
  height: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  box-sizing: border-box;
}

.left-panel {
  width: 180px;
  min-width: 140px;
  min-height: 0;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.episode-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  min-height: 0;
}

.right-panel {
  width: 320px;
  min-height: 0;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  height: 44px;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
  }

  .panel-actions {
    display: flex;
    gap: 8px;
  }
}

.episode-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  padding-right: 40px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;

  &:hover {
    background: var(--el-fill-color-light);

    .episode-actions {
      opacity: 1;
    }
  }

  &.active {
    background: var(--el-color-primary-light-9);
  }

  .episode-number {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .episode-title {
    font-size: 14px;
    font-weight: 500;
  }

  .episode-status {
    margin-top: 4px;
  }

  .episode-actions {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    transition: opacity 0.2s;
  }
}

.editor-tabs {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 12px;
    background: var(--el-bg-color);
    height: 40px;
    min-height: 40px;
    flex-shrink: 0;
  }

  :deep(.el-tabs__nav-wrap),
  :deep(.el-tabs__nav-scroll),
  :deep(.el-tabs__nav) {
    height: 40px;
  }

  :deep(.el-tabs__item) {
    height: 40px;
    line-height: 40px;
    font-size: 13px;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  :deep(.el-tab-pane) {
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
}

// 右侧分镜列表
.storyboard-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  min-height: 0;
}

.storyboard-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-light);
  transition: border-color 0.2s, background-color 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    background: var(--el-fill-color-light);
  }

  &.selected {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  &.has-image {
    border-left: 3px solid var(--el-color-success);
  }
}

.storyboard-item-left {
  flex: 1;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.storyboard-preview {
  width: 60px;
  height: 60px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    color: #fff;
  }

  &:hover .preview-overlay {
    opacity: 1;
  }

  &.placeholder {
    background: var(--el-fill-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--el-text-color-secondary);
    font-size: 11px;
    cursor: default;
  }
}

.storyboard-info {
  flex: 1;
  min-width: 0;
}

.storyboard-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;

  .shot-number {
    font-size: 12px;
    font-weight: 500;
  }
}

.storyboard-description {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;
}

.storyboard-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.storyboard-item-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
</style>
