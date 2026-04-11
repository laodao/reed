<template>
  <el-dialog
    v-model="visible"
    title="项目设置"
    width="500px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="默认模型">
        <el-select
          v-model="selectedModelKey"
          placeholder="选择默认图像生成模型"
          style="width: 100%"
          filterable
          :filter-method="filterModels"
          clearable
        >
          <el-option-group
            v-for="group in filteredModelGroups"
            :key="group.providerId"
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
        <p class="hint-text">设置后，生成人物形象时将默认使用此模型</p>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { PortraitProject } from '../../../shared/types/portrait.types'

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

// ==================== Props & Emits ====================

const props = defineProps<{
  modelValue: boolean
  project: PortraitProject | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

// ==================== 状态 ====================

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  defaultProviderId: '',
  defaultModelId: ''
})

const modelGroups = ref<ModelGroup[]>([])
const modelSearchKeyword = ref('')
const selectedModelKey = ref('')
const saving = ref(false)

// ==================== 计算属性 ====================

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
}

/** 初始化表单数据 */
function initForm() {
  if (props.project) {
    if (props.project.defaultProviderId && props.project.defaultModelId) {
      selectedModelKey.value = `${props.project.defaultProviderId}:${props.project.defaultModelId}`
    } else {
      selectedModelKey.value = ''
    }
  }
}

async function handleSave() {
  if (!props.project) return

  saving.value = true

  try {
    // 解析选中的模型
    let defaultProviderId = null
    let defaultModelId = null

    if (selectedModelKey.value) {
      const [providerId, modelId] = selectedModelKey.value.split(':')
      defaultProviderId = providerId
      defaultModelId = modelId
    }

    const result = await window.electronAPI.portrait.updateProject({
      id: props.project.id,
      defaultProviderId: defaultProviderId as any,
      defaultModelId: defaultModelId as any
    })

    if (result.success) {
      ElMessage.success('设置保存成功')
      visible.value = false
      emit('success')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ==================== 监听 ====================

watch(() => props.modelValue, (val) => {
  if (val) {
    initForm()
  }
})

// ==================== 生命周期 ====================

onMounted(() => {
  loadAllModels()
})
</script>

<style lang="scss" scoped>
.hint-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}
</style>