<template>
  <div class="world-setting-step">
    <div class="step-header">
      <h2>世界设定 <el-tag size="small" type="info">可选</el-tag></h2>
      <p class="step-desc">为故事搭建舞台：时代背景、地点、势力、技能与物品。每项都可 AI 生成或跳过</p>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="时代背景与地点" name="background">
        <BackgroundStage :project-id="projectId" />
      </el-tab-pane>
      <el-tab-pane v-if="featureEnabled('skill') || featureEnabled('item')" label="技能与物品" name="skillitem">
        <SkillItemStage :project-id="projectId" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
/**
 * 向导 Step 2（可选）：世界设定
 * 直接复用现有 BackgroundStage（时代背景/地图/地点/势力）+ SkillItemStage（技能/物品），
 * 不重复造轮子；与高级模式共享同一份数据。
 */
import { ref, provide, onMounted } from 'vue'
import BackgroundStage from '../story/BackgroundStage.vue'
import SkillItemStage from '../story/SkillItemStage.vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'stateChanged'): void
}>()

const activeTab = ref('background')

// 功能开关（从 overview 加载；向导模式无 StoryEditor provide，这里提供兜底）
const enabledFeatures = ref<string[]>([])
provide('enabledFeatures', enabledFeatures)

// 模型选择兜底：向导模式不强制选模型（后端兜底默认提供商），提供空值即可
provide('selectedModel', null)
provide('selectedModelKey', ref(''))
provide('imageProviderModels', ref([]))

function featureEnabled(key: string): boolean {
  return enabledFeatures.value.includes(key)
}

onMounted(async () => {
  const r = await window.electronAPI.longwriting.getStoryOverview(props.projectId)
  if (r.success && r.data?.enabledFeatures) {
    enabledFeatures.value = r.data.enabledFeatures
  }
  // 监听子组件进度变化（数据变化后刷新完成判定）
  // 说明：BackgroundStage/SkillItemStage 通过 update:progress emit，向导完成判定由 WizardContainer refresh 驱动
})
</script>

<style lang="scss" scoped>
.world-setting-step {
  max-width: 960px;
  margin: 0 auto;
}

.step-header {
  margin-bottom: 16px;

  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color-primary);
    margin: 0 0 6px 0;
  }

  .step-desc {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin: 0;
  }
}
</style>
