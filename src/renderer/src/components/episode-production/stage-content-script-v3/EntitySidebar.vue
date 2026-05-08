<template>
  <aside class="entity-sidebar">
    <header class="sidebar-header">
      <span class="sidebar-title">要素清单</span>
    </header>
    <div class="sidebar-body">
      <EntitySidebarSection
        kind="character"
        icon="👤"
        title="角色"
        :entities="characters"
        :scenes="scenes"
        :readonly="readonly"
        :highlighted-scene-id="highlightedSceneId"
        @click-entity="$emit('click-entity', $event)"
        @toggle="(k, i) => $emit('toggle', k, i)"
        @toggle-source="(k, i) => $emit('toggle-source', k, i)"
        @edit="(k, i) => $emit('edit', k, i)"
        @delete="(k, i) => $emit('delete', k, i)"
        @reidentify="(k) => $emit('reidentify', k)"
        @add="(k) => $emit('add', k)"
      />
      <EntitySidebarSection
        kind="location"
        icon="🏛"
        title="地点"
        :entities="locations"
        :scenes="scenes"
        :readonly="readonly"
        :highlighted-scene-id="highlightedSceneId"
        @click-entity="$emit('click-entity', $event)"
        @toggle="(k, i) => $emit('toggle', k, i)"
        @toggle-source="(k, i) => $emit('toggle-source', k, i)"
        @edit="(k, i) => $emit('edit', k, i)"
        @delete="(k, i) => $emit('delete', k, i)"
        @reidentify="(k) => $emit('reidentify', k)"
        @add="(k) => $emit('add', k)"
      />
      <EntitySidebarSection
        kind="item"
        icon="⚔️"
        title="物品"
        :entities="items"
        :scenes="scenes"
        :readonly="readonly"
        :highlighted-scene-id="highlightedSceneId"
        @click-entity="$emit('click-entity', $event)"
        @toggle="(k, i) => $emit('toggle', k, i)"
        @toggle-source="(k, i) => $emit('toggle-source', k, i)"
        @edit="(k, i) => $emit('edit', k, i)"
        @delete="(k, i) => $emit('delete', k, i)"
        @reidentify="(k) => $emit('reidentify', k)"
        @add="(k) => $emit('add', k)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import EntitySidebarSection from './EntitySidebarSection.vue'
import type { EntityRef } from './scene-entity-utils'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'

defineOptions({ name: 'EntitySidebar' })

type Kind = 'character' | 'location' | 'item'

defineProps<{
  characters: UploadedCharacter[]
  locations: UploadedLocation[]
  items: UploadedItem[]
  scenes: SceneScript[]
  highlightedEntity: EntityRef | null
  highlightedSceneId: string | null
  readonly?: boolean
}>()

defineEmits<{
  (e: 'click-entity', entity: EntityRef): void
  (e: 'toggle', kind: Kind, idx: number): void
  (e: 'toggle-source', kind: Kind, idx: number): void
  (e: 'edit', kind: Kind, idx: number): void
  (e: 'delete', kind: Kind, idx: number): void
  (e: 'reidentify', kind: Kind): void
  (e: 'add', kind: Kind): void
}>()
</script>

<style scoped lang="scss">
.entity-sidebar {
  width: 320px;
  min-width: 280px;
  max-width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sidebar-body {
  flex: 1;
  overflow: auto;
}
</style>
