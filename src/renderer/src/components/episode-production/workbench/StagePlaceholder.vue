<template>
  <!--
    StagePlaceholder · stage 占位组件（P6-T17）

    用于 ① 内容 / ③ 剧本 / ④ 分镜 三个 stage view 还没实装时的占位。
    明确告知用户哪个 P6 follow-up task 要实现这个 stage，避免空白页让人困惑。
  -->
  <div class="stage-placeholder">
    <div class="placeholder-card">
      <el-icon class="icon" :size="48">
        <component :is="iconComponent" />
      </el-icon>
      <h3 class="title">{{ title }}</h3>
      <p class="desc">{{ description }}</p>
      <p class="impl-note">
        <el-icon><InfoFilled /></el-icon>
        {{ implNote }}
      </p>
      <div v-if="suggestedNextStage" class="suggested-action">
        <el-button type="primary" @click="$emit('jump-to', suggestedNextStage)">
          先去 {{ suggestedNextStageLabel }} →
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElIcon, ElButton } from 'element-plus'
import { Document, Edit, VideoCamera, InfoFilled } from '@element-plus/icons-vue'
import type { EpisodeStatus } from '../../../../../shared/types/episode-production'

const props = defineProps<{
  /** 该 stage 的 EpisodeStatus */
  stage: 'pending' | 'scripting' | 'storyboarding'
}>()

defineEmits<{
  (e: 'jump-to', stage: EpisodeStatus): void
}>()

const config = computed(() => {
  switch (props.stage) {
    case 'pending':
      return {
        title: '① 内容',
        description: '上传长文 / 选大纲章节 → AI 自动识别角色 / 地点 / 物品 → 用户确认要素清单。',
        implNote: '此 stage view 待 P6-T18 实现。当前可在创建剧集弹框里上传内容（顶部"+"按钮）。',
        icon: Document,
        suggestedNextStage: 'asset_prep' as EpisodeStatus,
        suggestedNextStageLabel: '② 资产',
      }
    case 'scripting':
      return {
        title: '③ 剧本',
        description: '基于资产生成场景剧本（含旁白 / 对话 / 角色绑定 / 地点绑定 / 物品绑定 强约束）+ 完整性校验。',
        implNote: '此 stage view 待 P6-T19 实现。届时把现有 ScriptTabContent / ScriptCompletenessPanel 迁入并按 spec §4.1 完善。',
        icon: Edit,
        suggestedNextStage: 'asset_prep' as EpisodeStatus,
        suggestedNextStageLabel: '② 资产',
      }
    case 'storyboarding':
      return {
        title: '④ 分镜',
        description: '为每个场景生成分镜（镜头语言 + 角色站位 + keyframe_count 配置 + 多关键帧）。',
        implNote: '此 stage view 待 P6-T20 实现。届时含分镜级角色独立配置（spec §4.5.3 StoryboardCharacterEntity 接通）。',
        icon: VideoCamera,
        suggestedNextStage: 'scripting' as EpisodeStatus,
        suggestedNextStageLabel: '③ 剧本',
      }
  }
})

const title = computed(() => config.value.title)
const description = computed(() => config.value.description)
const implNote = computed(() => config.value.implNote)
const iconComponent = computed(() => config.value.icon)
const suggestedNextStage = computed(() => config.value.suggestedNextStage)
const suggestedNextStageLabel = computed(() => config.value.suggestedNextStageLabel)
</script>

<style scoped>
.stage-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
}

.placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
  padding: 32px;
  background: var(--el-bg-color);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  gap: 12px;
}

.icon {
  color: var(--el-color-primary);
  margin-bottom: 4px;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.impl-note {
  margin: 8px 0 0 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border-radius: 6px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
}

.suggested-action {
  margin-top: 8px;
}
</style>
