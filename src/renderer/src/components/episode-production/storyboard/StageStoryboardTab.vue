<template>
  <div class="stage-storyboard-tab">
    <!-- 分镜 tab 默认=列表；点击场次进入该场制作，可返回列表 -->
    <div class="mode-body">
      <StageStoryboardView
        v-if="view === 'list'"
        :episode-id="episodeId"
        :project-id="projectId"
        :context-hint="contextHint"
        @enter-scene="onEnterScene"
      />
      <StageStoryboardEditor
        v-else
        :episode-id="episodeId"
        :project-id="projectId"
        :scene-id="editingSceneId"
        :context-hint="contextHint"
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

defineProps<{
  episodeId: string
  projectId: string
  contextHint?: string | null
}>()

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
