<template>
  <div class="prompt-rich">
    <!-- 顶部小提示条 -->
    <div class="p-toolbar">
      <span class="p-label">提示词</span>
      <span class="p-hint">当前片段 · 输入 @ 引用资产 · 点击蓝色参数可切换 · 拖资产图到框内引用</span>
    </div>

    <!-- 一个整体富文本框（contenteditable）：一行 = 一个镜头（分镜） -->
    <div
      ref="editorRef"
      class="rich-box"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      spellcheck="false"
      :class="{ 'is-dragover': dragOver }"
      @input="onInput"
      @keydown="onKeydown"
      @click="onClick"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    />

    <!-- @ 提及弹层 -->
    <div v-if="mentionOpen" ref="mentionRef" class="rich-popup" :style="mentionStyle">
      <div class="popup-search"><el-input ref="mentionInput" v-model="mentionQuery" size="small" placeholder="搜索资产…" @keydown="onMentionKey" /></div>
      <div class="popup-list">
        <div v-for="(e, i) in filtered" :key="e.id" class="popup-item" :class="{ active: i === activeIdx }" @mousedown.prevent="pickMention(e)" @mouseenter="activeIdx = i">
          <span class="pi-icon" :class="e.kind"><el-icon :size="13"><component :is="kindIcon(e.kind)" /></el-icon></span>
          <span class="pi-name">{{ e.name }}</span>
          <span class="pi-kind">{{ kindLabel(e.kind) }}</span>
        </div>
        <div v-if="filtered.length === 0" class="popup-empty">无匹配资产</div>
      </div>
    </div>

    <!-- 参数下拉弹层 -->
    <div v-if="paramOpen" ref="paramRef" class="rich-popup param-popup" :style="paramStyle">
      <div class="popup-title">{{ paramKey }}</div>
      <div class="popup-list">
        <div v-for="opt in paramOptions" :key="opt.value" class="popup-item" :class="{ active: opt.value === paramValue }" @click="pickParam(opt)">
          <span>{{ displayValue(paramKey, opt.value) }}</span><el-icon v-if="opt.value === paramValue" class="check"><Check /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ShotPromptEditor · 分镜片段提示词富文本编辑器（对齐截图）。
 *
 * 模型：一段待生成的视频片段 = 多个镜头（分镜）。本组件是一个整体 contenteditable，
 * 框内一行 = 一个镜头，格式：
 *   `镜头N: [景别] · [运镜] · [时长] · [风格]. 描述`
 * 其中 4 个参数为行内蓝色可点徽章（点击弹出对应下拉切换），
 * 描述为可编辑普通文本，@资产引用为行内 token，拖图到框内生成 @ 引用。
 *
 * 通过 `rows: ShotPromptRow[]`（v-model）与外部交互，逐镜写回。
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { Check, User, Location, Goods } from '@element-plus/icons-vue'
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  labelOf,
} from '../shared/param-options'

/** 一行（一个镜头/分镜）的结构化数据 */
export interface ShotPromptRow {
  /** 分镜 id（用于写回 storyboard） */
  id: string
  /** 镜头序号（1-based，用于「镜头N:」标签） */
  shotNumber: number
  /** 景别（shotType value） */
  shotType: string
  /** 运镜（cameraMovement value） */
  cameraMovement: string
  /** 时长（秒） */
  duration: number
  /** 风格（style id，一般整段一致） */
  style: string
  /** 画面描述 */
  description: string
}

export interface MentionEntity { id: string; name: string; kind: 'character' | 'location' | 'item' }

export interface ParamOption { value: string; label: string }

const props = defineProps<{
  /** 当前片段的一组镜头 */
  rows: ShotPromptRow[]
  /** @ 可引用的资产实体 */
  entities?: MentionEntity[]
  /** 风格下拉选项（页面级 preset styles） */
  styleOptions?: ParamOption[]
}>()
const emit = defineEmits<{ 'update:rows': [ShotPromptRow[]] }>()

const editorRef = ref<HTMLElement | null>(null)
const mentionRef = ref<HTMLElement | null>(null)
const paramRef = ref<HTMLElement | null>(null)
const mentionInput = ref<InstanceType<typeof import('element-plus')['ElInput']> | null>(null)
const dragOver = ref(false)
let rendering = false
let composing = false

