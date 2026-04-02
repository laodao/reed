<template>
  <div class="character-editor">
    <!-- 紧凑头部 -->
    <div class="editor-header">
      <el-button link size="small" @click="$emit('back')">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="header-center" v-if="character">
        <span class="character-name">{{ character.name }}</span>
        <el-tag size="small" type="info" effect="plain">
          {{ GENDER_LABELS[character.gender] }} · {{ character.age }}岁
        </el-tag>
      </div>
      <el-button v-if="hasFrontImage" type="primary" size="small" @click="handleExport">
        <el-icon><Download /></el-icon>
        导出
      </el-button>
    </div>

    <!-- 没有正面形象时显示生成面板 -->
    <div class="generator-section" v-if="!hasFrontImage">
      <div class="generate-panel">
        <div class="panel-header">
          <div class="panel-icon">
            <el-icon :size="32"><User /></el-icon>
          </div>
          <div class="panel-title">
            <h3>生成人物形象</h3>
            <p>根据人物信息生成正面形象</p>
          </div>
        </div>

        <div class="panel-body">
          <!-- 模型选择 -->
          <div class="form-row">
            <div class="form-label">生成模型</div>
            <el-select
              v-model="selectedModelKey"
              placeholder="选择生成模型"
              class="model-select"
              filterable
              :filter-method="filterModels"
              @change="onModelChange"
            >
              <el-option-group
                v-for="provider in filteredProviderModels"
                :key="provider.id"
                :label="provider.name"
              >
                <el-option
                  v-for="model in provider.models"
                  :key="`${provider.id}:${model.id}`"
                  :label="model.name"
                  :value="`${provider.id}:${model.id}`"
                >
                  <div class="model-option">
                    <span class="model-name">{{ model.name }}</span>
                    <span class="model-size" v-if="model.maxResolution">{{ model.maxResolution }}</span>
                  </div>
                </el-option>
              </el-option-group>
            </el-select>
          </div>

          <!-- 尺寸选择 -->
          <div class="form-row">
            <div class="form-label">图片尺寸</div>
            <el-select v-model="generateConfig.size" class="size-select">
              <el-option
                v-for="size in sizeOptions"
                :key="size.value"
                :label="size.label"
                :value="size.value"
              />
            </el-select>
          </div>

          <!-- 提示词 -->
          <div class="form-row">
            <div class="form-label">提示词</div>
            <div class="prompt-wrapper">
              <el-input
                v-model="generateConfig.prompt"
                type="textarea"
                :rows="3"
                placeholder="可修改或补充人物描述..."
                resize="none"
                class="prompt-input"
              />
              <div class="prompt-hint">建议使用英文描述以避免部分云服务的内容审核问题</div>
            </div>
          </div>

          <!-- 反向提示词 -->
          <div class="form-row">
            <div class="form-label">反向提示词</div>
            <el-input
              v-model="generateConfig.negativePrompt"
              type="textarea"
              :rows="1"
              placeholder="不想出现的内容，如：模糊、低质量、变形..."
              resize="none"
              class="negative-input"
            />
          </div>

          <!-- 参考图片 -->
          <div class="form-row">
            <div class="form-label">参考图片</div>
            <div class="reference-images">
              <div
                v-for="(img, index) in generateConfig.referenceImages"
                :key="index"
                class="reference-image-item"
              >
                <el-image :src="img" fit="cover" />
                <el-button
                  class="remove-btn"
                  type="danger"
                  size="small"
                  circle
                  @click="removeReferenceImage(index)"
                >
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
              <div
                v-if="generateConfig.referenceImages.length < 3"
                class="upload-btn"
                @click="selectReferenceImage"
              >
                <el-icon :size="20"><Plus /></el-icon>
                <span>上传参考图</span>
              </div>
            </div>
            <div class="form-hint">可选，上传参考图片辅助生成（最多3张）</div>
          </div>
        </div>

        <div class="panel-footer">
          <el-button
            type="primary"
            size="large"
            class="generate-btn"
            @click="handleGenerateFront"
            :loading="generating"
            :disabled="!selectedModelKey"
          >
            <el-icon v-if="!generating"><MagicStick /></el-icon>
            {{ availableModels.length > 0 ? '开始生成' : '请先配置图像生成模型' }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 有正面形象时显示编辑区域 -->
    <template v-else>
      <div class="editor-content">
        <!-- 左侧：正面预览 -->
        <div class="preview-section">
          <div class="preview-image-large">
            <el-image :src="currentFrontVariant?.imagePath" fit="contain" @dblclick="handlePreviewImage(currentFrontVariant, 'front')" />
          </div>
          <!-- 缩略图放到下面 -->
          <div class="variant-tabs-wrapper" v-if="frontVariants.length > 1">
            <el-button
              v-if="frontVariants.length > 4"
              class="scroll-btn left"
              size="small"
              circle
              @click="scrollThumbnails('left')"
            >
              <el-icon><ArrowLeft /></el-icon>
            </el-button>
            <div class="variant-tabs" ref="thumbnailContainerRef">
              <div
                v-for="fv in frontVariants"
                :key="fv.id"
                class="variant-tab"
                :class="{ active: selectedFrontVariantId === fv.id }"
                @click="selectedFrontVariantId = fv.id"
              >
                <el-image :src="fv.imagePath" fit="cover" />
              </div>
            </div>
            <el-button
              v-if="frontVariants.length > 4"
              class="scroll-btn right"
              size="small"
              circle
              @click="scrollThumbnails('right')"
            >
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
          <div class="preview-actions">
            <el-button size="small" @click="handleRegenerateFront" :loading="regenerating">
              重新生成
            </el-button>
            <el-button size="small" @click="showClothesDialog = true">
              换衣
            </el-button>
            <el-button size="small" @click="showBackgroundDialog = true">
              换背景
            </el-button>
          </div>
        </div>

        <!-- 右侧：操作面板 -->
        <div class="actions-panel">
          <!-- 生成信息展示 -->
          <div class="info-section" v-if="currentFrontVariant">
            <h4>生成信息</h4>
            <div class="info-item">
              <span class="info-label">提示词</span>
              <div class="info-value prompt-text">{{ currentFrontVariant.prompt || '无' }}</div>
            </div>
            <div class="info-row">
              <div class="info-item half">
                <span class="info-label">尺寸</span>
                <span class="info-value">
                  {{ currentFrontVariant.config?.width || '-' }} × {{ currentFrontVariant.config?.height || '-' }}
                </span>
              </div>
              <div class="info-item half">
                <span class="info-label">角度</span>
                <span class="info-value">{{ ANGLE_LABELS[currentFrontVariant.angle] }}</span>
              </div>
            </div>
            <div class="info-item" v-if="character?.referenceImages?.length">
              <span class="info-label">参考图</span>
              <div class="reference-thumbs">
                <el-image
                  v-for="(img, idx) in character.referenceImages"
                  :key="idx"
                  :src="img"
                  fit="cover"
                  class="ref-thumb"
                  @click="previewReferenceImage(img)"
                />
              </div>
            </div>
          </div>

          <el-divider />

          <!-- 编辑形象 -->
          <div class="panel-section">
            <h4>编辑形象</h4>
            <el-input
              v-model="editPrompt"
              type="textarea"
              :rows="2"
              placeholder="输入编辑指令，如：戴上帽子、改变发型..."
              resize="none"
            />
            <el-button
              type="primary"
              :disabled="!editPrompt.trim() || editing"
              :loading="editing"
              @click="handleEditFront"
              class="action-btn"
            >
              编辑形象
            </el-button>
          </div>

          <el-divider />

          <!-- 多角度生成 -->
          <div class="panel-section">
            <h4>生成其他角度</h4>
            <div class="angle-row">
              <el-checkbox-group v-model="anglesToGenerate" class="angle-checkbox-group">
                <el-checkbox value="left">左侧</el-checkbox>
                <el-checkbox value="right">右侧</el-checkbox>
                <el-checkbox value="back">背面</el-checkbox>
              </el-checkbox-group>
              <el-button
                type="primary"
                :disabled="anglesToGenerate.length === 0 || generatingAngles"
                :loading="generatingAngles"
                @click="handleGenerateAngles"
              >
                生成
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 套图列表 -->
      <div class="gallery-section" v-if="variantGroups.length > 0">
        <h3>套图列表</h3>
        <div v-for="group in variantGroups" :key="group.id" class="variant-group">
          <div class="group-header">
            <h4>{{ group.title }}</h4>
            <div class="group-actions">
              <el-button
                v-if="!group.hasAllAngles && group.frontVariant"
                size="small"
                type="primary"
                @click="openGenerateAnglesForVariant(group.frontVariant)"
              >
                生成其他角度
              </el-button>
            </div>
          </div>
          <div class="group-images">
            <div
              v-for="variant in group.variants"
              :key="variant.id"
              class="variant-card"
            >
              <el-image :src="variant.imagePath" fit="contain" @dblclick="handlePreviewImage(variant, 'group')" />
              <div class="variant-info">
                <span class="variant-angle">{{ ANGLE_LABELS[variant.angle] }}</span>
                <el-button type="danger" size="small" circle @click="handleDeleteVariant(variant)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 对话框 -->
    <ChangeClothesDialog
      v-model="showClothesDialog"
      :character-id="characterId"
      :variant-id="currentFrontVariant?.id"
      @success="loadVariants"
    />

    <ChangeBackgroundDialog
      v-model="showBackgroundDialog"
      :character-id="characterId"
      :variant-id="currentFrontVariant?.id"
      @success="loadVariants"
    />

    <ExportDialog
      v-model="showExportDialog"
      :character-id="characterId"
      :variants="variants"
    />

    <!-- 图片预览 -->
    <el-dialog
      v-model="showPreviewDialog"
      :title="previewVariant ? ANGLE_LABELS[previewVariant.angle] : ''"
      width="90%"
      class="preview-dialog"
      append-to-body
      destroy-on-close
      @keydown.left="prevImage"
      @keydown.right="nextImage"
    >
      <div class="preview-image-container" v-if="previewVariant">
        <!-- 左侧切换按钮 -->
        <div class="nav-btn nav-prev" @click.stop="prevImage" :class="{ disabled: previewIndex === 0 }">
          <el-icon :size="32"><ArrowLeft /></el-icon>
        </div>
        <!-- 中间图片 -->
        <img :src="previewVariant.imagePath" alt="预览" @click.stop="nextImage" draggable="false" />
        <!-- 右侧切换按钮 -->
        <div class="nav-btn nav-next" @click.stop="nextImage" :class="{ disabled: previewIndex >= currentPreviewList.length - 1 }">
          <el-icon :size="32"><ArrowRight /></el-icon>
        </div>
      </div>
      <!-- 图片计数 -->
      <div class="preview-counter" v-if="currentPreviewList.length > 1">
        {{ previewIndex + 1 }} / {{ currentPreviewList.length }}
      </div>
    </el-dialog>

    <!-- 参考图预览 -->
    <el-dialog
      v-model="showRefPreviewDialog"
      title="参考图"
      width="auto"
      class="ref-preview-dialog"
      append-to-body
    >
      <el-image :src="previewRefImage" fit="contain" style="max-width: 80vw; max-height: 80vh;" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, ArrowRight, User, Download, EditPen, PictureFilled, Delete, Plus, Close, MagicStick } from '@element-plus/icons-vue'
