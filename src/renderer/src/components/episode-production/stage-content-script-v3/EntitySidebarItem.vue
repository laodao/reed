<template>
  <li
    class="entity-item"
    :class="{ confirmed: entity.confirmed, dimmed: !entity.confirmed, highlighted }"
    @click="onItemClick"
  >
    <el-checkbox
      :model-value="!!entity.confirmed"
      :disabled="readonly"
      class="entity-check"
      @click.stop
      @change="$emit('toggle')"
    />
    <div class="entity-body">
      <div class="entity-name-row">
        <span class="entity-name" :title="entity.name">{{ entity.name }}</span>
        <span class="entity-scenes">
          <template v-if="sceneNumbers.length > 0">({{ sceneNumbers.join(', ') }})</template>
          <template v-else>(-)</template>
        </span>
      </div>
      <div class="entity-meta">
        <AssetSourceTag
          :source="(entity.sourceType ?? 'standalone') as 'linked_lw' | 'standalone'"
          size="small"
          effect="light"
        />
        <a
          v-if="!readonly"
          class="action-link"
          @click.stop="$emit('toggle-source')"
        >改 source</a>
      </div>
    </div>
    <span v-if="!readonly" class="hover-actions">
      <button class="btn-edit" :title="`编辑 ${entity.name}`" @click.stop="$emit('edit')">
        <el-icon><EditPen /></el-icon>
      </button>
      <button class="btn-delete" :title="`删除 ${entity.name}`" @click.stop="$emit('delete')">
        <el-icon><Delete /></el-icon>
      </button>
    </span>
  </li>
</template>

<script setup lang="ts">
import { EditPen, Delete } from '@element-plus/icons-vue'
import AssetSourceTag from '../shared/AssetSourceTag.vue'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'

defineOptions({ name: 'EntitySidebarItem' })

type AnyEntity = UploadedCharacter | UploadedLocation | UploadedItem

defineProps<{
  entity: AnyEntity
  kind: 'character' | 'location' | 'item'
  sceneNumbers: number[]
  readonly?: boolean
  highlighted?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'toggle'): void
  (e: 'toggle-source'): void
  (e: 'edit'): void
  (e: 'delete'): void
}>()

function onItemClick(): void {
  emit('click')
}
</script>

<style scoped lang="scss">
.entity-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  list-style: none;
}

.entity-item:hover {
  background: var(--el-fill-color-lighter);
}

.entity-item:hover .hover-actions {
  opacity: 1;
}

.entity-item.dimmed {
  opacity: 0.55;
}

.entity-item.highlighted {
  background: var(--el-color-warning-light-9);
  outline: 1px solid var(--el-color-warning-light-5);
}

.entity-check {
  flex-shrink: 0;
  margin-top: 2px;
}

.entity-body {
  flex: 1;
  min-width: 0;
}

.entity-name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.entity-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-scenes {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.entity-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11px;
}

.action-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}

.action-link:hover {
  text-decoration: underline;
}

.hover-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.hover-actions button {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.hover-actions .btn-edit:hover {
  background: var(--el-color-primary);
}

.hover-actions .btn-delete:hover {
  background: var(--el-color-danger);
}
</style>