// ==================== 参数 token 定义 ====================
function paramDefinitions(): Array<{ key: string; options: ParamOption[] }> {
  return [
    { key: '景别', options: SHOT_TYPE_OPTIONS },
    { key: '运镜', options: CAMERA_MOVEMENT_OPTIONS },
    {
      key: '时长',
      options: [2, 3, 4, 5, 6, 8, 10].map((s) => ({ value: String(s), label: formatDuration(s) })),
    },
    { key: '风格', options: props.styleOptions?.length ? props.styleOptions : [{ value: 'cinematic', label: 'cinematic' }] },
  ]
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function displayValue(key: string, val: string): string {
  if (key === '景别') return labelOf(SHOT_TYPE_OPTIONS, val) || val
  if (key === '运镜') return labelOf(CAMERA_MOVEMENT_OPTIONS, val) || val
  if (key === '时长') return formatDuration(Number(val) || 0)
  return val // 风格：直接显示 style id（如 bpm_only）
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ==================== 渲染：rows -> HTML ====================
function buildDescHtml(description: string): string {
  // 描述里的 @资产 高亮为行内 token（从 entities 匹配名字）
  return esc(description).replace(/@([^\s,.。，、！？；：<>{}()[\]"'`]+)/g, (_m0, name) => {
    const hit = (props.entities ?? []).find((e) => e.name === name)
    return hit
      ? `<span class="pk-token entity" data-key="@entity" data-entity-id="${esc(hit.id)}" contenteditable="false">@${esc(name)}</span>`
      : `@${esc(name)}`
  })
}

function buildLineHtml(row: ShotPromptRow): string {
  const toks = paramDefinitions()
  const findVal = (key: string): string => {
    if (key === '景别') return row.shotType
    if (key === '运镜') return row.cameraMovement
    if (key === '时长') return String(row.duration)
    return row.style
  }
  const toksHtml = toks
    .map(
      (d) =>
        `<span class="pk-token" data-key="${esc(d.key)}" data-val="${esc(findVal(d.key))}" contenteditable="false">${esc(displayValue(d.key, findVal(d.key)))}</span>`,
    )
    .join('<span class="pk-sep" contenteditable="false">·</span>')
  return (
    `<div class="pk-line" data-id="${esc(row.id)}" data-no="${row.shotNumber}">` +
    `<span class="pk-label" contenteditable="false">镜头${row.shotNumber}:</span>` +
    ` ${toksHtml}` +
    `<span class="pk-dot" contenteditable="false">.</span> ` +
    `<span class="pk-desc">${buildDescHtml(row.description)}</span>` +
    `</div>`
  )
}

function renderRows(): void {
  const el = editorRef.value
  if (!el) return
  rendering = true
  el.innerHTML = props.rows.map(buildLineHtml).join('')
  void nextTick(() => {
    rendering = false
  })
}

// ==================== 序列化：DOM -> rows ====================
function serializeDesc(descEl: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) out += (node.textContent ?? '').replace(/\u00a0/g, ' ')
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const em = node as HTMLElement
      if (em.classList.contains('pk-token') && em.getAttribute('data-key') === '@entity') {
        const name = em.textContent?.replace(/^@/, '') ?? ''
        out += `@${name}`
      } else {
        if (em.tagName === 'BR') out += '\n'
        em.childNodes.forEach(walk)
      }
    }
  }
  descEl.childNodes.forEach(walk)
  return out.replace(/\n{2,}/g, '\n').trim()
}

function currentRows(): ShotPromptRow[] {
  const el = editorRef.value
  if (!el) return []
  const rows: ShotPromptRow[] = []
  el.querySelectorAll('.pk-line').forEach((line) => {
    const lineEl = line as HTMLElement
    let shotType = ''
    let cameraMovement = ''
    let duration = 0
    let style = ''
    lineEl.querySelectorAll<HTMLElement>('.pk-token[data-key]').forEach((tok) => {
      if (tok.getAttribute('data-key') === '@entity') return
      const key = tok.getAttribute('data-key') || ''
      const val = tok.getAttribute('data-val') || ''
      if (key === '景别') shotType = val
      else if (key === '运镜') cameraMovement = val
      else if (key === '时长') duration = Number(val) || 0
      else if (key === '风格') style = val
    })
    const descEl = lineEl.querySelector('.pk-desc') as HTMLElement | null
    rows.push({
      id: lineEl.getAttribute('data-id') || '',
      shotNumber: Number(lineEl.getAttribute('data-no')) || 0,
      shotType,
      cameraMovement,
      duration,
      style,
      description: descEl ? serializeDesc(descEl) : '',
    })
  })
  return rows
}

