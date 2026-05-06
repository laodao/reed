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
      <!--
        左侧资产侧栏（P6-T14 · spec §2.1 第 414-418 行）

        spec §2.1 第 425 行字面要求"任何阶段都可见"，但用户反馈：
        - ① 内容 stage：资产还没生产出来（识别要素是雏形，不算资产）
        - ② 资产 stage：主区域已详细管理资产，左侧侧栏视觉重复

        因此 ①/② 时隐藏；其他 stage 保留（③④⑤⑥）。
        context-aware 高亮（按当前 stage 关联资产）= P6-T22 follow-up。
      -->
      <AssetSidebar
        v-if="projectId && showAssetSidebar"
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

      <!-- 中间区域 - 主区域 stage 切换（P6-T17 · spec §2.1 形态 D） -->
      <div class="center-panel">
        <template v-if="episodeStore.currentEpisode">
          <!--
            P6-T17 主区域 stage 切换：
            按 spec §2.1 6 stage 顺序：① 内容 / ② 资产 / ③ 剧本 / ④ 分镜 / ⑤ 制作 / ⑥ 合成
            activeTab 类型对齐 EpisodeStatus（pending / asset_prep / scripting /
            storyboarding / producing / composing），让顶部进度条点击直接驱动
            主区域，不再走 tab name 字符串。
            ① ③ ④ 三个 stage view 待 P6-T18/T19/T20 实现，目前用 StagePlaceholder
            占位 — 不再让用户看到突然的"无 tab"或"提示弹框"，而是真实可见的占位
            页面，明确说明"待哪个 task 实现"。
          -->
          <el-tabs v-model="activeTab" class="editor-tabs">
            <!-- ① 内容（P6-T18 · spec §2.2 第 433 行） -->
            <el-tab-pane label="① 内容" name="pending">
              <StageContentView
                :episode="episodeStore.currentEpisode"
                @confirmed="onContentConfirmed"
              />
            </el-tab-pane>

            <!-- ② 资产 -->
            <el-tab-pane label="② 资产" name="asset_prep">
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

            <!--
              ③ 剧本（FU2 · spec §2.2 第 435 行 + §4.1）
              V3 StageScriptView：场景卡片列表 + AI 生成 + ScriptCompletenessPanel
              + "修复缺失绑定" + "剧本定稿" 按钮。替代 V2 ScriptTabContent。
            -->
            <el-tab-pane label="③ 剧本" name="scripting">
              <StageScriptView :project-id="projectId" />
            </el-tab-pane>

            <!-- ④ 分镜（P6-T20 · spec §2.2 第 436 行 + §4.5） -->
            <el-tab-pane label="④ 分镜" name="storyboarding">
              <StageStoryboardView
                :episode-script-id="scriptStore.currentScript?.id ?? null"
                :project-id="projectId"
                @edit-storyboard="onEditStoryboardFromStage"
                @jump-to-production="onJumpToProductionWithSb"
              />
            </el-tab-pane>

            <!-- ⑤ 制作 -->
            <el-tab-pane label="⑤ 制作" name="producing">
              <StageProductionTabContent
                :storyboards="productionStoryboards"
              />
            </el-tab-pane>

            <!-- ⑥ 合成 -->
            <el-tab-pane label="⑥ 合成" name="composing">
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

    <!-- 分镜编辑（StageStoryboardView 触发） -->
    <StoryboardEditDialog
      v-model="dialogs.storyboardEdit"
      :storyboard="dialogs.editingStoryboard"
      @saved="onStoryboardSaved"
    />

    <!-- 角色 / 物品 / 地点 详情（V2 路径触发已删除，但 dialog 保留供
         未来 stage view 可能复用）— P6 follow-up 时确认无引用再彻底删 -->
    <CharacterDetailDialog
      v-model="dialogs.characterDetail"
      :character-id="dialogs.detailId"
    />
    <ItemDetailDialog
      v-model="dialogs.itemDetail"
      :item-id="dialogs.detailId"
    />
    <LocationDetailDialog
      v-model="dialogs.locationDetail"
      :location-id="dialogs.detailId"
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
  useEpActiveContextStore
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
// FU2 ③ 剧本 stage view（V3 重写，替代 V2 ScriptTabContent）
import StageScriptView from '@/components/episode-production/stage-script/StageScriptView.vue'
// P6-T13 顶部 6 段阶段进度条（spec §2.1）
import StageProgressBar from '@/components/episode-production/workbench/StageProgressBar.vue'
// P6-T14 左侧资产侧栏（spec §2.1 第 414-418 行）
import AssetSidebar from '@/components/episode-production/workbench/AssetSidebar.vue'
// P6-T15 底部迷你时间线（spec §2.1 第 420-421 行）
import BottomTimeline from '@/components/episode-production/workbench/BottomTimeline.vue'
// P6-T17 stage 占位组件（① 内容 / ③ 剧本 待实现 stage view）
import StagePlaceholder from '@/components/episode-production/workbench/StagePlaceholder.vue'
// FU3 stage 切换 + 门控 composable
import { useWorkbenchStageNavigation } from '@/composables/use-workbench-stage-navigation'
// P6-T20 ④ 分镜 stage view（spec §2.2 第 436 行 + §4.5）
import StageStoryboardView from '@/components/episode-production/stage-storyboard/StageStoryboardView.vue'
// P6-T18 ① 内容 stage view（spec §2.2 第 433 行 + §0.4）
import StageContentView from '@/components/episode-production/stage-content/StageContentView.vue'
import type {
  EpisodeStatus,
  VideoEpisode as _VE,
  StageEnterDecision,
} from '../../../shared/types/episode-production'
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
import StoryboardEditDialog from '@/components/episode-production/dialogs/StoryboardEditDialog.vue'
import CharacterDetailDialog from '@/components/episode-production/dialogs/CharacterDetailDialog.vue'
import ItemDetailDialog from '@/components/episode-production/dialogs/ItemDetailDialog.vue'
import LocationDetailDialog from '@/components/episode-production/dialogs/LocationDetailDialog.vue'
import EntityEditDialog from '@/components/episode-production/dialogs/EntityEditDialog.vue'
// V2 老 dialog 已删除（GenerateImagesDialog / SynthesisDialog /
// ImagePreviewDialog / RegenerateDialog）— 之前由右侧 V2 panel 触发，
// 右侧 panel 删除后这些 dialog 无触发点

