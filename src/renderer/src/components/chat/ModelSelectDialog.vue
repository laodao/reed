<template>
  <el-dialog
    v-model="visible"
    title="选择模型"
    width="500px"
    :close-on-click-modal="true"
    @close="handleClose"
  >
    <div class="model-select-dialog">
      <!-- 搜索框 -->
      <el-input
        v-model="searchText"
        placeholder="搜索模型..."
        prefix-icon="Search"
        clearable
        class="search-input"
      />

      <!-- 模型列表 -->
      <div class="model-list">
        <div
          v-for="model in filteredModels"
          :key="model.id"
          class="model-item"
          :class="{ selected: selectedModelId === model.id }"
          @click="selectModel(model)"
        >
          <div class="model-info">
            <div class="model-name">{{ model.name }}</div>
            <div class="model-provider">{{ model.providerName }}</div>
          </div>
          <el-icon v-if="selectedModelId === model.id" class="check-icon"><Check /></el-icon>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredModels.length === 0" class="empty-state">
          <el-empty description="没有找到匹配的模型" :image-size="80" />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" :disabled="!selectedModelId" @click="handleConfirm">
          确定
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check } from '@element-plus/icons-vue'

interface ModelOption {
  id: string
  name: string
  providerName: string
  providerId: string
  modelId: string
}

const props = defineProps<{
  modelValue: boolean
  models: ModelOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', model: ModelOption): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const searchText = ref('')
const selectedModelId = ref<string | null>(null)

// 过滤后的模型列表
const filteredModels = computed(() => {
  if (!searchText.value) {
    return props.models
  }

  const keyword = searchText.value.toLowerCase()
  return props.models.filter(model =>
    model.name.toLowerCase().includes(keyword) ||
    model.providerName.toLowerCase().includes(keyword)
  )
})

// 选择模型
function selectModel(model: ModelOption) {
  selectedModelId.value = model.id
}

// 确认选择
function handleConfirm() {
  const selectedModel = props.models.find(m => m.id === selectedModelId.value)
  if (selectedModel) {
    emit('select', selectedModel)
    handleClose()
  }
}

// 关闭对话框
function handleClose() {
  visible.value = false
  searchText.value = ''
  selectedModelId.value = null
}

// 对话框打开时重置
watch(visible, (newVal) => {
  if (newVal) {
    searchText.value = ''
    selectedModelId.value = null
  }
})
</script>

<style lang="scss" scoped>
.model-select-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  flex-shrink: 0;
}

.model-list {
  height: 300px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
  }

  &.selected {
    background: var(--el-color-primary-light-9);
    border: 1px solid var(--el-color-primary-light-5);
  }

  &:not(:last-child) {
    margin-bottom: 4px;
  }
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-provider {
  font-size: 12px;
  color: #64748b;
}

.check-icon {
  color: var(--el-color-primary);
  font-size: 18px;
  flex-shrink: 0;
  margin-left: 12px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
