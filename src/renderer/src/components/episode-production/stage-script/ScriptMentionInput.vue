<template>
  <!--
    ScriptMentionInput · @ 提及输入控件（spec §4.1 + P4-T7）

    用途：
      在剧本场景编辑（对话 / 动作 / 旁白）的文本输入处，输入 @ 弹出资产下拉，
      选中角色/地点/物品后将 @名字 插入文本，同时把对应 binding ID 通过 emit 给父组件，
      父组件持久化到 character_binding_id / location_binding_id / item_binding_id 列。

    设计：
      - 内部用 el-input + 浮层下拉（contenteditable 太复杂，先用 textarea + 文本插入）
      - 下拉支持键盘上下选择 + 回车插入 + ESC 关闭
      - 类别可通过 mentionKinds prop 限定（如 dialogue 只允许 @character）
  -->
  <div class="script-mention-input">
    <el-input
      ref="inputRef"
      v-model="text"
      :type="multiline ? 'textarea' : 'text'"
      :rows="rows"
      :placeholder="placeholder"
      :autosize="multiline ? { minRows: rows, maxRows: 8 } : undefined"
      @input="onInput"
      @keydown="onKeyDown"
      @blur="onBlur"
    />
    <div
      v-if="dropdownOpen && filteredCandidates.length > 0"
      class="mention-dropdown"
      :style="dropdownStyle"
    >
      <div class="mention-dropdown-tip">
        @ 提及：选中后插入 @名字（按 Esc 取消）
      </div>
      <div
        v-for="(c, idx) in filteredCandidates"
        :key="`${c.kind}:${c.bindingId}`"
        class="mention-item"
        :class="{ active: idx === activeIdx }"
        @mousedown.prevent="selectCandidate(idx)"
        @mouseenter="activeIdx = idx"
      >
        <span class="mention-kind-tag" :class="`kind-${c.kind}`">
          {{ kindLabel(c.kind) }}
        </span>
        <span class="mention-name">{{ c.name }}</span>
        <span v-if="c.description" class="mention-desc">{{ c.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ScriptMentionInput · @ 提及输入（P4-T7）
 *
 * Props：
 *   - modelValue (v-model)：当前文本
 *   - candidates：可被 @ 的资产清单（来自 AssetRosterForScript 三类 flat 起来）
 *   - mentionKinds：限定可提及的类别（如对话只允许 @character）
 *   - placeholder / rows / multiline：常规输入控件配置
 *
 * Emits：
 *   - update:modelValue：文本变化
 *   - mention：选中一条 → emit({ kind, bindingId, name, atIndex }) 父组件可记录用了哪些 binding
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'

export type MentionKind = 'character' | 'location' | 'item'

export interface MentionCandidate {
  kind: MentionKind
  bindingId: string
  name: string
  description?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    candidates: MentionCandidate[]
    mentionKinds?: MentionKind[]
    placeholder?: string
    rows?: number
    multiline?: boolean
  }>(),
  {
    mentionKinds: () => ['character', 'location', 'item'] as MentionKind[],
    placeholder: '输入文本，输入 @ 引用资产',
    rows: 2,
    multiline: true,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (
    e: 'mention',
    payload: { kind: MentionKind; bindingId: string; name: string; atIndex: number },
  ): void
}>()

const text = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => {
    if (v !== text.value) text.value = v
  },
)
watch(text, (v) => emit('update:modelValue', v))

const inputRef = ref<any>(null)

const dropdownOpen = ref(false)
const queryStartAt = ref(-1) // @ 字符在 text 中的位置
const queryString = ref('')
const activeIdx = ref(0)
const dropdownStyle = ref<CSSProperties>({})

const filteredCandidates = computed(() => {
  const allowed = new Set(props.mentionKinds)
  let pool = props.candidates.filter((c) => allowed.has(c.kind))
  const q = queryString.value.trim().toLowerCase()
  if (q) {
    pool = pool.filter((c) => c.name.toLowerCase().includes(q))
  }
  return pool.slice(0, 12) // 上限 12 项避免太长
})

function kindLabel(kind: MentionKind): string {
  return kind === 'character' ? '角色' : kind === 'location' ? '地点' : '物品'
}

function getNativeTextarea(): HTMLTextAreaElement | HTMLInputElement | null {
  const el = inputRef.value?.input ?? inputRef.value?.textarea ?? null
  return el ?? null
}

function onInput() {
  const el = getNativeTextarea()
  if (!el) return
  const cursor = el.selectionStart ?? 0

  // 找最近一个 @ 字符（向前搜，遇到空白则中断）
  const before = text.value.slice(0, cursor)
  let i = before.length - 1
  let atIdx = -1
  while (i >= 0) {
    const ch = before[i]
    if (ch === '@') {
      atIdx = i
      break
    }
    if (ch === ' ' || ch === '\n' || ch === '\t') break
    i--
  }

  if (atIdx === -1) {
    closeDropdown()
    return
  }
  queryStartAt.value = atIdx
  queryString.value = before.slice(atIdx + 1)
  activeIdx.value = 0
  openDropdown()
}

function onKeyDown(e: KeyboardEvent) {
  if (!dropdownOpen.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value + 1) % filteredCandidates.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value =
      (activeIdx.value - 1 + filteredCandidates.value.length) %
      filteredCandidates.value.length
  } else if (e.key === 'Enter') {
    if (filteredCandidates.value.length > 0) {
      e.preventDefault()
      selectCandidate(activeIdx.value)
    }
  } else if (e.key === 'Escape') {
    closeDropdown()
  }
}

