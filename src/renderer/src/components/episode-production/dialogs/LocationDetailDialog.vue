<template>
  <el-dialog
    v-model="visible"
    title="地点详情"
    width="600px"
    class="entity-detail-dialog"
    destroy-on-close
  >
    <div v-loading="loading" class="detail-content">
      <template v-if="location">
        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="section-title">基本信息</div>
          <div class="section-content">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="名称">{{ location.name }}</el-descriptions-item>
              <el-descriptions-item label="类型">
                <el-tag size="small" type="info">{{ getLocationTypeLabel(location.type) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="重要性">
                <el-tag size="small" :type="getImportanceType(location.importance)">
                  {{ getEntityImportanceLabel(location.importance) }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <!-- 详细描述 -->
        <div class="detail-section">
          <div class="section-title">详细描述</div>
          <div class="section-content">
            <div class="description-text">{{ location.description || '-' }}</div>
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
              <pre class="ai-info-code">{{ formatLocationAIInfo(location) }}</pre>
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
import type { StoryLocation } from '../../../../shared/types/longwriting.types'

const props = defineProps<{
  modelValue: boolean
  locationId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const loading = ref(false)
const location = ref<StoryLocation | null>(null)

watch(() => props.modelValue, async (val) => {
  if (val && props.locationId) {
    loading.value = true
    location.value = null
    try {
      const result = await window.electronAPI.longwriting.getLocation(props.locationId)
      if (result.success && result.data) {
        location.value = result.data
      } else {
        ElMessage.error('获取地点详情失败')
        visible.value = false
      }
    } catch (error) {
      console.error('获取地点详情失败:', error)
      ElMessage.error('获取地点详情失败')
      visible.value = false
    } finally {
      loading.value = false
    }
  }
})

function getLocationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    interior: '内景',
    exterior: '外景',
    mixed: '混合'
  }
  return labels[type] || type
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

function formatLocationAIInfo(loc: StoryLocation): string {
  const parts = [
    `【地点】${loc.name}`,
    `类型：${getLocationTypeLabel(loc.type)}`,
    loc.description ? `描述：${loc.description}` : null
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
