<template>
  <div class="voice-sidebar">
    <!-- 顶部标题区域 -->
    <div class="sidebar-header">
      <h3>{{ title ?? '语音历史' }}</h3>
      <el-tooltip content="仅显示收藏" placement="bottom">
        <el-button
          :type="favoriteOnly ? 'warning' : 'default'"
          :icon="Star"
          circle
          size="small"
          @click="handleToggleFavoriteFilter"
        />
      </el-tooltip>
    </div>

    <!-- 历史列表区域 -->
    <div class="sidebar-content" v-loading="loading">
      <template v-if="histories.length > 0">
        <!-- 今天 -->
        <div v-if="groupedHistories.today.length > 0" class="history-group">
          <div class="group-title" @click="toggleGroup('today')">
            <el-icon class="collapse-icon" :class="{ collapsed: collapsedGroups.today }">
              <ArrowRight />
            </el-icon>
            <span>今天</span>
            <span class="group-count">{{ groupedHistories.today.length }}</span>
          </div>
          <div class="group-content" :class="{ collapsed: collapsedGroups.today }">
            <div
              v-for="history in groupedHistories.today"
              :key="history.id"
              class="history-card"
              :class="{ selected: selectedId === history.id }"
              @click="handleSelect(history)"
            >
              <!-- 类型图标 -->
              <div class="history-type">
                <el-icon v-if="history.type === 'tts'"><Microphone /></el-icon>
                <el-icon v-else><Headset /></el-icon>
              </div>

              <!-- 内容预览 -->
              <div class="history-content">
                <div class="history-preview" :title="getPreviewText(history)">
                  {{ getPreviewText(history) }}
                </div>
                <div class="history-meta">
                  <span class="history-type-label">
                    {{ history.type === 'tts' ? '文本转语音' : '语音转文本' }}
                  </span>
                  <span class="history-time">{{ formatTime(history.createdAt) }}</span>
                </div>
              </div>

              <!-- 收藏标记 -->
              <div v-if="history.favorite" class="favorite-badge">
                <el-icon><StarFilled /></el-icon>
              </div>

              <!-- 操作按钮 -->
              <div class="history-actions">
                <el-button
                  v-if="history.type === 'tts' && history.outputAudioPath"
                  type="success"
                  :icon="Download"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDownload(history)"
                />
                <el-button
                  :type="history.favorite ? 'warning' : 'primary'"
                  :icon="history.favorite ? StarFilled : Star"
                  circle
                  size="small"
                  plain
                  @click.stop="handleToggleFavorite(history)"
                />
                <el-button
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDelete(history)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 昨天 -->
        <div v-if="groupedHistories.yesterday.length > 0" class="history-group">
          <div class="group-title" @click="toggleGroup('yesterday')">
            <el-icon class="collapse-icon" :class="{ collapsed: collapsedGroups.yesterday }">
              <ArrowRight />
            </el-icon>
            <span>昨天</span>
            <span class="group-count">{{ groupedHistories.yesterday.length }}</span>
          </div>
          <div class="group-content" :class="{ collapsed: collapsedGroups.yesterday }">
            <div
              v-for="history in groupedHistories.yesterday"
              :key="history.id"
              class="history-card"
              :class="{ selected: selectedId === history.id }"
              @click="handleSelect(history)"
            >
              <div class="history-type">
                <el-icon v-if="history.type === 'tts'"><Microphone /></el-icon>
                <el-icon v-else><Headset /></el-icon>
              </div>
              <div class="history-content">
                <div class="history-preview" :title="getPreviewText(history)">
                  {{ getPreviewText(history) }}
                </div>
                <div class="history-meta">
                  <span class="history-type-label">
                    {{ history.type === 'tts' ? '文本转语音' : '语音转文本' }}
                  </span>
                  <span class="history-time">{{ formatTime(history.createdAt) }}</span>
                </div>
              </div>
              <div v-if="history.favorite" class="favorite-badge">
                <el-icon><StarFilled /></el-icon>
              </div>
              <div class="history-actions">
                <el-button
                  v-if="history.type === 'tts' && history.outputAudioPath"
                  type="success"
                  :icon="Download"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDownload(history)"
                />
                <el-button
                  :type="history.favorite ? 'warning' : 'primary'"
                  :icon="history.favorite ? StarFilled : Star"
                  circle
                  size="small"
                  plain
                  @click.stop="handleToggleFavorite(history)"
                />
                <el-button
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDelete(history)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 更早 -->
        <div v-if="groupedHistories.earlier.length > 0" class="history-group">
          <div class="group-title" @click="toggleGroup('earlier')">
            <el-icon class="collapse-icon" :class="{ collapsed: collapsedGroups.earlier }">
              <ArrowRight />
            </el-icon>
            <span>更早</span>
            <span class="group-count">{{ groupedHistories.earlier.length }}</span>
          </div>
          <div class="group-content" :class="{ collapsed: collapsedGroups.earlier }">
            <div
              v-for="history in groupedHistories.earlier"
              :key="history.id"
              class="history-card"
              :class="{ selected: selectedId === history.id }"
              @click="handleSelect(history)"
            >
              <div class="history-type">
                <el-icon v-if="history.type === 'tts'"><Microphone /></el-icon>
                <el-icon v-else><Headset /></el-icon>
              </div>
              <div class="history-content">
                <div class="history-preview" :title="getPreviewText(history)">
                  {{ getPreviewText(history) }}
                </div>
                <div class="history-meta">
                  <span class="history-type-label">
                    {{ history.type === 'tts' ? '文本转语音' : '语音转文本' }}
                  </span>
                  <span class="history-time">{{ formatTime(history.createdAt) }}</span>
                </div>
              </div>
              <div v-if="history.favorite" class="favorite-badge">
                <el-icon><StarFilled /></el-icon>
              </div>
              <div class="history-actions">
                <el-button
                  v-if="history.type === 'tts' && history.outputAudioPath"
                  type="success"
                  :icon="Download"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDownload(history)"
                />
                <el-button
                  :type="history.favorite ? 'warning' : 'primary'"
                  :icon="history.favorite ? StarFilled : Star"
                  circle
                  size="small"
                  plain
                  @click.stop="handleToggleFavorite(history)"
                />
                <el-button
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  plain
                  @click.stop="handleDelete(history)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <template v-else>
        <div class="empty-state">
          <el-empty description="暂无语音记录">
            <template #image>
              <el-icon :size="48"><Microphone /></el-icon>
            </template>
          </el-empty>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import {
  Star,
  StarFilled,
  Microphone,
  Headset,
  Delete,
  ArrowRight,
  Download
} from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { VoiceRecord } from '../../../../shared/types/voice.types'

