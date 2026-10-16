<template>
  <el-dialog
    v-model="visible"
    title="从助手库选择"
    width="720px"
    :close-on-click-modal="false"
    class="assistant-library-picker"
    @close="handleClose"
  >
    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索助手..."
        prefix-icon="Search"
        clearable
        class="search-input"
      />
    </div>

    <!-- 分类标签 -->
    <div class="category-tabs">
      <div
        class="category-tab"
        :class="{ active: selectedCategory === null }"
        @click="selectedCategory = null"
      >
        全部
      </div>
      <div
        v-for="(label, key) in categoryLabels"
        :key="key"
        class="category-tab"
        :class="{ active: selectedCategory === key }"
        @click="selectedCategory = key as AssistantCategory"
      >
        {{ label }}
      </div>
    </div>

    <!-- 模板列表 - 可滚动区域 -->
    <div class="template-list-wrapper">
      <div
        v-for="template in filteredTemplates"
        :key="template.id"
        class="template-card"
        @click="handleSelectTemplate(template)"
      >
        <div class="template-avatar">{{ template.avatar }}</div>
        <div class="template-info">
          <div class="template-name">{{ template.name }}</div>
          <div class="template-desc">{{ template.description }}</div>
          <div class="template-tags">
            <span v-for="tag in template.tags?.slice(0, 3)" :key="tag" class="tag">
              {{ tag }}
            </span>
          </div>
        </div>
        <el-button type="primary" size="small" class="select-btn">
          选择
        </el-button>
      </div>

      <el-empty v-if="filteredTemplates.length === 0" description="没有找到匹配的助手" />
    </div>

    <!-- 自定义助手入口 -->
    <div class="custom-entry" @click="handleCustomCreate">
      <el-icon><Plus /></el-icon>
      <span>自定义助手</span>
      <span class="hint">从零开始创建自己的助手</span>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import {
  ASSISTANT_LIBRARY_TEMPLATES,
  CATEGORY_LABELS,
  type AssistantLibraryTemplate,
  type AssistantCategory
} from '../../../../shared/types/assistant-library.types'

// Props
const props = defineProps<{
  modelValue: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', template: AssistantLibraryTemplate): void
  (e: 'custom'): void
}>()

// 状态
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const searchQuery = ref('')
const selectedCategory = ref<AssistantCategory | null>(null)
const categoryLabels = CATEGORY_LABELS

// 过滤后的模板列表
const filteredTemplates = computed(() => {
  let templates = ASSISTANT_LIBRARY_TEMPLATES

  // 按分类过滤
  if (selectedCategory.value) {
    templates = templates.filter(t => t.category === selectedCategory.value)
  }

  // 按搜索词过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    templates = templates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }

  return templates
})

// 选择模板
function handleSelectTemplate(template: AssistantLibraryTemplate): void {
  emit('select', template)
  visible.value = false
}

// 自定义创建
function handleCustomCreate(): void {
  emit('custom')
  visible.value = false
}

// 关闭
function handleClose(): void {
  searchQuery.value = ''
  selectedCategory.value = null
}
</script>

<style lang="scss" scoped>
.assistant-library-picker {
  :deep(.el-dialog__body) {
    padding: 16px 20px;
  }
}

.search-bar {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.category-tab {
  padding: 6px 12px;
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #e2e8f0;
    color: #475569;
  }

  &.active {
    background: var(--el-color-primary);
    color: #fff;
  }
}

.template-list-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.template-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px var(--el-color-primary-light-7);

    .select-btn {
      opacity: 1;
    }
  }
}

.template-avatar {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border-radius: 12px;
  flex-shrink: 0;
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.template-desc {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-tags {
  display: flex;
  gap: 4px;
}

.tag {
  font-size: 10px;
  padding: 2px 6px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 4px;
}

.select-btn {
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.custom-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  cursor: pointer;
  color: #64748b;
  font-size: 13px;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .hint {
    font-size: 12px;
    color: #94a3b8;
    margin-left: auto;
  }
}
</style>