import ChangeClothesDialog from '@/components/portrait/ChangeClothesDialog.vue'
import ChangeBackgroundDialog from '@/components/portrait/ChangeBackgroundDialog.vue'
import ExportDialog from '@/components/portrait/ExportDialog.vue'
import { ANGLE_LABELS, GENDER_LABELS, RACE_LABELS } from '../../../../shared/types/portrait.types'
import type { PortraitProject, PortraitCharacter, PortraitVariant, PortraitAngle } from '../../../../shared/types/portrait.types'

const props = defineProps<{
  characterId: string
  project?: PortraitProject
}>()

const emit = defineEmits<{
  back: []
  deleted: []
}>()

// ==================== 状态 ====================

const character = ref<PortraitCharacter | null>(null)
const variants = ref<PortraitVariant[]>([])

// 生成状态
const generating = ref(false)
const regenerating = ref(false)
const editing = ref(false)
const generatingAngles = ref(false)

// 表单
const editPrompt = ref('')
const anglesToGenerate = ref<PortraitAngle[]>(['left', 'right', 'back'])

// 选中的正面变体
const selectedFrontVariantId = ref<string | null>(null)

// 缩略图容器引用
const thumbnailContainerRef = ref<HTMLElement | null>(null)

// 缩略图滚动
function scrollThumbnails(direction: 'left' | 'right') {
  if (!thumbnailContainerRef.value) return
  const scrollAmount = 68 * 4 // 每次滚动4个缩略图的宽度
  const newScrollLeft = direction === 'left'
    ? thumbnailContainerRef.value.scrollLeft - scrollAmount
    : thumbnailContainerRef.value.scrollLeft + scrollAmount
  thumbnailContainerRef.value.scrollTo({
    left: newScrollLeft,
    behavior: 'smooth'
  })
}

