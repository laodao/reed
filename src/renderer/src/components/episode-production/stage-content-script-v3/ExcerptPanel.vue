<template>
  <!--
    ExcerptPanel · 原文片段（含实体高亮 + 编辑双模式）

    从 stage-content-v2 / StageContentViewV2.vue 拆出。
    职责：
      - 只读模式：显示带实体高亮的原文（mark.entity-mark 三色区分 character/location/item）
      - 编辑模式：el-input textarea 编辑原文，本地 dirty 检测，保存时 emit('save-content')
      - 重新 AI 分析：emit('reidentify') 由父容器决定调哪个 IPC
    高亮逻辑：扫 props.characters/locations/items 三类 entity，按 name 匹配文本
    去重叠后切片（保留先到的较长匹配），再渲染为 mark + text 段。
  -->
  <section class="excerpt-panel">
    <div class="panel-header">
      <span class="panel-title">原文片段</span>
      <span class="panel-actions">
        <template v-if="!editingContent">
          <el-button size="small" :disabled="readonly" @click="enterEditContent">
            <el-icon><EditPen /></el-icon>
            <span>编辑</span>
          </el-button>
          <el-button
            size="small"
            :loading="identifying"
            :disabled="readonly"
            @click="emit('reidentify')"
          >
            <el-icon><Refresh /></el-icon>
            <span>✨ 重新 AI 分析</span>
          </el-button>
        </template>
        <template v-else>
          <el-button size="small" :disabled="savingContent" @click="cancelEditContent">
            取消
          </el-button>
          <el-button
            size="small"
            type="primary"
            :loading="savingContent"
            :disabled="!editContentDirty || !isEditContentValid"
            @click="onSave"
          >
            保存
          </el-button>
        </template>
      </span>
    </div>

    <!-- 章节梗概嵌入 ExcerptPanel 内（在原文正文上面，单行排列：标签:正文 [重新生成]） -->
    <div v-if="!editingContent && (synopsis || regenerating !== undefined)" class="synopsis-inline">
      <span class="synopsis-label">章节梗概：</span>
      <span v-if="synopsis" class="synopsis-text">{{ synopsis }}</span>
      <span v-else class="synopsis-empty">梗概为空，点右侧"重新生成"或剧本生成后自动填充</span>
      <el-button
        v-if="!readonly"
        size="small"
        link
        class="btn-regen-synopsis"
        :loading="regenerating"
        @click="emit('regenerate-synopsis')"
      >
        <el-icon><Refresh /></el-icon>
        <span>✨ 重新生成</span>
      </el-button>
    </div>

    <div v-if="!editingContent" class="excerpt-body">
      <span v-for="(seg, i) in highlightedExcerpt" :key="i">
        <mark
          v-if="seg.type === 'entity'"
          class="entity-mark"
          :class="`mark-${seg.kind}`"
          :title="`${seg.kind === 'character' ? '角色' : seg.kind === 'location' ? '地点' : '物品'}：${seg.entity?.description ?? seg.name}`"
        >{{ seg.name }}</mark>
        <template v-else>{{ seg.text }}</template>
      </span>
    </div>
    <el-input
      v-else
      v-model="editContentDraft"
      type="textarea"
      :rows="14"
      resize="vertical"
      placeholder="原文内容（500–15000 字）"
      class="excerpt-editor"
    />

    <div class="excerpt-footer">
      <template v-if="!editingContent">
        字数：约 {{ contentWordCount }} 字 ·
        AI 已扫描，识别出
        <strong>{{ characters.length }}</strong> 角色 ·
        <strong>{{ locations.length }}</strong> 地点 ·
        <strong>{{ items.length }}</strong> 物品 — 见右侧
      </template>
      <template v-else>
        字数：{{ editContentDraft.length }} 字
        <span :class="['word-count-hint', { warn: !isEditContentValid }]">
          （需 500–15000 字）
        </span>
        <span v-if="editContentDirty" class="dirty-tip">· 未保存</span>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen, Refresh } from '@element-plus/icons-vue'
import type {
  UploadedCharacter,
  UploadedItem,
  UploadedLocation,
  VideoEpisode,
} from '../../../../../shared/types/episode-production'

defineOptions({ name: 'ExcerptPanel' })

type Kind = 'character' | 'location' | 'item'

const props = defineProps<{
  episode: VideoEpisode
  characters: UploadedCharacter[]
  locations: UploadedLocation[]
  items: UploadedItem[]
  identifying?: boolean
  readonly?: boolean
  /** 章节梗概文本（嵌入显示在原文正文上面，仅在 scripting sub-state 由父容器传入） */
  synopsis?: string
  /** 章节梗概重新生成中（loading 态） */
  regenerating?: boolean
}>()

