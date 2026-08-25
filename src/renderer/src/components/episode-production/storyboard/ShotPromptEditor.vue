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
 * 核心约定：提示词本体就是一个字符串（一个字段），富文本只是编辑这段字符串的界面层。
 * 字符串格式（可逆，见 storyboard-prompt-format）：
 *   一行 = 一个镜头：`镜头N [景别=full|运镜=static|时长=5|风格=cinematic] 描述`
 *   - 「镜头N」标识分镜行
 *   - `[ ... ]` 内为镜头参数（key=value 以 | 分隔）→ 界面层解析为蓝色可点 token
 *   - `] ` 之后到行尾 = 该镜头的描述（普通文本）
 *
 * v-model 为字符串；组件内部 parse 字符串 -> 富文本，编辑后再 serialize 回字符串 emit。
 * 参数 token 的选项（景别/运镜/时长/风格）来自 param-options / styleOptions prop。
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { Check, User, Location, Goods } from '@element-plus/icons-vue'
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  labelOf,
} from '../shared/param-options'
import { parsePrompt, serializePrompt, type PromptLine } from './storyboard-prompt-format'

export interface MentionEntity { id: string; name: string; kind: 'character' | 'location' | 'item' }
export interface ParamOption { value: string; label: string }

/** 参数 key 的顺序（渲染顺序 + 序列化顺序） */
const PARAM_KEYS = ['景别', '运镜', '时长', '风格'] as const

const props = defineProps<{
  /** 提示词字符串（一个字段，一行=一个镜头） */
  modelValue?: string
  /** @ 可引用的资产实体 */
  entities?: MentionEntity[]
  /** 风格下拉选项（页面级 preset styles） */
  styleOptions?: ParamOption[]
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const editorRef = ref<HTMLElement | null>(null)
const mentionRef = ref<HTMLElement | null>(null)
const paramRef = ref<HTMLElement | null>(null)
const mentionInput = ref<InstanceType<typeof import('element-plus')['ElInput']> | null>(null)
const dragOver = ref(false)
let rendering = false
let composing = false

// ==================== 参数选项 ====================
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function optionsOf(key: string): ParamOption[] {
  if (key === '景别') return SHOT_TYPE_OPTIONS
  if (key === '运镜') return CAMERA_MOVEMENT_OPTIONS
  if (key === '时长') return [2, 3, 4, 5, 6, 8, 10].map((s) => ({ value: String(s), label: formatDuration(s) }))
  if (key === '风格') return props.styleOptions?.length ? props.styleOptions : [{ value: 'cinematic', label: 'cinematic' }]
  return []
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

// ==================== 渲染：字符串 -> HTML ====================
function buildDescHtml(description: string): string {
  // 描述里的 @资产 高亮为行内 token（从 entities 匹配名字）
  return esc(description).replace(/@([^\s,.。，、！？；：<>{}()[\]"'`]+)/g, (_m0, name) => {
    const hit = (props.entities ?? []).find((e) => e.name === name)
    return hit
      ? `<span class="pk-token entity" data-key="@entity" data-entity-id="${esc(hit.id)}" contenteditable="false">@${esc(name)}</span>`
      : `@${esc(name)}`
  })
}

function buildLineHtml(line: PromptLine): string {
  const toksHtml = PARAM_KEYS.filter((k) => line.params[k] !== undefined)
    .map((k) => {
      const v = line.params[k]
      return `<span class="pk-token" data-key="${esc(k)}" data-val="${esc(v)}" contenteditable="false">${esc(displayValue(k, v))}</span>`
    })
    .join('<span class="pk-sep" contenteditable="false">·</span>')
  const shotRow =
    `<span class="pk-label" contenteditable="false">镜头${line.shotNumber}:</span>` +
    `${toksHtml ? ` ${toksHtml}` : ''}` +
    `<span class="pk-dot" contenteditable="false">.</span> `
  return (
    `<div class="pk-line" data-no="${line.shotNumber}">` + shotRow +
    `<span class="pk-desc">${buildDescHtml(line.description)}</span>` +
    `</div>`
  )
}

function renderHtml(): void {
  const el = editorRef.value
  if (!el) return
  rendering = true
  const lines = parsePrompt(props.modelValue ?? '')
  el.innerHTML = lines.map(buildLineHtml).join('')
  void nextTick(() => {
    rendering = false
  })
}

// ==================== 序列化：DOM -> 字符串 ====================
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

/** 从 DOM 读出结构化行（参数 token + 描述），保持 PARAM_KEYS 顺序 */
function readLines(): PromptLine[] {
  const el = editorRef.value
  if (!el) return []
  const lines: PromptLine[] = []
  el.querySelectorAll('.pk-line').forEach((line) => {
    const lineEl = line as HTMLElement
    const params: Record<string, string> = {}
    lineEl.querySelectorAll<HTMLElement>('.pk-token[data-key]').forEach((tok) => {
      if (tok.getAttribute('data-key') === '@entity') return
      params[tok.getAttribute('data-key') || ''] = tok.getAttribute('data-val') || ''
    })
    const descEl = lineEl.querySelector('.pk-desc') as HTMLElement | null
    lines.push({
      shotNumber: Number(lineEl.getAttribute('data-no')) || 0,
      params,
      description: descEl ? serializeDesc(descEl) : '',
    })
  })
  return lines
}

function emitText(): void {
  emit('update:modelValue', serializePrompt(readLines()))
}

// ==================== 光标偏移（用于 @ 检测）====================
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
  emitText()
  // 输入时检测是否正在输入 @，以弹出资产选择
  detectMention()
}

// ==================== 弹层定位（相对 .prompt-rich 容器）====================
/** 取某元素相对提示词容器的位置，返回弹层应放置的 left/top */
function anchorToRoot(el: Element): { left: number; top: number } {
  const root = editorRef.value?.closest('.prompt-rich')
  if (!root) return { left: 12, top: 40 }
  const rr = (root as HTMLElement).getBoundingClientRect()
  const er = el.getBoundingClientRect()
  // 弹层出现在元素下方
  return { left: er.left - rr.left, top: er.bottom - rr.top + 4 }
}
/** 取光标（caret）所在位置（用于 @ 提及弹层），定位到光标下方 */
function caretPopupPos(): { left: number; top: number } {
  const root = editorRef.value?.closest('.prompt-rich')
  if (!root) return { left: 12, top: 40 }
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect && rect.top > 0) {
      const rr = (root as HTMLElement).getBoundingClientRect()
      return { left: rect.left - rr.left, top: rect.bottom - rr.top + 4 }
    }
  }
  return { left: 12, top: 40 }
}

