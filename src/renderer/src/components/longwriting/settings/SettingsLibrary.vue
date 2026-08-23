<template>
  <div class="settings-library">
    <div class="library-header">
      <span class="library-title">设定库</span>
      <span class="library-desc">统一管理故事设定：概要 / 故事线 / 世界 / 人物 / 技能物品，图谱入口查看实体关系</span>
      <el-button size="small" @click="showGraph = true">
        <el-icon><Share /></el-icon>
        知识图谱
      </el-button>
    </div>

    <el-tabs v-model="activeTab" class="library-tabs">
      <el-tab-pane label="故事概要" name="overview">
        <OverviewStage :project-id="projectId" />
      </el-tab-pane>
      <el-tab-pane label="故事情节" name="plot">
        <PlotStage :project-id="projectId" />
      </el-tab-pane>
      <el-tab-pane label="世界设定" name="world">
        <BackgroundStage :project-id="projectId" />
      </el-tab-pane>
      <el-tab-pane label="人物" name="characters">
        <CharacterStage :project-id="projectId" />
      </el-tab-pane>
      <el-tab-pane v-if="featureEnabled('skill') || featureEnabled('item')" label="技能物品" name="skillitem">
        <SkillItemStage :project-id="projectId" />
      </el-tab-pane>
    </el-tabs>

    <!-- 图谱（懒加载） -->
    <el-dialog v-model="showGraph" title="知识图谱" width="90%" top="4vh" destroy-on-close>
      <GraphView v-if="showGraph" :project-id="projectId" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 设定库（高级模式）：统一实体管理入口
 * 复用现有阶段组件（Overview/Plot/Background/Character/SkillItem），图谱入口 + 功能开关 Tab 控制。
 */
import { ref, provide, onMounted, defineAsyncComponent } from 'vue'
import { Share } from '@element-plus/icons-vue'
import OverviewStage from '../story/OverviewStage.vue'
import PlotStage from '../story/PlotStage.vue'
import BackgroundStage from '../story/BackgroundStage.vue'
import CharacterStage from '../story/CharacterStage.vue'
import SkillItemStage from '../story/SkillItemStage.vue'

const GraphView = defineAsyncComponent(() => import('../graph/GraphView.vue'))

const props = defineProps<{
  projectId: string
}>()

const activeTab = ref('overview')
const showGraph = ref(false)

// 提供现有阶段组件所需的注入（enabledFeatures/imageProviderModels 兜底；selectedModel 继承 StoryEditor）
const enabledFeatures = ref<string[]>([])
provide('enabledFeatures', enabledFeatures)
provide('imageProviderModels', ref([]))

function featureEnabled(key: string): boolean {
  return enabledFeatures.value.includes(key)
}

onMounted(async () => {
  const r = await window.electronAPI.longwriting.getStoryOverview(props.projectId)
  if (r.success && r.data?.enabledFeatures) {
    enabledFeatures.value = r.data.enabledFeatures
  }
})
</script>

<style lang="scss" scoped>
.settings-library {
  height: 100%;
  display: flex;
  flex-direction: column;

  .library-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 4px 12px;

    .library-title {
      font-size: 16px;
      font-weight: 600;
    }

    .library-desc {
      flex: 1;
      font-size: 12px;
      color: var(--text-color-secondary);
    }
  }

  .library-tabs {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
  }
}
</style>
