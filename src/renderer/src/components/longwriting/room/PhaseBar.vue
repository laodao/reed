<template>
  <div class="phase-bar">
    <template v-for="(p, i) in phases" :key="p.id">
      <span
        class="phase"
        :class="{ on: p.id === modelValue, done: order(p.id) < order(modelValue) }"
        @click="$emit('select', p.id)"
      >
        <i class="no">{{ i + 1 }}</i>{{ p.label }}
      </span>
      <span v-if="i < phases.length - 1" class="dash">─</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ROOM_PHASE_META } from './roomKinds'
import type { RoomPhaseId } from '@shared/types/story-room.types'

defineOptions({ name: 'RoomPhaseBar' })

const props = defineProps<{ modelValue: RoomPhaseId }>()
defineEmits<{ (e: 'select', phase: RoomPhaseId): void }>()

const phases = ROOM_PHASE_META
const order = (id: RoomPhaseId) => phases.find((p) => p.id === id)?.order ?? 0
void props
</script>

<style scoped>
.phase-bar { display: flex; align-items: center; gap: 7px; }
.phase {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--el-text-color-secondary);
  padding: 3px 10px; border-radius: 999px; border: 1px solid transparent; cursor: pointer; transition: all .15s;
  user-select: none;
}
.phase:hover { color: var(--el-color-primary); }
.phase.on {
  color: var(--el-color-primary); font-weight: 600;
  background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-8);
}
.phase.done { color: var(--el-text-color-regular); }
.phase .no {
  font-style: normal; font-size: 10.5px; width: 16px; height: 16px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--el-fill-color-light); color: var(--el-text-color-secondary);
}
.phase.on .no { background: var(--el-color-primary); color: #fff; }
.dash { color: var(--el-border-color); font-size: 11px; }
</style>
