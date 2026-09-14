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
      <div class="panel-title-row">
        <span class="panel-title">原文片段</span>
        <!-- 字数 / 识别结果信息（spec 2026-05-08 v4：原 footer 上提到标题后） -->
        <span v-if="!editingContent" class="panel-meta">
          <template v-if="hasContent">
            字数：约 {{ contentWordCount }} 字 ·
            识别出
            <strong>{{ characters.length }}</strong> 角色 ·
            <strong>{{ locations.length }}</strong> 地点 ·
            <strong>{{ items.length }}</strong> 物品
          </template>
          <template v-else>
            字数：0 字 · 未粘贴原文
          </template>
        </span>
      </div>
      <span class="panel-actions">
        <template v-if="!editingContent">
          <el-button size="small" :disabled="readonly" @click="enterEditContent">
            <el-icon><EditPen /></el-icon>
            <span>{{ hasContent ? '编辑' : '粘贴原文' }}</span>
          </el-button>
          <el-button
            size="small"
            :loading="identifying"
            :disabled="readonly || !hasContent"
            :title="!hasContent ? '请先粘贴原文再做 AI 分析' : ''"
            @click="emit('reidentify')"
          >
            <el-icon><Refresh /></el-icon>
            <span>✨ 重新 AI 分析</span>
          </el-button>
          <!-- 专注 icon 已移除（spec 2026-05-08 v5）：原文片段没有最大化入口；
               场景列表的最大化仍可反向折叠本卡（由父容器 collapsed-bar 显示） -->
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

    <!--
      章节梗概嵌入 ExcerptPanel 内（在原文正文上面）。
      spec 2026-05-08 v3：支持就地编辑——
        - readonly 状态：单行展示 + ✨ 重新生成 AI 按钮
        - editing 状态：textarea + 保存 / 取消，emit('save-synopsis', text)
    -->
    <div v-if="!editingContent && (synopsis || regenerating !== undefined)" class="synopsis-inline">
      <template v-if="!editingSynopsis">
        <span class="synopsis-label">章节梗概：</span>
        <span v-if="synopsis" class="synopsis-text">{{ synopsis }}</span>
        <span v-else class="synopsis-empty">梗概为空，点右侧"编辑"或"重新生成"或剧本生成后自动填充</span>
        <el-button
          v-if="!readonly"
          size="small"
          link
          class="btn-regen-synopsis"
          @click="enterEditSynopsis"
        >
          <el-icon><EditPen /></el-icon>
          <span>编辑</span>
        </el-button>
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
      </template>
      <template v-else>
        <div class="synopsis-edit-row">
          <el-input
            v-model="synopsisDraft"
            type="textarea"
            :rows="3"
            placeholder="章节梗概（50-100 字摘要，参与后续 prompt 拼接）"
            class="synopsis-editor"
          />
          <div class="synopsis-edit-actions">
            <el-button size="small" :disabled="savingSynopsis" @click="cancelEditSynopsis">
              取消
            </el-button>
            <el-button
              size="small"
              type="primary"
              :loading="savingSynopsis"
              :disabled="!synopsisDirty"
              @click="onSaveSynopsis"
            >
              保存
            </el-button>
          </div>
        </div>
      </template>
    </div>

    <div v-if="!editingContent && hasContent" class="excerpt-body">
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
    <!-- 空态：剧集创建时未填长文，进入剧集页后引导粘贴 -->
    <div v-else-if="!editingContent && !hasContent" class="excerpt-empty">
      <el-icon :size="32" color="var(--el-text-color-placeholder)">
        <DocumentAdd />
      </el-icon>
      <p class="empty-title">还没有原文</p>
      <p class="empty-hint">
        点上方"粘贴原文"贴入小说章节内容（500-15000 字），
        AI 会基于原文识别角色 / 地点 / 物品要素，并生成剧本。
      </p>
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

    <!-- 编辑模式下保留字数提示（浏览模式的字数信息已上提到 panel-header） -->
    <div v-if="editingContent" class="excerpt-footer">
      字数：{{ editContentDraft.length }} 字
      <span :class="['word-count-hint', { warn: !isEditContentValid }]">
        （需 500–15000 字）
      </span>
      <span v-if="editContentDirty" class="dirty-tip">· 未保存</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentAdd, EditPen, Refresh } from '@element-plus/icons-vue'
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
  /**
   * 复核修复：父容器提供的异步保存（返回 true=成功）。传入后 onSave
   * 等待回执再退编辑态——保存失败保留草稿（旧实现立即清空，1.5 万字
   * 原文保存失败即丢稿）。
   */
  onContentSave?: (content: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  (e: 'reidentify'): void
  (e: 'save-content', content: string): void
  (e: 'regenerate-synopsis'): void
  /** 章节梗概就地编辑保存：父容器调 ep:update-script({ synopsis }) 落库 */
  (e: 'save-synopsis', text: string): void
}>()

