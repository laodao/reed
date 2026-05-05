<template>
  <el-dialog
    :model-value="modelValue"
    title="镜头剧本"
    width="70%"
    top="8vh"
    custom-class="script-view-dialog"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="scene" class="script-dialog-content">
      <!-- 场景信息 -->
      <div class="scene-info-section">
        <div class="scene-header">
          <el-tag type="primary">场景 {{ scene.sceneNumber }}</el-tag>
          <el-tag>{{ scene.location }}</el-tag>
          <el-tag type="info">{{ getLocationTypeLabel(scene.locationType) }}</el-tag>
          <el-tag>{{ getTimeOfDayLabel(scene.timeOfDay) }}</el-tag>
        </div>
        <div class="scene-meta" v-if="scene.weather">
          <span>天气：{{ getWeatherLabel(scene.weather) }}</span>
        </div>
      </div>

      <!-- 场景描述 -->
      <div class="script-section" v-if="scene.sceneDescription">
        <h4>场景描述</h4>
        <div class="section-content">{{ scene.sceneDescription }}</div>
      </div>

      <!-- 氛围与光线 -->
      <div class="script-section" v-if="scene.mood || scene.lighting">
        <h4>氛围与光线</h4>
        <div class="section-content">
          <p v-if="scene.mood"><strong>氛围：</strong>{{ scene.mood }}</p>
          <p v-if="scene.lighting"><strong>光线：</strong>{{ scene.lighting }}</p>
        </div>
      </div>

      <!-- 旁白 -->
      <div class="script-section" v-if="scene.narration">
        <h4>旁白</h4>
        <div class="section-content narration">{{ scene.narration }}</div>
      </div>

      <!-- 对话列表 -->
      <div class="script-section" v-if="scene.dialogues && scene.dialogues.length > 0">
        <h4>对话 ({{ scene.dialogues.length }} 条)</h4>
        <div class="dialogue-list">
          <div
            v-for="dialogue in scene.dialogues"
            :key="dialogue.id"
            class="dialogue-item"
          >
            <div class="dialogue-character">
              <el-tag size="small" type="info">{{ dialogue.characterName }}</el-tag>
              <el-tag v-if="dialogue.emotion" size="small" effect="plain">{{ dialogue.emotion }}</el-tag>
            </div>
            <div class="dialogue-text">{{ dialogue.text }}</div>
            <div class="dialogue-meta" v-if="dialogue.volume !== 'normal' || dialogue.pace !== 'normal'">
              <span v-if="dialogue.volume !== 'normal'">{{ dialogue.volume === 'loud' ? '大声' : '低语' }}</span>
              <span v-if="dialogue.pace !== 'normal'">{{ dialogue.pace === 'fast' ? '快语速' : '慢语速' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 动作描述 -->
      <div class="script-section" v-if="scene.actions && scene.actions.length > 0">
        <h4>动作描述 ({{ scene.actions.length }} 条)</h4>
        <div class="action-list">
          <div
            v-for="action in scene.actions"
            :key="action.id"
            class="action-item"
          >
            <el-tag v-if="action.characterId" size="small">{{ getCharacterName(action.characterId) }}</el-tag>
            <el-tag v-else size="small" type="info">群像动作</el-tag>
            <span class="action-timing">({{ getTimingLabel(action.timing) }})</span>
            <span class="action-description">{{ action.description }}</span>
          </div>
        </div>
      </div>

      <!-- 出场角色 -->
      <div class="script-section" v-if="scene.characters && scene.characters.length > 0">
        <h4>出场角色</h4>
        <div class="character-list">
          <el-tag
            v-for="character in scene.characters"
            :key="character.characterId"
            class="character-tag"
          >
            {{ character.characterName }}
            <span v-if="character.expression"> - {{ character.expression }}</span>
          </el-tag>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无剧本数据" :image-size="60" />
  </el-dialog>
</template>

<script setup lang="ts">
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'

// ==================== Props ====================
const props = defineProps<{
  /** 对话框显示/隐藏（v-model） */
  modelValue: boolean
  /** 当前场景数据 */
  scene: SceneScript | null
}>()

// ==================== Emits ====================
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

// ==================== 标签映射 ====================
const locationTypeLabels: Record<string, string> = {
  interior: '内景',
  exterior: '外景',
  mixed: '混合'
}

const timeOfDayLabels: Record<string, string> = {
  morning: '早晨',
  noon: '正午',
  afternoon: '下午',
  evening: '傍晚',
  night: '夜晚',
  dawn: '黎明',
  dusk: '黄昏'
}

const weatherLabels: Record<string, string> = {
  sunny: '晴天',
  cloudy: '多云',
  rainy: '雨天',
  snowy: '雪天',
  foggy: '雾天',
  stormy: '暴风雨'
}

const timingLabels: Record<string, string> = {
  before: '对话前',
  during: '对话中',
  after: '对话后'
}

function getLocationTypeLabel(type: string): string {
  return locationTypeLabels[type] || type
}

function getTimeOfDayLabel(time: string): string {
  return timeOfDayLabels[time] || time
}

function getWeatherLabel(weather: string): string {
  return weatherLabels[weather] || weather
}

function getTimingLabel(timing: string): string {
  return timingLabels[timing] || timing
}

function getCharacterName(characterId: string): string {
  if (!props.scene || !props.scene.characters) return characterId
  const character = props.scene.characters.find(c => c.characterId === characterId)
  return character?.characterName || characterId
}
</script>

<style lang="scss">
/* 非 scoped：覆盖 el-dialog custom-class */
.script-view-dialog {
  max-width: 900px;
  min-width: 500px;
}

@media (max-width: 768px) {
  .script-view-dialog {
    width: 95% !important;

    .script-dialog-content {
      max-height: 55vh;
    }
  }
}
</style>

<style scoped lang="scss">
.script-dialog-content {
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 4px;

  scrollbar-width: thin;
  scrollbar-color: var(--el-border-color-darker) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color-darker);
    border-radius: 3px;
  }

  .scene-info-section {
    margin-bottom: 20px;
    padding: 12px;
    background: var(--el-fill-color-light);
    border-radius: 8px;

    .scene-header {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }

    .scene-meta {
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }

  .script-section {
    margin-bottom: 16px;

    h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      border-left: 3px solid var(--el-color-primary);
      padding-left: 8px;
    }

    .section-content {
      padding: 12px;
      background: var(--el-fill-color-lighter);
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--el-text-color-regular);

      &.narration {
        font-style: italic;
        color: var(--el-text-color-secondary);
      }

      p {
        margin: 4px 0;
      }
    }
  }

  .dialogue-list,
  .action-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 150px;
    overflow-y: auto;
  }

  .dialogue-item,
  .action-item {
    padding: 10px 12px;
    background: var(--el-fill-color-lighter);
    border-radius: 6px;

    .dialogue-character,
    .action-item > .el-tag {
      margin-bottom: 6px;
    }

    .dialogue-text {
      font-size: 13px;
      line-height: 1.5;
    }

    .dialogue-meta {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-top: 4px;
    }

    .action-timing {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin: 0 8px;
    }

    .action-description {
      font-size: 13px;
    }
  }

  .character-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .character-tag {
      cursor: default;
    }
  }
}
</style>