// ==================== @ 提及 ====================
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(0)
const activeIdx = ref(0)
const mentionPos = ref<{ left: number; top: number }>({ left: 12, top: 40 })
const mentionStyle = computed<Record<string, string>>(() => ({
  left: `${mentionPos.value.left}px`,
  top: `${mentionPos.value.top}px`,
}))
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
  if (m) { mentionStart.value = offset - m[0].length; mentionQuery.value = m[1]; activeIdx.value = 0; mentionPos.value = caretPopupPos(); openMention() }
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
  emitText()
}

// ==================== 参数 token 点击 ====================
const paramOpen = ref(false)
const paramKey = ref('')
const paramValue = ref('')
const paramPos = ref<{ left: number; top: number }>({ left: 12, top: 40 })
const paramStyle = computed<Record<string, string>>(() => ({
  left: `${paramPos.value.left}px`,
  top: `${paramPos.value.top}px`,
}))
const paramOptions = computed<ParamOption[]>(() => optionsOf(paramKey.value))

function onClick(e: MouseEvent): void {
  const t = e.target as HTMLElement
  if (t.classList?.contains('pk-token') && t.getAttribute('data-key') !== '@entity') {
    const key = t.getAttribute('data-key') || ''
    const val = t.getAttribute('data-val') || ''
    paramKey.value = key
    paramValue.value = val || ''
    paramPos.value = anchorToRoot(t)
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
  emitText()
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
  () => [props.modelValue, props.entities] as const,
  () => {
    if (composing) return
    const el = editorRef.value
    if (el && document.activeElement === el && serializePrompt(readLines()) === (props.modelValue ?? '')) return
    renderHtml()
  },
  { deep: true },
)

onMounted(() => {
  renderHtml()
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
  position: absolute; z-index: 60;
  /* 宽度贴合内容：参数项都很短，只按最长项撑宽，避免固定 220px 过宽 */
  width: max-content; min-width: 96px; max-width: 200px;
  max-height: 240px;
  background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg); overflow: hidden; display: flex; flex-direction: column;
}
.popup-search { padding: 6px; border-bottom: 1px solid var(--border-color-lighter); }
.popup-search :deep(.el-input) { width: 150px; }
.popup-title { padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-color-secondary); border-bottom: 1px solid var(--border-color-lighter); }
.popup-list { flex: 1; min-height: 0; overflow-y: auto; max-height: 180px; padding: 4px 0; }
.popup-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 13px; color: var(--text-color-primary); cursor: pointer;
  white-space: nowrap;
  &:hover, &.active { background: var(--fill-color-light); }
  .pi-icon { width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 13px;
    &.character { background: var(--color-primary-light-9); color: var(--color-primary); }
    &.location { background: var(--color-success-light-9); color: var(--color-success); }
    &.item { background: var(--color-warning-light-9); color: var(--color-warning); }
  }
  .pi-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }
  .pi-kind { font-size: 11px; color: var(--text-color-placeholder); flex-shrink: 0; }
  .check { font-size: 12px; flex-shrink: 0; }
}
.popup-empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-color-placeholder); }
</style>
