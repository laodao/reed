<template>
  <!--
    ProjectAssetView · 项目级资产盘点入口

    资产是项目级全局数据（character/location/item/voice binding 均按 projectId 聚合），
    入口从 episode 工作台的「② 资产」stage 迁移到项目列表页右侧顶部按钮。
    本组件封装 AssetStageViewV2 + 4 类资产 sub-editor + selectedAsset 切换 + 返回按钮，
    逻辑搬迁自 EpisodeWorkbench.vue 的资产 tab。
  -->
  <div class="project-asset-view">
    <div class="asset-view-header">
      <el-button text @click="$emit('back')">
        <el-icon><ArrowLeft /></el-icon>
        返回剧集列表
      </el-button>
      <el-divider direction="vertical" />
      <h2 class="view-title">项目资产</h2>
      <span class="view-subtitle">项目级全局数据 · 所有剧集共享</span>
    </div>

    <div class="asset-view-body">
      <AssetStageView
        v-if="!selectedAsset"
        :project-id="projectId"
        hide-stage-complete
        @open-character="(id: string) => (selectedAsset = { type: 'character', id })"
        @open-location="(id: string) => (selectedAsset = { type: 'location', id })"
        @open-item="(id: string) => (selectedAsset = { type: 'item', id })"
        @open-voice="(id: string) => (selectedAsset = { type: 'voice', id })"
        @complete="onComplete"
      />
      <CharacterAssetEditor
        v-else-if="selectedAsset.type === 'character'"
        :binding-id="selectedAsset.id"
        @close="selectedAsset = null"
        @saved="onAssetSaved"
      />
      <LocationAssetEditor
        v-else-if="selectedAsset.type === 'location'"
        :binding-id="selectedAsset.id"
        @close="selectedAsset = null"
        @saved="onAssetSaved"
      />
      <ItemAssetEditor
        v-else-if="selectedAsset.type === 'item'"
        :binding-id="selectedAsset.id"
        @close="selectedAsset = null"
        @saved="onAssetSaved"
      />
      <VoiceAssetEditor
        v-else-if="selectedAsset.type === 'voice'"
        :voice-id="selectedAsset.id"
        @close="selectedAsset = null"
        @saved="onAssetSaved"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import AssetStageView from '@/components/episode-production/stage-asset-v2/AssetStageViewV2.vue'
// P3a Task 12 / 13 / 14 · 4 类资产 sub-editor（搬迁自 EpisodeWorkbench）
import CharacterAssetEditor from '@/components/episode-production/stage-asset-v2/character/CharacterAssetEditorV2.vue'
import LocationAssetEditor from '@/components/episode-production/stage-asset-v2/location/LocationAssetEditorV2.vue'
import ItemAssetEditor from '@/components/episode-production/stage-asset/item/ItemAssetEditor.vue'
import VoiceAssetEditor from '@/components/episode-production/stage-asset/voice/VoiceAssetEditor.vue'

type AssetKind = 'character' | 'location' | 'item' | 'voice'

const props = defineProps<{
  projectId: string
  /** 初始选中的资产（支持剧本违例跳入并直接定位到 sub-editor） */
  initialSelected?: { type: AssetKind; id: string } | null
}>()

defineEmits<{
  (e: 'back'): void
}>()

const selectedAsset = ref<{ type: AssetKind; id: string } | null>(
  props.initialSelected ?? null,
)

// 支持外部更新 initialSelected（如已在资产视图时再次从剧本违例跳入定位）
watch(
  () => props.initialSelected,
  (v) => {
    if (v) selectedAsset.value = v
  },
)

function onAssetSaved(): void {
  ElMessage.success('保存成功')
}

function onComplete(): void {
  ElMessage.success('资产盘点完成')
}
</script>

<style scoped lang="scss">
.project-asset-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.asset-view-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;

  .view-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .view-subtitle {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.asset-view-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
