<template>
  <el-dialog
    :model-value="modelValue"
    title="加入知识库"
    width="500px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="loading" class="state-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中...</span>
    </div>

    <el-alert
      v-else-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
    >
      <template #default>
        <el-button text @click="loadKbs">重试</el-button>
      </template>
    </el-alert>

    <div v-else-if="kbs.length === 0" class="state-empty">
      <el-icon :size="48" color="var(--el-text-color-placeholder)">
        <Box />
      </el-icon>
      <p>还没有知识库</p>
      <el-button type="primary" @click="goCreateKb">去新建知识库 →</el-button>
    </div>

    <el-radio-group
      v-else
      v-model="selectedKbId"
      class="kb-list"
    >
      <el-radio
        v-for="kb in kbs"
        :key="kb.id"
        :value="kb.id"
        :label="kb.id"
        class="kb-item"
      >
        <div class="kb-name">{{ kb.name }}</div>
        <div v-if="kb.description" class="kb-desc">{{ kb.description }}</div>
        <div class="kb-meta">
          {{ kb.documentCount }} 篇文档 · {{ kb.embeddingModel }}
        </div>
      </el-radio>
    </el-radio-group>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :disabled="!selectedKbId || importing"
        :loading="importing"
        @click="handleConfirm"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading, Box } from '@element-plus/icons-vue'
import type { KnowledgeBase } from '@shared/types/knowledge-base.types'

const props = defineProps<{
  modelValue: boolean
  entryId: string
  title: string
  content: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'imported': [{ kbId: string; isUpdate: boolean }]
}>()

const router = useRouter()
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const kbs = ref<KnowledgeBase[]>([])
const selectedKbId = ref<string | null>(null)
const importing = ref(false)

watch(
  () => props.modelValue,
  open => {
    if (open) {
      selectedKbId.value = null
      errorMsg.value = null
      loadKbs()
    }
  },
)

async function loadKbs() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await window.electronAPI.knowledgeBase.list()
    if (res.success) {
      kbs.value = res.data || []
    } else {
      errorMsg.value = res.error || '加载知识库失败'
    }
  } catch (e) {
    console.error('[KbPickerDialog] loadKbs:', e)
    errorMsg.value = '加载知识库失败'
  } finally {
    loading.value = false
  }
}

function goCreateKb() {
  emit('update:modelValue', false)
  router.push('/knowledge-base')
}

async function handleConfirm() {
  if (!selectedKbId.value) return
  importing.value = true
  try {
    const res = await window.electronAPI.knowledgeBase.addDocument(selectedKbId.value, {
      name: props.title || '未命名日记',
      type: 'text',
      content: props.content,
      source: { type: 'diary', id: props.entryId },
    })
    if (res.success && res.data) {
      ElMessage.success(res.data.isUpdate ? '已更新到知识库' : '已加入知识库')
      emit('imported', { kbId: selectedKbId.value, isUpdate: res.data.isUpdate })
      emit('update:modelValue', false)
    } else {
      ElMessage.error(res.error || '导入失败')
    }
  } catch (e) {
    console.error('[KbPickerDialog] addDocument:', e)
    ElMessage.error('导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<style lang="scss" scoped>
.state-loading,
.state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.kb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  :deep(.el-radio) {
    width: 100%;
    margin-right: 0;
    height: auto;
    padding: 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    transition: all 0.2s;

    &.is-checked {
      border-color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    .el-radio__label {
      flex: 1;
      padding-left: 8px;
    }
  }
}

.kb-item {
  .kb-name {
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .kb-desc {
    font-size: 12px;
    color: var(--el-text-color-regular);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kb-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
  }
}
</style>