/**
 * Props 定义
 */
interface Props {
  /** 当前选中的历史 ID */
  modelValue?: string
  /** 历史类型筛选：'tts' / 'stt'。缺省 'tts'（向后兼容）*/
  historyType?: 'tts' | 'stt'
  /** 标题文字（默认"语音历史"，TTS 拆独立页时可改为"合成历史"等）*/
  title?: string
}

/**
 * Emits 定义
 */
interface Emits {
  /** 更新选中历史 */
  (e: 'update:modelValue', id: string): void
  /** 历史选中事件 */
  (e: 'select', history: VoiceRecord): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 加载状态
const loading = ref(false)
// 历史列表
const histories = ref<VoiceRecord[]>([])
// 只看收藏
const favoriteOnly = ref(false)

// 当前选中的历史 ID
const selectedId = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 折叠状态
const collapsedGroups = reactive({
  today: false,
  yesterday: false,
  earlier: false
})

// 分组后的历史列表
const groupedHistories = computed(() => {
  const today: VoiceRecord[] = []
  const yesterday: VoiceRecord[] = []
  const earlier: VoiceRecord[] = []

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  for (const history of histories.value) {
    const date = typeof history.createdAt === 'string' ? new Date(history.createdAt) : history.createdAt

    if (date >= todayStart) {
      today.push(history)
    } else if (date >= yesterdayStart) {
      yesterday.push(history)
    } else {
      earlier.push(history)
    }
  }

  return { today, yesterday, earlier }
})

/**
 * 加载历史记录
 */
async function loadHistories(): Promise<void> {
  try {
    loading.value = true
    const response = await window.electronAPI.voice.history({
      page: 1,
      pageSize: 50,
      type: props.historyType ?? 'tts',
      favorite: favoriteOnly.value || undefined
    })

    if (response.success && response.data) {
      histories.value = response.data.list
    }
  } finally {
    loading.value = false
  }
}

/**
 * 切换分组折叠状态
 */
function toggleGroup(group: 'today' | 'yesterday' | 'earlier'): void {
  collapsedGroups[group] = !collapsedGroups[group]
}

/**
 * 处理历史选择
 */
function handleSelect(history: VoiceRecord): void {
  selectedId.value = history.id
  emit('select', history)
}

/**
 * 切换收藏筛选
 */
async function handleToggleFavoriteFilter(): Promise<void> {
  favoriteOnly.value = !favoriteOnly.value
  await loadHistories()
}

/**
 * 切换历史收藏状态
 */
async function handleToggleFavorite(history: VoiceRecord): Promise<void> {
  const response = await window.electronAPI.voice.toggleFavorite(history.id)
  if (response.success) {
    await loadHistories()
    ElMessage.success(history.favorite ? '已取消收藏' : '已添加收藏')
  }
}

/**
 * 删除历史
 */
async function handleDelete(history: VoiceRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条语音记录吗？',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await window.electronAPI.voice.delete(history.id)
    if (response.success) {
      await loadHistories()
      ElMessage.success('删除成功')
      // 如果删除的是当前选中的历史，清除选中状态
      if (selectedId.value === history.id) {
        selectedId.value = ''
      }
    }
  } catch {
    // 用户取消删除
  }
}

