<template>
  <article class="episode-card" @click="$emit('click', episode)">
    <div class="cover" :class="coverClass">
      <span class="cover-emoji">{{ coverEmoji }}</span>
      <div class="hover-actions">
        <button class="edit-btn" :title="`编辑「第${episode.episodeNumber}集」`" @click.stop="$emit('edit', episode)">
          <el-icon><Edit /></el-icon>
        </button>
        <button class="delete-btn" :title="`删除「第${episode.episodeNumber}集」`" @click.stop="$emit('delete', episode)">
          <el-icon><Delete /></el-icon>
        </button>
      </div>
    </div>
    <div class="body">
      <h3 class="title" :title="`第 ${episode.episodeNumber} 集 · ${episode.title}`">
        第 {{ episode.episodeNumber }} 集 · {{ episode.title }}
      </h3>
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: episode.progressPct + '%' }" />
        </div>
        <span class="progress-text">{{ episode.currentStageLabel }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Edit, Delete } from '@element-plus/icons-vue'
import type { EpisodeWithProgress } from '../../../../../shared/types/episode-production/episode-with-progress.types'

defineOptions({ name: 'EpisodeCard' })

const props = defineProps<{ episode: EpisodeWithProgress }>()

defineEmits<{
  (e: 'click', ep: EpisodeWithProgress): void
  (e: 'edit', ep: EpisodeWithProgress): void
  (e: 'delete', ep: EpisodeWithProgress): void
}>()

const COVER_CLASSES = ['cover-c1', 'cover-c2', 'cover-c3', 'cover-c4'] as const
const COVER_EMOJI = ['🎬', '📖', '🎥', '📺']

const coverClass = computed(() => COVER_CLASSES[props.episode.episodeNumber % COVER_CLASSES.length])
const coverEmoji = computed(() => COVER_EMOJI[props.episode.episodeNumber % COVER_EMOJI.length])
</script>

<style scoped lang="scss">
.episode-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.episode-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.episode-card:hover .hover-actions {
  opacity: 1;
}

.cover {
  height: 130px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 60px;
}

.cover-c1 { background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2)); }
.cover-c2 { background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-dark-2)); }
.cover-c3 { background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-dark-2)); }
.cover-c4 { background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-dark-2)); }

.cover-emoji {
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
}

.hover-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 1;
  transition: opacity 0.15s;
}

.hover-actions button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.hover-actions .edit-btn:hover { background: var(--el-color-primary); }
.hover-actions .delete-btn:hover { background: var(--el-color-danger); }

.body { padding: 14px; }

.title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-track {
  flex: 1;
  height: 4px;
  background: var(--el-fill-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--el-color-success);
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
