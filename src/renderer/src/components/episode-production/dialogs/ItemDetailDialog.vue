<template>
  <el-dialog
    v-model="visible"
    title="物品详情"
    width="600px"
    class="entity-detail-dialog"
    destroy-on-close
  >
    <div v-loading="loading" class="detail-content">
      <template v-if="item">
        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="section-title">基本信息</div>
          <div class="section-content">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="名称">{{ item.name }}</el-descriptions-item>
              <el-descriptions-item label="类型">
                <el-tag size="small">{{ getItemTypeLabel(item.type) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="等级">
                <el-tag size="small" type="warning">{{ getItemLevelLabel(item.level) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="重要性">
                <el-tag size="small" :type="getImportanceType(item.importance)">
                  {{ getEntityImportanceLabel(item.importance) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="持有者" :span="2">
                {{ item.ownerId ? item.ownerId : '-' }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <!-- 详细描述 -->
        <div class="detail-section">
          <div class="section-title">详细描述</div>
          <div class="section-content">
            <div class="description-text">{{ item.description || '-' }}</div>
          </div>
        </div>

        <!-- AI 可见信息 -->
        <div class="detail-section ai-section">
          <div class="section-title">
            <el-icon><InfoFilled /></el-icon>
            AI 可见信息
          </div>
          <div class="section-content">
            <div class="ai-info-box">
              <div class="ai-info-hint">以下信息将提交给 AI 用于剧本和分镜生成：</div>
              <pre class="ai-info-code">{{ formatItemAIInfo(item) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import type { StoryItem } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  modelValue: boolean
  itemId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const loading = ref(false)
const item = ref<StoryItem | null>(null)

watch(() => props.modelValue, async (val) => {
  if (val && props.itemId) {
    loading.value = true
    item.value = null
    try {
      const result = await window.electronAPI.longwriting.getItem(props.itemId)
      if (result.success && result.data) {
        item.value = result.data
      } else {
        ElMessage.error('获取物品详情失败')
        visible.value = false
      }
    } catch (error) {
      console.error('获取物品详情失败:', error)
      ElMessage.error('获取物品详情失败')
      visible.value = false
    } finally {
      loading.value = false
    }
  }
})

function getItemTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    weapon: '武器',
    artifact: '神器',
    medicine: '丹药',
    manual: '秘籍',
    token: '信物',
    other: '其他'
  }
  return labels[type] || type
}

function getItemLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    common: '普通',
    rare: '稀有',
    legendary: '传说',
    divine: '神级'
  }
  return labels[level] || level
}

function getEntityImportanceLabel(importance: string): string {
  const labels: Record<string, string> = {
    main: '主要',
    secondary: '次要',
    temporary: '临时'
  }
  return labels[importance] || importance
}

function getImportanceType(importance: string): string {
  const types: Record<string, string> = {
    main: 'danger',
    secondary: 'warning',
    temporary: 'info'
  }
  return types[importance] || 'info'
}

function formatItemAIInfo(i: StoryItem): string {
  const parts = [
    `【物品】${i.name}`,
    `类型：${getItemTypeLabel(i.type)}`,
    `等级：${getItemLevelLabel(i.level)}`,
    i.description ? `描述：${i.description}` : null
  ].filter(Boolean)
  return parts.join('\n')
}
</script>

<style scoped lang="scss">
.detail-content {
  min-height: 100px;
}

.detail-section {
  margin-bottom: 20px;

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .description-text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
  }
}

.ai-section .section-title {
  color: var(--el-color-primary);
}

.ai-info-box {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px;

  .ai-info-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }

  .ai-info-code {
    font-family: monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    color: var(--el-text-color-primary);
  }
}
</style>
