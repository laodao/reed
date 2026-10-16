<template>
  <div class="recent-projects">
    <!-- 标题行 -->
    <div class="grid-head">
      <div class="head-left">
        <span class="head-title">最近项目</span>
        <el-button text size="small" @click="onMore">
          <span>更多项目</span>
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
      <el-button type="primary" circle class="add-btn" title="新建项目" @click="emit('create')">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>

    <!-- 项目卡片流（横向滑动） -->
    <div v-if="projects.length > 0" class="card-scroll">
      <div
        v-for="p in projects"
        :key="p.id"
        class="project-card"
        @click="openProject(p)"
      >
        <div class="card-cover">
          <el-image v-if="coverThumb(p)" :src="coverThumb(p)" fit="cover" class="cover-img" />
          <div v-else class="cover-placeholder">
            <el-icon :size="26"><VideoCamera /></el-icon>
          </div>
          <div class="cover-progress">
            <el-progress :percentage="p.progressPct || 0" :stroke-width="6" :show-text="false" />
          </div>
        </div>
        <div class="card-body">
          <div class="card-name">{{ p.name }}</div>
          <div class="card-meta">
            <span>{{ p.episodeCount }} 集</span>
            <span v-if="p.currentStageLabel" class="stage-label">{{ p.currentStageLabel }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空态 -->
    <div v-else class="empty-state">
      <el-icon :size="40" class="empty-icon"><FolderOpened /></el-icon>
      <p class="empty-text">还没有项目。<br />粘贴剧本或上传文件开始创作，或点击右上角「+」新建项目。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * M1 首页 · 最近项目卡片流。数据来自 listProjectsSummary（项目聚合视图）。
 * 卡片点击 → 进该项目最新剧集的新版工作台；「更多」展开列表视图；「+」新建项目。
 */
import { ArrowRight, Plus, VideoCamera, FolderOpened } from '@element-plus/icons-vue'
import type { VideoProjectSummary } from '@shared/types/episode-production/workflow.types'

const props = defineProps<{
  projects: VideoProjectSummary[]
}>()

const emit = defineEmits<{
  (e: 'open', project: VideoProjectSummary): void
  (e: 'create'): void
  (e: 'more'): void
}>()

function coverThumb(p: VideoProjectSummary): string | null {
  const c = (p as any).coverUrl || (p as any).coverThumb || (p as any).thumbnailPath
  return c || null
}

/** 卡片点击：进该项目最新剧集工作台 */
function openProject(p: VideoProjectSummary): void {
  emit('open', p)
}

function onMore(): void {
  emit('more')
}
</script>

<style lang="scss" scoped>
.recent-projects {
  width: 100%;
}

.grid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  .head-left { display: flex; align-items: center; gap: 6px; }
  .head-title { font-size: 15px; font-weight: 600; color: var(--text-color-primary); }
  .add-btn { margin-left: auto; }
}

.card-scroll {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
  &::-webkit-scrollbar { height: 6px; }
  &::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: var(--radius-full); }

  .project-card {
    flex: 0 0 auto;
    width: 200px;
  }
}

.project-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-primary);
    box-shadow: var(--shadow-card-hover);
  }
}

.card-cover {
  position: relative;
  height: 110px;
  background: var(--fill-color-lighter);
  .cover-img { width: 100%; height: 100%; object-fit: cover; }
  .cover-placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color-placeholder);
  }
  .cover-progress {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 8px;
  }
}

.card-body { padding: 10px 12px 12px; }
.card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-color-secondary);
  .stage-label { color: var(--color-primary); }
}

.empty-state {
  padding: 48px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  .empty-icon { color: var(--text-color-placeholder); }
  .empty-text { margin: 0; font-size: 13px; color: var(--text-color-secondary); line-height: 1.8; }
}
</style>