// ===== 编辑态 =====
const editingContent = ref(false)
const savingContent = ref(false)
const editContentDraft = ref('')
const editContentOriginal = ref('')

// ===== 章节梗概就地编辑（spec 2026-05-08 v3） =====
const editingSynopsis = ref(false)
const savingSynopsis = ref(false)
const synopsisDraft = ref('')
const synopsisOriginal = ref('')
const synopsisDirty = computed(() => synopsisDraft.value !== synopsisOriginal.value)

function enterEditSynopsis(): void {
  if (props.readonly) return
  synopsisDraft.value = props.synopsis ?? ''
  synopsisOriginal.value = props.synopsis ?? ''
  editingSynopsis.value = true
}

function cancelEditSynopsis(): void {
  editingSynopsis.value = false
  synopsisDraft.value = ''
  synopsisOriginal.value = ''
}

async function onSaveSynopsis(): Promise<void> {
  if (!synopsisDirty.value) {
    cancelEditSynopsis()
    return
  }
  savingSynopsis.value = true
  try {
    emit('save-synopsis', synopsisDraft.value.trim())
    // 父容器实际落库后会通过 props.synopsis 同步回来；这里乐观退出编辑态
    cancelEditSynopsis()
  } finally {
    savingSynopsis.value = false
  }
}

const editContentDirty = computed(
  () => editContentDraft.value !== editContentOriginal.value,
)
const isEditContentValid = computed(() => {
  const len = editContentDraft.value.length
  return len >= 500 && len <= 15000
})

const contentWordCount = computed(() => props.episode?.uploadedContent?.length ?? 0)
/** 是否已有原文（创建时可空 → 进剧集后再填，期间显示空态引导） */
const hasContent = computed(
  () => !!props.episode?.uploadedContent && props.episode.uploadedContent.length > 0,
)

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
    if (props.onContentSave) {
      // 复核修复：等父容器保存回执，成功才退编辑态——失败保留草稿不丢稿
      const ok = await props.onContentSave(editContentDraft.value).catch(() => false)
      if (!ok) return
    } else {
      // 兼容旧接入：无异步回执时按原 emit 语义
      emit('save-content', editContentDraft.value)
    }
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
  display: flex;
  flex-direction: column;
  /* 让 excerpt-body 能用 flex: 1 撑满 panel 剩余高度 */
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.panel-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.panel-meta {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-meta strong {
  font-weight: 600;
  color: var(--el-text-color-secondary);
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

.synopsis-edit-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.synopsis-editor {
  width: 100%;
}

.synopsis-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.excerpt-body {
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  /*
   * height:0 + flex:1：让 body 不参与 panel 自然高度计算（防止长原文
   * 撑高 panel）；外部 excerpt-row 单栏布局后 panel 自由生长，body 弹性占满。
   */
  height: 0;
  flex: 1;
  overflow-y: auto;
}

.excerpt-empty {
  flex: 1;
  min-height: 160px;
  background: var(--el-fill-color-lighter);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}

.empty-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0;
  font-weight: 500;
}

.empty-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.6;
  max-width: 420px;
  margin: 0;
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
