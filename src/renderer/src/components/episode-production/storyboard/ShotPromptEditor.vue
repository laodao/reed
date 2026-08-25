<template>
  <div class="prompt-rich">
    <!-- 顶部小提示条 -->
    <div class="p-toolbar">
      <span class="p-label">提示词</span>
      <span class="p-hint">输入 @ 引用资产 · 点击蓝色参数可切换 · 拖资产图到框内引用</span>
    </div>

    <!-- 一个整体富文本框（contenteditable） -->
    <div
      ref="editorRef"
      class="rich-box"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      spellcheck="false"
      :data-placeholder="placeholder"
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
      <div class="popup-search"><el-input v-model="mentionQuery" ref="mentionInput" size="small" placeholder="搜索资产…" @keydown="onMentionKey" /></div>
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
        <div v-for="opt in paramOptions" :key="opt" class="popup-item" :class="{ active: opt === paramValue }" @click="pickParam(opt)">
          <span>{{ displayValue(paramKey, opt) }}</span><el-icon v-if="opt === paramValue" class="check"><Check /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ShotPromptEditor · 分镜提示词富文本编辑器（对齐截图）。
 *
 * 一个 contenteditable 富文本框，内部渲染多行镜头文本；每行的
 * 「景别 / 时长 / 风格」是行内可点击的蓝色 token（点击弹下拉切换），
 * 描述为普通文本，@资产引用也是行内 token。
 *
 * 存储格式（frameDescription）：每行 `镜头N|景别:<v>|时长:<n>s|风格:<v>|<描述>`，
 * 展示时把 `key:value` 段渲染成 token，其余为文本。
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { Check, User, Location, Goods } from '@element-plus/icons-vue'
import { SHOT_TYPE_OPTIONS, CAMERA_ANGLE_OPTIONS, CAMERA_MOVEMENT_OPTIONS, labelOf } from '../shared/param-options'

export interface MentionEntity { id: string; name: string; kind: 'character' | 'location' | 'item' }

const props = defineProps<{
  modelValue: string
  entities?: MentionEntity[]
  keyframeCount?: number
  /** 分镜默认镜头参数（用于构造逐镜头参数 token） */
  shotType?: string
  duration?: number
  style?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const editorRef = ref<HTMLElement | null>(null)
const mentionRef = ref<HTMLElement | null>(null)
const paramRef = ref<HTMLElement | null>(null)
const mentionInput = ref<InstanceType<typeof import('element-plus')['ElInput']> | null>(null)
const dragOver = ref(false)
const placeholder = '此处为镜头提示词富文本，输入 @ 引用资产…'
let rendering = false
let composing = false

// ==================== 参数 token 定义 ====================
const PARAM_DEFS = [
  { key: '景别', options: SHOT_TYPE_OPTIONS.map(o => o.value) },
  { key: '时长', options: ['2', '3', '4', '5', '6', '8', '10'] },
  { key: '风格', options: ['bpm_only', 'cinematic', 'realistic', 'anime'] },
]
const PARAM_KEYS = PARAM_DEFS.map(d => d.key)

function displayValue(key: string, val: string): string {
  if (key === '时长') return `${val}s`
  if (key === '景别') return labelOf(SHOT_TYPE_OPTIONS, val) || val
  if (key === '角度') return labelOf(CAMERA_ANGLE_OPTIONS, val) || val
  if (key === '运镜') return labelOf(CAMERA_MOVEMENT_OPTIONS, val) || val
  return val
}

// ==================== 渲染：文本 -> HTML token ====================
function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function lineToHtml(line: string): string {
  // 段落：先匹配 `key:value`（含 时长:4s），渲染为 token；其余为文本
  const re = /(景别|时长|风格|角度|运镜):([^|｜\n]+)/g
  const parts: Array<{ type: 'tok'; k: string; v: string } | { type: 'txt'; t: string }> = []
  let last = 0
  for (const m of line.matchAll(re)) {
    if (m.index! > last) parts.push({ type: 'txt', t: line.slice(last, m.index) })
    parts.push({ type: 'tok', k: m[1], v: m[2].trim().replace(/s$/, '') })
    last = m.index! + m[0].length
  }
  if (last < line.length) parts.push({ type: 'txt', t: line.slice(last) })
  // @资产 token 高亮
  return parts.map(p => {
    if (p.type === 'tok') {
      return `<span class="pk-token" data-key="${esc(p.k)}" data-val="${esc(p.v)}" contenteditable="false">${esc(displayValue(p.k, p.v))}</span>`
    }
    return esc(p.t).replace(/@([^\s,.。，、！？；：<>{}()\[\]"'`]+)/g, (_m0, name) => {
      const hit = (props.entities ?? []).find(e => e.name === name)
      return hit ? `<span class="pk-token entity" data-key="@entity" data-entity-id="${esc(hit.id)}">@${esc(name)}</span>` : `@${esc(name)}`
    })
  }).join('')
}

function toEditorHtml(text: string): string {
  if (!text) return ''
  return text.replace(/\r/g, '').split('\n')
    .map(line => `<div class="pk-line">${lineToHtml(line) || ''}</div>`)
    .join('')
}

// ==================== 序列化：DOM -> 文本 ====================
function currentText(): string {
  const el = editorRef.value
  if (!el) return ''
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) parts.push((node.textContent ?? '').replace(/\u00a0/g, ' '))
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const em = node as HTMLElement
      if (em.classList.contains('pk-token')) {
        const key = em.getAttribute('data-key') || ''
        const val = em.getAttribute('data-val') || ''
        const suffix = key === '时长' ? 's' : ''
        parts.push(`${key}:${val}${suffix}`)
      } else {
        if (em.tagName === 'BR') parts.push('\n')
        else if ((em.tagName === 'DIV' || em.tagName === 'P') && parts.length && parts[parts.length - 1] !== '\n') parts.push('\n')
        em.childNodes.forEach(walk)
      }
    }
  }
  el.childNodes.forEach(walk)
  return parts.join('').replace(/\n{2,}/g, '\n').trim()
}

