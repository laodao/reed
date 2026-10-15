<template>
  <!--
    VoiceDesignSidebar · 声音设计历史侧栏
    显示设计音色列表（training/ready/failed），支持试听、刷新状态、删除。
  -->
  <div class="voice-design-sidebar">
    <!-- 顶部标题区域 -->
    <div class="sidebar-header">
      <h3>{{ title }}</h3>
      <el-button
        type="primary"
        :icon="Plus"
        circle
        size="small"
        @click="handleCreate"
      />
    </div>

    <!-- 列表区域 -->
    <div class="sidebar-content" v-loading="loading">
      <template v-if="designList.length > 0">
        <div
          v-for="voice in designList"
          :key="voice.id"
          class="design-card"
          :class="{ selected: selectedId === voice.id, [`status-${voice.status}`]: true }"
          @click="handleSelect(voice)"
        >
          <!-- 状态图标 -->
          <div class="card-status">
            <el-icon v-if="voice.status === 'ready'" class="status-ready"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="voice.status === 'failed'" class="status-failed"><CircleCloseFilled /></el-icon>
            <el-icon v-else class="status-training"><Loading /></el-icon>
          </div>

          <!-- 内容 -->
          <div class="card-content">
            <div class="card-name" :title="voice.name">{{ voice.name }}</div>
            <div class="card-prompt" :title="voice.voicePrompt">
              {{ voice.voicePrompt.length > 40 ? voice.voicePrompt.slice(0, 40) + '...' : voice.voicePrompt }}
            </div>
            <div class="card-meta">
              <el-tag :type="statusTagType(voice.status)" size="small" effect="plain">
                {{ statusLabel(voice.status) }}
              </el-tag>
              <span class="card-time">{{ formatTime(voice.createdAt) }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="card-actions" v-if="selectedId === voice.id">
            <el-button
              v-if="voice.status === 'ready'"
              size="small"
              type="success"
              plain
              :loading="previewingId === voice.id"
              @click.stop="handlePreview(voice)"
            >
              试听
            </el-button>
            <el-button
              v-if="voice.status === 'training'"
              size="small"
              :loading="refreshingId === voice.id"
              @click.stop="handleRefresh(voice)"
            >
              刷新
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :loading="deletingId === voice.id"
              @click.stop="handleDelete(voice)"
            >
              删除
            </el-button>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <template v-else>
        <div class="empty-state">
          <el-empty description="尚未设计任何音色">
            <el-button type="primary" :icon="Plus" @click="handleCreate">
              创建第一个
            </el-button>
          </el-empty>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
} from '@element-plus/icons-vue'
import type { DesignedVoice } from '../../../shared/types/voice.types'

const props = defineProps<{
  /** 标题 */
  title?: string
  /** 当前选中 ID */
  selectedId?: string
}>()

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'select', voice: DesignedVoice): void
  (e: 'refresh'): void
}>()

const loading = ref(false)
const designList = ref<DesignedVoice[]>([])
const previewingId = ref<string>('')
const refreshingId = ref<string>('')
const deletingId = ref<string>('')

const statusLabel = (s: string): string => {
  if (s === 'ready') return '已就绪'
  if (s === 'training') return '训练中'
  if (s === 'failed') return '失败'
  return s
}

const statusTagType = (s: string): 'success' | 'info' | 'danger' => {
  if (s === 'ready') return 'success'
  if (s === 'training') return 'info'
  return 'danger'
}

async function loadList(): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.getDesignedVoices) {
    ElMessage.error('voice.getDesignedVoices IPC 未就绪')
    return
  }
  loading.value = true
  try {
    const resp = await api.getDesignedVoices()
    if (resp?.success && Array.isArray(resp.data)) {
      designList.value = resp.data
    } else {
      ElMessage.error(resp?.error || '加载设计音色列表失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载列表异常')
  } finally {
    loading.value = false
  }
}

function handleCreate(): void {
  emit('create')
}

function handleSelect(voice: DesignedVoice): void {
  emit('select', voice)
}

async function handlePreview(voice: DesignedVoice): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.previewDesignedVoice) return
  previewingId.value = voice.id
  try {
    const resp = await api.previewDesignedVoice(voice.id)
    if (!resp?.success || !resp.data?.audioPath) {
      ElMessage.error(resp?.error || '试听失败')
      return
    }
    const audio = new Audio(resp.data.audioPath)
    audio.play().catch((err: any) => {
      ElMessage.error(`音频播放失败：${err?.message ?? err}`)
    })
  } catch (e: any) {
    ElMessage.error(e?.message || '试听异常')
  } finally {
    previewingId.value = ''
  }
}

async function handleRefresh(voice: DesignedVoice): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.refreshDesignStatus) return
  refreshingId.value = voice.id
  try {
    const resp = await api.refreshDesignStatus(voice.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '刷新失败')
    } else if (resp.data?.status === 'ready') {
      ElMessage.success('音色已就绪')
    } else if (resp.data?.status === 'failed') {
      ElMessage.error(`训练失败：${resp.data?.errorMessage || '未知原因'}`)
    }
    await loadList()
    emit('refresh')
  } finally {
    refreshingId.value = ''
  }
}

async function handleDelete(voice: DesignedVoice): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除设计音色 "${voice.name}"？\n如有角色绑定该音色将被解绑，无法恢复。`,
      '删除设计音色',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const api = (window as any).electronAPI?.voice
  if (!api?.deleteDesignedVoice) return
  deletingId.value = voice.id
  try {
    const resp = await api.deleteDesignedVoice(voice.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '删除失败')
      return
    }
    ElMessage.success('已删除')
    await loadList()
    emit('refresh')
  } finally {
    deletingId.value = ''
  }
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 暴露给父组件调用
defineExpose({ loadList })

onMounted(() => {
  loadList()
})
</script>

<style scoped lang="scss">
.voice-design-sidebar {
  display: flex;
  flex-direction: column;
  width: 300px;
  height: 100%;
  background: linear-gradient(180deg, var(--bg-color) 0%, var(--bg-color-page) 100%);
  border-right: 1px solid var(--border-color-lighter);
  box-shadow: var(--shadow-sm);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color-lighter);

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;

    &:hover {
      background: var(--border-color-dark);
    }
  }
}

.design-card {
  position: relative;
  margin-bottom: 12px;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-lighter);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: var(--color-primary-light-9);
    border-color: var(--color-primary-light-5);
  }

  &.selected {
    border-color: var(--color-primary);
    background: linear-gradient(
      135deg,
      var(--color-primary-light-9) 0%,
      var(--bg-color) 100%
    );
    box-shadow: 0 4px 16px var(--color-glow);
  }

  &.status-training {
    border-left: 3px solid var(--color-info);
  }

  &.status-ready {
    border-left: 3px solid var(--color-success);
  }

  &.status-failed {
    border-left: 3px solid var(--color-danger);
  }
}

.card-status {
  position: absolute;
  top: 10px;
  right: 10px;

  .status-ready {
    color: var(--color-success);
  }
  .status-training {
    color: var(--color-info);
  }
  .status-failed {
    color: var(--color-danger);
  }
}

.card-content {
  .card-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-prompt {
    font-size: 12px;
    color: var(--text-regular);
    line-height: 1.4;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 8px;

    .card-time {
      font-size: 11px;
      color: var(--text-secondary);
    }
  }
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color-lighter);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}
</style>