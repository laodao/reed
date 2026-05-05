<template>
  <!--
    StageStoryboardView · ④ 分镜 stage view（spec §2.2 第 436 行 + §4.5 · P6-T20）

    spec §2.2 ④ 分镜的四要素：
      - 产物：每场 ≥1 个 Storyboard
      - 主区域形态：场景树 + 该场分镜网格
      - 完成条件：用户点"分镜定稿"

    spec §4.5 业务流程映射到本组件：
      - §4.5.1 三层映射：场景树 → 分镜网格 → （关键帧/视频在 ⑤ 制作 stage）
      - §4.5.2 一场景多分镜：左场景树选场景 → 右网格显示该场分镜
      - §4.5.3 分镜内角色独立配置：右侧详情面板"分镜内角色"区块（待 P5-T33
        接通 StoryboardCharacterEntity 后实装编辑入口）

    本 stage 聚焦"配置分镜"（决定怎么拍）；生成关键帧 + 视频在 ⑤ 制作 stage。
  -->
  <div class="stage-storyboard-view">
    <!-- 顶栏 -->
    <div class="view-header">
      <h3 class="view-title">
        ④ 分镜
        <el-tag v-if="selectedScene" type="info" class="header-meta">
          场景 {{ selectedSceneIndex + 1 }} · {{ selectedScene.location ?? '' }}
        </el-tag>
      </h3>
      <div class="view-actions">
        <el-button
          v-if="selectedSceneId"
          :loading="generating"
          @click="onGenerateForScene"
        >
          <el-icon><MagicStick /></el-icon>
          为本场景生成分镜
        </el-button>
        <el-button
          type="primary"
          :loading="generatingAll"
          :disabled="scenes.length === 0"
          @click="onGenerateAllScenes"
        >
          <el-icon><MagicStick /></el-icon>
          批量生成全部场景
        </el-button>
      </div>
    </div>

    <div v-if="scenes.length === 0" class="empty-state">
      <el-empty description="该剧集还没有场景。请先在 ③ 剧本 stage 生成场景剧本（待 P6-T19 实现）。" />
    </div>

    <div v-else class="content-row">
      <!-- 左侧场景树 -->
      <div class="scene-tree">
        <h4 class="tree-title">场景</h4>
        <div
          v-for="(scene, idx) in scenes"
          :key="scene.id"
          class="scene-item"
          :class="{ active: selectedSceneId === scene.id }"
          @click="onSceneSelect(scene.id)"
        >
          <div class="scene-row-1">
            <span class="scene-num">{{ idx + 1 }}</span>
            <span class="scene-location">{{ scene.location ?? '未指定地点' }}</span>
          </div>
          <div class="scene-row-2">
            <el-tag size="small" round>
              {{ scene.timeOfDay ?? '?时' }} · {{ scene.weather ?? '?气' }}
            </el-tag>
          </div>
          <div class="scene-row-3" v-if="selectedSceneId === scene.id">
            <span class="storyboard-count" v-if="loadingStoryboards">
              <el-icon class="is-loading"><Loading /></el-icon>
              加载中
            </span>
            <span v-else class="storyboard-count">
              {{ storyboards.length }} 个分镜
            </span>
          </div>
        </div>
      </div>

      <!-- 中间分镜网格 -->
      <div class="storyboard-grid-wrapper">
        <h4 class="grid-title">分镜网格</h4>
        <div v-if="!selectedSceneId" class="empty-hint">请先在左侧选择一个场景</div>
        <div v-else-if="loadingStoryboards" class="loading-state">
          <el-icon class="is-loading"><Loading /></el-icon>
          加载分镜...
        </div>
        <div v-else-if="storyboards.length === 0" class="empty-hint">
          该场景还没生成分镜，点击右上角"为本场景生成分镜"。
        </div>
        <div v-else class="storyboard-grid">
          <div
            v-for="sb in storyboards"
            :key="sb.id"
            class="sb-card"
            :class="{ active: selectedStoryboardId === sb.id }"
            @click="selectedStoryboardId = sb.id"
          >
            <div class="sb-card-header">
              <span class="sb-num">镜 {{ sb.shotNumber }}</span>
              <el-tag
                size="small"
                :type="sb.videoPath ? 'success' : 'info'"
                class="sb-video-tag"
              >
                {{ sb.videoPath ? '已出片' : '未出片' }}
              </el-tag>
            </div>
            <div class="sb-meta">
              <el-tag size="small">{{ shotTypeLabel(sb.shotType) }}</el-tag>
              <el-tag size="small">{{ cameraAngleLabel(sb.cameraAngle) }}</el-tag>
              <el-tag size="small">{{ cameraMovementLabel(sb.cameraMovement) }}</el-tag>
            </div>
            <p class="sb-desc">{{ sb.frameDescription }}</p>
            <div class="sb-footer">
              <span class="sb-duration">{{ sb.duration }}s</span>
              <span class="sb-keyframe">
                关键帧 {{ keyframeCountOf(sb) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <div class="storyboard-detail" v-if="selectedStoryboard">
        <h4 class="detail-title">
          镜头 {{ selectedStoryboard.shotNumber }} 详情
        </h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="景别">
            {{ shotTypeLabel(selectedStoryboard.shotType) }}
          </el-descriptions-item>
          <el-descriptions-item label="角度">
            {{ cameraAngleLabel(selectedStoryboard.cameraAngle) }}
          </el-descriptions-item>
          <el-descriptions-item label="运镜">
            {{ cameraMovementLabel(selectedStoryboard.cameraMovement) }}
          </el-descriptions-item>
          <el-descriptions-item label="时长">
            {{ selectedStoryboard.duration }} 秒
          </el-descriptions-item>
          <el-descriptions-item label="关键帧数">
            {{ keyframeCountOf(selectedStoryboard) }}
          </el-descriptions-item>
          <el-descriptions-item label="视频状态">
            <el-tag
              size="small"
              :type="selectedStoryboard.videoPath ? 'success' : 'info'"
            >
              {{ selectedStoryboard.videoPath ? '已出片' : '未出片' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section">
          <h5>画面描述</h5>
          <p class="frame-desc">{{ selectedStoryboard.frameDescription }}</p>
        </div>

        <div class="detail-section">
          <h5>
            分镜内角色 (spec §4.5.3)
            <el-tag size="small" :type="hasOverrides ? 'success' : 'info'" round>
              {{ hasOverrides ? `${overrides.length} 项已配置` : '场景级' }}
            </el-tag>
          </h5>
          <p v-if="!hasOverrides" class="info-note">
            <el-icon><InfoFilled /></el-icon>
            未配置分镜级独立角色 → 关键帧生成回退到场景级
            <code>scene.characters</code>。点"编辑分镜内角色"为本分镜独立
            配置（spec §4.5.3 实操示例：分镜 1.2 张三 angry 举手 / 分镜
            1.3 李四 surprised 3q_left）。
          </p>
          <ul v-else class="override-list">
            <li v-for="(o, i) in overrides" :key="`o-${i}`" class="override-item">
              <span class="o-name">{{ characterName(o.characterId) }}</span>
              <span v-if="o.expression" class="o-attr">{{ o.expression }}</span>
              <span v-if="o.action" class="o-attr">{{ o.action }}</span>
              <span v-if="o.facing && o.facing !== 'front'" class="o-attr">
                朝向 {{ o.facing }}
              </span>
            </li>
          </ul>
        </div>

        <div class="detail-actions">
          <el-button size="small" @click="$emit('edit-storyboard', selectedStoryboard)">
            <el-icon><Edit /></el-icon>
            编辑分镜配置
          </el-button>
          <el-button size="small" type="warning" @click="onEditCharacters">
            <el-icon><User /></el-icon>
            {{ hasOverrides ? '修改' : '编辑' }}分镜内角色
          </el-button>
          <el-button
            size="small"
            type="primary"
            @click="$emit('jump-to-production', selectedStoryboard.id)"
          >
            <el-icon><VideoCamera /></el-icon>
            去 ⑤ 制作（生成关键帧 + 视频）
          </el-button>
        </div>
      </div>

      <div v-else-if="storyboards.length > 0" class="storyboard-detail empty-detail">
        <el-empty description="点击中间网格中的某个分镜查看详情" :image-size="80" />
      </div>
    </div>

    <!-- P5-T33 分镜内角色编辑（spec §4.5.3） -->
    <StoryboardCharacterEditDialog
      v-model="charDialogVisible"
      :storyboard-id="selectedStoryboardId"
      :character-candidates="characterCandidates"
      @saved="onCharactersSaved"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * StageStoryboardView（P6-T20）
 *
 * Props：
 *   - episodeScriptId：当前剧集的 episode_script.id
 *   - projectId：项目 ID（用于生成分镜的 model 配置）
 *
 * Emits：
 *   - edit-storyboard(sb)：用户点"编辑"按钮 → 父组件应弹 StoryboardEditDialog
 *   - jump-to-production(sbId)：用户点"去 ⑤ 制作" → 父组件切到 ⑤ 制作 stage
 *
 * 内部数据：
 *   - scenes：来自 scriptStore（剧本 stage 已加载）
 *   - storyboards：每次切场景时调 storyboardStore.loadStoryboards
 *
 * 不在 scope（留 P5-T31~T34 / P6-T19）：
 *   - StoryboardCharacterEntity 编辑（spec §4.5.3）
 *   - 分镜级地点 angle 变体编辑（spec §4.5.2）
 *   - "分镜定稿"按钮（spec §2.2 完成条件）
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Edit,
  InfoFilled,
  Loading,
  MagicStick,
  User,
  VideoCamera,
} from '@element-plus/icons-vue'
import {
  useEpAssetStore,
  useEpProjectStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpWorkbenchStore,
} from '@/stores/episode-production'
import StoryboardCharacterEditDialog from '../dialogs/StoryboardCharacterEditDialog.vue'
import {
  getCameraAngleLabel,
  getCameraMovementLabel,
  getShotTypeLabel,
} from '@/components/episode-production/shared/shot-labels'
import type { Storyboard } from '../../../../../shared/types/story-to-video.types'

defineProps<{
  episodeScriptId: string | null
  projectId: string
}>()

defineEmits<{
  (e: 'edit-storyboard', sb: Storyboard): void
  (e: 'jump-to-production', storyboardId: string): void
}>()

const projectStore = useEpProjectStore()
const scriptStore = useEpScriptStore()
const storyboardStore = useEpStoryboardStore()
const workbenchStore = useEpWorkbenchStore()
const assetStore = useEpAssetStore()

const scenes = computed(() => scriptStore.scenes)
const storyboards = computed(() => storyboardStore.storyboards)
const loadingStoryboards = computed(() => workbenchStore.loading)

const selectedSceneId = ref<string | null>(null)
const selectedStoryboardId = ref<string | null>(null)
const generating = ref(false)
const generatingAll = ref(false)

// P5-T33 分镜内角色编辑
const charDialogVisible = ref(false)
interface StoryboardCharOverride {
  characterId: string
  expression?: string
  action?: string
  facing?: string
  position?: { x: number; y: number; scale: number }
}
const overrides = ref<StoryboardCharOverride[]>([])
const hasOverrides = computed(() => overrides.value.length > 0)

// 候选角色列表（来自项目级 epAssetCharacters）
const characterCandidates = computed(() => {
  return (assetStore.epAssetCharacters as any[]).map((c) => ({
    id: c.id ?? c.bindingId ?? '',
    name: c.name ?? c.standaloneName ?? c.characterName ?? '未命名',
  }))
})

function characterName(id: string): string {
  const cand = characterCandidates.value.find((c) => c.id === id)
  return cand?.name ?? id.slice(0, 8)
}

async function loadStoryboardCharacters(sbId: string): Promise<void> {
  if (!sbId) {
    overrides.value = []
    return
  }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listStoryboardCharacters) return
    const resp = await api.listStoryboardCharacters(sbId)
    if (resp?.success && Array.isArray(resp.data)) {
      overrides.value = resp.data as StoryboardCharOverride[]
    } else {
      overrides.value = []
    }
  } catch {
    overrides.value = []
  }
}

function onEditCharacters(): void {
  if (!selectedStoryboardId.value) return
  charDialogVisible.value = true
}

async function onCharactersSaved(): Promise<void> {
  if (selectedStoryboardId.value) {
    await loadStoryboardCharacters(selectedStoryboardId.value)
  }
}

// 选中分镜变化时 reload overrides
watch(selectedStoryboardId, (id) => {
  if (id) void loadStoryboardCharacters(id)
  else overrides.value = []
})

const selectedSceneIndex = computed(() =>
  scenes.value.findIndex((s) => s.id === selectedSceneId.value),
)
const selectedScene = computed(() =>
  scenes.value.find((s) => s.id === selectedSceneId.value) ?? null,
)
const selectedStoryboard = computed(() =>
  storyboards.value.find((s) => s.id === selectedStoryboardId.value) ?? null,
)

function shotTypeLabel(t: string): string {
  return getShotTypeLabel(t)
}
function cameraAngleLabel(a: string): string {
  return getCameraAngleLabel(a)
}
function cameraMovementLabel(m: string): string {
  return getCameraMovementLabel(m)
}
function keyframeCountOf(sb: Storyboard): string {
  const v = (sb as any).keyframeCount
  if (typeof v === 'number') return String(v)
  return '默认'
}

async function onSceneSelect(sceneId: string): Promise<void> {
  selectedSceneId.value = sceneId
  selectedStoryboardId.value = null
  await storyboardStore.loadStoryboards(sceneId)
}

async function onGenerateForScene(): Promise<void> {
  if (!selectedSceneId.value) return
  ElMessage.info(
    '"为本场景生成分镜"功能待 P6 follow-up（service 仅暴露按 episodeScript 批量生成）',
  )
}

async function onGenerateAllScenes(): Promise<void> {
  if (scenes.value.length === 0) return
  const sm = projectStore.currentProject?.config?.storyboardModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置分镜生成模型')
    return
  }
  if (!scriptStore.currentScript) {
    ElMessage.warning('请先在 ③ 剧本 stage 生成剧本')
    return
  }
  generatingAll.value = true
  try {
    const result = await storyboardStore.generateStoryboards(
      scriptStore.currentScript.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (result) {
      ElMessage.success(`分镜生成成功，共 ${result.length} 个镜头`)
      // 重新选当前场景刷新分镜
      if (selectedSceneId.value) {
        await storyboardStore.loadStoryboards(selectedSceneId.value)
      }
    } else {
      ElMessage.error(workbenchStore.error || '生成分镜失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成分镜失败')
  } finally {
    generatingAll.value = false
  }
}

// 默认选第一个场景
watch(
  () => scenes.value,
  (sv) => {
    if (sv.length > 0 && !selectedSceneId.value) {
      void onSceneSelect(sv[0].id)
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.stage-storyboard-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 12px;
  gap: 12px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;

  .view-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;

    .header-meta {
      margin-left: 8px;
      font-size: 12px;
      font-weight: normal;
    }
  }

  .view-actions {
    display: flex;
    gap: 8px;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-row {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

// 左侧场景树
.scene-tree {
  width: 200px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .tree-title {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }
}

.scene-item {
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:hover {
    background: var(--el-fill-color-lighter);
  }
  &.active {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
  }

  .scene-row-1 {
    display: flex;
    align-items: center;
    gap: 6px;

    .scene-num {
      display: inline-flex;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--el-color-primary);
      color: #fff;
      font-size: 11px;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .scene-location {
      font-size: 13px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .scene-row-2 {
    font-size: 11px;
  }

  .scene-row-3 {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }
}

// 中间分镜网格
.storyboard-grid-wrapper {
  flex: 1;
  min-width: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;

  .grid-title {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }
}

.empty-hint,
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  gap: 6px;
}

.storyboard-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  overflow-y: auto;
  align-content: start;
}

.sb-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--el-bg-color);

  &:hover {
    border-color: var(--el-color-primary);
    transform: translateY(-1px);
  }

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .sb-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .sb-num {
      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .sb-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 11px;
  }

  .sb-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--el-text-color-regular);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .sb-footer {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 4px;
  }
}

// 右侧详情
.storyboard-detail {
  width: 300px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .detail-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .detail-section {
    h5 {
      margin: 0 0 6px 0;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .frame-desc {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--el-text-color-regular);
      padding: 8px;
      background: var(--el-fill-color-lighter);
      border-radius: 4px;
    }

    .placeholder-note,
    .info-note {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: var(--el-color-info);
      padding: 8px 10px;
      background: var(--el-color-info-light-9);
      border-radius: 4px;
      display: flex;
      gap: 6px;
      align-items: flex-start;

      code {
        background: var(--el-color-warning-light-7);
        padding: 1px 4px;
        border-radius: 2px;
        font-size: 10px;
      }
    }

    .placeholder-note {
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
    }

    .override-list {
      list-style: none;
      padding: 0;
      margin: 4px 0 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .override-item {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px 8px;
      background: var(--el-color-success-light-9);
      border-left: 2px solid var(--el-color-success);
      border-radius: 4px;
      font-size: 11px;
      align-items: center;

      .o-name {
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .o-attr {
        font-size: 10px;
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color-blank);
        padding: 1px 4px;
        border-radius: 2px;
      }
    }
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
}

.empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