const route = useRoute()
const router = useRouter()
const workbenchStore = useEpWorkbenchStore()
const projectStore = useEpProjectStore()
const episodeStore = useEpEpisodeStore()
const assetStore = useEpAssetStore()
const scriptStore = useEpScriptStore()
const storyboardStore = useEpStoryboardStore()
// productionStore / composeStore 之前由已删的 V2 单图生成 + 单镜合成
// 流程使用，P6-T21 清理后无引用，移除（V3 路径在各 stage view 内部
// 直接调对应 store / IPC）
const tabsStore = useTabsStore()

const projectId = computed(() => route.params.projectId as string)

/**
 * P6-T17 主区域 stage state — 类型对齐 EpisodeStatus（不含 completed 终态）。
 *
 * 6 个值：
 *   pending（① 内容） / asset_prep（② 资产） / scripting（③ 剧本）
 *   storyboarding（④ 分镜） / producing（⑤ 制作） / composing（⑥ 合成）
 *
 * 顶部进度条点击 → 直接 set activeTab.value = status（之前还要做字符串映射）
 * el-tabs 的 v-model 接收同样的 string，pane 的 name 与之对应。
 *
 * 默认 'asset_prep'（① 内容 stage view 是占位，不强制把用户拉过去）；
 * P6-T18 ① 内容 stage view 实现后默认改 'pending' 或按 episode.status 智能选。
 */
type WorkbenchStage = Exclude<EpisodeStatus, 'completed'>
const activeTab = ref<WorkbenchStage>('asset_prep')

/**
 * AssetSidebar 显隐逻辑（用户反馈）：
 * - ① 内容（pending）：资产还没生产，识别要素在主区域右侧（不重复）
 * - ② 资产（asset_prep）：主区域已详细管理资产，侧栏重复
 * - ③④⑤⑥（scripting / storyboarding / producing / composing）：保留侧栏作为
 *   参考；P6-T22 follow-up 实现 context-aware 高亮
 */
