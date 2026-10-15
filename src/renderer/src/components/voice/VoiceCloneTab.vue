<template>
  <!--
    VoiceCloneTab · Voice.vue 「声音复刻」tab 主区
    设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §8.1

    布局：
      - 顶部 toolbar：刷新按钮 + 「+ 新建复刻」打开 VoiceCloneDialog
      - 中部网格：每条复刻音色卡（试听 / 删除 / 状态徽标）
      - 空态：引导用户新建第一个
  -->
  <div class="voice-clone-tab">
    <header class="toolbar">
      <div class="toolbar-left">
        <span class="title">已复刻音色</span>
        <el-tag round size="small">{{ clonedList.length }}</el-tag>
      </div>
      <div class="toolbar-right">
        <el-button :loading="loading" :icon="Refresh" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openDialog">
          新建复刻
        </el-button>
      </div>
    </header>

    <div v-loading="loading" class="card-grid">
      <div v-if="!loading && clonedList.length === 0" class="empty-state">
        <el-empty description="尚未复刻任何音色">
          <el-button type="primary" :icon="Plus" @click="openDialog">
            创建第一个
          </el-button>
        </el-empty>
      </div>

      <article
        v-for="v in clonedList"
        :key="v.id"
        class="voice-card"
        :class="`status-${v.status}`"
      >
        <div class="card-head">
          <span class="emoji">{{ v.status === 'ready' ? '🎤' : '⏳' }}</span>
          <span class="card-name" :title="v.name">{{ v.name }}</span>
          <el-tag :type="statusTagType(v.status)" size="small" effect="light">
            {{ statusLabel(v.status) }}
          </el-tag>
        </div>

        <div class="card-meta">
          <div v-if="v.voiceId" class="meta-row">
            <span class="meta-label">Voice ID</span>
            <code class="meta-mono">{{ v.voiceId }}</code>
          </div>
          <div v-if="v.sampleDuration" class="meta-row">
            <span class="meta-label">样本</span>
            <span>{{ Math.round(v.sampleDuration / 1000) }}s</span>
          </div>
          <div v-if="v.errorMessage" class="meta-row meta-error">
            <span class="meta-label">错误</span>
            <span>{{ v.errorMessage }}</span>
          </div>
        </div>

        <div class="card-actions">
          <el-button
            v-if="v.status === 'ready'"
            size="small"
            :loading="previewingId === v.id"
            @click="onPreview(v.id)"
          >
            <el-icon><VideoPlay /></el-icon>
            试听
          </el-button>
          <el-button
            v-if="v.status === 'training'"
            size="small"
            :loading="refreshingId === v.id"
            @click="onRefreshOne(v.id)"
          >
            <el-icon><Refresh /></el-icon>
            刷新状态
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :loading="deletingId === v.id"
            @click="onDelete(v)"
          >
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>
      </article>
    </div>

    <VoiceCloneDialog
      v-model="dialogVisible"
      use-case="standalone"
      @completed="onCloneCompleted"
      @failed="onCloneFailed"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Plus,
  Refresh,
  VideoPlay,
} from '@element-plus/icons-vue'
import VoiceCloneDialog from './VoiceCloneDialog.vue'
import type { ClonedVoice } from '../../../../shared/types/voice.types'

const loading = ref(false)
const clonedList = ref<ClonedVoice[]>([])
const dialogVisible = ref(false)
const previewingId = ref<string>('')
const refreshingId = ref<string>('')
const deletingId = ref<string>('')

let unsubCompleted: (() => void) | null = null
let unsubFailed: (() => void) | null = null

const statusLabel = (s: string): string => {
  if (s === 'ready') return '已就绪'
  if (s === 'training') return '训练中'
  if (s === 'failed') return '失败'
  return s
}

const statusTagType = computed(() => (s: string) => {
  if (s === 'ready') return 'success'
  if (s === 'training') return 'info'
  if (s === 'failed') return 'danger'
  return 'info'
})

async function reload(): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.getClonedVoices) {
    ElMessage.error('voice.getClonedVoices IPC 未就绪')
    return
  }
  loading.value = true
  try {
    const resp = await api.getClonedVoices()
    if (resp?.success && Array.isArray(resp.data)) {
      clonedList.value = resp.data
    } else {
      ElMessage.error(resp?.error || '加载复刻音色列表失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载列表异常')
  } finally {
    loading.value = false
  }
}

function openDialog(): void {
  dialogVisible.value = true
}

async function onCloneCompleted(): Promise<void> {
  ElMessage.success('音色复刻完成')
  await reload()
}

async function onCloneFailed(payload: { errorMessage?: string }): Promise<void> {
  ElMessage.error(`复刻失败：${payload.errorMessage ?? '未知错误'}`)
  await reload()
}

async function onRefreshOne(id: string): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.refreshCloneStatus) return
  refreshingId.value = id
  try {
    const resp = await api.refreshCloneStatus(id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '刷新失败')
    }
    await reload()
  } finally {
    refreshingId.value = ''
  }
}

async function onPreview(id: string): Promise<void> {
  const api = (window as any).electronAPI?.voice
  if (!api?.preview) return
  previewingId.value = id
  try {
    const resp = await api.preview(id)
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

async function onDelete(v: ClonedVoice): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除复刻音色 "${v.name}"？\n如有角色绑定该音色将被解绑，无法恢复。`,
      '删除复刻音色',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const api = (window as any).electronAPI?.voice
  if (!api?.deleteClonedVoice) return
  deletingId.value = v.id
  try {
    const resp = await api.deleteClonedVoice(v.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '删除失败')
      return
    }
    ElMessage.success('已删除')
    await reload()
  } finally {
    deletingId.value = ''
  }
}

onMounted(() => {
  void reload()
  // 订阅事件，自动刷新列表（后台 scheduler 推完成 / 失败时）
  const api = (window as any).electronAPI?.voice
  if (api?.onCloneCompleted) {
    unsubCompleted = api.onCloneCompleted(() => {
      void reload()
    })
  }
  if (api?.onCloneFailed) {
    unsubFailed = api.onCloneFailed(() => {
      void reload()
    })
  }
})

onBeforeUnmount(() => {
  if (unsubCompleted) unsubCompleted()
  if (unsubFailed) unsubFailed()
})
</script>

<style scoped lang="scss">
.voice-clone-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 14px;
  padding: 16px;
  overflow: auto;
  background: var(--el-bg-color-page);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;

  .title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.voice-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.15s, transform 0.15s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.status-training {
    border-left: 3px solid var(--el-color-info);
  }

  &.status-ready {
    border-left: 3px solid var(--el-color-success);
  }

  &.status-failed {
    border-left: 3px solid var(--el-color-danger);
  }
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.emoji {
  font-size: 18px;
  line-height: 1;
}

.card-name {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.meta-label {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
  width: 56px;
}

.meta-mono {
  font-family: var(--el-font-family-monospace, monospace);
  font-size: 11px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.meta-error {
  color: var(--el-color-danger);
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
</style>