function emitRows(): void {
  emit('update:rows', currentRows())
}

// ==================== 光标保位（用于 @ / 拖图插入后重渲染）====================
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!root.contains(r.endContainer)) return null
  const pre = r.cloneRange(); pre.selectNodeContents(root); pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}

function onCompositionStart(): void { composing = true }
function onCompositionEnd(): void { composing = false; onInput() }
function onInput(): void {
  if (rendering || composing) return
  emitRows()
}

// ==================== @ 提及 ====================
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(0)
const activeIdx = ref(0)
const mentionStyle = computed(() => ({ right: '8px', top: '40px' }))
const filtered = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase()
  const list = props.entities ?? []
  if (!q) return list
  return list.filter((e) => e.name.toLowerCase().includes(q))
})

function detectMention(): void {
  const el = editorRef.value
  if (!el) return
  const offset = caretOffset(el)
  if (offset == null) { closeMention(); return }
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ')
  const before = text.slice(0, offset)
  const m = before.match(/@([^\s]*)$/)
  if (m) { mentionStart.value = offset - m[0].length; mentionQuery.value = m[1]; activeIdx.value = 0; openMention() }
  else closeMention()
}
function openMention(): void { if (!mentionOpen.value) { mentionOpen.value = true; void nextTick(() => mentionInput.value?.focus?.()) } }
function closeMention(): void { mentionOpen.value = false; paramOpen.value = false }
function pickMention(e: MentionEntity): void {
  insertAtCaret(`<span class="pk-token entity" data-key="@entity" data-entity-id="${esc(e.id)}" contenteditable="false">@${esc(e.name)}</span>&nbsp;`)
  closeMention()
}
function onMentionKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = e.key === 'ArrowUp' ? -1 : 1; activeIdx.value = (activeIdx.value + d + filtered.value.length) % Math.max(1, filtered.value.length) }
  else if (e.key === 'Enter') { e.preventDefault(); const it = filtered.value[activeIdx.value]; if (it) pickMention(it) }
  else if (e.key === 'Escape') closeMention()
}

/** 在光标处插入 HTML（仅限 .pk-desc 内），随后重新序列化并 emit */
function insertAtCaret(html: string): void {
  const el = editorRef.value; if (!el) return
  const sel = window.getSelection()
  let range: Range | null = null
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0)
    const desc = (r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer as Element)?.closest('.pk-desc')
    if (desc) range = r
  }
  if (range) {
    const frag = document.createRange().createContextualFragment(html)
    range.deleteContents()
    range.insertNode(frag)
    range.collapse(false)
    sel?.removeAllRanges(); sel?.addRange(range)
  } else {
    // 无有效光标：追加到最后一行描述末尾
    const descs = el.querySelectorAll('.pk-desc')
    const last = descs[descs.length - 1]
    if (last) last.insertAdjacentHTML('beforeend', html)
  }
  emitRows()
}

// ==================== 参数 token 点击 ====================
const paramOpen = ref(false)
const paramKey = ref('')
const paramValue = ref('')
const paramStyle = computed(() => ({ right: '8px', top: '40px' }))
const paramOptions = computed<ParamOption[]>(() => {
  const def = paramDefinitions().find((d) => d.key === paramKey.value)
  return def?.options ?? []
})

function onClick(e: MouseEvent): void {
  const t = e.target as HTMLElement
  if (t.classList?.contains('pk-token') && t.getAttribute('data-key') !== '@entity') {
    const key = t.getAttribute('data-key') || ''
    const val = t.getAttribute('data-val') || ''
    paramKey.value = key
    paramValue.value = val || ''
    paramOpen.value = true
    return
  }
  detectMention()
}
function pickParam(opt: ParamOption): void {
  const el = editorRef.value
  const t = el?.querySelector(`.pk-token[data-key="${paramKey.value}"][data-val="${paramValue.value}"]`) as HTMLElement | null
  if (t) {
    t.setAttribute('data-val', opt.value)
    t.textContent = displayValue(paramKey.value, opt.value)
  }
  paramOpen.value = false
  emitRows()
}
function onKeydown(e: KeyboardEvent): void {
  if (mentionOpen.value) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = e.key === 'ArrowUp' ? -1 : 1; activeIdx.value = (activeIdx.value + d + filtered.value.length) % Math.max(1, filtered.value.length) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered.value[activeIdx.value]; if (it) pickMention(it) }
    else if (e.key === 'Escape') closeMention()
    return
  }
  // 回车：在描述内生成软换行（保留行结构，token 不拆分）
  if (e.key === 'Enter') {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0)
      const desc = (r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer as Element)?.closest('.pk-desc')
      if (desc) {
        e.preventDefault()
        insertAtCaret('<br>')
        return
      }
    }
  }
}

