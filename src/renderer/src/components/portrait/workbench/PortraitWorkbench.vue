<template>
  <div class="portrait-workbench">
    <!-- 头部 -->
    <div class="wb-header">
      <el-button @click="$emit('back')">← 返回</el-button>
      <div class="wb-title" v-if="character">
        <span class="name">{{ character.name }}</span>
        <span class="meta">{{ GENDER_LABELS[character.gender] }} · {{ character.age }}岁</span>
      </div>
      <div class="wb-actions">
        <el-select
          v-model="models.selectedModelKey.value"
          placeholder="选择模型"
          class="model-select"
          filterable
          :filter-method="models.filterModels"
          @change="onHeaderModelChange"
        >
          <el-option-group
            v-for="provider in models.filteredProviderModels.value"
            :key="provider.id"
            :label="provider.name"
          >
            <el-option
              v-for="model in provider.models"
              :key="`${provider.id}:${model.id}`"
              :label="model.name"
              :value="`${provider.id}:${model.id}`"
            />
          </el-option-group>
        </el-select>
        <el-button size="small" @click="$router.push('/portrait-templates')">📚 模板库</el-button>
        <el-button v-if="hasAnyVariant" size="small" @click="showExportDialog = true">⬇ 导出</el-button>
      </div>
    </div>

    <div class="wb-body" v-if="character">
      <!-- 生成态：无半身形象 -->
      <GeneratePanel
        v-if="!hasHalfVariant"
        :character="character"
        :project="project"
        @generated="loadVariants"
      />

      <!-- 编辑态 -->
      <template v-else>
        <div class="wb-main">
          <!-- 左：预览 -->
          <div class="wb-preview">
            <!-- framing tab（联动预览与主编辑面板） -->
            <div class="framing-tabs">
              <span
                class="ft-tab"
                :class="{ active: currentTab === 'half' }"
                @click="currentTab = 'half'"
              >半身像</span>
              <span
                class="ft-tab"
                :class="{ active: currentTab === 'full' }"
                @click="currentTab = 'full'"
              >全身像</span>
            </div>

            <!-- 当前 tab 有图 -->
            <template v-if="currentVariant">
              <el-image
                :src="currentVariant.imagePath"
                fit="contain"
                class="preview-img"
                :preview-src-list="previewList"
                preview-teleported
                :initial-index="0"
              />
              <div class="preview-info">
                <div class="info-row"><span class="k">取景</span><span class="v">{{ FRAMING_LABELS[currentTab] }}像 · {{ ANGLE_LABELS[currentVariant.angle] }}</span></div>
                <div class="info-row"><span class="k">尺寸</span><span class="v">{{ currentVariant.config?.width ?? '-' }} × {{ currentVariant.config?.height ?? '-' }}</span></div>
                <div class="info-row"><span class="k">种子</span><span class="v">{{ currentVariant.config?.seed ?? '-' }}</span></div>
                <div class="info-row"><span class="k">模型</span><span class="v">{{ character.modelId ?? '-' }}</span></div>
              </div>
            </template>

            <!-- 全身 tab 空状态 -->
            <template v-else>
              <div class="preview-empty">
                <div class="pe-figure">👤</div>
              </div>
              <div class="preview-info empty-info">
                <div class="info-row"><span class="k">状态</span><span class="v accent">尚未生成全身像</span></div>
                <div class="info-row"><span class="k">来源</span><span class="v">基于当前半身扩展 · 面部一致</span></div>
              </div>
              <el-button type="primary" style="width: 100%" @click="showFullBodyDialog = true">
                ⬇ 生成全身像
              </el-button>
            </template>
          </div>

          <!-- 右：操作 -->
          <div class="wb-ops">
            <EditPanel
              v-if="currentVariant"
              :framing="currentTab"
              :character="character"
              :variant="currentVariant"
              :model-sizes="models.modelSizes.value"
              :capabilities="models.capabilities.value"
              @success="loadVariants"
            />
            <MoreActionsPanel @open="openDialog" />
          </div>
        </div>

        <!-- 套图画廊 -->
        <VariantGallery
          :variants="variants"
          @open-fullbody="showFullBodyDialog = true"
          @deleted="loadVariants"
          @preview="v => previewVariant(v)"
        />
      </template>
    </div>

    <!-- 对话框 -->
    <RegenerateDialog
      v-if="currentVariant && character"
      v-model="showRegenerateDialog"
      :character="character"
      :variant="currentVariant"
      :model-sizes="models.modelSizes.value"
      :capabilities="models.capabilities.value"
      @success="loadVariants"
    />
    <ClothesDialog
      v-if="character"
      v-model="showClothesDialog"
      :character="character"
      :variant="currentVariant"
      :model-sizes="models.modelSizes.value"
      :capabilities="models.capabilities.value"
      @success="loadVariants"
    />
    <BackgroundDialog
      v-if="character"
      v-model="showBackgroundDialog"
      :character="character"
      :variant="currentVariant"
      :model-sizes="models.modelSizes.value"
      :capabilities="models.capabilities.value"
      @success="loadVariants"
    />
    <AnglesDialog
      v-if="character"
      v-model="showAnglesDialog"
      :character="character"
      :variant="currentVariant"
      :model-sizes="models.modelSizes.value"
      :capabilities="models.capabilities.value"
      @success="loadVariants"
    />
    <GenerateFullBodyDialog
      v-if="character && halfSourceVariant"
      v-model="showFullBodyDialog"
      :character="character"
      :source-variant="halfSourceVariant"
      :model-sizes="models.modelSizes.value"
      :capabilities="models.capabilities.value"
      @success="loadVariants"
    />
    <ExportDialog
      v-model="showExportDialog"
      :character-id="characterId"
      :variants="variants"
    />

    <!-- 图片预览（双击套图卡打开）：与主图一致的 Element Plus 原生查看器，
         隐藏触发器 + 程序化 clickHandler -->
    <el-image
      ref="previewImageRef"
      :src="previewCurrentSrc"
      :preview-src-list="previewSrcList"
      :initial-index="previewIndex"
      preview-teleported
      class="hidden-preview-trigger"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, type ComponentPublicInstance } from 'vue'