// 对话框
const showClothesDialog = ref(false)
const showBackgroundDialog = ref(false)
const showExportDialog = ref(false)
const showPreviewDialog = ref(false)
const previewVariant = ref<PortraitVariant | null>(null)

// 参考图预览
const showRefPreviewDialog = ref(false)
const previewRefImage = ref('')

// 图片预览索引（用于左右切换）
const previewIndex = ref(0)

// 当前预览的图片列表（根据预览来源不同而不同）
const currentPreviewList = ref<PortraitVariant[]>([])

// 默认模型配置（从系统配置获取）
const defaultModel = ref<{ providerId: string; modelId: string } | null>(null)

// 可用的模型列表（扁平化，用于判断是否有模型）
const availableModels = ref<Array<{ key: string; label: string; providerId: string; modelId: string }>>([])

// 按提供商分组的模型列表
const providerModels = ref<Array<{
  id: string;
  name: string;
  models: Array<{ id: string; name: string; maxResolution?: string }>;
}>>([])

// 模型搜索关键词
const modelSearchKeyword = ref('')

// 过滤后的模型列表
const filteredProviderModels = computed(() => {
  if (!modelSearchKeyword.value) {
    return providerModels.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  return providerModels.value
    .map(provider => ({
      ...provider,
      models: provider.models.filter(model =>
        model.name.toLowerCase().includes(keyword) ||
        model.id.toLowerCase().includes(keyword) ||
        provider.name.toLowerCase().includes(keyword)
      )
    }))
    .filter(provider => provider.models.length > 0)
})

// 选中的模型
const selectedModelKey = ref<string>('')

// 尺寸选项 - 优先显示适合全身照的竖版尺寸
const sizeOptions = [
  { label: '768×1024 (竖版全身)', value: '768x1024' },
  { label: '896×1152 (竖版全身)', value: '896x1152' },
  { label: '1024×1792 (竖版全身)', value: '1024x1792' },
  { label: '1024×1024 (正方形)', value: '1024x1024' },
  { label: '512×512', value: '512x512' },
  { label: '768×768', value: '768x768' },
  { label: '1024×768 (横版)', value: '1024x768' },
  { label: '1792×1024 (横版)', value: '1792x1024' }
]

// 生成配置
const generateConfig = ref({
  prompt: '',
  negativePrompt: '',
  size: '768x1024',  // 默认使用竖版尺寸，更适合全身照
  referenceImages: [] as string[]
})

// ==================== 计算属性 ====================

// 默认提示词（根据人物信息生成）
const defaultPrompt = computed(() => {
  if (!character.value) return ''
  const c = character.value
  const genderText = c.gender === 'male' ? '男性' : '女性'
  const raceText = c.race === 'asian' ? '亚洲人' : '欧洲人'
  return `${c.name}，${genderText}，${c.age}岁，${raceText}，身高${c.height}cm，体重${c.weight}kg${c.description ? '，' + c.description : ''}`
})

const hasFrontImage = computed(() =>
  variants.value.some(v => v.angle === 'front' && v.type === 'base')
)

// 所有正面形象的变体（base、clothes、background）
// 排序规则：base类型在前，其他按时间升序（先生成的在前）
const frontVariants = computed(() => {
  const frontList = variants.value.filter(v => v.angle === 'front')
  return frontList.sort((a, b) => {
    // base 类型排前面
    if (a.type === 'base' && b.type !== 'base') return -1
    if (a.type !== 'base' && b.type === 'base') return 1
    // 同类型按创建时间升序（早的在前）
    return a.createdAt - b.createdAt
  })
})

// 当前显示的正面形象
const currentFrontVariant = computed(() => {
  if (selectedFrontVariantId.value) {
    return frontVariants.value.find(v => v.id === selectedFrontVariantId.value)
  }
  // 默认显示基础正面
  return variants.value.find(v => v.angle === 'front' && v.type === 'base') || frontVariants.value[0]
})

// 所有可预览的图片列表（用于左右切换）
// 按分组排序，正面在前
const allPreviewVariants = computed(() => {
  const angleOrder: Record<string, number> = { front: 0, left: 1, right: 2, back: 3 }
  return [...variants.value].sort((a, b) => {
    // 先按分组排序（base在前，然后按创建时间）
    const getGroupOrder = (v: PortraitVariant) => {
      if (v.type === 'base') return 0
      return v.createdAt
    }
    const groupA = getGroupOrder(a)
    const groupB = getGroupOrder(b)
    if (groupA !== groupB) return groupA - groupB

    // 同分组内，正面在前，然后按角度，最后按时间
    if (a.angle === 'front' && b.angle !== 'front') return -1
    if (a.angle !== 'front' && b.angle === 'front') return 1
    if (a.angle === b.angle) return a.createdAt - b.createdAt
    return (angleOrder[a.angle] ?? 99) - (angleOrder[b.angle] ?? 99)
  })
})

// 变体分组（按类型和 parentId 分组）
const variantGroups = computed(() => {
  const groups: Map<string, { id: string; title: string; variants: PortraitVariant[]; frontVariant?: PortraitVariant; hasAllAngles: boolean }> = new Map()

  for (const variant of variants.value) {
    let groupId: string

    if (variant.type === 'base') {
      groupId = 'base'
    } else if (variant.angle === 'front') {
      groupId = variant.id
    } else {
      groupId = variant.parentId || variant.id
    }

    if (!groups.has(groupId)) {
      let title = '基础形象'
      if (variant.type === 'clothes') {
        title = `换衣：${variant.variantInfo?.clothesDescription || ''}`
      } else if (variant.type === 'background') {
        title = `换背景：${variant.variantInfo?.backgroundDescription || ''}`
      }

      groups.set(groupId, {
        id: groupId,
        title,
        variants: [],
        hasAllAngles: false
      })
    }

    const group = groups.get(groupId)!
    group.variants.push(variant)

    if (variant.angle === 'front') {
      group.frontVariant = variant
    }
  }

  // 检查是否有完整四角度
  for (const group of groups.values()) {
    const angles = new Set(group.variants.map(v => v.angle))
    group.hasAllAngles = angles.has('front') && angles.has('left') && angles.has('right') && angles.has('back')
  }

  // 排序分组（base在前，其他按创建时间）
  const result = Array.from(groups.values())
  result.sort((a, b) => {
    const typeA = a.variants[0]?.type || 'base'
    const typeB = b.variants[0]?.type || 'base'
    if (typeA === 'base' && typeB !== 'base') return -1
    if (typeA !== 'base' && typeB === 'base') return 1
    // 同类型按最早创建时间排序
    const timeA = Math.min(...a.variants.map(v => v.createdAt))
    const timeB = Math.min(...b.variants.map(v => v.createdAt))
    return timeA - timeB
  })

  // 每个分组内的 variants 排序：正面在前，其他按角度顺序，同角度按时间
  const angleOrder: Record<string, number> = { front: 0, left: 1, right: 2, back: 3 }
  for (const group of result) {
    group.variants.sort((a, b) => {
      // 正面在前
      if (a.angle === 'front' && b.angle !== 'front') return -1
      if (a.angle !== 'front' && b.angle === 'front') return 1
      // 同角度按创建时间升序
      if (a.angle === b.angle) return a.createdAt - b.createdAt
      // 不同角度按固定顺序
      return (angleOrder[a.angle] ?? 99) - (angleOrder[b.angle] ?? 99)
    })
  }

  return result
})

// ==================== 方法 ====================

// 加载模型列表
async function loadDefaultModel() {
  try {
    const result = await window.electronAPI.image.getProviders()
    if (result.success && result.data) {
      const providers = result.data.filter((p: any) => p.configured && p.models?.length > 0)

      // 构建按提供商分组的模型列表
      providerModels.value = providers.map((provider: any) => ({
        id: provider.id,
        name: provider.name,
        models: (provider.models || []).map((model: any) => ({
          id: model.id,
          name: model.name,
          maxResolution: model.maxResolution
        }))
      }))

      // 同时构建扁平化列表（用于判断是否有模型）
      availableModels.value = []
      for (const provider of providers) {
        for (const model of provider.models || []) {
          availableModels.value.push({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} - ${model.name}`,
            providerId: provider.id,
            modelId: model.id
          })
        }
      }

      // 默认选中第一个模型
      if (availableModels.value.length > 0) {
        const first = availableModels.value[0]
        defaultModel.value = {
          providerId: first.providerId,
          modelId: first.modelId
        }
        selectedModelKey.value = first.key
      }
    }
  } catch (error) {
    console.error('加载模型失败:', error)
  }
}

// 模型搜索过滤
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

// 监听模型选择变化
function onModelChange(key: string) {
  const model = availableModels.value.find(m => m.key === key)
  if (model) {
    defaultModel.value = {
      providerId: model.providerId,
      modelId: model.modelId
    }
  }
}

// 选择参考图片
async function selectReferenceImage() {
  try {
    const result = await window.electronAPI.image.selectFile()
    if (result.success && result.data) {
      generateConfig.value.referenceImages.push(result.data.base64)
    }
  } catch (error: any) {
    ElMessage.error(error.message || '选择图片失败')
  }
}

// 移除参考图片
function removeReferenceImage(index: number) {
  generateConfig.value.referenceImages.splice(index, 1)
}

async function loadCharacter() {
  if (!props.characterId) return
  const result = await window.electronAPI.portrait.getCharacter(props.characterId)
  if (result.success && result.data) {
    character.value = result.data
    // 恢复参考图片
    if (result.data.referenceImages) {
      generateConfig.value.referenceImages = [...result.data.referenceImages]
    }
    // 如果没有保存的提示词，则使用人物基本信息生成英文提示词（避免内容审核问题）
    if (!result.data.prompt) {
      const c = result.data
      const genderText = c.gender === 'male' ? 'male' : 'female'
      const raceText = c.race === 'asian' ? 'Asian' : 'European'
      // 使用纯英文描述，避免阿里云内容审核对中文敏感词的拦截
      generateConfig.value.prompt = `portrait of a person, ${genderText}, ${raceText}, age ${c.age}, height ${c.height}cm, weight ${c.weight}kg${c.description ? ', ' + c.description : ''}`
    } else {
      generateConfig.value.prompt = result.data.prompt
    }
  }
}

async function loadVariants() {
  if (!props.characterId) return
  const result = await window.electronAPI.portrait.listVariants(props.characterId)
  if (result.success && result.data) {
    variants.value = result.data
    // 重置选中的正面变体
    selectedFrontVariantId.value = null
  }
}

async function handleGenerateFront() {
  if (!character.value || !defaultModel.value) return

  generating.value = true
  try {
    const prompt = generateConfig.value.prompt || defaultPrompt.value
    // 使用 toRaw 确保传递的是普通对象，避免 IPC 序列化问题
    const referenceImages = toRaw(generateConfig.value.referenceImages)

    // 解析尺寸
    const [width, height] = generateConfig.value.size.split('x').map(Number)

    // 更新角色的模型配置和参考图片
    await window.electronAPI.portrait.updateCharacter({
      id: props.characterId,
      providerId: defaultModel.value.providerId,
      modelId: defaultModel.value.modelId,
      prompt: prompt,
      referenceImages: referenceImages
    })

    const result = await window.electronAPI.portrait.generate({
      characterId: props.characterId,
      prompt: prompt,
      negativePrompt: generateConfig.value.negativePrompt || undefined,
      referenceImages: referenceImages,
      providerId: defaultModel.value.providerId,
      modelId: defaultModel.value.modelId,
      config: {
        angles: ['front'],
        backgroundType: 'solid',
        width,
        height
      }
    })

    if (result.success) {
      if (result.warning) {
        ElMessage.warning(result.warning)
      } else {
        ElMessage.success('生成成功')
      }
      loadVariants()
      loadCharacter()
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}

async function handleRegenerateFront() {
  if (!character.value) return

  try {
    await ElMessageBox.confirm('确定要重新生成正面形象吗？当前形象将被替换。', '确认', { type: 'warning' })
  } catch {
    return
  }

  regenerating.value = true
  try {
    // 删除现有正面形象
    if (currentFrontVariant.value) {
      await window.electronAPI.portrait.deleteVariant(currentFrontVariant.value.id)
    }

    // 使用 toRaw 确保传递普通对象
    const char = toRaw(character.value)

    // 重新生成
    const result = await window.electronAPI.portrait.generate({
      characterId: props.characterId,
      prompt: char.prompt,
      referenceImages: toRaw(char.referenceImages),
      providerId: char.providerId,
      modelId: char.modelId,
      config: {
        angles: ['front'],
        backgroundType: 'solid'
      }
    })

    if (result.success) {
      ElMessage.success('重新生成成功')
      loadVariants()
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    regenerating.value = false
  }
}

async function handleEditFront() {
  if (!editPrompt.value.trim() || !currentFrontVariant.value) return

  editing.value = true
  try {
    const result = await window.electronAPI.portrait.editImage({
      characterId: props.characterId,
      variantId: currentFrontVariant.value.id,
      editPrompt: editPrompt.value.trim()
    })

    if (result.success) {
      ElMessage.success('编辑成功')
      editPrompt.value = ''
      loadVariants()
    } else {
      ElMessage.error(result.error || '编辑失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '编辑失败')
  } finally {
    editing.value = false
  }
}

async function handleGenerateAngles() {
  if (anglesToGenerate.value.length === 0) return

  generatingAngles.value = true
  try {
    const result = await window.electronAPI.portrait.generateAngles({
      characterId: props.characterId,
      angles: toRaw(anglesToGenerate.value),
      variantId: currentFrontVariant.value?.id
    })

    if (result.success) {
      if (result.warning) {
        ElMessage.warning(result.warning)
      } else {
        ElMessage.success('多角度生成成功')
      }
      loadVariants()
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generatingAngles.value = false
  }
}

function openGenerateAnglesForVariant(variant: PortraitVariant) {
  selectedFrontVariantId.value = variant.id
  // 检查缺失的角度
  const existingAngles = new Set(
    variants.value
      .filter(v => v.parentId === variant.id || v.id === variant.id)
      .map(v => v.angle)
  )
  anglesToGenerate.value = (['left', 'right', 'back'] as PortraitAngle[]).filter(a => !existingAngles.has(a))
}

async function handleDeleteVariant(variant: PortraitVariant) {
  try {
    await ElMessageBox.confirm('确定要删除此图片吗？', '删除确认', { type: 'warning' })
    const result = await window.electronAPI.portrait.deleteVariant(variant.id)
    if (result.success) {
      ElMessage.success('删除成功')
      loadVariants()
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

function handlePreviewImage(variant: PortraitVariant | null | undefined, type: 'front' | 'group' = 'front') {
  if (!variant) return
  previewVariant.value = variant

  // 根据预览类型设置不同的预览列表
  if (type === 'front') {
    // 预览正面人像
    currentPreviewList.value = frontVariants.value
  } else {
    // 预览当前套图 - 找到该图片所属的分组
    // 分组逻辑与 variantGroups 的计算逻辑一致
    let groupId: string
    if (variant.type === 'base') {
      groupId = 'base'
    } else if (variant.angle === 'front') {
      groupId = variant.id
    } else {
      groupId = variant.parentId || variant.id
    }

    const group = variantGroups.value.find(g => g.id === groupId)
    if (group) {
      currentPreviewList.value = group.variants
    } else {
      // 如果找不到分组，只显示当前图片
      currentPreviewList.value = [variant]
    }
  }

  // 设置当前索引
  previewIndex.value = currentPreviewList.value.findIndex(v => v.id === variant.id)
  if (previewIndex.value < 0) previewIndex.value = 0
  showPreviewDialog.value = true
}

// 上一张图片
function prevImage() {
  if (previewIndex.value > 0) {
    previewIndex.value--
    previewVariant.value = currentPreviewList.value[previewIndex.value]
  }
}

// 下一张图片
function nextImage() {
  if (previewIndex.value < currentPreviewList.value.length - 1) {
    previewIndex.value++
    previewVariant.value = currentPreviewList.value[previewIndex.value]
  }
}

function handleExport() {
  showExportDialog.value = true
}

// 预览参考图
function previewReferenceImage(img: string) {
  previewRefImage.value = img
  showRefPreviewDialog.value = true
}

// ==================== 监听和生命周期 ====================

watch(() => props.characterId, () => {
  loadCharacter()
  loadVariants()
  loadDefaultModel()
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
.character-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: #fff;
  min-height: 44px;

  .header-center {
    display: flex;
    align-items: center;
    gap: 10px;

    .character-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }
}

.generator-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e9f2 100%);
}

.generate-panel {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  max-width: 560px;
  width: 100%;
  overflow: hidden;

  .panel-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px;
    background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, #fff 100%);
    border-bottom: 1px solid var(--el-border-color-lighter);

    .panel-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      background: var(--el-color-primary-light-8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--el-color-primary);
    }

    .panel-title {
      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .panel-body {
    padding: 24px;

    .form-row {
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }

      .form-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--el-text-color-primary);
        margin-bottom: 8px;
      }

      .model-select {
        width: 100%;
      }

      .size-select {
        width: 140px;
      }

      .prompt-wrapper {
        position: relative;

        .prompt-input {
          :deep(.el-textarea__inner) {
            font-size: 14px;
            line-height: 1.6;
            padding: 12px;
            border-radius: 8px;
          }
        }

        .prompt-hint {
          font-size: 12px;
          color: var(--el-text-color-secondary);
          margin-top: 6px;
        }
      }

      .negative-input {
        :deep(.el-textarea__inner) {
          font-size: 13px;
          padding: 10px 12px;
          border-radius: 8px;
        }
      }

      .form-hint {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        margin-top: 6px;
      }

      .reference-images {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;

        .reference-image-item {
          position: relative;
          width: 72px;
          height: 72px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--el-border-color);

          .el-image {
            width: 100%;
            height: 100%;
          }

          .remove-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 20px;
            height: 20px;
            padding: 0;
          }
        }

        .upload-btn {
          width: 72px;
          height: 72px;
          border: 2px dashed var(--el-border-color);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--el-text-color-secondary);
          transition: all 0.2s;

          &:hover {
            border-color: var(--el-color-primary);
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
          }

          span {
            font-size: 11px;
            margin-top: 4px;
          }
        }
      }
    }
  }

  .panel-footer {
    padding: 16px 24px 24px;
    border-top: 1px solid var(--el-border-color-lighter);

    .generate-btn {
      width: 100%;
      height: 44px;
      font-size: 15px;
      border-radius: 10px;
    }
  }
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .model-name {
    font-size: 13px;
    color: var(--el-text-color-primary);
  }

  .model-size {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.editor-content {
  display: flex;
  gap: 24px;
  padding: 20px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preview-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;

  .preview-image-large {
    width: 300px;
    height: 400px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--el-fill-color);

    .el-image {
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
  }

  .variant-tabs-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;

    .scroll-btn {
      flex-shrink: 0;
      width: 28px;
      height: 28px;

      &.left {
        margin-right: -4px;
      }

      &.right {
        margin-left: -4px;
      }
    }
  }

  .variant-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scroll-behavior: smooth;
    // 隐藏滚动条但保留滚动功能
    scrollbar-width: none; // Firefox
    -ms-overflow-style: none; // IE/Edge

    &::-webkit-scrollbar {
      display: none; // Chrome/Safari
    }

    // 最多显示4张，每张60px + 8px gap
    max-width: calc(4 * 60px + 3 * 8px);

    .variant-tab {
      flex-shrink: 0;
      width: 60px;
      height: 60px;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.2s;

      &:hover {
        border-color: var(--el-color-primary-light-5);
      }

      &.active {
        border-color: var(--el-color-primary);
      }

      .el-image {
        width: 100%;
        height: 100%;
      }
    }
  }

  .preview-actions {
    margin-top: 12px;
    display: flex;
    justify-content: center;
    gap: 8px;
  }
}

.actions-panel {
  flex: 1;
  min-width: 300px;

  .info-section {
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;

    h4 {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .info-item {
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }

      .info-label {
        display: block;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        margin-bottom: 4px;
      }

      .info-value {
        font-size: 13px;
        color: var(--el-text-color-primary);

        &.prompt-text {
          word-break: break-all;
          line-height: 1.5;
          max-height: 60px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }
      }

      &.half {
        flex: 1;
        margin-bottom: 0;
      }
    }

    .info-row {
      display: flex;
      gap: 16px;
    }

    .reference-thumbs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;

      .ref-thumb {
        width: 48px;
        height: 48px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid var(--el-border-color);
        transition: all 0.2s;

        &:hover {
          border-color: var(--el-color-primary);
          transform: scale(1.05);
        }
      }
    }
  }

  .angle-row {
    display: flex;
    align-items: center;
    gap: 12px;

    .angle-checkbox-group {
      display: flex;
      gap: 12px;
      flex: 1;
    }
  }

  .action-btn {
    margin-top: 10px;
    width: 100%;
  }
}

.panel-section {
  margin-bottom: 20px;

  h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .hint-text {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.gallery-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  h3 {
    margin: 0 0 16px;
    font-size: 16px;
    color: var(--el-text-color-primary);
  }
}

.variant-group {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h4 {
    margin: 0;
    font-size: 15px;
    color: var(--el-text-color-primary);
  }
}

.group-images {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.variant-card {
  flex-shrink: 0;
  width: 160px;
  background: var(--el-fill-color);
  border-radius: 8px;
  overflow: hidden;

  .el-image {
    width: 100%;
    height: 200px;
    cursor: pointer;
  }

  .variant-info {
    padding: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .variant-angle {
    font-size: 13px;
    color: var(--el-text-color-primary);
  }
}
</style>

<style lang="scss">
// 全局预览对话框样式
.el-dialog.preview-dialog {
  width: 90vw !important;
  height: 90vh !important;
  max-width: 90vw !important;
  max-height: 90vh !important;
  margin: 0 !important;
  position: fixed !important;
  top: 5vh !important;
  left: 5vw !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;

  .el-dialog__body {
    flex: 1 !important;
    min-height: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
}

.ref-preview-dialog {
  .el-dialog__body {
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.preview-image-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;
  position: relative;
  // 禁止选中，防止点击导航按钮时出现选中效果
  user-select: none;
  -webkit-user-select: none;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    cursor: pointer;
    // 禁止图片拖拽
    -webkit-user-drag: none;
    user-drag: none;
  }

  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 60px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.7);
    transition: all 0.2s;
    z-index: 10;

    &:hover:not(.disabled) {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }

    &.disabled {
      color: rgba(255, 255, 255, 0.3);
      cursor: not-allowed;
    }

    &.nav-prev {
      left: 0;
    }

    &.nav-next {
      right: 0;
    }
  }
}

.preview-counter {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
}
</style>