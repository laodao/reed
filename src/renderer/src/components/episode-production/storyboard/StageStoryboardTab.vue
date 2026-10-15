<template>
  <div class="stage-storyboard-tab">
    <!-- 分镜 tab 默认=列表；点击场次进入该场制作，可返回列表 -->
    <div class="mode-body">
      <StageStoryboardView
        v-if="view === 'list'"
        :episode-id="episodeId"
        :project-id="projectId"
        :context-hint="contextHint"
        :refresh-tick="refreshTick"
        @enter-scene="onEnterScene"
        @switch-tab="(t) => emit('switch-tab', t)"
      />
      <StageStoryboardEditor
        v-else
        :episode-id="episodeId"
        :project-id="projectId"
        :scene-id="editingSceneId"
        :context-hint="contextHint"
        :refresh-tick="refreshTick"
        @go-back="view = 'list'; editingSceneId = null"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 分镜 tab 宿主：默认=列表（M4）；点击某个场次 → 进入该场分镜制作（M5），可返回列表。
 * 不再使用「分镜列表/分镜制作」子 tab 切换。
 */
import { ref } from 'vue'
import StageStoryboardView from '@/components/episode-production/storyboard/StageStoryboardView.vue'
import StageStoryboardEditor from '@/components/episode-production/storyboard/StageStoryboardEditor.vue'
import type { EpStudioTab } from '@/composables/useEpStudioContext'

defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
  /** agent 改数据后由 Studio 递增，转发给当前视图触发重载 */
  refreshTick?: number
}>()
const emit = defineEmits<{ 'switch-tab': [tab: EpStudioTab] }>()

const view = ref<'list' | 'edit'>('list')
const editingSceneId = ref<string | null>(null)

function onEnterScene(sceneId: string): void {
  editingSceneId.value = sceneId
  view.value = 'edit'
}
</script>

<style lang="scss" scoped>
.stage-storyboard-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-color-page);
}

.mode-body { flex: 1; min-height: 0; }
</style>
