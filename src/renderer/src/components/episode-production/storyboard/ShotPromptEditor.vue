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

    <!-- @ 提及弹层（两段式：先选资产，有多图再选图） -->
    <div v-if="mentionOpen" ref="mentionRef" class="rich-popup" :style="mentionStyle">
      <div class="popup-search">
        <el-input
          v-if="mentionStage === 'asset'"
          ref="mentionInput"
          v-model="mentionQuery"
          size="small"
          placeholder="搜索资产…"
          @keydown="onMentionKey"
        />
        <div v-else class="popup-back" @click="mentionStage = 'asset'">
          <el-icon :size="12"><ArrowLeft /></el-icon> 返回资产
        </div>
      </div>
      <!-- 阶段一：资产列表 -->
      <div v-if="mentionStage === 'asset'" class="popup-list">
        <div
          v-for="(e, i) in filtered"
          :key="e.id"
          class="popup-item"
          :class="{ active: i === activeIdx }"
          @mousedown.prevent="onPickAsset(e)"
          @mouseenter="activeIdx = i"
        >
          <span class="pi-icon" :class="e.kind"><el-icon :size="13"><component :is="kindIcon(e.kind)" /></el-icon></span>
          <span class="pi-name">{{ e.name }}</span>
          <span class="pi-kind">{{ kindLabel(e.kind) }}</span>
          <span class="pi-more" v-if="(e.images?.length ?? 0) > 1">›</span>
        </div>
        <div v-if="filtered.length === 0" class="popup-empty">无匹配资产</div>
      </div>
      <!-- 阶段二：选择该资产的图 -->
      <div v-else class="popup-list">
        <div class="popup-item" @mousedown.prevent="pickMention(mentionAsset!, null)">
          <span class="pi-name">{{ mentionAsset?.name }}</span>
          <span class="pi-kind">资产本体</span>
        </div>
        <div
          v-for="(img, idx) in (mentionAsset?.images ?? [])"
          :key="img.id"
          class="popup-item"
          @mousedown.prevent="pickMention(mentionAsset!, idx + 1)"
        >
          <span class="pi-thumb"><img :src="img.path" alt="" /></span>
          <span class="pi-name">{{ mentionAsset?.name }} 图{{ idx + 1 }}</span>
        </div>
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
import { Check, User, Location, Goods, ArrowLeft } from '@element-plus/icons-vue'
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  labelOf,
} from '../shared/param-options'
import { parsePrompt, serializePrompt, type PromptLine } from './storyboard-prompt-format'
import { toImageUrl } from '@/utils/asset-url'

export interface MentionEntityImage { id: string; path: string }
export interface MentionEntity {
  id: string
  name: string
  kind: 'character' | 'location' | 'item'
  /** 该资产的图集（用于 @[名字@索引] 精确引用；可为空则只引资产本体） */
  images?: MentionEntityImage[]
}
export interface ParamOption { value: string; label: string }

/** 参数 key 的顺序（渲染顺序 + 序列化顺序） */
const PARAM_KEYS = ['景别', '运镜', '时长', '风格'] as const

/**
 * @资产 引用格式：`@[名字@图索引]`。
 *  - 无图索引：`@[杜十娘]`（只引资产本体，生成时由后端自动选图）
 *  - 有图索引：`@[杜十娘@1]`（精确引用该资产第 N 张图）
 * 方括号提供明确边界，后面跟任何文字都不影响识别；也可再次点击弹弹出重新选择。
 */