import GeneratePanel from './GeneratePanel.vue'
import EditPanel from './EditPanel.vue'
import MoreActionsPanel from './MoreActionsPanel.vue'
import VariantGallery from './VariantGallery.vue'
import RegenerateDialog from './RegenerateDialog.vue'
import ClothesDialog from './ClothesDialog.vue'
import BackgroundDialog from './BackgroundDialog.vue'
import AnglesDialog from './AnglesDialog.vue'
import GenerateFullBodyDialog from './GenerateFullBodyDialog.vue'
import ExportDialog from '../ExportDialog.vue'
import { useImageModels } from './useImageModels'
import { ANGLE_LABELS, FRAMING_LABELS, GENDER_LABELS } from '../../../../../shared/types/portrait.types'
import type {
  PortraitCharacter,
  PortraitProject,
  PortraitVariant,
  PortraitFraming
} from '../../../../../shared/types/portrait.types'

/**
 * 新版人像工作台容器（spec 2026-07-24 §6.1）：
 * 无半身形象 → 生成态（GeneratePanel）；
 * 有形象 → 编辑态（framing tab 联动预览与主编辑面板 + 更多操作 + 套图画廊）。
 */
const props = defineProps<{
  characterId: string
  project?: PortraitProject
}>()

defineEmits<{
  back: []
  deleted: []
}>()

const character = ref<PortraitCharacter | null>(null)
const variants = ref<PortraitVariant[]>([])

const projectRef = computed(() => props.project)
const models = useImageModels(projectRef as never)

// framing tab（默认半身）
const currentTab = ref<PortraitFraming>('half')

// 对话框状态
const showRegenerateDialog = ref(false)
const showClothesDialog = ref(false)
const showBackgroundDialog = ref(false)
const showAnglesDialog = ref(false)
const showFullBodyDialog = ref(false)
const showExportDialog = ref(false)

// ---- 数据加载 ----

async function loadCharacter() {
  if (!props.characterId) return
  const result = await window.electronAPI.portrait.getCharacter(props.characterId)
  if (result.success && result.data) {
    character.value = result.data
  }
}

async function loadVariants() {
  if (!props.characterId) return
  const result = await window.electronAPI.portrait.listVariants(props.characterId)
  if (result.success && result.data) {
    variants.value = result.data
  }
}

// ---- 变体选择 ----

const hasAnyVariant = computed(() => variants.value.length > 0)

/** 半身 base 正面（最新的） */
const halfSourceVariant = computed(() =>
  variants.value.find(v => v.framing === 'half' && v.type === 'base' && v.angle === 'front')
)

const hasHalfVariant = computed(() => !!halfSourceVariant.value)