// ==================== 光标保位 ====================
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!root.contains(r.endContainer)) return null
  const pre = r.cloneRange(); pre.selectNodeContents(root); pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}
function restoreCaret(root: HTMLElement, offset: number): void {
  const sel = window.getSelection(); if (!sel) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset, node = walker.nextNode() as Text | null
  while (node) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) { const r = document.createRange(); r.setStart(node, remaining); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return }
    remaining -= len; node = walker.nextNode() as Text | null
  }
  const r = document.createRange(); r.selectNodeContents(root); r.collapse(false); sel.removeAllRanges(); sel.addRange(r)
}

function render(text: string): void {
  const el = editorRef.value
  if (!el) return
  const offset = document.activeElement === el ? caretOffset(el) : null
  rendering = true
  el.innerHTML = toEditorHtml(text)
  void nextTick(() => {
    if (offset != null) restoreCaret(el, Math.min(offset, text.length))
    rendering = false
  })
}

function onCompositionStart(): void { composing = true }
function onCompositionEnd(): void { composing = false; onInput() }
function onInput(): void {
  if (rendering) return
  const text = currentText()
  emit('update:modelValue', text)
  if (!composing) { render(text); detectMention() }
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
  return list.filter(e => e.name.toLowerCase().includes(q))
})

function caretRectRoot(): { top: number; left: number } {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0); const rect = r.getBoundingClientRect()
    const root = editorRef.value?.getBoundingClientRect()
    return { top: rect.top - (root?.top ?? 0) + rect.height + 4, left: rect.left - (root?.left ?? 0) }
  }
  return { top: 40, left: 8 }
}
function detectMention(): void {
  const el = editorRef.value
  if (!el) return
  const offset = caretOffset(el)
  if (offset == null) { closeMention(); return }
  const text = currentText()
  const before = text.slice(0, offset)
  const m = before.match(/@([^\s]*)$/)
  if (m) { mentionStart.value = offset - m[0].length; mentionQuery.value = m[1]; activeIdx.value = 0; openMention() }
  else closeMention()
}
function openMention(): void { if (!mentionOpen.value) { mentionOpen.value = true; void nextTick(() => mentionInput.value?.focus?.()) } }
function closeMention(): void { mentionOpen.value = false; paramOpen.value = false }
function pickMention(e: MentionEntity): void {
  const el = editorRef.value; if (!el) return
  const text = currentText()
  const before = text.slice(0, mentionStart.value)
  const triggerLen = `@${mentionQuery.value}`.length
  const newText = `${before}@${e.name} ${text.slice(mentionStart.value + triggerLen)}`
  emit('update:modelValue', newText); render(newText); closeMention()
}
function onMentionKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = e.key === 'ArrowUp' ? -1 : 1; activeIdx.value = (activeIdx.value + d + filtered.value.length) % Math.max(1, filtered.value.length) }
  else if (e.key === 'Enter') { e.preventDefault(); const it = filtered.value[activeIdx.value]; if (it) pickMention(it) }
  else if (e.key === 'Escape') closeMention()
}

