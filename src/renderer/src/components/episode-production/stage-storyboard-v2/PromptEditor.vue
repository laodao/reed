<template>
  <!--
    PromptEditor · 参数化提示词编辑器（分镜简化原型核心）

    思路：把镜头参数 / 转场参数从分散表单收敛进编辑器顶部的 #参数 chip 行，
    点击 chip 弹下拉改值（类似 @引用 + 代码提示）；下方自由文本区支持
    @角色/地点/物品 引用（复用 ShotDescriptionTemplate）。

    - 参数 chip 是结构化字段（shotType/cameraAngle/...）的可视化入口，不嵌入
      frameDescription 文本，保持与现有 keyframe-prompt-builder 兼容。
    - 自由文本区 = frameDescription，@实体引用走 ShotDescriptionTemplate 现有逻辑。
  -->
  <div class="prompt-editor">
    <!-- 参数模板行：#景别 #角度 #运镜 #转场 #方向 chip + #时长 input -->
    <div class="param-chips">
      <span class="param-chips-label">镜头参数</span>
      <el-popover
        v-for="p in paramChips"
        :key="p.key"
        trigger="click"
        placement="bottom-start"
        :width="200"
        :show-arrow="false"
        popper-class="param-popover"
      >
        <template #reference>
          <span class="param-chip" :class="{ 'is-empty': !p.displayValue }">
            <span class="chip-label">{{ p.label }}</span>
            <span class="chip-value">{{ p.displayValue || '未设置' }}</span>
            <el-icon class="chip-caret"><ArrowDown /></el-icon>
          </span>
        </template>
        <div class="param-dropdown">
          <div class="dropdown-title">{{ p.label }}</div>
          <div class="dropdown-list">
            <div
              v-for="opt in p.options"
              :key="opt.value"
              class="dropdown-item"
              :class="{ active: opt.value === p.value }"
              @click="onSelectParam(p.key, opt.value)"
            >
              <span>{{ opt.label }}</span>
              <el-icon v-if="opt.value === p.value" class="check"><Check /></el-icon>
            </div>
          </div>
        </div>
      </el-popover>

      <!-- 时长（数字）chip -->
      <el-popover
        trigger="click"
        placement="bottom-start"
        :width="220"
        :show-arrow="false"
        popper-class="param-popover"
      >
        <template #reference>
          <span class="param-chip">
            <span class="chip-label">转场时长</span>
            <span class="chip-value">{{ transitionDuration ?? 0 }}ms</span>
            <el-icon class="chip-caret"><ArrowDown /></el-icon>
          </span>
        </template>
        <div class="param-dropdown">
          <div class="dropdown-title">转场时长（毫秒）</div>
          <div class="dropdown-list dropdown-input">
            <el-input-number
              :model-value="transitionDuration"
              :min="0"
              :max="3000"
              :step="100"
              size="small"
              controls-position="right"
              style="width: 100%"
              @update:model-value="onDurationChange"
            />
          </div>
        </div>
      </el-popover>
    </div>

    <!-- 自由文本区（@实体引用，复用 ShotDescriptionTemplate） -->
    <ShotDescriptionTemplate
      :model-value="modelValue"
      :entities="entities"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, Check } from '@element-plus/icons-vue'
import ShotDescriptionTemplate from './ShotDescriptionTemplate.vue'
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  TRANSITION_TYPE_OPTIONS,
  TRANSITION_DIRECTION_OPTIONS,
  labelOf,
  type ParamOption,
} from '../shared/param-options'
import type { EntityRefMeta } from '../shared/entity-ref-parser'

type ParamKey =
  | 'shotType'
  | 'cameraAngle'
  | 'cameraMovement'
  | 'transitionType'
  | 'transitionDirection'

const props = defineProps<{
  /** 自由提示词文本（frameDescription） */
  modelValue: string
  /** @实体引用字典（角色/地点/物品） */
  entities?: EntityRefMeta[]
  shotType?: string
  cameraAngle?: string
  cameraMovement?: string
  transitionType?: string
  transitionDuration?: number
  transitionDirection?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
  'update:shotType': [string]
  'update:cameraAngle': [string]
  'update:cameraMovement': [string]
  'update:transitionType': [string]
  'update:transitionDuration': [number]
  'update:transitionDirection': [string]
}>()

interface ParamChip {
  key: ParamKey
  label: string
  value: string | undefined
  displayValue: string
  options: ParamOption[]
}

const paramChips = computed<ParamChip[]>(() => [
  {
    key: 'shotType',
    label: '景别',
    value: props.shotType,
    displayValue: labelOf(SHOT_TYPE_OPTIONS, props.shotType),
    options: SHOT_TYPE_OPTIONS,
  },
  {
    key: 'cameraAngle',
    label: '角度',
    value: props.cameraAngle,
    displayValue: labelOf(CAMERA_ANGLE_OPTIONS, props.cameraAngle),
    options: CAMERA_ANGLE_OPTIONS,
  },
  {
    key: 'cameraMovement',
    label: '运镜',
    value: props.cameraMovement,
    displayValue: labelOf(CAMERA_MOVEMENT_OPTIONS, props.cameraMovement),
    options: CAMERA_MOVEMENT_OPTIONS,
  },
  {
    key: 'transitionType',
    label: '转场',
    value: props.transitionType,
    displayValue: labelOf(TRANSITION_TYPE_OPTIONS, props.transitionType),
    options: TRANSITION_TYPE_OPTIONS,
  },
  {
    key: 'transitionDirection',
    label: '方向',
    value: props.transitionDirection,
    displayValue: labelOf(TRANSITION_DIRECTION_OPTIONS, props.transitionDirection),
    options: TRANSITION_DIRECTION_OPTIONS,
  },
])

function onSelectParam(key: ParamKey, value: string): void {
  emit(`update:${key}` as any, value)
}

function onDurationChange(v: number | undefined): void {
  if (v != null) emit('update:transitionDuration', v)
}
</script>

<style scoped lang="scss">
.prompt-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

/* 编辑框内部滚动：让 ShotDescriptionTemplate 填充剩余空间，文本区在内部滚动而非外部容器滚动 */
:deep(.shot-desc-template) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.rich-prompt-editor) {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.param-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.param-chips-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 4px;
  user-select: none;
}

.param-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  background: var(--el-color-success-light-9);
  border: 1px solid var(--el-color-success-light-5);
  color: var(--el-color-success);
  transition: background-color 0.15s, border-color 0.15s;

  &:hover {
    background: var(--el-color-success-light-8);
  }

  &.is-empty {
    background: var(--el-fill-color);
    border-color: var(--el-border-color);
    color: var(--el-text-color-placeholder);
  }

  .chip-label {
    font-weight: 600;
  }

  .chip-value {
    color: var(--el-text-color-primary);
  }

  &.is-empty .chip-value {
    color: var(--el-text-color-placeholder);
  }

  .chip-caret {
    font-size: 10px;
    opacity: 0.6;
  }
}

.prompt-text-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:deep(.param-popover.el-popover) {
  padding: 0 !important;
}

.param-dropdown {
  .dropdown-title {
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .dropdown-list {
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 0;

    &.dropdown-input {
      padding: 12px;
    }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    color: var(--el-text-color-primary);

    &:hover {
      background: var(--el-fill-color-light);
    }

    &.active {
      color: var(--el-color-primary);
      font-weight: 600;
    }

    .check {
      font-size: 12px;
    }
  }
}
</style>