const emit = defineEmits<{
  (e: 'reidentify'): void
  (e: 'save-content', content: string): void
  (e: 'regenerate-synopsis'): void
}>()

// ===== 编辑态 =====
const editingContent = ref(false)
const savingContent = ref(false)
const editContentDraft = ref('')
const editContentOriginal = ref('')

const editContentDirty = computed(
  () => editContentDraft.value !== editContentOriginal.value,
)
const isEditContentValid = computed(() => {
  const len = editContentDraft.value.length
  return len >= 500 && len <= 15000
})

const contentWordCount = computed(() => props.episode?.uploadedContent?.length ?? 0)

// ===== 实体高亮 =====
type ExcerptSeg =
  | { type: 'text'; text: string }
  | {
      type: 'entity'
      name: string
      kind: Kind
      entity: UploadedCharacter | UploadedLocation | UploadedItem
    }

const highlightedExcerpt = computed<ExcerptSeg[]>(() => {
  const text = props.episode?.uploadedContent ?? ''
  if (!text) return []
  const matches: Array<{
    name: string
    kind: Kind
    entity: any
    start: number
    end: number
  }> = []
  const allEntities = [
    ...props.characters.map((e) => ({ entity: e, kind: 'character' as Kind })),
    ...props.locations.map((e) => ({ entity: e, kind: 'location' as Kind })),
    ...props.items.map((e) => ({ entity: e, kind: 'item' as Kind })),
  ].filter(({ entity }) => entity.name && entity.name.length > 0)

  for (const { entity, kind } of allEntities) {
    const name = entity.name
    let pos = 0
    while ((pos = text.indexOf(name, pos)) !== -1) {
      matches.push({ name, kind, entity, start: pos, end: pos + name.length })
      pos += name.length
    }
  }

  // 去重叠：按 start 升序，丢弃重叠（保留先到的较长匹配）
  matches.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start))
  const accepted: typeof matches = []
  for (const m of matches) {
    if (accepted.length === 0 || m.start >= accepted[accepted.length - 1].end) {
      accepted.push(m)
    }
  }

  const segs: ExcerptSeg[] = []
  let last = 0
  for (const m of accepted) {
    if (m.start > last) segs.push({ type: 'text', text: text.slice(last, m.start) })
    segs.push({ type: 'entity', name: m.name, kind: m.kind, entity: m.entity })
    last = m.end
  }
  if (last < text.length) segs.push({ type: 'text', text: text.slice(last) })
  return segs
})

// ===== 编辑流程 =====
function enterEditContent(): void {
  if (props.readonly) return
  if (!props.episode || props.episode.sourceType !== 'uploaded') return
  const cur = props.episode.uploadedContent ?? ''
  editContentOriginal.value = cur
  editContentDraft.value = cur
  editingContent.value = true
}

function cancelEditContent(): void {
  editingContent.value = false
  editContentDraft.value = ''
  editContentOriginal.value = ''
}

async function onSave(): Promise<void> {
  if (!editContentDirty.value) {
    cancelEditContent()
    return
  }
  if (!isEditContentValid.value) {
    ElMessage.warning('原文字数需在 500–15000 字之间')
    return
  }
  savingContent.value = true
  try {
    // 由父容器决定调哪个 IPC，结果不阻塞这里 ack
    emit('save-content', editContentDraft.value)
    // 父容器应负责 success message + episode 更新；这里直接退出编辑态
    cancelEditContent()
  } finally {
    savingContent.value = false
  }
}
</script>

<style scoped lang="scss">
.excerpt-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 12px;
  flex: 1;
  min-width: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.synopsis-inline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
  padding: 6px 10px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.55;
}

.synopsis-label {
  font-weight: 600;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.synopsis-text {
  flex: 1;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  min-width: 0;
}

.synopsis-empty {
  flex: 1;
  color: var(--el-text-color-placeholder);
  font-style: italic;
  min-width: 0;
}

.btn-regen-synopsis {
  font-size: 11px;
  flex-shrink: 0;
}

.excerpt-body {
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  max-height: 180px;
  overflow-y: auto;
}

.entity-mark {
  background: var(--el-color-warning-light-7);
  color: var(--el-text-color-primary);
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 500;
  cursor: help;
}

.mark-character {
  background: var(--el-color-primary-light-7);
}
.mark-location {
  background: var(--el-color-success-light-7);
}
.mark-item {
  background: var(--el-color-warning-light-7);
}

.excerpt-editor {
  width: 100%;
}

.excerpt-editor :deep(.el-textarea__inner) {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.85;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
}

.excerpt-footer {
  margin-top: 6px;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.word-count-hint {
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
}

.word-count-hint.warn {
  color: var(--el-color-warning);
}

.dirty-tip {
  margin-left: 6px;
  color: var(--el-color-warning);
}
</style>