// ==================== 参数 token 点击 ====================
const paramOpen = ref(false)
const paramKey = ref('')
const paramValue = ref('')
const paramStyle = computed(() => ({ right: '8px', top: '40px' }))
const paramOptions = computed(() => PARAM_DEFS.find(d => d.key === paramKey.value)?.options ?? [])

function onClick(e: MouseEvent): void {
  const t = e.target as HTMLElement
  if (t.classList?.contains('pk-token') && t.getAttribute('data-key') !== '@entity') {
    const key = t.getAttribute('data-key') || ''
    const val = t.getAttribute('data-val') || ''
    paramKey.value = key; paramValue.value = val || ''; paramOpen.value = true
    return
  }
  detectMention()
}
function pickParam(opt: string): void {
  const t = editorRef.value?.querySelector('.pk-token[data-key="' + paramKey.value + '"][data-val="' + paramValue.value + '"]') as HTMLElement
  if (t) { t.setAttribute('data-val', opt); t.textContent = displayValue(paramKey.value, opt) }
  paramOpen.value = false
  emit('update:modelValue', currentText())
}
function onKeydown(e: KeyboardEvent): void {
  if (mentionOpen.value) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = e.key === 'ArrowUp' ? -1 : 1; activeIdx.value = (activeIdx.value + d + filtered.value.length) % Math.max(1, filtered.value.length) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered.value[activeIdx.value]; if (it) pickMention(it) }
    else if (e.key === 'Escape') closeMention()
  }
}

// ==================== 拖图引用 ====================
function onDrop(e: DragEvent): void {
  dragOver.value = false
  const el = editorRef.value; if (!el) return
  const name = e.dataTransfer?.getData('text/asset-name') || e.dataTransfer?.getData('text/plain') || ''
  if (!name) return
  const text = currentText()
  const offset = caretOffset(el); const pos = offset ?? text.length
  const newText = `${text.slice(0, pos)}@${name.trim()} ${text.slice(pos)}`
  emit('update:modelValue', newText); render(newText); void nextTick(() => el.focus())
}

function kindIcon(kind: string): any { return kind === 'character' ? User : kind === 'location' ? Location : Goods }
function kindLabel(kind: string): string { return kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品' }

watch(() => [props.modelValue, props.entities] as const, () => {
  if (composing) return
  const el = editorRef.value
  if (el && document.activeElement === el && currentText() === (props.modelValue ?? '')) return
  render(normalize(props.modelValue ?? '', props.keyframeCount))
}, { deep: true })

onMounted(() => {
  render(normalize(props.modelValue ?? '', props.keyframeCount))
  document.addEventListener('mousedown', onDocMouse)
})
function onDocMouse(e: MouseEvent): void {
  const hit = (refEl: HTMLElement | null) => refEl && refEl.contains(e.target as Node)
  if (!hit(mentionRef.value) && !hit(editorRef.value)) closeMention()
  if (!hit(paramRef.value) && !(e.target as HTMLElement).classList?.contains('pk-token')) paramOpen.value = false
}

/** 补齐镜头行（默认模板），保证富文本里有逐镜头行 + 参数 token */
function normalize(text: string, n?: number): string {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
  const need = Math.max(1, n || 1)
  const dur = props.duration || 4
  const shot = props.shotType || 'full'
  const style = props.style || 'bpm_only'
  const result: string[] = []
  for (let i = 0; i < Math.max(need, lines.length); i++) {
    const desc = lines[i] || ''
    result.push(`镜头${i + 1} 景别:${shot} 时长:${dur}s 风格:${style} ${desc}`)
  }
  return result.join('\n')
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
  &:empty::before { content: attr(data-placeholder); color: var(--text-color-placeholder); pointer-events: none; }

  :deep(.pk-line) { display: block; }
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