/**
 * 下载语音文件
 */
async function handleDownload(history: VoiceRecord): Promise<void> {
  if (!history.outputAudioPath) {
    ElMessage.warning('没有可下载的音频文件')
    return
  }

  const response = await window.electronAPI.voice.download(history.outputAudioPath)
  if (response.success && response.data) {
    ElMessage.success('下载成功')
  } else {
    ElMessage.error(response.error || '下载失败')
  }
}

/**
 * 获取预览文本
 */
function getPreviewText(history: VoiceRecord): string {
  if (history.type === 'tts' && history.inputText) {
    return history.inputText.length > 30
      ? history.inputText.substring(0, 30) + '...'
      : history.inputText
  }
  if (history.type === 'stt' && history.outputText) {
    return history.outputText.length > 30
      ? history.outputText.substring(0, 30) + '...'
      : history.outputText
  }
  return '语音记录'
}

/**
 * 格式化时间
 */
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  // 一小时内
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return minutes <= 1 ? '刚刚' : `${minutes}分钟前`
  }

  // 今天
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }

  // 更早
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

onMounted(() => {
  loadHistories()
})
</script>

<style lang="scss" scoped>
.voice-sidebar {
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 100%;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-right: 1px solid var(--el-border-color-lighter);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
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
    background: var(--el-border-color);
    border-radius: 3px;

    &:hover {
      background: var(--el-border-color-dark);
    }
  }
}

.history-group {
  margin-bottom: 16px;

  &:first-child {
    .group-content {
      padding-top: 8px;
    }
  }
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--el-fill-color-light);
  }

  .collapse-icon {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    transition: transform 0.2s ease;

    &.collapsed {
      transform: rotate(90deg);
    }
  }

  .group-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color);
    padding: 2px 8px;
    border-radius: 10px;
  }
}

.group-content {
  overflow: hidden;
  transition: max-height 0.3s ease, opacity 0.2s ease;
  max-height: 2000px;
  opacity: 1;

  &.collapsed {
    max-height: 0;
    opacity: 0;
  }
}

.history-card {
  position: relative;
  margin-bottom: 12px;
  padding: 12px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);

    .history-actions {
      opacity: 1;
    }
  }

  &.selected {
    border-color: var(--el-color-primary);
    background: linear-gradient(
      135deg,
      var(--el-color-primary-light-9) 0%,
      #ffffff 100%
    );
    box-shadow: 0 4px 16px rgba(64, 158, 255, 0.15);
  }
}

.history-type {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  color: var(--el-color-primary);
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1;
}

.history-content {
  .history-preview {
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 6px;
  }

  .history-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;

    .history-type-label {
      color: var(--el-color-primary);
    }

    .history-time {
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      padding: 2px 8px;
      border-radius: 4px;
    }
  }
}

.favorite-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  color: var(--el-color-warning);
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1;
}

.history-actions {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 2;

  .el-button {
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    :deep(.el-icon) {
      color: inherit;
    }

    &:hover {
      background: #ffffff;
      transform: scale(1.1);
    }

    &.el-button--primary {
      &:hover {
        background: var(--el-color-primary);
        :deep(.el-icon) {
          color: #fff;
        }
      }
    }

    &.el-button--warning {
      &:hover {
        background: var(--el-color-warning);
        :deep(.el-icon) {
          color: #fff;
        }
      }
    }

    &.el-button--danger {
      &:hover {
        background: var(--el-color-danger);
        :deep(.el-icon) {
          color: #fff;
        }
      }
    }

    &.el-button--success {
      &:hover {
        background: var(--el-color-success);
        :deep(.el-icon) {
          color: #fff;
        }
      }
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--el-text-color-placeholder);

  .el-icon {
    color: var(--el-text-color-placeholder);
  }
}
</style>