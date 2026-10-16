<template>
  <!--
    VoiceDesign · 声音设计独立页
    左侧：设计音色历史侧栏
    右侧：主功能区（创建设计 + 详细信息展示）
  -->
  <div class="voice-design-page">
    <VoiceDesignSidebar
      ref="sidebarRef"
      title="设计历史"
      :selected-id="selectedVoice?.id"
      @create="openDialog"
      @select="handleSelect"
      @refresh="handleRefresh"
    />

    <div class="page-main">
      <!-- 未选中时：显示引导 -->
      <div v-if="!selectedVoice" class="main-empty">
        <el-empty description="选择一个设计音色或创建新的">
          <el-button type="primary" :icon="Plus" @click="openDialog">
            新建设计
          </el-button>
        </el-empty>
      </div>

      <!-- 已选中时：显示详情 -->
      <div v-else class="main-detail">
        <header class="detail-header">
          <div class="header-left">
            <span class="emoji">{{ selectedVoice.status === 'ready' ? '🎤' : '⏳' }}</span>
            <h2 class="detail-name">{{ selectedVoice.name }}</h2>
            <el-tag :type="statusTagType(selectedVoice.status)" size="small">
              {{ statusLabel(selectedVoice.status) }}
            </el-tag>
          </div>
          <div class="header-right">
            <el-button
              v-if="selectedVoice.status === 'ready'"
              type="success"
              :loading="previewing"
              @click="handlePreview"
            >
              试听
            </el-button>
            <el-button
              v-if="selectedVoice.status === 'training'"
              :loading="refreshing"
              @click="handleRefreshSelected"
            >
              刷新状态
            </el-button>
          </div>
        </header>

        <div class="detail-body">
          <div class="detail-section">
            <div class="section-title">声音描述</div>
            <div class="section-content">{{ selectedVoice.voicePrompt }}</div>
          </div>

          <div class="detail-grid">
            <div class="detail-item">
              <div class="item-label">Voice ID</div>
              <div class="item-value">
                <code v-if="selectedVoice.voiceId">{{ selectedVoice.voiceId }}</code>
                <span v-else class="item-empty">待生成</span>
              </div>
            </div>
            <div class="detail-item">
              <div class="item-label">目标模型</div>
              <div class="item-value">{{ selectedVoice.targetModel || 'cosyvoice-v3.5-plus' }}</div>
            </div>
            <div class="detail-item">
              <div class="item-label">前缀</div>
              <div class="item-value">{{ selectedVoice.prefix || '-' }}</div>
            </div>
            <div class="detail-item">
              <div class="item-label">创建时间</div>
              <div class="item-value">{{ formatDateTime(selectedVoice.createdAt) }}</div>
            </div>
          </div>

          <div v-if="selectedVoice.errorMessage" class="detail-error">
            <el-alert type="error" :closable="false">
              <template #title>错误信息</template>
              {{ selectedVoice.errorMessage }}
            </el-alert>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建对话框 -->
    <VoiceDesignDialog
      v-model="dialogVisible"
      @completed="onDesignCompleted"
      @failed="onDesignFailed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import VoiceDesignSidebar from '@/components/voice/VoiceDesignSidebar.vue'
import VoiceDesignDialog from '@/components/voice/VoiceDesignDialog.vue'
import type { DesignedVoice } from '../../../shared/types/voice.types'

const sidebarRef = ref<{ loadList: () => Promise<void> } | null>(null)
const selectedVoice = ref<DesignedVoice | null>(null)
const dialogVisible = ref(false)
const previewing = ref(false)
const refreshing = ref(false)

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

function openDialog(): void {
  dialogVisible.value = true
}

function handleSelect(voice: DesignedVoice): void {
  selectedVoice.value = voice
}

async function handleRefresh(): Promise<void> {
  // sidebar 刷新后，如果选中的音色状态变化，更新显示
  if (selectedVoice.value && sidebarRef.value) {
    await sidebarRef.value.loadList()
    // 重新获取选中音色的最新数据
    const api = (window as any).electronAPI?.voice
    if (api?.getDesignedVoices) {
      const resp = await api.getDesignedVoices()
      if (resp?.success && Array.isArray(resp.data)) {
        const updated = resp.data.find(v => v.id === selectedVoice.value?.id)
        if (updated) {
          selectedVoice.value = updated
        }
      }
    }
  }
}

async function handleRefreshSelected(): Promise<void> {
  if (!selectedVoice.value) return
  const api = (window as any).electronAPI?.voice
  if (!api?.refreshDesignStatus) return
  refreshing.value = true
  try {
    const resp = await api.refreshDesignStatus(selectedVoice.value.id)
    if (!resp?.success) {
      ElMessage.error(resp?.error || '刷新失败')
    } else if (resp.data?.status === 'ready') {
      ElMessage.success('音色已就绪')
    } else if (resp.data?.status === 'failed') {
      ElMessage.error(`训练失败：${resp.data?.errorMessage || '未知原因'}`)
    }
    await handleRefresh()
  } finally {
    refreshing.value = false
  }
}

async function handlePreview(): Promise<void> {
  if (!selectedVoice.value) return
  const api = (window as any).electronAPI?.voice
  if (!api?.previewDesignedVoice) return
  previewing.value = true
  try {
    const resp = await api.previewDesignedVoice(selectedVoice.value.id)
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
    previewing.value = false
  }
}

async function onDesignCompleted(payload: { id: string }): Promise<void> {
  ElMessage.success('音色设计完成')
  dialogVisible.value = false
  if (sidebarRef.value) {
    await sidebarRef.value.loadList()
  }
  // 选中新创建的音色
  const api = (window as any).electronAPI?.voice
  if (api?.getDesignedVoices) {
    const resp = await api.getDesignedVoices()
    if (resp?.success && Array.isArray(resp.data)) {
      const created = resp.data.find(v => v.id === payload.id)
      if (created) {
        selectedVoice.value = created
      }
    }
  }
}

async function onDesignFailed(payload: { errorMessage?: string }): Promise<void> {
  ElMessage.error(`设计失败：${payload.errorMessage ?? '未知错误'}`)
  dialogVisible.value = false
  if (sidebarRef.value) {
    await sidebarRef.value.loadList()
  }
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped lang="scss">
.voice-design-page {
  display: flex;
  height: 100%;
  background: var(--bg-color-page);
  overflow: hidden;
}

.page-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  padding: 20px;
}

.main-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.main-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: auto;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: 12px;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .emoji {
      font-size: 24px;
    }

    .detail-name {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .header-right {
    display: flex;
    gap: 8px;
  }
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: 12px;
}

.detail-section {
  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .section-content {
    font-size: 14px;
    color: var(--text-regular);
    line-height: 1.6;
    padding: 12px;
    background: var(--fill-color-light);
    border-radius: 8px;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  .item-label {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .item-value {
    font-size: 14px;
    color: var(--text-primary);

    code {
      font-family: monospace;
      font-size: 12px;
      background: var(--fill-color-light);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .item-empty {
      color: var(--text-placeholder);
    }
  }
}

.detail-error {
  margin-top: 8px;
}
</style>