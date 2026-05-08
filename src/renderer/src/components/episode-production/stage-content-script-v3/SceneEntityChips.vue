<template>
  <div v-if="chips.length > 0" class="scene-entity-chips">
    <button
      v-for="(chip, idx) in chips"
      :key="`${chip.kind}-${chip.id ?? chip.name}-${idx}`"
      class="entity-chip"
      :class="`chip-${chip.kind}`"
      :title="chipTitle(chip)"
      @click.stop="$emit('click-entity', chip)"
    >
      <span class="chip-icon">{{ chipIcon(chip.kind) }}</span>
      <span class="chip-name">{{ chip.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { EntityRef } from './scene-entity-utils'

defineOptions({ name: 'SceneEntityChips' })

defineProps<{ chips: EntityRef[] }>()

defineEmits<{
  (e: 'click-entity', entity: EntityRef): void
}>()

function chipIcon(kind: 'character' | 'location' | 'item'): string {
  return kind === 'character' ? '👤' : kind === 'location' ? '🏛' : '⚔️'
}

function chipTitle(chip: EntityRef): string {
  const label = chip.kind === 'character' ? '角色' : chip.kind === 'location' ? '地点' : '物品'
  return `${label}：${chip.name}（点击高亮该要素的所有出场场景）`
}
</script>

<style scoped lang="scss">
.scene-entity-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  overflow-x: auto;
}

.entity-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  font-size: 10px;
  color: var(--el-text-color-regular);
  font-family: inherit;
  transition: all 0.15s;
  white-space: nowrap;
}

.entity-chip:hover {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.chip-icon {
  font-size: 11px;
}

.chip-character { color: var(--el-color-primary); }
.chip-location { color: var(--el-color-warning); }
.chip-item { color: var(--el-color-success); }
</style>
