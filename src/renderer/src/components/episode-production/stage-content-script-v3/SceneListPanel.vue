<template>
  <section class="scene-list-panel">
    <header class="panel-header">
      <span class="panel-title">场景列表 ({{ scenes.length }})</span>
      <span class="panel-actions">
        <template v-if="!readonly">
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
        </template>
        <!-- 专注切换 icon（spec 2026-05-08 v4） -->
        <el-button
          size="small"
          :title="focused ? '退出专注（恢复双区）' : '专注此卡（折叠原文片段）'"
          @click="$emit('toggle-focus')"
        >
          <el-icon><FullScreen v-if="!focused" /><Aim v-else /></el-icon>
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
        <!--
          展开默认 = 浏览模式（spec 2026-05-08 v3 修订）：
          - 浏览模式：只读渲染（带 entity 高亮的原文/旁白/对话/动作）+ 顶部「编辑」按钮
          - 编辑模式：渲染 SceneInlineEditor 表单。点保存或取消后回到浏览模式。
          每个场景独立 mode 状态（editingSceneIds），允许多个场景同时打开但其中只有部分在编辑。
        -->
        <div v-if="expandedSceneIds.has(scene.id)" class="scene-body">
          <!-- 浏览模式 -->
          <template v-if="!editingSceneIds.has(scene.id)">
            <div class="scene-toolbar" v-if="!readonly">
              <el-button size="small" type="primary" plain @click.stop="startEditing(scene.id)">
                <el-icon><EditPen /></el-icon>
                编辑
              </el-button>
            </div>
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
          </template>
          <!-- 编辑模式：SceneInlineEditor 全字段表单 -->
          <SceneInlineEditor
            v-else
            :ref="(el) => setEditorRef(scene.id, el as any)"
            :scene="scene"
            :readonly="readonly"
            :saving="savingSceneId === scene.id"
            :polishing="polishingSceneId === scene.id"
            @save="onInlineSave"
            @polish-requested="(sid) => $emit('polish-scene', sid)"
            @cancel="stopEditing"
          />
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Aim, Plus, EditPen, Connection, FullScreen } from '@element-plus/icons-vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'
import SceneEntityChips from './SceneEntityChips.vue'
import SceneInlineEditor from './SceneInlineEditor.vue'
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
  /** 父容器在 ep:update-scene 调用期间设置；展开的对应场景 saveBar loading */
  savingSceneId?: string | null
  /** 父容器在 ep:polish-scene 调用期间设置；对应场景的"AI 润色"按钮 loading */
  polishingSceneId?: string | null
  /** spec 2026-05-08 v4：本卡片是否在专注模式（占满主区） */
  focused?: boolean
  /**
   * 复核修复：父容器提供的异步保存（返回 true=成功）。传入后内联保存
   * 等待回执再退编辑态，保存失败保留编辑器（用户稿不再丢失）。
   */
  onSceneSave?: (sceneId: string, partial: Partial<SceneScript>) => Promise<boolean>
}>()

const emit = defineEmits<{
  (e: 'expand', sceneId: string): void
  (e: 'collapse', sceneId: string): void
  (e: 'add-scene'): void
  (e: 'rewrite-scenes'): void
  (e: 'fix-bindings'): void
  /** 场景就地保存：父容器调 ep:update-scene 落库 */
  (e: 'save-scene', sceneId: string, partial: Partial<SceneScript>): void
  /** AI 场景级润色：父容器调 ep:polish-scene 后通过 ref 把结果填回 SceneInlineEditor */
  (e: 'polish-scene', sceneId: string): void
  (e: 'click-entity', entity: EntityRef | any): void
  /** 切换专注模式：父容器把 focusedPanel 在 'sceneList' / null 之间切 */
  (e: 'toggle-focus'): void
}>()

const expandedSceneIds = ref<Set<string>>(new Set())
/**
 * 当前进入"编辑模式"的场景 id 集合（spec 2026-05-08 v3 修订）。
 * 默认展开是浏览模式；点"编辑"按钮才进编辑模式渲染 SceneInlineEditor 表单。
 */
const editingSceneIds = ref<Set<string>>(new Set())

/**
 * 每个进入编辑模式的 SceneInlineEditor 实例 ref —— 供父容器在 polishScene 成功后
 * 通过 getEditorRef(sceneId) 拿到对应实例调 applyPolishResult 回填。
 * 浏览模式下没有编辑器实例，map 里 entry 自然不存在。
 */
const editorRefs = ref<Map<string, any>>(new Map())

function setEditorRef(sceneId: string, el: any): void {
  if (el) editorRefs.value.set(sceneId, el)
  else editorRefs.value.delete(sceneId)
}

function getEditorRef(sceneId: string): any {
  return editorRefs.value.get(sceneId)
}

function startEditing(sceneId: string): void {
  editingSceneIds.value.add(sceneId)
}

function stopEditing(sceneId: string): void {
  editingSceneIds.value.delete(sceneId)
}

/**
 * 编辑器保存事件中转：调父容器 onSaveSceneInline，成功后切回浏览模式。
 * 复核修复：不再乐观退编辑态——await onSceneSave 回执，失败保留编辑器
 * （旧实现保存失败时表单已销毁，用户对场景的全部修改丢失）。
 */
async function onInlineSave(sceneId: string, partial: Partial<SceneScript>): Promise<void> {
  if (props.onSceneSave) {
    const ok = await props.onSceneSave(sceneId, partial).catch(() => false)
    if (!ok) return
  } else {
    // 兼容旧接入：无异步回执时按原 emit 语义（乐观切回）
    emit('save-scene', sceneId, partial)
  }
  stopEditing(sceneId)
}

defineExpose({ getEditorRef, startEditing, stopEditing })

function toggleExpand(id: string): void {
  if (expandedSceneIds.value.has(id)) {
    expandedSceneIds.value.delete(id)
    // 折叠时同步退出编辑模式（避免再展开时仍在 editing 状态）
    editingSceneIds.value.delete(id)
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
  /* spec 2026-05-08 v4：自身做滚动容器，标题 sticky 顶部不随场景列表滚走 */
  height: 100%;
  overflow-y: auto;
  /* padding 移到内容区，避免 sticky 标题底部缺乏视觉对齐 */
  padding: 0;
  display: flex;
  flex-direction: column;
}


.panel-header {
  /* sticky 让标题不随内部滚动（spec 2026-05-08 v4 需求 2） */
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
  padding: 18px 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.scenes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 12px;
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

/* 浏览模式顶部工具条：「编辑」按钮靠右 */
.scene-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
</style>
