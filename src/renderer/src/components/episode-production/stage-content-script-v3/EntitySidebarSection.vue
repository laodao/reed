<template>
  <section class="entity-section">
    <header class="section-header" @click="expanded = !expanded">
      <el-icon class="toggle-icon" :class="{ expanded }">
        <ArrowRight />
      </el-icon>
      <span class="section-icon">{{ icon }}</span>
      <span class="section-title">{{ title }}</span>
      <span class="section-count">({{ entities.length }})</span>
      <span class="section-actions">
        <el-dropdown
          v-if="!readonly"
          trigger="click"
          @command="onCommand"
          @click.stop
        >
          <el-button link size="small" class="more-btn" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="reidentify">重新识别{{ title }}</el-dropdown-item>
              <el-dropdown-item command="add" divided>+ 添加{{ title }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </span>
    </header>
    <ul v-if="expanded" class="section-list">
      <li v-if="entities.length === 0" class="empty-hint">
        未识别到{{ title }}
      </li>
      <EntitySidebarItem
        v-for="(entity, idx) in entities"
        :key="entity.id ?? idx"
        :entity="entity"
        :kind="kind"
        :scene-numbers="getSceneNumbers(entity)"
        :readonly="readonly"
        :highlighted="isHighlighted(entity)"
        @click="onItemClick(entity)"
        @toggle="$emit('toggle', kind, idx)"
        @toggle-source="$emit('toggle-source', kind, idx)"
        @edit="$emit('edit', kind, idx)"
        @delete="$emit('delete', kind, idx)"
      />
    </ul>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, MoreFilled } from '@element-plus/icons-vue'
import EntitySidebarItem from './EntitySidebarItem.vue'
import { entityScenes, sceneContainsEntity } from './scene-entity-utils'
import type { EntityRef } from './scene-entity-utils'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'

defineOptions({ name: 'EntitySidebarSection' })

type AnyEntity = UploadedCharacter | UploadedLocation | UploadedItem
type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  kind: Kind
  icon: string
  title: string
  entities: AnyEntity[]
  scenes: SceneScript[]
  readonly?: boolean
  highlightedSceneId?: string | null
}>()

const emit = defineEmits<{
  (e: 'click-entity', entity: EntityRef): void
  (e: 'toggle', kind: Kind, idx: number): void
  (e: 'toggle-source', kind: Kind, idx: number): void
  (e: 'edit', kind: Kind, idx: number): void
  (e: 'delete', kind: Kind, idx: number): void
  (e: 'reidentify', kind: Kind): void
  (e: 'add', kind: Kind): void
}>()

const expanded = ref(true)

function entityRefOf(entity: AnyEntity): EntityRef {
  return { kind: props.kind, name: entity.name, id: entity.id }
}

function getSceneNumbers(entity: AnyEntity): number[] {
  return entityScenes(entityRefOf(entity), props.scenes)
}

function isHighlighted(entity: AnyEntity): boolean {
  if (!props.highlightedSceneId) return false
  const scene = props.scenes.find((s) => s.id === props.highlightedSceneId)
  if (!scene) return false
  return sceneContainsEntity(scene, entityRefOf(entity))
}

function onItemClick(entity: AnyEntity): void {
  emit('click-entity', entityRefOf(entity))
}

function onCommand(command: string): void {
  if (command === 'reidentify') emit('reidentify', props.kind)
  else if (command === 'add') emit('add', props.kind)
}
</script>

<style scoped lang="scss">
.entity-section {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  user-select: none;
  background: var(--el-fill-color-lighter);
}

.toggle-icon {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  transition: transform 0.15s;
}

.toggle-icon.expanded {
  transform: rotate(90deg);
}

.section-icon {
  font-size: 13px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.section-actions {
  margin-left: auto;
}

.section-list {
  margin: 0;
  padding: 4px 4px;
  list-style: none;
}

.empty-hint {
  padding: 8px 6px;
  text-align: center;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  list-style: none;
}
</style>
