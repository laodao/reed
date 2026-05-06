<template>
  <!--
    StageContentView · ① 内容 stage view（spec §2.2 第 433 行 + §0.4 · P6-T18）

    spec §2.2 ① 内容的四要素：
      - 产物：要素清单（含 source_type）
      - 进入条件：剧集已创建
      - 完成条件：用户点"确认要素"
      - 主区域形态：长文/上传内容 + 识别出的角色/地点/物品 三栏

    本 stage 显示当前剧集的内容来源（outline / uploaded）+ AI 识别出的
    要素清单，让用户确认后进入 ② 资产 stage。

    AI 识别在创建剧集时跑（CreateEpisodeDialog 内）；本 stage 仅展示 +
    "确认要素"。重新识别 / 编辑识别结果 留 P6 follow-up。
  -->
  <div class="stage-content-view">
    <div class="view-header">
      <h3 class="view-title">① 内容</h3>
      <div class="view-actions">
        <!-- FU4-1 AI 识别要素（uploaded 模式可见；总数 0 时主推，>0 时辅助） -->
        <el-button
          v-if="canIdentify"
          :type="entityCount === 0 ? 'primary' : 'default'"
          :loading="identifying"
          @click="onIdentify"
        >
          <el-icon><MagicStick /></el-icon>
          {{ entityCount === 0 ? 'AI 识别要素' : '重新识别' }}
        </el-button>
        <el-button
          v-if="canConfirm"
          type="primary"
          :loading="confirming"
          @click="onConfirm"
        >
          <el-icon><Check /></el-icon>
          确认要素 → 进入 ② 资产
        </el-button>
        <el-tag v-else-if="alreadyConfirmed" type="success" round>
          已确认
        </el-tag>
      </div>
    </div>

    <div v-if="!episode" class="empty-state">
      <el-empty description="请先选择剧集" />
    </div>

    <div v-else class="content-row">
      <!-- 内容来源 -->
      <div class="source-panel">
        <h4>内容来源</h4>
        <el-tag size="small" :type="episode.sourceType === 'uploaded' ? 'warning' : 'primary'">
          {{ sourceLabel }}
        </el-tag>

        <div v-if="episode.sourceType === 'uploaded'" class="content-area">
          <p class="content-label">上传长文（{{ contentWordCount }} 字）</p>
          <div class="content-text">
            {{ episode.uploadedContent || '(无内容)' }}
          </div>
        </div>

        <div v-else-if="episode.sourceType === 'outline'" class="outline-area">
          <p class="content-label">关联大纲章节</p>
          <div class="outline-info">
            <el-tag size="small">outline ID: {{ episode.outlineId || '未设置' }}</el-tag>
            <p class="outline-note">大纲章节内容由长文模块管理（请在长文模块查看完整内容）。</p>
          </div>
        </div>
      </div>

      <!-- 识别要素三栏 -->
      <div class="entities-panel">
        <h4>AI 识别的要素</h4>
        <div v-if="episode.sourceType === 'outline'" class="outline-hint">
          <el-icon><InfoFilled /></el-icon>
          outline 模式下，要素来自长文项目的角色 / 地点 / 物品库。请在 ② 资产 stage 查看绑定。
        </div>
        <div v-else class="entities-grid">
          <!-- 角色 -->
          <div class="entity-col">
            <div class="col-header">
              <el-icon><User /></el-icon>
              <span>角色</span>
              <el-tag size="small" round>{{ uploadedCharacters.length }}</el-tag>
            </div>
            <div v-if="uploadedCharacters.length === 0" class="empty-hint">
              未识别到角色
            </div>
            <div
              v-for="(c, idx) in uploadedCharacters"
              :key="`char-${idx}`"
              class="entity-card"
            >
              <div class="entity-name">{{ c.name }}</div>
              <div v-if="c.role" class="entity-role">{{ c.role }}</div>
              <div v-if="c.description" class="entity-desc">{{ c.description }}</div>
            </div>
          </div>

          <!-- 地点 -->
          <div class="entity-col">
            <div class="col-header">
              <el-icon><Location /></el-icon>
              <span>地点</span>
              <el-tag size="small" round>{{ uploadedLocations.length }}</el-tag>
            </div>
            <div v-if="uploadedLocations.length === 0" class="empty-hint">
              未识别到地点
            </div>
            <div
              v-for="(l, idx) in uploadedLocations"
              :key="`loc-${idx}`"
              class="entity-card"
            >
              <div class="entity-name">{{ l.name }}</div>
              <div v-if="l.type" class="entity-role">{{ l.type }}</div>
              <div v-if="l.description" class="entity-desc">{{ l.description }}</div>
            </div>
          </div>

          <!-- 物品 -->
          <div class="entity-col">
            <div class="col-header">
              <el-icon><Box /></el-icon>
              <span>物品</span>
              <el-tag size="small" round>{{ uploadedItems.length }}</el-tag>
            </div>
            <div v-if="uploadedItems.length === 0" class="empty-hint">
              未识别到物品
            </div>
            <div
              v-for="(it, idx) in uploadedItems"
              :key="`item-${idx}`"
              class="entity-card"
            >
              <div class="entity-name">{{ it.name }}</div>
              <div v-if="it.type" class="entity-role">{{ it.type }}</div>
              <div v-if="it.description" class="entity-desc">{{ it.description }}</div>
            </div>
          </div>
        </div>

        <!-- spec §2.2 ① 内容 - 进入 ② 资产 前可随时点上方"AI 识别 / 重新识别"重跑 -->
        <p v-if="entityCount === 0" class="rebuild-note empty-note">
          <el-icon><InfoFilled /></el-icon>
          还未识别到任何要素。请点上方"AI 识别要素"按钮跑 AI 识别（需要先在项目设置中配置剧本生成模型）。
        </p>
        <p v-else class="rebuild-note">
          <el-icon><InfoFilled /></el-icon>
          已识别 {{ entityCount }} 个要素。如需调整可点"重新识别"重跑。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * StageContentView（P6-T18）
 *
 * Props：
 *   - episode：当前剧集（含 sourceType / uploadedContent / outlineId /
 *     uploadedCharacters / uploadedLocations / uploadedItems / status）
 *
 * Emits：
 *   - confirmed：用户点"确认要素" + 后端 update 成功 → 父组件应把 activeTab
 *     切到 ② 资产
 *
 * 仅展示 + 确认。AI 识别 / 重新识别 / 编辑识别结果留 P6 follow-up。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Check, InfoFilled, Location, MagicStick, User } from '@element-plus/icons-vue'