const ENTITY_RE = /@\[([^\]]+)\]/g
/** 拆出 `名字@图索引` → { name, index }；索引非数字则整体视为名字。 */
function splitEntityRef(inner: string): { name: string; index: number | null } {
  const at = inner.lastIndexOf('@')
  if (at > 0 && /^\d+$/.test(inner.slice(at + 1))) {
    return { name: inner.slice(0, at), index: Number(inner.slice(at + 1)) }
  }
  return { name: inner, index: null }
}

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
/** 取资产 token 应显示的缩略图 URL（指定索引取该图；否则取首图/主图；无图返回空） */
function entityThumb(hit: MentionEntity, index: number | null): string {
  const imgs = hit.images ?? []
  if (imgs.length === 0) return ''
  const path = index != null ? imgs[Math.min(index - 1, imgs.length - 1)]?.path : imgs[0]?.path
  return toImageUrl(path || '')
}
function buildDescHtml(description: string): string {
  // 描述里的 @[名字@图索引] 高亮为行内 token（从 entities 精确匹配名字）
  return esc(description).replace(ENTITY_RE, (_m0, inner) => {
    const { name, index } = splitEntityRef(inner)
    const hit = (props.entities ?? []).find((e) => e.name === name)
    if (!hit) return `@[${inner}]`
    const display = index != null ? `${name} 图${index}` : name
    const thumb = entityThumb(hit, index)
    const thumbHtml = thumb
      ? `<img class="ent-thumb" src="${esc(thumb)}" alt="" />`
      : ''
    return `<span class="pk-token entity" data-key="@entity" data-entity-id="${esc(hit.id)}" data-img-index="${index ?? ''}" contenteditable="false"><span class="ent-thumb-wrap">${thumbHtml}</span>@${esc(display)}</span>`
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
        const name = (em.textContent ?? '').replace(/^@/, '').replace(/\s*图\d+$/, '')
        const idx = em.getAttribute('data-img-index')
        out += `@[${name}${idx ? '@' + idx : ''}]`
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

// ==================== 弹层定位（fixed 视口坐标，浮在最上层）====================
const POPUP_MAX_W = 200
const POPUP_MAX_H = 240
/**
 * 基于锚点 rect 计算弹层位置。pw/ph 为弹层真实尺寸（未测得时用初值）。
 * 默认放锚点下方；超出视口底部则按真实高度翻到锚点上方；超出右/左则回拉。
 */
function popupPosition(
  ar: { left: number; top: number; bottom: number },
  pw: number,
  ph: number,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 4
  let left = ar.left
  let top = ar.bottom + gap
  if (left + pw > vw) left = Math.max(0, vw - pw)
  if (left < 0) left = 0
  // 超出视口底部 → 翻到锚点上方，用真实高度贴住锚点顶（避免空出一截）
  if (top + ph > vh) top = Math.max(0, ar.top - ph - gap)
  return { left: Math.round(left), top: Math.round(top) }
}
/** 参数 token 锚点 rect */
function anchorRectOf(el: Element): { left: number; top: number; bottom: number } {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, bottom: r.bottom }
}
/** 初始位置（下方），供弹层渲染前放置；翻转等精细调整由 refinePopup 完成 */
function anchorToRoot(el: Element): { left: number; top: number } {
  const ar = anchorRectOf(el)
  return popupPosition(ar, POPUP_MAX_W, 120)
}
/** 弹层渲染后用真实尺寸校正位置，确保向上翻时贴住锚点顶部（无空出一截） */
function refinePopup(
  anchorEl: Element | null,
  popupEl: HTMLElement | null,
  pos: { value: { left: number; top: number } },
): void {
  if (!anchorEl || !popupEl) return
  const ar = anchorRectOf(anchorEl)
  const pw = popupEl.offsetWidth || POPUP_MAX_W
  const ph = popupEl.offsetHeight || POPUP_MAX_H
  pos.value = popupPosition(ar, pw, ph)
}
/** 锚点为光标（用于 @ 提及弹层），放在光标下方 */
function caretPopupPos(): { left: number; top: number } {
  const err = editorRef.value?.getBoundingClientRect()
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect && rect.top > 0) {
      return popupPosition({ left: rect.left, top: rect.top, bottom: rect.bottom }, POPUP_MAX_W, POPUP_MAX_H * 0.5)
    }
  }
  return { left: Math.round(err?.left ?? 0), top: Math.round((err?.top ?? 0) + 40) }
}

// ==================== @ 提及 ====================
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(0)
const activeIdx = ref(0)
/** 打开 @ 弹层时捕获的光标所在描述元素与内部偏移（选中项时插入到该处） */
const mentionDescEl = ref<HTMLElement | null>(null)
const mentionDescOffset = ref(0)
const mentionPos = ref<{ left: number; top: number }>({ left: 12, top: 40 })
/** 两段式选择：asset = 资产列表；image = 该资产的多图选择 */
const mentionStage = ref<'asset' | 'image'>('asset')
const mentionAsset = ref<MentionEntity | null>(null)
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
/** 选择资产：若有>1张图则进入选图阶段，否则直接插入（资产本体） */
function onPickAsset(e: MentionEntity): void {
  const n = e.images?.length ?? 0
  if (n > 1) { mentionAsset.value = e; mentionStage.value = 'image' }
  else pickMention(e, null)
}

