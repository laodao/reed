<template>
  <div class="portrait-generator">
    <div class="generator-card">
      <h3 class="card-title">生成人物形象</h3>

      <!-- 模型选择 -->
      <div class="form-section">
        <label class="section-label">选择模型</label>
        <el-select
          v-model="selectedModelKey"
          placeholder="选择图像生成模型"
          style="width: 100%"
          filterable
          :filter-method="filterModels"
        >
          <el-option-group
            v-for="group in filteredModelGroups"
            :key="group.providerName"
            :label="group.providerName"
          >
            <el-option
              v-for="model in group.models"
              :key="model.key"
              :label="model.name"
              :value="model.key"
            >
              <span>{{ model.name }}</span>
              <span style="color: var(--el-text-color-secondary); font-size: 12px; margin-left: 8px;">{{ group.providerName }}</span>
            </el-option>
          </el-option-group>
        </el-select>
      </div>

      <!-- 人物描述 -->
      <div class="form-section">
        <label class="section-label">人物描述</label>
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="描述人物的外貌特征：年龄、性别、发型、肤色、体型、服装风格等..."
          maxlength="2000"
          show-word-limit
        />
      </div>

      <!-- 参考图片 -->
      <div class="form-section">
        <label class="section-label">参考图片（可选）</label>
        <div class="reference-images">
          <div
            v-for="(img, index) in referenceImages"
            :key="index"
            class="reference-item"
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
            v-if="referenceImages.length < 3"
            class="reference-upload"
            @click="selectReferenceImage"
          >
            <el-icon><Plus /></el-icon>
            <span>上传参考图</span>
          </div>
        </div>
      </div>

      <!-- 生成角度 -->
      <div class="form-section">
        <label class="section-label">生成角度</label>
        <div class="angle-options">
          <el-checkbox-group v-model="selectedAngles">
            <el-checkbox value="front">正面</el-checkbox>
            <el-checkbox value="left">左侧</el-checkbox>
            <el-checkbox value="right">右侧</el-checkbox>
            <el-checkbox value="back">背面</el-checkbox>
          </el-checkbox-group>
        </div>
      </div>

      <!-- 背景设置 -->
      <div class="form-section">
        <label class="section-label">背景设置</label>
        <div class="background-settings">
          <el-radio-group v-model="backgroundType">
            <el-radio value="solid">纯色背景</el-radio>
            <el-radio value="transparent">透明背景</el-radio>
          </el-radio-group>
          <el-color-picker
            v-if="backgroundType === 'solid'"
            v-model="backgroundColor"
            show-alpha
          />
        </div>
      </div>

      <!-- 生成按钮 -->
      <div class="form-actions">
        <el-button
          type="primary"
          size="large"
          :loading="generating"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          {{ generating ? '生成中...' : '生成人物' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Close } from '@element-plus/icons-vue'
import type { PortraitAngle } from '../../../../shared/types/portrait.types'

const props = defineProps<{
  projectId?: string
  angles?: PortraitAngle[]  // 外部控制生成哪些角度
}>()

const emit = defineEmits<{
  generated: [projectId: string]
}>()

// ==================== 类型定义 ====================

interface ModelItem {
  key: string           // providerId:modelId
  id: string            // modelId
  name: string
  providerId: string
  providerName: string
}

interface ModelGroup {
  providerId: string
  providerName: string
  models: ModelItem[]
}

// ==================== 状态 ====================

const modelGroups = ref<ModelGroup[]>([])
const modelSearchKeyword = ref('')
const selectedModelKey = ref('')
const prompt = ref('')
const referenceImages = ref<string[]>([])
const selectedAngles = ref<PortraitAngle[]>(['front', 'left', 'right', 'back'])
const backgroundType = ref<'solid' | 'transparent'>('solid')
const backgroundColor = ref('#FFFFFF')
const generating = ref(false)

// ==================== 计算属性 ====================

const canGenerate = computed(() => {
  return prompt.value.trim() && selectedModelKey.value && selectedAngles.value.length > 0
})

/** 过滤后的模型列表 */
const filteredModelGroups = computed(() => {
  if (!modelSearchKeyword.value) {
    return modelGroups.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  const result: ModelGroup[] = []

  for (const group of modelGroups.value) {
    const filteredModels = group.models.filter(model =>
      model.name.toLowerCase().includes(keyword) ||
      model.id.toLowerCase().includes(keyword) ||
      group.providerName.toLowerCase().includes(keyword)
    )

    if (filteredModels.length > 0) {
      result.push({
        ...group,
        models: filteredModels
      })
    }
  }

  return result
})

// ==================== 监听器 ====================

// 监听外部 angles prop 变化，更新内部 selectedAngles
watch(() => props.angles, (newAngles) => {
  if (newAngles && newAngles.length > 0) {
    selectedAngles.value = [...newAngles]
  }
}, { immediate: true })

// ==================== 方法 ====================

/** 模型搜索过滤方法 */
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

async function loadAllModels() {
  const result = await window.electronAPI.image.getProviders()
  if (!result.success || !result.data) return

  const providers = result.data
  const groups: ModelGroup[] = []

  for (const provider of providers) {
    const modelsResult = await window.electronAPI.image.getModels(provider.id)
    if (modelsResult.success && modelsResult.data && modelsResult.data.length > 0) {
      const models: ModelItem[] = modelsResult.data.map((model: any) => ({
        key: `${provider.id}:${model.id}`,
        id: model.id,
        name: model.name || model.id,
        providerId: provider.id,
        providerName: provider.name
      }))
      groups.push({
        providerId: provider.id,
        providerName: provider.name,
        models
      })
    }
  }

  modelGroups.value = groups

  // 默认选中第一个模型
  if (groups.length > 0 && groups[0].models.length > 0) {
    selectedModelKey.value = groups[0].models[0].key
  }
}

async function selectReferenceImage() {
  const result = await window.electronAPI.image.selectFile()
  if (result.success && result.data) {
    referenceImages.value.push(result.data.base64)
  }
}

function removeReferenceImage(index: number) {
  referenceImages.value.splice(index, 1)
}

async function handleGenerate() {
  if (!canGenerate.value) return

  // 解析选中的模型
  const [providerId, modelId] = selectedModelKey.value.split(':')

  generating.value = true

  try {
    const result = await window.electronAPI.portrait.generate({
      projectId: props.projectId,
      prompt: prompt.value,
      referenceImages: [...referenceImages.value],
      providerId: providerId,
      modelId: modelId,
      config: {
        angles: [...selectedAngles.value] as ('front' | 'left' | 'right' | 'back')[],
        backgroundType: backgroundType.value,
        backgroundColor: backgroundColor.value
      }
    })

    if (result.success && result.data?.projectId) {
      ElMessage.success('人物形象生成成功')
      emit('generated', result.data.projectId)
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}

// 暴露方法给父组件
function setParams(params: any) {
  if (params.prompt) prompt.value = params.prompt
  if (params.providerId && params.modelId) {
    selectedModelKey.value = `${params.providerId}:${params.modelId}`
  }
}

defineExpose({ setParams })

// ==================== 生命周期 ====================

onMounted(() => {
  loadAllModels()
})
</script>

<style lang="scss" scoped>
.portrait-generator {
  max-width: 800px;
  margin: 0 auto;
}

.generator-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 24px;
}

.form-section {
  margin-bottom: 24px;
}

.section-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}

.reference-images {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.reference-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;

  .el-image {
    width: 100%;
    height: 100%;
  }

  .remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
  }
}

.reference-upload {
  width: 80px;
  height: 80px;
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
  }

  span {
    font-size: 12px;
    margin-top: 4px;
  }
}

.angle-options {
  :deep(.el-checkbox-group) {
    display: flex;
    gap: 16px;
  }
}

.background-settings {
  display: flex;
  align-items: center;
  gap: 16px;
}

.form-actions {
  display: flex;
  justify-content: center;
  margin-top: 32px;

  .el-button {
    min-width: 200px;
  }
}
</style>