function onBlur() {
  // 延迟关闭让 mousedown 生效
  setTimeout(() => closeDropdown(), 150)
}

function openDropdown() {
  dropdownOpen.value = true
  // 简化：固定下拉到输入框正下方，不计算光标偏移（那样需要测量字符宽度）
  nextTick(() => {
    dropdownStyle.value = { top: '100%', left: '0' }
  })
}

function closeDropdown() {
  dropdownOpen.value = false
  queryStartAt.value = -1
  queryString.value = ''
}

function selectCandidate(idx: number) {
  const c = filteredCandidates.value[idx]
  if (!c) return
  const start = queryStartAt.value
  if (start < 0) return
  const before = text.value.slice(0, start)
  const after = text.value.slice(start + 1 + queryString.value.length)
  // 插入 @名字 + 空格
  const insertion = `@${c.name} `
  const newText = before + insertion + after
  text.value = newText

  emit('mention', {
    kind: c.kind,
    bindingId: c.bindingId,
    name: c.name,
    atIndex: start,
  })

  closeDropdown()
  // 把光标放到插入末尾
  nextTick(() => {
    const el = getNativeTextarea()
    if (el) {
      const pos = before.length + insertion.length
      el.focus()
      try {
        el.setSelectionRange(pos, pos)
      } catch {
        // contenteditable / element-plus 内部组件不一定都支持
      }
    }
  })
}
</script>

<style scoped>
.script-mention-input {
  position: relative;
}

.mention-dropdown {
  position: absolute;
  z-index: 1000;
  margin-top: 4px;
  min-width: 220px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.mention-dropdown-tip {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
}

.mention-item.active,
.mention-item:hover {
  background: var(--el-color-primary-light-9);
}

.mention-kind-tag {
  display: inline-block;
  min-width: 28px;
  padding: 1px 4px;
  font-size: 11px;
  text-align: center;
  border-radius: 3px;
  color: #fff;
}

.mention-kind-tag.kind-character {
  background: #67c23a;
}

.mention-kind-tag.kind-location {
  background: #409eff;
}

.mention-kind-tag.kind-item {
  background: #e6a23c;
}

.mention-name {
  font-weight: 500;
}

.mention-desc {
  flex: 1;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