/** 全身 base 正面（最新的） */
const fullSourceVariant = computed(() =>
  variants.value.find(v => (v.framing ?? 'full') === 'full' && v.type === 'base' && v.angle === 'front')
)

/** 当前 tab 对应的展示 variant */
const currentVariant = computed<PortraitVariant | undefined>(() => {
  if (currentTab.value === 'half') return halfSourceVariant.value
  return fullSourceVariant.value
})

const previewList = computed(() => (currentVariant.value ? [currentVariant.value.imagePath] : []))

// ---- 套图双击预览（与主图一致的 EP 原生查看器） ----
const previewIndex = ref(0)
const previewImageRef = ref<ComponentPublicInstance | null>(null)

const previewSrcList = computed(() => variants.value.map(v => v.imagePath))
const previewCurrentSrc = computed(() => previewSrcList.value[previewIndex.value] ?? '')

function previewVariant(v: PortraitVariant) {
  const idx = variants.value.findIndex(x => x.id === v.id)
  previewIndex.value = idx >= 0 ? idx : 0
  // 等 initial-index/src 更新后，程序化触发 el-image 的原生查看器
  nextTick(() => {
    (previewImageRef.value as unknown as { clickHandler?: () => void })?.clickHandler?.()
  })
}

function openDialog(dialog: 'regenerate' | 'clothes' | 'background' | 'angles') {
  if (!currentVariant.value) return
  if (dialog === 'regenerate') showRegenerateDialog.value = true
  else if (dialog === 'clothes') showClothesDialog.value = true
  else if (dialog === 'background') showBackgroundDialog.value = true
  else if (dialog === 'angles') showAnglesDialog.value = true
}

/**
 * 头部模型切换：
 * 1. 保存为项目默认（useImageModels.onModelChange）
 * 2. 写回角色 providerId/modelId —— editFace / generateFullBody / 重新生成
 *    都读 DB 里的 character.providerId/modelId，必须同步否则换模型不生效
 */
async function onHeaderModelChange(key: string) {
  const model = models.availableModels.value.find(m => m.key === key)
  if (!model || !character.value) return

  models.onModelChange(key)

  const result = await window.electronAPI.portrait.updateCharacter({
    id: character.value.id,
    providerId: model.providerId,
    modelId: model.modelId
  })
  if (result.success) {
    await loadCharacter()
  }
}


// ---- 生命周期 ----

watch(() => props.characterId, () => {
  loadCharacter()
  loadVariants()
  models.load()
}, { immediate: true })

onMounted(() => {
  window.electronAPI.portrait.onGenerationEvent((data) => {
    if (data.type === 'generation-completed' && data.characterId === props.characterId) {
      loadVariants()
    }
  })
})
</script>

<style lang="scss" scoped>
.portrait-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.wb-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color-lighter);
  background: var(--bg-color-card);
  min-height: 48px;

  .wb-title {
    display: flex;
    align-items: center;
    gap: 10px;

    .name {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .meta {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }

  .wb-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
}

.wb-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg, 20px);
}

.wb-main {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: var(--spacing-lg, 20px);
  margin-bottom: var(--spacing-lg, 24px);
  align-items: start;
}

.wb-preview {
  position: sticky;
  top: 0;
}

.framing-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 11px;
  background: var(--fill-color);
  padding: 4px;
  border-radius: var(--radius-md);
}

.ft-tab {
  flex: 1;
  text-align: center;
  padding: 7px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--bg-color-card);
    font-weight: 600;
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
  }
}

.preview-img {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color-light);
  background: var(--fill-color);
  cursor: zoom-in;
}

.preview-empty {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-color);
  background: var(--fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;

  .pe-figure {
    font-size: 96px;
    color: var(--text-placeholder);
    opacity: 0.5;
  }
}

.preview-info {
  margin-top: 14px;
  background: var(--fill-color-light);
  border-radius: var(--radius-md);
  padding: 12px 14px;

  &.empty-info {
    background: var(--color-primary-light-9);
    margin-bottom: 12px;
  }
}

.info-row {
  display: flex;
  font-size: 12.5px;
  margin-bottom: 7px;

  &:last-child {
    margin-bottom: 0;
  }

  .k {
    color: var(--text-secondary);
    width: 48px;
    flex-shrink: 0;
  }

  .v {
    color: var(--text-primary);
    flex: 1;

    &.accent {
      color: var(--color-primary);
    }
  }
}

.wb-ops {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
}
</style>


<style lang="scss" scoped>
.model-select {
  width: 200px;
}

.hidden-preview-trigger {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
</style>

