<template>
  <div class="shot-desc-template">
    <div
      ref="editorRef"
      class="rich-prompt-editor"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      spellcheck="false"
      :data-placeholder="placeholder"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @input="onInput"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import {
  parseEntityRefs,
  type EntityRefMeta,
} from '../shared/entity-ref-parser'

const props = defineProps<{
  modelValue: string
  entities?: EntityRefMeta[]
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const editorRef = ref<HTMLElement | null>(null)
const placeholder = '请输入自由提示词；可用 @角色名 / @地点 / @物品 引用资产...'
let rendering = false
let composing = false

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toEditorHtml(text: string): string {
  if (!text) return ''
  return parseEntityRefs(text, props.entities ?? [])
    .map((seg) => {
      if (seg.type === 'text') return escapeHtml(seg.text)
      const typeClass = seg.sourceType === 'linked_lw' ? 'linked-lw' : 'standalone'
      return `<span class="entity-ref-token ${typeClass}" data-entity-id="${escapeHtml(seg.id ?? '')}">@${escapeHtml(seg.name)}</span>`
    })
    .join('')
}

function currentText(): string {
  const el = editorRef.value
  if (!el) return ''
  return (el.innerText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n$/, '')
}

function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.endContainer)) return null
  const preRange = range.cloneRange()
  preRange.selectNodeContents(root)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

function restoreCaret(root: HTMLElement, offset: number): void {
  const selection = window.getSelection()
  if (!selection) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode() as Text | null
  }
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
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

function onCompositionStart(): void {
  composing = true
}

function onCompositionEnd(): void {
  composing = false
  onInput()
}

function onInput(): void {
  if (rendering) return
  const text = currentText()
  emit('update:modelValue', text)
  if (!composing) render(text)
}

watch(
  () => [props.modelValue, props.entities] as const,
  () => {
    if (composing) return
    const el = editorRef.value
    if (el && document.activeElement === el && currentText() === (props.modelValue ?? '')) return
    render(props.modelValue ?? '')
  },
  { deep: true },
)

onMounted(() => render(props.modelValue ?? ''))
</script>

<style scoped lang="scss">
.shot-desc-template {
  display: flex;
  flex-direction: column;
}

.rich-prompt-editor {
  min-height: 180px;
  max-height: 360px;
  overflow-y: auto;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
}

.rich-prompt-editor:focus {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}

.rich-prompt-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--el-text-color-placeholder);
  pointer-events: none;
}

.rich-prompt-editor :deep(.entity-ref-token) {
  display: inline-block;
  margin: 0 2px;
  padding: 0 6px;
  border-radius: 999px;
  font-weight: 600;
  line-height: 1.5;
}

.rich-prompt-editor :deep(.entity-ref-token.linked-lw) {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
}

.rich-prompt-editor :deep(.entity-ref-token.standalone) {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
}
</style>