// ==================== 拖图引用 ====================
function onDrop(e: DragEvent): void {
  dragOver.value = false
  const name = e.dataTransfer?.getData('text/asset-name') || e.dataTransfer?.getData('text/plain') || ''
  if (!name) return
  insertAtCaret(`<span class="pk-token entity" data-key="@entity" data-entity-id="" contenteditable="false">@${esc(name.trim())}</span>&nbsp;`)
  void nextTick(() => editorRef.value?.focus())
}

function kindIcon(kind: string): any { return kind === 'character' ? User : kind === 'location' ? Location : Goods }
function kindLabel(kind: string): string { return kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品' }

watch(
  () => [props.rows, props.entities] as const,
  () => {
    if (composing) return
    const el = editorRef.value
    if (el && document.activeElement === el && JSON.stringify(currentRows()) === JSON.stringify(props.rows)) return
    renderRows()
  },
  { deep: true },
)

onMounted(() => {
  renderRows()
  document.addEventListener('mousedown', onDocMouse)
})
function onDocMouse(e: MouseEvent): void {
  const hit = (refEl: HTMLElement | null) => refEl && refEl.contains(e.target as Node)
  if (!hit(mentionRef.value) && !hit(editorRef.value)) closeMention()
  if (!hit(paramRef.value) && !(e.target as HTMLElement).classList?.contains('pk-token')) paramOpen.value = false
}
</script>

<style lang="scss" scoped>
.prompt-rich { position: relative; display: flex; flex-direction: column; min-width: 0; }
.p-toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; }
.p-label { font-size: 12px; font-weight: 600; color: var(--text-color-secondary); }
.p-hint { font-size: 11px; color: var(--text-color-placeholder); }

.rich-box {
  min-height: 150px; max-height: 300px; overflow-y: auto;
  padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md);
  background: var(--bg-color); color: var(--text-color-primary);
  font-size: 13px; line-height: 2; outline: none; white-space: pre-wrap; word-break: break-word;
  &:focus { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary-light-7); }
  &.is-dragover { border-color: var(--color-primary); background: var(--color-primary-light-9); box-shadow: 0 0 0 2px var(--color-primary-light-5); }

  :deep(.pk-line) { display: block; margin-bottom: 2px; }
  :deep(.pk-label) { color: var(--text-color-secondary); font-weight: 600; margin-right: 4px; }
  :deep(.pk-sep) { color: var(--text-color-placeholder); margin: 0 2px; }
  :deep(.pk-dot) { color: var(--text-color-placeholder); margin: 0 2px 0 2px; }
  :deep(.pk-token) {
    display: inline-block; margin: 0 2px; padding: 0 8px; border-radius: 4px; cursor: pointer; user-select: none;
    font-weight: 600; line-height: 1.8; vertical-align: middle;
    color: var(--color-primary); background: var(--color-primary-light-9); border: 1px solid var(--color-primary-light-5);
    &:hover { background: var(--color-primary-light-8); }
    &.entity { color: var(--color-success); background: var(--color-success-light-9); border-color: var(--color-success-light-5); }
  }
}

.rich-popup {
  position: absolute; z-index: 60; width: 220px; max-height: 240px;
  background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg); overflow: hidden; display: flex; flex-direction: column;
}
.popup-search { padding: 6px; border-bottom: 1px solid var(--border-color-lighter); }
.popup-title { padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-color-secondary); border-bottom: 1px solid var(--border-color-lighter); }
.popup-list { flex: 1; min-height: 0; overflow-y: auto; max-height: 180px; padding: 4px 0; }
.popup-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 13px; color: var(--text-color-primary); cursor: pointer;
  &:hover, &.active { background: var(--fill-color-light); }
  .pi-icon { width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 13px;
    &.character { background: var(--color-primary-light-9); color: var(--color-primary); }
    &.location { background: var(--color-success-light-9); color: var(--color-success); }
    &.item { background: var(--color-warning-light-9); color: var(--color-warning); }
  }
  .pi-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pi-kind { font-size: 11px; color: var(--text-color-placeholder); }
  .check { font-size: 12px; }
}
.popup-empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-color-placeholder); }
</style>