function detectMention(): void {
  const el = editorRef.value
  if (!el) return
  const offset = caretOffset(el)
  if (offset == null) { closeMention(); return }
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ')
  const before = text.slice(0, offset)
  // 只在「真正正在输入 @」时弹：@ 后紧跟的必须是普通字符（不含 [ ] @ 与空白）。
  // 这样已生成的 @[名字@索引] token（后面有 [）不会被当作正在输入，光标在其后点/输入不再误弹。
  const m = before.match(/@([^[\]@\s]*)$/)
  if (m) {
    mentionStart.value = offset - m[0].length; mentionQuery.value = m[1]; activeIdx.value = 0
    mentionStage.value = 'asset'; mentionAsset.value = null
    // 捕获光标所在的 .pk-desc 及其内部 offset，选中项时插入到该处（而非最后一行）
    mentionDescEl.value = descUnderCaret()
    mentionDescOffset.value = mentionDescEl.value ? (caretOffsetInDesc(mentionDescEl.value) ?? 0) : 0
    const caretRect = caretRectOf()
    mentionPos.value = caretRect ? popupPosition(caretRect, POPUP_MAX_W, 120) : caretPopupPos()
    openMention()
    // 渲染后用真实尺寸校正定位（双 nextTick 确保 DOM 已布局）
    if (caretRect) void nextTick(() => nextTick(() => {
      const popup = mentionRef.value
      if (popup) mentionPos.value = popupPosition(caretRect, popup.offsetWidth || POPUP_MAX_W, popup.offsetHeight || POPUP_MAX_H)
    }))
  } else closeMention()
}
/** 光标所在的 .pk-desc 元素（无则 null） */
function descUnderCaret(): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  const el = (r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer as Element)?.closest('.pk-desc')
  return (el as HTMLElement) ?? null
}
/** 光标所在处 rect（用于 @ 提及弹层锚点） */
function caretRectOf(): { left: number; top: number; bottom: number } | null {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0).getBoundingClientRect()
    if (r && r.top > 0) return { left: r.left, top: r.top, bottom: r.bottom }
  }
  return null
}
function openMention(): void { if (!mentionOpen.value) { mentionOpen.value = true; void nextTick(() => mentionInput.value?.focus?.()) } }
function closeMention(): void { mentionOpen.value = false; paramOpen.value = false }
function pickMention(e: MentionEntity, imgIndex?: number | null): void {
  // 移除已输入的部分 @query，替换为 @[名字@索引]；插入到捕获时所在描述的位置
  const descEl = mentionDescEl.value
  let insertOffset = mentionDescOffset.value
  if (descEl && insertOffset > 0) {
    const typedLen = (mentionQuery.value || '').length
    const start = Math.max(0, insertOffset - typedLen - 1) // 去掉 @query
    const range = rangeAtOffset(descEl, start)
    const end = rangeAtOffset(descEl, insertOffset)
    range.setEnd(end.endContainer, end.endOffset)
    range.deleteContents()
    insertOffset = start
  }
  const idx = imgIndex != null ? imgIndex : null
  const display = idx != null ? `${e.name} 图${idx}` : e.name
  const thumb = entityThumb(e, idx)
  const thumbHtml = thumb ? `<img class="ent-thumb" src="${esc(thumb)}" alt="" />` : ''
  insertAtCaret(
    `<span class="pk-token entity" data-key="@entity" data-entity-id="${esc(e.id)}" data-img-index="${idx ?? ''}" contenteditable="false"><span class="ent-thumb-wrap">${thumbHtml}</span>@${esc(display)}</span>&nbsp;`,
    descEl,
    insertOffset,
  )
  closeMention()
}
function onMentionKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = e.key === 'ArrowUp' ? -1 : 1; activeIdx.value = (activeIdx.value + d + filtered.value.length) % Math.max(1, filtered.value.length) }
  else if (e.key === 'Enter') { e.preventDefault(); const it = filtered.value[activeIdx.value]; if (it) onPickAsset(it) }
  else if (e.key === 'Escape') closeMention()
}

/** 在光标处插入 HTML（仅限 .pk-desc 内），随后重新序列化并 emit。
 *  若调用方传入了 descEl+offset（来自 detectMention 捕获的目标），则插入到该处，
 *  否则回退到当前 selection（有则插，无则追加到最后一个 desc）。 */
function insertAtCaret(html: string, targetDesc?: HTMLElement, targetOffset?: number): void {
  const el = editorRef.value; if (!el) return
  const sel = window.getSelection()
  let range: Range | null = null
  if (targetDesc && targetOffset != null) {
    range = rangeAtOffset(targetDesc, targetOffset)
  } else if (sel && sel.rangeCount > 0) {
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

/** 在一个元素内，按「字符偏移」构造 collapse 在对应文本位置的 Range（跨文本节点）。 */
function rangeAtOffset(root: HTMLElement, offset: number): Range {
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) {
      range.setStart(node, remaining)
      range.collapse(true)
      return range
    }
    remaining -= len
    node = walker.nextNode() as Text | null
  }
  range.selectNodeContents(root)
  range.collapse(false)
  return range
}