const showAssetSidebar = computed(
  () => activeTab.value !== 'pending' && activeTab.value !== 'asset_prep',
)

// P6-T13 顶部进度条引用（用于剧集状态变化后主动 reload）
const progressBarRef = ref<{ reload: () => Promise<void> } | null>(null)

// P6-T22 active context store（资产侧栏 context-aware 高亮）
const activeContextStore = useEpActiveContextStore()

/**
 * 当 activeTab 切换到 ①/②/⑥ stage 时清空侧栏 context（侧栏不显示也无所谓，
 * 但避免下次切回 ③④⑤ 时显示陈旧 ctx label）。
 * ③④⑤ 的 setContext 由对应 stage view 内部处理。
 */
watch(activeTab, (s) => {
  if (s === 'pending' || s === 'asset_prep' || s === 'composing') {
    activeContextStore.clear()
  }
})

// FU3：selectedAsset 提前声明（多个 composable + 模板共享）
const selectedAsset = ref<{ type: 'character' | 'location' | 'item' | 'voice'; id: string } | null>(null)

// FU3：useWorkbenchStageNavigation 调用挪到 setup 末尾（所有 ref/function 声明之后）
// 见 watch(projectId) 上方

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

// ===== Dialog 状态集中管理 =====
// 注：V2 老右侧 panel 删除后，generateImages / synthesis / imagePreview /
// regenerate / regeneratingStoryboard / previewImageUrl / selectedStoryboard /
// generatingImage / synthesisProgress 等状态已无引用，删除（P6-T21）。
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
  // 分镜编辑（StageStoryboardView 触发）
  storyboardEdit: false,
  editingStoryboard: null as Storyboard | null,
  // 资产详情
  characterDetail: false,
  itemDetail: false,
  locationDetail: false,
  detailId: '',
  // 实体编辑
  entityEdit: false,
  editingEntityType: 'character' as 'character' | 'location' | 'item',
  editingEntityId: '',
  editingEntityData: null as StoryCharacter | StoryLocation | StoryItem | null,
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

// V2 老右侧 panel + 单图 frameImage 路径相关函数已删除（P6-T21）：
// - openImagePreview / openRegenerateDialog（V2 单图重生成 dialog 已删）
// - openStoryboardEditDialog（StageStoryboardView 直接 set dialogs.
//   storyboardEdit，不再需要本地包装）
// - selectStoryboard / generateStoryboards（右侧 panel 已删；④ 分镜
//   stage 内部直接调 storyboardStore）
// - generateSingleStoryboardImage / regenerateStoryboardImage（V2 单图
//   流程；V3 走多关键帧路径 P5-T31~T34）
// - confirmDeleteStoryboardImage（V2 删除单图；V3 关键帧重生成走
//   keyframe-regenerate-dialog）
// - synthesizeVideo（V2 单镜合成；V3 走 ⑥ 合成 stage 整剧 export-mp4）

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

// goToVideoProduction 已删除（V2 路由 /production/:sceneId 已废弃，
// V3 用 ⑤ 制作 stage tab 替代）

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
// FU3：selectedAsset 已提前声明（line 432 上方）

function onAssetSaved() {
  ElMessage.success('保存成功')
}

function onCompleteAssetStage() {
  ElMessage.success('阶段完成（暂未持久化）')
}

// ===== FU3 stage 切换 + 门控 composable（放最末避免 TDZ） =====
const {
  onNavigateStage,
  onEpisodeSelectChange,
  onOpenAsset,
  onAddAsset,
  onPreviewEpisode,
  onSelectStoryboard,
  onEditStoryboardFromStage,
  onJumpToProductionWithSb,
  onContentConfirmed,
} = useWorkbenchStageNavigation({
  activeTab,
  selectedAsset,
  dialogs,
  progressBarRef,
  selectEpisode,
})

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

  // P6-T17 follow-up: 隐藏 el-tabs 自带 header（标签栏）
  // 因为顶部 StageProgressBar 已是唯一 navigation（spec §2.1 形态 D），
  // el-tabs 的 tab header 视觉重复且让用户困惑（同一 stage 切换有两个入口）。
  // el-tabs 的 v-model 切换内容能力保留，仅隐藏 header DOM。
  :deep(.el-tabs__header) {
    display: none;
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