import type {
  VideoEpisode,
  EpisodeStatus,
  UploadedCharacter,
  UploadedLocation,
  UploadedItem,
} from '../../../../../shared/types/episode-production'
import { useEpEpisodeStore, useEpProjectStore } from '@/stores/episode-production'

const props = defineProps<{
  episode: VideoEpisode | null
}>()

const emit = defineEmits<{
  (e: 'confirmed'): void
}>()

const episodeStore = useEpEpisodeStore()
const projectStore = useEpProjectStore()
const confirming = ref(false)
const identifying = ref(false)

const sourceLabel = computed(() => {
  if (!props.episode) return ''
  return props.episode.sourceType === 'uploaded' ? '上传长文' : '大纲章节'
})

const contentWordCount = computed(() => {
  return props.episode?.uploadedContent?.length ?? 0
})

const uploadedCharacters = computed<UploadedCharacter[]>(() =>
  Array.isArray(props.episode?.uploadedCharacters)
    ? (props.episode!.uploadedCharacters as UploadedCharacter[])
    : [],
)
const uploadedLocations = computed<UploadedLocation[]>(() =>
  Array.isArray(props.episode?.uploadedLocations)
    ? (props.episode!.uploadedLocations as UploadedLocation[])
    : [],
)
const uploadedItems = computed<UploadedItem[]>(() =>
  Array.isArray(props.episode?.uploadedItems)
    ? (props.episode!.uploadedItems as UploadedItem[])
    : [],
)

const alreadyConfirmed = computed(() => {
  if (!props.episode) return false
  const s = props.episode.status as EpisodeStatus
  // 只要 status 已经走过 pending（含 asset_prep / scripting / 后续），即视作已确认
  return s !== 'pending'
})

const entityCount = computed(
  () =>
    uploadedCharacters.value.length +
    uploadedLocations.value.length +
    uploadedItems.value.length,
)

const canIdentify = computed(() => {
  // 仅 uploaded 模式有意义；outline 模式由长文模块管理
  return (
    !!props.episode &&
    props.episode.sourceType === 'uploaded' &&
    !!props.episode.uploadedContent &&
    !alreadyConfirmed.value
  )
})

async function onIdentify(): Promise<void> {
  if (!props.episode) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型（用于 AI 识别）')
    return
  }
  if (entityCount.value > 0) {
    try {
      await ElMessageBox.confirm(
        '已有识别结果将被覆盖，是否继续？',
        '重新识别要素',
        { type: 'warning', confirmButtonText: '重新识别', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  identifying.value = true
  try {
    const result = await episodeStore.identifyEntities(
      props.episode.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (result) {
      ElMessage.success(
        `识别完成：${result.characters} 角色 / ${result.locations} 地点 / ${result.items} 物品`,
      )
    } else {
      ElMessage.error(episodeStore.$state ? '识别失败，请检查模型配置或稍后重试' : '识别失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? 'AI 识别失败')
  } finally {
    identifying.value = false
  }
}

const canConfirm = computed(() => {
  if (!props.episode) return false
  if (alreadyConfirmed.value) return false
  // outline 模式：有 outlineId 即可确认
  if (props.episode.sourceType === 'outline') {
    return !!props.episode.outlineId
  }
  // uploaded 模式：至少识别到一个要素
  return (
    uploadedCharacters.value.length +
      uploadedLocations.value.length +
      uploadedItems.value.length >
    0
  )
})

async function onConfirm(): Promise<void> {
  if (!props.episode) return
  confirming.value = true
  try {
    const ok = await episodeStore.updateEpisode(props.episode.id, {
      status: 'asset_prep' as EpisodeStatus,
    } as any)
    if (ok) {
      ElMessage.success('要素已确认 → 进入 ② 资产 stage')
      emit('confirmed')
    } else {
      ElMessage.error('确认失败，请重试')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '确认失败')
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped lang="scss">
.stage-content-view {
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

.source-panel,
.entities-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.source-panel {
  width: 320px;
  flex-shrink: 0;
}

.entities-panel {
  flex: 1;
  min-width: 0;
}

h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.content-area,
.outline-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
  flex: 1;

  .content-label {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .content-text {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    background: var(--el-fill-color-lighter);
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-regular);
    white-space: pre-wrap;
  }
}

.outline-info {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .outline-note {
    margin: 0;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }
}

.outline-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-info);
  padding: 8px;
  background: var(--el-color-info-light-9);
  border-radius: 4px;
}

.entities-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.entity-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px;
}

.col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  font-weight: 500;
}

.empty-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 8px;
  font-style: italic;
}

.entity-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 12px;

  .entity-name {
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .entity-role {
    font-size: 10px;
    color: var(--el-color-primary);
  }

  .entity-desc {
    font-size: 11px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
  }
}

.rebuild-note {
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
