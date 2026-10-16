<template>
  <el-card class="asset-card" shadow="hover" body-style="padding: 8px;" @click="onCardClick">
    <div class="thumb">
      <el-icon size="32"><Microphone /></el-icon>
      <el-tag
        class="badge"
        size="small"
        :type="statusTagType"
        effect="dark"
      >
        {{ statusLabel }}
      </el-tag>
    </div>

    <div class="body">
      <div class="title">
        <span class="name-text">{{ displayName }}</span>
      </div>
      <div class="meta">{{ statusHint }}</div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 语音资产卡（P3a Task 11）
 * @module renderer/components/episode-production/stage-asset/VoiceAssetCard
 * @description 语音资产无 sourceType / 主图概念；展示 name + status (training/ready) tag。
 *              不发出 generate-main 事件，由父级 onAddVoice 走"复刻新声音"流程。
 */
import { computed } from 'vue'
import { Microphone } from '@element-plus/icons-vue'

const props = defineProps<{ binding: any }>()
const emit = defineEmits<{
  click: []
}>()

const displayName = computed(() => {
  const b = props.binding
  if (!b) return '(未命名)'
  return b.name || b.voiceName || '(未命名)'
})

const statusLabel = computed(() => {
  const s = props.binding?.status
  if (s === 'ready') return '就绪'
  if (s === 'training') return '训练中'
  if (s === 'failed') return '失败'
  return '未知'
})

const statusTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  const s = props.binding?.status
  if (s === 'ready') return 'success'
  if (s === 'training') return 'warning'
  if (s === 'failed') return 'danger'
  return 'info'
})

const statusHint = computed(() => {
  const s = props.binding?.status
  if (s === 'ready') return '可用于配音'
  if (s === 'training') return '复刻进行中…'
  if (s === 'failed') return '复刻失败，请重试'
  return '—'
})

function onCardClick() {
  emit('click')
}
</script>

<style scoped>
.asset-card {
  cursor: pointer;
  transition: transform 0.15s;
}

.asset-card:hover {
  transform: translateY(-2px);
}

.asset-card .thumb {
  width: 100%;
  height: 100px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  color: var(--el-color-info);
}

.asset-card .thumb .badge {
  position: absolute;
  top: 4px;
  right: 4px;
}

.asset-card .body {
  padding-top: 8px;
}

.asset-card .title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.asset-card .title .name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.asset-card .meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 8px;
}
</style>