/** 计算光标在 .pk-desc 内的字符偏移（不含 token 高亮文本，只算描述文本）。 */
function caretOffsetInDesc(descEl: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!descEl.contains(r.endContainer)) return null
  const pre = r.cloneRange()
  pre.selectNodeContents(descEl)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().replace(/\u00a0/g, ' ').length
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
    // 渲染后用真实尺寸校正定位（双 nextTick 确保 DOM 已布局，修正向上翻的高度偏差）
    void nextTick(() => nextTick(() => refinePopup(t, paramRef.value, paramPos)))
    return
  }
  // 点击已 @ 引用的资产 token → 重新打开资产弹层（可重新选图/改引用）
  if (t.classList?.contains('pk-token') && t.getAttribute('data-key') === '@entity') {
    mentionAsset.value = findEntityByName((t.textContent ?? '').replace(/^@/, '').replace(/\s*图\d+$/, ''))
    mentionStage.value = 'asset'
    mentionDescEl.value = descUnderCaret()
    mentionDescOffset.value = t ? caretOffsetInDesc((t.closest('.pk-desc') as HTMLElement) ?? mentionDescEl.value!) : 0
    mentionPos.value = anchorToRoot(t)
    mentionOpen.value = true
    void nextTick(() => nextTick(() => refinePopup(t, mentionRef.value, mentionPos)))
    return
  }
  detectMention()
}
/** 按名字查实体（用于点击已引用 token 时定位回弹层） */
function findEntityByName(name: string): MentionEntity | null {
  return (props.entities ?? []).find((e) => e.name === name) ?? null
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
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered.value[activeIdx.value]; if (it) onPickAsset(it) }
    else if (e.key === 'Escape') closeMention()
    return
  }
  // Backspace / Delete：光标紧邻 contenteditable=false 的 token → 整删该 token
  // 避免浏览器把 @[名字@索引] 的 ']' 切掉只剩 '@'，导致误判为正在输入 @
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const target = adjacentToken(e.key === 'Backspace' ? 'before' : 'after')
    if (target) {
      target.remove()
      e.preventDefault()
      emitText()
      return
    }
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
/** 找光标前/后紧邻的 contenteditable=false token（pk-token），用于整删 */
function adjacentToken(dir: 'before' | 'after'): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!r.collapsed) return null // 非折叠选区不做
  const container = r.startContainer
  if (container.nodeType === Node.ELEMENT_NODE) {
    const el = container as HTMLElement
    if (dir === 'before') {
      const prev = el.childNodes[r.startOffset - 1]
      return (prev as HTMLElement)?.classList?.contains('pk-token') ? (prev as HTMLElement) : null
    } else {
      const next = el.childNodes[r.startOffset]
      return (next as HTMLElement)?.classList?.contains('pk-token') ? (next as HTMLElement) : null
    }
  } else if (container.nodeType === Node.TEXT_NODE) {
    const text = container as Text
    const parentEl = text.parentElement as HTMLElement
    if (!parentEl) return null
    // Backspace：光标在文本起点且前一个兄弟是 token；Delete：光标在文本末尾且后一个兄弟是 token
    const idx = Array.prototype.indexOf.call(parentEl.childNodes, text)
    if (dir === 'before' && r.startOffset === 0 && text.textContent?.length) {
      const prev = parentEl.childNodes[idx - 1]
      return (prev as HTMLElement)?.classList?.contains('pk-token') ? (prev as HTMLElement) : null
    }
    if (dir === 'after' && r.startOffset === (text.textContent?.length ?? 0)) {
      const next = parentEl.childNodes[idx + 1]
      return (next as HTMLElement)?.classList?.contains('pk-token') ? (next as HTMLElement) : null
    }
  }
  return null
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
    .ent-thumb-wrap { display: inline-block; vertical-align: middle; margin-right: 4px; }
    .ent-thumb { display: inline-block; width: 20px; height: 20px; border-radius: 3px; object-fit: cover; vertical-align: middle; }
  }
}

.rich-popup {
  position: fixed; z-index: 3000;
  /* 宽度贴合内容：参数项都很短，只按最长项撑宽，避免固定 220px 过宽 */
  width: max-content; min-width: 96px; max-width: 200px;
  max-height: 240px;
  background: var(--bg-color); border: 1px solid var(--border-color-lighter); border-radius: var(--radius-md);
  box-shadow: 0 6px 20px rgba(0,0,0,.14); overflow: hidden; display: flex; flex-direction: column;
}
.popup-search { padding: 6px; border-bottom: 1px solid var(--border-color-lighter); }
.popup-search :deep(.el-input) { width: 150px; }
.popup-back { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: var(--color-primary); padding: 3px 4px; &:hover { text-decoration: underline; } }
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
  .pi-more { color: var(--text-color-placeholder); flex-shrink: 0; font-size: 14px; }
  .pi-thumb { width: 32px; height: 32px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: var(--fill-color-lighter);
    img { width: 100%; height: 100%; object-fit: cover; }
  }
  .check { font-size: 12px; flex-shrink: 0; }
}
.popup-empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-color-placeholder); }
</style>
