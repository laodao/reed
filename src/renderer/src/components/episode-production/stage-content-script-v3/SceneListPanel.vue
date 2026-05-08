<template>
  <section class="scene-list-panel">
    <header class="panel-header">
      <span class="panel-title">场景列表 ({{ scenes.length }})</span>
      <span class="panel-actions" v-if="!readonly">
        <el-button size="small" class="btn-add-scene" @click="$emit('add-scene')">
          <el-icon><Plus /></el-icon>
          添加场景
        </el-button>
        <el-button size="small" class="btn-rewrite" @click="$emit('rewrite-scenes')">
          <el-icon><EditPen /></el-icon>
          ✏ 重写场景
        </el-button>
        <el-button size="small" class="btn-fix-bindings" @click="$emit('fix-bindings')">
          <el-icon><Connection /></el-icon>
          🔗 修复绑定
        </el-button>
      </span>
    </header>

    <div v-if="scenes.length === 0" class="empty-hint">
      还没场景 — 点 + 添加场景 或上方 AI 生成剧本
    </div>

    <div v-else class="scenes">
      <article
        v-for="scene in scenes"
        :key="scene.id"
        class="scene-card"
        :class="{
          highlighted: isHighlighted(scene),
          expanded: expandedSceneIds.has(scene.id),
        }"
      >
        <header class="scene-header" @click="toggleExpand(scene.id)">
          <div class="scene-info">
            <span class="scene-num">场景 {{ scene.sceneNumber }}</span>
            <span class="scene-meta">
              📍 {{ scene.location || '未指定地点' }}
              <span v-if="scene.timeOfDay">· {{ scene.timeOfDay }}</span>
            </span>
          </div>
          <SceneEntityChips
            :chips="getSceneChips(scene)"
            @click-entity="$emit('click-entity', $event)"
          />
        </header>
        <div v-if="expandedSceneIds.has(scene.id)" class="scene-body">
          <div v-if="scene.originalText" class="scene-section">
            <span class="section-label">原文</span>
            <EntityRefRenderer :text="scene.originalText" :entities="entities" @click-entity="$emit('click-entity', $event)" />
          </div>
          <div v-if="scene.narration" class="scene-section">
            <span class="section-label">旁白</span>
            <EntityRefRenderer :text="scene.narration" :entities="entities" @click-entity="$emit('click-entity', $event)" />
          </div>
          <div v-if="(scene.dialogues ?? []).length > 0" class="scene-section">
            <span class="section-label">对话</span>
            <div v-for="d in scene.dialogues" :key="d.id" class="dialogue-line">
              <span class="dialogue-speaker">{{ d.characterName }}：</span>
              <EntityRefRenderer :text="d.text" :entities="entities" />
            </div>
          </div>
          <div v-if="(scene.actions ?? []).length > 0" class="scene-section">
            <span class="section-label">动作</span>
            <div v-for="a in scene.actions" :key="a.id" class="action-line">
              <EntityRefRenderer :text="a.description" :entities="entities" />
            </div>
          </div>
          <div class="scene-footer" v-if="!readonly">
            <el-button size="small" @click.stop="$emit('edit-scene', scene.id)">
              <el-icon><EditPen /></el-icon>
              编辑场景
            </el-button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, EditPen, Connection } from '@element-plus/icons-vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'
import SceneEntityChips from './SceneEntityChips.vue'
import { sceneContainsEntity } from './scene-entity-utils'
import type { EntityRef } from './scene-entity-utils'
import type { SceneScript } from '../../../../../shared/types/episode-production/narrative.types'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
} from '../../../../../shared/types/episode-production'

defineOptions({ name: 'SceneListPanel' })

const props = defineProps<{
  scenes: SceneScript[]
  entities: any[]
  characters: UploadedCharacter[]
  locations: UploadedLocation[]
  items: UploadedItem[]
  highlightedEntity: EntityRef | null
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'expand', sceneId: string): void
  (e: 'collapse', sceneId: string): void
  (e: 'add-scene'): void
  (e: 'rewrite-scenes'): void
  (e: 'fix-bindings'): void
  (e: 'edit-scene', sceneId: string): void
  (e: 'click-entity', entity: EntityRef | any): void
}>()

const expandedSceneIds = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  if (expandedSceneIds.value.has(id)) {
    expandedSceneIds.value.delete(id)
    emit('collapse', id)
  } else {
    expandedSceneIds.value.add(id)
    emit('expand', id)
  }
}

function isHighlighted(scene: SceneScript): boolean {
  if (!props.highlightedEntity) return false
  return sceneContainsEntity(scene, props.highlightedEntity)
}

function getSceneChips(scene: SceneScript): EntityRef[] {
  const refs: EntityRef[] = []
  for (const c of scene.characters ?? []) {
    if (props.characters.some((ch) => ch.id === c.characterId || ch.name === c.characterName)) {
      refs.push({ kind: 'character', name: c.characterName, id: c.characterId })
    }
  }
  if (scene.location) {
    const loc = props.locations.find((l) => l.name === scene.location || l.id === scene.locationBindingId)
    if (loc) refs.push({ kind: 'location', name: loc.name, id: loc.id })
  }
  for (const item of props.items) {
    const ref: EntityRef = { kind: 'item', name: item.name, id: item.id }
    if (sceneContainsEntity(scene, ref)) refs.push(ref)
  }
  return refs
}
</script>

<style scoped lang="scss">
.scene-list-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 12px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-actions {
  display: inline-flex;
  gap: 4px;
}

.empty-hint {
  text-align: center;
  padding: 18px 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.scenes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scene-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-bg-color);
  transition: all 0.2s;
}

.scene-card.highlighted {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning);
}

.scene-header {
  padding: 6px 10px;
  cursor: pointer;
  background: var(--el-color-primary-light-9);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.scene-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scene-num {
  font-weight: 600;
  font-size: 12px;
  color: var(--el-color-primary);
}

.scene-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.scene-body {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scene-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.dialogue-line,
.action-line {
  font-size: 11px;
  line-height: 1.45;
  color: var(--el-text-color-regular);
  padding-left: 10px;
}

.dialogue-speaker {
  color: var(--el-color-primary);
  font-weight: 500;
}

.scene-footer {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}
</style>
