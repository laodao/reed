<template>
  <section class="episode-list-panel">
    <div class="page-header">
      <div class="title-block">
        <h1 class="page-title" :title="project.name">{{ project.name }}</h1>
        <p class="page-subtitle">{{ episodes.length }} 集</p>
      </div>
      <div class="actions">
        <el-button class="btn-settings" @click="$emit('settings')">
          <el-icon><Setting /></el-icon>
          项目设置
        </el-button>
        <!-- AI 一键模式（spec 2026-05-09 ep-redesign §3.2 C3 · P-19） -->
        <el-button type="warning" class="btn-quick-mode" @click="$emit('open-quick-mode')">
          <el-icon><Star /></el-icon>
          ✨ AI 一键
        </el-button>
        <el-button type="primary" class="btn-create-episode" @click="$emit('create-episode')">
          <el-icon><Plus /></el-icon>
          新建剧集
        </el-button>
        <el-button class="btn-batch-create" @click="$emit('batch-create-episode')">
          <el-icon><Upload /></el-icon>
          批量创建
        </el-button>
      </div>
    </div>
    <div class="episode-grid">
      <EpisodeCard
        v-for="ep in episodes"
        :key="ep.id"
        :episode="ep"
        @click="$emit('open-episode', $event)"
        @edit="$emit('edit-episode', $event)"
        @delete="$emit('delete-episode', $event)"
      />
      <button class="episode-card-new" @click="$emit('create-episode')">
        <el-icon :size="32"><Plus /></el-icon>
        <span>新建剧集</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Setting, Plus, Star, Upload } from '@element-plus/icons-vue'
import EpisodeCard from './EpisodeCard.vue'
import type { VideoProject, VideoProjectSummary } from '../../../../../shared/types/story-to-video.types'
import type { EpisodeWithProgress } from '../../../../../shared/types/episode-production/episode-with-progress.types'

defineOptions({ name: 'EpisodeListPanel' })

defineProps<{
  project: VideoProject | VideoProjectSummary
  episodes: EpisodeWithProgress[]
}>()

defineEmits<{
  (e: 'settings'): void
  (e: 'create-episode'): void
  (e: 'batch-create-episode'): void
  (e: 'open-quick-mode'): void
  (e: 'open-episode', ep: EpisodeWithProgress): void
  (e: 'edit-episode', ep: EpisodeWithProgress): void
  (e: 'delete-episode', ep: EpisodeWithProgress): void
}>()
</script>

<style scoped lang="scss">
.episode-list-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.title-block {
  flex: 1;
  min-width: 0;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.episode-grid {
  flex: 1;
  overflow: auto;
  padding: 20px 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-content: start;
}

.episode-card-new {
  min-height: 220px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--el-text-color-placeholder);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
}

.episode-card-new:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
</style>
