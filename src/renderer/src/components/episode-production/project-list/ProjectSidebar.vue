<template>
  <aside class="project-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">剧集项目</span>
      <el-button type="primary" size="small" class="create-btn" @click="$emit('create')">
        <el-icon><Plus /></el-icon>
        新建
      </el-button>
    </div>
    <div class="project-list">
      <div
        v-for="p in projects"
        :key="p.id"
        class="project-item"
        :class="{ active: p.id === selectedId }"
        @click="$emit('select', p)"
      >
        <div class="item-cover" :class="getCoverClass(p)">
          <span class="cover-emoji">{{ getCoverEmoji(p) }}</span>
        </div>
        <div class="item-body">
          <div class="item-name" :title="p.name">{{ p.name }}</div>
          <div class="item-meta">{{ p.episodeCount }} 集</div>
        </div>
        <el-dropdown trigger="click" @command="onCommand($event, p)" @click.stop>
          <el-button link size="small" class="more-btn" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rename">重命名</el-dropdown-item>
              <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <el-empty v-if="projects.length === 0" class="empty-state" description="还没有剧集项目" :image-size="80" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Plus, MoreFilled } from '@element-plus/icons-vue'
import type { VideoProjectSummary } from '../../../../../shared/types/story-to-video.types'

defineOptions({ name: 'ProjectSidebar' })

defineProps<{
  projects: VideoProjectSummary[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'select', project: VideoProjectSummary): void
  (e: 'rename', project: VideoProjectSummary): void
  (e: 'delete', project: VideoProjectSummary): void
}>()

const COVER_CLASSES = ['cover-c1', 'cover-c2', 'cover-c3', 'cover-c4'] as const
const COVER_EMOJI = ['🎬', '📖', '🎥', '📺']

function hashIndex(id: string, mod: number): number {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return sum % mod
}

function getCoverClass(p: VideoProjectSummary): string {
  return COVER_CLASSES[hashIndex(p.id, COVER_CLASSES.length)]
}

function getCoverEmoji(p: VideoProjectSummary): string {
  return COVER_EMOJI[hashIndex(p.id, COVER_EMOJI.length)]
}

function onCommand(command: string, p: VideoProjectSummary): void {
  if (command === 'rename') emit('rename', p)
  else if (command === 'delete') emit('delete', p)
}
</script>

<style scoped lang="scss">
.project-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  height: 100%;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.project-list {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.project-item:hover {
  background: var(--el-fill-color-light);
}

.project-item.active {
  background: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}

.item-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
}

.item-cover.cover-c1 { background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2)); }
.item-cover.cover-c2 { background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-dark-2)); }
.item-cover.cover-c3 { background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-dark-2)); }
.item-cover.cover-c4 { background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-dark-2)); }

.item-body {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.more-btn {
  flex-shrink: 0;
}

.empty-state {
  margin-top: 32px;
}
</style>
