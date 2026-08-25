<template>
  <div class="stage-storyboard-tab">
    <!-- 子导航：列表 / 制作 -->
    <div class="mode-tabs">
      <button :class="{ active: mode === 'list' }" @click="mode = 'list'">分镜列表</button>
      <button :class="{ active: mode === 'edit' }" @click="mode = 'edit'">分镜制作</button>
    </div>

    <!-- 内容按模式切换 -->
    <div class="mode-body">
      <StageStoryboardView v-if="mode === 'list'" :episode-id="episodeId" :project-id="projectId" :context-hint="contextHint" />
      <StageStoryboardEditor v-else :episode-id="episodeId" :project-id="projectId" :context-hint="contextHint" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 分镜 tab 宿主：列表（M4）/ 制作（M5）子模式切换。
 */
import { ref } from 'vue'
import StageStoryboardView from '@/components/episode-production/storyboard/StageStoryboardView.vue'
import StageStoryboardEditor from '@/components/episode-production/storyboard/StageStoryboardEditor.vue'

defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()

const mode = ref<'list' | 'edit'>('list')
</script>

<style lang="scss" scoped>
.stage-storyboard-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.mode-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 2px;
  padding: 6px 16px 0;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);
  button {
    border: none;
    background: transparent;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text-color-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    &.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
    &:hover { color: var(--color-primary); }
  }
}

.mode-body { flex: 1; min-height: 0; }
</style>
