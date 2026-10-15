<template>
  <!--
    VoiceAssetCardV2 · 语音资产卡（FU5-C1 / 原型 §3.D-voice）

    语音 meta：绑定关系（绑定: 张三 / 旁白；未绑定）+ 系统/复刻 标签 + 试听
  -->
  <article class="asset-card-v2 voice-card" @click="emit('click')">
    <div class="card-thumb">
      <div class="thumb-emoji">{{ summary.type === 'cloned' ? '🎤' : '🎙' }}</div>
      <AssetSourceTag :source="summary.type === 'cloned' ? 'cloned' : 'system'" variant="badge" />
    </div>

    <div class="card-body">
      <div class="card-title">
        <span class="title-name">{{ summary.name }}</span>
      </div>

      <div class="card-meta">
        <template v-if="summary.boundCharacterNames.length > 0">
          <span>绑定:</span>
          <span class="bound-list">
            {{ summary.boundCharacterNames.join(' / ') }}
          </span>
        </template>
        <template v-else>
          <span class="meta-warn">未绑定</span>
        </template>
      </div>

      <div class="card-actions" @click.stop>
        <el-button size="small" @click="onPlay">
          <el-icon><VideoPlay /></el-icon>
          试听
        </el-button>
        <el-button size="small" @click="emit('click')">设定</el-button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'
import AssetSourceTag from '../shared/AssetSourceTag.vue'

const props = defineProps<{
  summary: {
    voiceId: string
    name: string
    type: 'system' | 'cloned'
    boundCharacterNames: string[]
  }
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

function onPlay(): void {
  ElMessage.info(`试听 "${props.summary.name}" — 留 follow-up 接 voice preview API`)
}
</script>

<style scoped lang="scss">
@use './asset-card-v2.scss';

.bound-list {
  color: var(--el-color-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>
